import { supabase } from "@/integrations/supabase/client";

/** Records a move/action in asset_logs. Never throws — logging must not block the move. */
export async function logAssetAction(assetId: string, action: string, details: string) {
  try {
    const { data } = await supabase.auth.getUser();
    const { error } = await (supabase as any)
      .from("asset_logs")
      .insert({ asset_id: assetId, action, details, created_by: data.user?.id });
    if (error) console.warn("asset_logs insert failed", error.message);
  } catch (e) {
    console.warn("asset_logs insert failed", e);
  }
}

export function kitLabel(name?: string | null) {
  return name ? name : "Top Level";
}
