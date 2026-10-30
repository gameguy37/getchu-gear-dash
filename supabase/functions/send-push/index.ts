import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { createClient } from "npm:@supabase/supabase-js@2";

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
  const userRole = (emp?.role ?? "").toLowerCase();
  if (!["admin", "manager", "operator"].includes(userRole)) {
    return new Response(JSON.stringify({ error: "Forbidden: employees only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log("[send-push] VAPID keys not configured, skipping");
    return new Response(JSON.stringify({ skipped: true, reason: "no_vapid_keys" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  webpush.setVapidDetails("mailto:info@promptin.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  try {
    const { employee_ids, title, message } = await req.json();
    if (!employee_ids?.length) {
      return new Response(JSON.stringify({ error: "No employee_ids" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: subs, error } = await adminClient
      .from("push_subscriptions")
      .select("subscription")
      .in("employee_id", employee_ids);

    if (error) throw error;
    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_subscriptions" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = JSON.stringify({ title: title || "GetchüGear", body: message || "", icon: "/favicon.ico", badge: "/favicon.ico" });
    const results = [];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub.subscription, payload);
        results.push({ status: "sent" });
      } catch (err: any) {
        results.push({ status: "failed", error: err.message });
      }
    }

    return new Response(JSON.stringify({ sent: results.filter((r) => r.status === "sent").length, failed: results.filter((r) => r.status === "failed").length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
