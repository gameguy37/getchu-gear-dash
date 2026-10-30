import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listMyJobsTool from "./tools/list-my-jobs";
import getJobTool from "./tools/get-job";
import listMyGearTool from "./tools/list-my-gear";
import searchAssetsTool from "./tools/search-assets";
import postRelayMessageTool from "./tools/post-relay-message";

// Build the OAuth issuer from the Supabase project ref. Vite inlines
// import.meta.env.VITE_SUPABASE_PROJECT_ID at build time so this stays
// import-safe (no runtime env reads at module load).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "getchugear-mcp",
  title: "GetchüGear MCP",
  version: "0.1.0",
  instructions:
    "Tools for the GetchüGear / Promptin' Portal operations app. Use `whoami` first to see the signed-in user's role. Operators can list their jobs and gear and post Relay messages; managers and admins can also search inventory across the fleet.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listMyJobsTool, getJobTool, listMyGearTool, searchAssetsTool, postRelayMessageTool],
});
