import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAssetAction } from "@/lib/assetLogs";
import type { Asset } from "@/lib/types";

export const ASSETS_KEY = ["assets"] as const;

/** Shared optimistic lifecycle for any single-asset patch against the ["assets"] cache. */
export function optimisticAssetHandlers(qc: QueryClient) {
  return {
    onMutate: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      await qc.cancelQueries({ queryKey: ASSETS_KEY });
      const previous = qc.getQueryData<Asset[]>(ASSETS_KEY);
      qc.setQueryData<Asset[]>(ASSETS_KEY, (cur) =>
        cur?.map((a) => (a.id === id ? ({ ...a, ...patch } as Asset) : a))
      );
      return { previous };
    },
    onError: (_err: unknown, _vars: unknown, ctx?: { previous?: Asset[] }) => {
      if (ctx?.previous) qc.setQueryData(ASSETS_KEY, ctx.previous);
      toast.error("Sync failed. Please check connection.");
    },
    onSettled: (_d: unknown, _e: unknown, vars?: { id: string }) => {
      qc.invalidateQueries({ queryKey: ASSETS_KEY });
      qc.invalidateQueries({ queryKey: ["parent_assets"] });
      if (vars?.id) qc.invalidateQueries({ queryKey: ["asset_logs", vars.id] });
    },
  };
}

export interface AssetPatchVars {
  id: string;
  patch: Record<string, unknown>;
  log?: { action: string; details: string };
}

/** Optimistic move / nest / borrow / return / make-permanent mutation. */
export function useAssetPatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, log }: AssetPatchVars) => {
      // Cache uses undefined for "cleared"; the database needs null.
      const dbPatch = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? null : v]));
      const { error } = await supabase.from("assets").update(dbPatch as never).eq("id", id);
      if (error) throw error;
      if (log) await logAssetAction(id, log.action, log.details);
    },
    ...optimisticAssetHandlers(qc),
  });
}
