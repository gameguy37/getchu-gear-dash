import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate: require valid JWT and manager/admin role
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    // Allow service role key directly (for cron jobs)
    if (token !== serviceRoleKey) {
      // Verify JWT and check role
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: empData } = await adminClient
        .from("employees")
        .select("role")
        .eq("user_id", claimsData.claims.sub)
        .single();
      const callerRole = (empData?.role ?? "").toLowerCase();
      if (!["admin", "manager"].includes(callerRole)) {
        return new Response(JSON.stringify({ error: "Forbidden: managers only" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoff = sevenDaysAgo.toISOString().split("T")[0];

    const { data: oldJobs, error: jobsErr } = await supabase
      .from("jobs")
      .select("id")
      .lt("job_date", cutoff)
      .not("status", "eq", "completed");

    if (jobsErr) throw jobsErr;
    if (!oldJobs || oldJobs.length === 0) {
      return new Response(JSON.stringify({ deleted: 0, message: "No ghost jobs found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jobIds = oldJobs.map((j: any) => j.id);

    const { data: activeAssignments, error: assErr } = await supabase
      .from("assignments")
      .select("job_id")
      .in("job_id", jobIds)
      .not("actual_start_time", "is", null);

    if (assErr) throw assErr;

    const activeJobIds = new Set((activeAssignments ?? []).map((a: any) => a.job_id));
    const ghostJobIds = jobIds.filter((id: string) => !activeJobIds.has(id));

    if (ghostJobIds.length === 0) {
      return new Response(JSON.stringify({ deleted: 0, message: "No ghost jobs found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("assignments").delete().in("job_id", ghostJobIds);
    const { error: delErr } = await supabase.from("jobs").delete().in("id", ghostJobIds);
    if (delErr) throw delErr;

    return new Response(
      JSON.stringify({ deleted: ghostJobIds.length, message: `Cleaned up ${ghostJobIds.length} ghost job(s)` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("cleanup-ghost-jobs error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
