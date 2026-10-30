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
  name: "get_job",
  title: "Get job details",
  description:
    "Fetch a single job by ID with its assignments (assigned operators, actual start/end times, expense/mileage, notes). RLS limits visibility to jobs the caller may see.",
  inputSchema: {
    job_id: z.string().uuid().describe("The job UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ job_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const client = sb(ctx);
    const [{ data: job, error: jobErr }, { data: assignments, error: aErr }] = await Promise.all([
      client.from("jobs").select("*").eq("id", job_id).maybeSingle(),
      client
        .from("assignments")
        .select(
          "id, operator_id, asset_ids, actual_start_time, actual_end_time, expense_amount, mileage, notes, mission_accepted",
        )
        .eq("job_id", job_id),
    ]);
    if (jobErr) return { content: [{ type: "text", text: jobErr.message }], isError: true };
    if (aErr) return { content: [{ type: "text", text: aErr.message }], isError: true };
    if (!job) return { content: [{ type: "text", text: "Job not found or not accessible." }], isError: true };
    const result = { job, assignments: assignments ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
