import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_my_jobs",
  title: "List my jobs",
  description:
    "List jobs assigned to the signed-in operator (or all jobs the caller can see under RLS), optionally filtered by status. Returns id, job number, client, date, call time, address, and status.",
  inputSchema: {
    status: z
      .enum(["needs_prep", "ready_for_takeoff", "launched", "pending_sign_off", "completed", "cancelled"])
      .optional()
      .describe("Optional status filter."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const client = sb(ctx);
    let query = client
      .from("jobs")
      .select("id, job_number, client_name, job_date, call_time, address, status, guaranteed_hours")
      .order("job_date", { ascending: false })
      .limit(limit ?? 25);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { jobs: data ?? [] },
    };
  },
});
