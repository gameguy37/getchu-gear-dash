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
  name: "post_relay_message",
  title: "Post a Relay message on a job",
  description:
    "Post a message into the Relay chat for a job as the signed-in user. Use for status updates, questions, or notes. RLS enforces that the caller can post on this job.",
  inputSchema: {
    job_id: z.string().uuid().describe("Job UUID to post into."),
    message: z.string().trim().min(1).max(2000).describe("Message text."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ job_id, message }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const client = sb(ctx);

    // Look up the employee record for a display name and to tag sender_type.
    const { data: emp } = await client
      .from("employees")
      .select("id, name, role")
      .eq("user_id", ctx.getUserId())
      .maybeSingle();

    const senderRole = (emp?.role ?? "").toLowerCase();
    const sender_type =
      senderRole === "admin" || senderRole === "manager" ? "manager" : senderRole === "operator" ? "operator" : "user";

    const { data, error } = await client
      .from("relay_messages")
      .insert({
        job_id,
        sender_id: ctx.getUserId(),
        sender_name: emp?.name ?? ctx.getUserEmail() ?? "MCP client",
        sender_type,
        message,
      })
      .select()
      .single();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Posted message ${data.id}` }],
      structuredContent: { message: data },
    };
  },
});
