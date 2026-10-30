import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Step 1-3: Verify JWT via getUser()
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Step 4-5: RBAC — admin only
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: emp } = await adminClient.from("employees").select("role").eq("user_id", user.id).maybeSingle();
  if ((emp?.role ?? "").toLowerCase() !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
  const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER");

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    console.log("[send-sms] Twilio credentials not configured, skipping");
    return new Response(JSON.stringify({ skipped: true, reason: "no_twilio_credentials" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const { messages } = await req.json() as { messages: { to: string; message: string }[] };
    if (!messages?.length) {
      return new Response(JSON.stringify({ error: "No messages" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results = [];
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    for (const msg of messages) {
      try {
        // Check SMS opt-in for the recipient by phone number
        const { data: recipient } = await adminClient
          .from("employees")
          .select("sms_opt_in, name")
          .eq("phone", msg.to)
          .maybeSingle();

        if (recipient && !recipient.sms_opt_in) {
          results.push({ to: msg.to, status: "blocked", reason: `${recipient.name || "User"} has not consented to SMS messages` });
          continue;
        }

        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To: msg.to,
              From: TWILIO_FROM_NUMBER,
              Body: msg.message,
            }),
          }
        );
        const body = await res.json();
        results.push({ to: msg.to, status: res.ok ? "sent" : "failed", detail: body });
      } catch (err: any) {
        results.push({ to: msg.to, status: "failed", error: err.message });
      }
    }

    return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
