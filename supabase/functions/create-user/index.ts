import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth check: caller must be admin/manager ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller identity
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !caller) {
      console.error("Caller auth failed:", callerError?.message);
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Service-role client for privileged operations
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller role
    const { data: callerEmp } = await admin
      .from("employees")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (
      !callerEmp ||
      !["admin", "manager"].includes((callerEmp.role ?? "").toLowerCase())
    ) {
      return jsonResponse({ error: "Only managers can create users" }, 403);
    }

    // ── Parse request body ──
    let body: Record<string, string>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { email, password, name, phone, role } = body;

    if (!email || !password) {
      return jsonResponse({ error: "Email and password are required" }, 400);
    }
    if (password.length < 6) {
      return jsonResponse(
        { error: "Password must be at least 6 characters" },
        400
      );
    }

    // ── Step A: Create Auth user ──
    console.log("Creating auth user for:", email);
    const { data: newUser, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createError || !newUser?.user) {
      console.error("auth.admin.createUser failed:", createError?.message);
      return jsonResponse(
        { error: createError?.message || "Failed to create auth user" },
        400
      );
    }

    const newUserId = newUser.user.id;
    console.log("Auth user created:", newUserId);

    // ── Step B: Check for existing employee record ──
    const { data: existingEmp } = await admin
      .from("employees")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    let empError: string | null = null;

    if (existingEmp) {
      // Link auth user to existing employee
      const { error } = await admin
        .from("employees")
        .update({ user_id: newUserId })
        .eq("id", existingEmp.id);
      if (error) empError = error.message;
    } else {
      // ── Step C: Insert new employee record ──
      const { error } = await admin.from("employees").insert({
        name: name || email,
        email,
        phone: phone || null,
        role: role || "operator",
        user_id: newUserId,
        status: "active",
      });
      if (error) empError = error.message;
    }

    // If employee upsert failed, clean up the ghost auth user
    if (empError) {
      console.error("Employee insert/update failed:", empError);
      console.log("Cleaning up ghost auth user:", newUserId);
      await admin.auth.admin.deleteUser(newUserId);
      return jsonResponse({ error: `Employee save failed: ${empError}` }, 500);
    }

    console.log("Employee record saved successfully for:", email);
    return jsonResponse({ success: true, user_id: newUserId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown server error";
    console.error("Unhandled error in create-user:", message);
    return jsonResponse({ error: message }, 500);
  }
});
