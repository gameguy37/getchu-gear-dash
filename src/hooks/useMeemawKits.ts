import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MeemawKit {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  status: string;
}
export interface MeemawKitMember {
  id: string;
  kit_id: string;
  asset_id: string;
  position: number;
  shared_out: boolean;
}

export function useMeemawKits() {
  return useQuery({
    queryKey: ["meemaw_kits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("meemaw_kits" as any).select("id,name,emoji,description,status").order("name");
      if (error) throw error;
      return (data as unknown as MeemawKit[]) ?? [];
    },
    staleTime: 10000,
  });
}

export function useMeemawKitMembers() {
  return useQuery({
    queryKey: ["meemaw_kit_members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("meemaw_kit_members" as any).select("id,kit_id,asset_id,position,shared_out").order("position");
      if (error) throw error;
      return (data as unknown as MeemawKitMember[]) ?? [];
    },
    staleTime: 10000,
  });
}

/**
 * Build derived structures for kit-aware asset selection.
 * - lockedAssetIds: parent assets that are locked inside a kit (cannot be picked individually)
 * - assetIdToKit: lookup of which kit a locked asset belongs to
 * - kitMemberIds: ordered locked-member asset IDs per kit
 */
export function useKitIndex() {
  const { data: kits = [] } = useMeemawKits();
  const { data: members = [] } = useMeemawKitMembers();

  return useMemo(() => {
    const lockedAssetIds = new Set<string>();
    const assetIdToKit = new Map<string, MeemawKit>();
    const kitMemberIds = new Map<string, string[]>();
    const kitById = new Map(kits.map((k) => [k.id, k]));

    members.forEach((m) => {
      const kit = kitById.get(m.kit_id);
      if (!kit) return;
      if (!m.shared_out) {
        lockedAssetIds.add(m.asset_id);
        assetIdToKit.set(m.asset_id, kit);
      }
      const arr = kitMemberIds.get(m.kit_id) ?? [];
      if (!m.shared_out) arr.push(m.asset_id);
      kitMemberIds.set(m.kit_id, arr);
    });

    return { kits, members, lockedAssetIds, assetIdToKit, kitMemberIds, kitById };
  }, [kits, members]);
}
