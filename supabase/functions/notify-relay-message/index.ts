// Edge function: notify-relay-message
// Triggered after each new relay_messages insert.
// 1. Sends a web push notification to the recipient (operator(s) or all managers).
// 2. Schedules an SMS fallback check 5 minutes later — if the message is still unread,
//    sends an SMS via the existing send-sms function (respecting opt-in).
//
// Trigger flow: a Postgres trigger sends an HTTP POST to this function via pg_net.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER");

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:info@promptin.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
}

interface RelayMessage {
  id: string;
  job_id: string;
  sender_id: string | null;
  sender_name: string;
  sender_type: string;
  message: string;
  created_at: string | null;
}

async function sendPushTo(
  admin: ReturnType<typeof createClient>,
  employeeIds: string[],
  title: string,
  body: string,
  jobId: string,
) {
  if (!employeeIds.length || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("subscription")
    .in("employee_id", employeeIds);
  if (!subs?.length) return;
  const payload = JSON.stringify({
    title,
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: { url: `/messages?job=${jobId}` },
  });
  await Promise.all(
    subs.map((s: any) =>
      webpush.sendNotification(s.subscription, payload).catch((e: any) =>
        console.warn("[push] fail", e?.message),
      ),
    ),
  );
}

async function sendSmsTo(
  admin: ReturnType<typeof createClient>,
  employeeIds: string[],
  text: string,
) {
  if (!employeeIds.length) return;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    console.log("[sms] Twilio not configured — skipping fallback");
    return;
  }
  const { data: emps } = await admin
    .from("employees")
    .select("id, phone, sms_opt_in, name")
    .in("id", employeeIds);
  const recipients = (emps || []).filter(
    (e: any) => e.sms_opt_in && e.phone,
  );
  if (!recipients.length) return;
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  for (const r of recipients as any[]) {
    try {
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: r.phone,
            From: TWILIO_FROM_NUMBER,
            Body: text,
          }),
        },
      );
    } catch (e) {
      console.warn("[sms] send failed", (e as Error).message);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // This function is only ever invoked server-to-server (by the Postgres trigger
  // via pg_net, or self-referentially for the SMS-fallback phase). Require the
  // service role key on the Authorization header — reject all other callers.
  const incoming = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  const apikey = req.headers.get("apikey")?.trim();
  if (
    incoming !== SUPABASE_SERVICE_ROLE_KEY &&
    apikey !== SUPABASE_SERVICE_ROLE_KEY
  ) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: { record?: RelayMessage; phase?: "push" | "sms_check"; message_id?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Phase: SMS fallback check (called via setTimeout below for the same invocation)
  if (payload.phase === "sms_check" && payload.message_id) {
    const { data: msg } = await admin
      .from("relay_messages")
      .select("*")
      .eq("id", payload.message_id)
      .maybeSingle();
    if (!msg) {
      return new Response(JSON.stringify({ ok: true, reason: "msg_gone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // If a newer message in the same thread was sent BY a different participant,
    // we assume the conversation is being read — skip SMS.
    const { data: newer } = await admin
      .from("relay_messages")
      .select("id, sender_id")
      .eq("job_id", msg.job_id)
      .gt("created_at", msg.created_at!)
      .neq("sender_id", msg.sender_id ?? "")
      .limit(1);
    if (newer && newer.length > 0) {
      return new Response(JSON.stringify({ ok: true, reason: "got_reply" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const recipientIds = await resolveRecipients(admin, msg);
    const { data: job } = await admin
      .from("jobs")
      .select("client_name, job_number")
      .eq("id", msg.job_id)
      .maybeSingle();
    const tag = job?.client_name || `Job ${job?.job_number || ""}`;
    await sendSmsTo(
      admin,
      recipientIds,
      `[GetchüGear] ${msg.sender_name} on ${tag}: ${truncate(msg.message, 140)}`,
    );
    return new Response(JSON.stringify({ ok: true, sms_to: recipientIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Phase 1: push immediately
  const record = payload.record;
  if (!record) {
    return new Response(JSON.stringify({ error: "no record" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const recipientIds = await resolveRecipients(admin, record);
  const { data: job } = await admin
    .from("jobs")
    .select("client_name, job_number")
    .eq("id", record.job_id)
    .maybeSingle();
  const tag = job?.client_name || `Job ${job?.job_number || ""}`;

  await sendPushTo(
    admin,
    recipientIds,
    `💬 ${record.sender_name} · ${tag}`,
    truncate(record.message, 140),
    record.job_id,
  );

  // Phase 2: schedule SMS check 5 min later (best-effort; the function instance must stay alive).
  // Fire-and-forget background task using EdgeRuntime.waitUntil if available.
  const smsTask = async () => {
    await new Promise((r) => setTimeout(r, 5 * 60 * 1000));
    try {
      await fetch(
        `${SUPABASE_URL}/functions/v1/notify-relay-message`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ phase: "sms_check", message_id: record.id }),
        },
      );
    } catch (e) {
      console.warn("[sms_check] dispatch failed", (e as Error).message);
    }
  };

  // @ts-ignore — EdgeRuntime is available on Supabase functions
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(smsTask());
  } else {
    smsTask();
  }

  return new Response(JSON.stringify({ ok: true, push_to: recipientIds.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function resolveRecipients(
  admin: ReturnType<typeof createClient>,
  msg: RelayMessage,
): Promise<string[]> {
  if (msg.sender_type === "operator" || msg.sender_type === "client") {
    // Notify all managers/admins
    const { data } = await admin
      .from("employees")
      .select("id")
      .in("role", ["manager", "admin"]);
    return (data || []).map((e: any) => e.id);
  }
  // Manager → notify all assigned operators (excluding the sender if they're an operator)
  const { data } = await admin
    .from("assignments")
    .select("operator_id")
    .eq("job_id", msg.job_id);
  return Array.from(
    new Set(
      (data || [])
        .map((a: any) => a.operator_id)
        .filter((id: string | null) => !!id && id !== msg.sender_id),
    ),
  ) as string[];
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
