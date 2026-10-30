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
  name: "search_assets",
  title: "Search assets",
  description:
    "Search the equipment inventory by name, category, or serial number. Returns id, name, category, serial, and status. RLS applies.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Text to match against asset_name, category, or serial_number."),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const client = sb(ctx);
    const q = `%${query}%`;
    const { data, error } = await client
      .from("assets")
      .select("id, asset_name, category, serial_number, status, quantity")
      .or(`asset_name.ilike.${q},category.ilike.${q},serial_number.ilike.${q}`)
      .limit(limit ?? 25);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { assets: data ?? [] },
    };
  },
});
