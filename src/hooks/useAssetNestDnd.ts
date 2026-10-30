import { useCallback, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { toast } from "sonner";
import { kitLabel } from "@/lib/assetLogs";
import { useAssetPatch } from "@/hooks/useAssetPatch";
import { supabase } from "@/integrations/supabase/client";
import type { Asset } from "@/lib/types";

const MIME = "application/x-gg-asset-id";

/**
 * HTML5 drag-and-drop nesting for assets.
 * Drag any asset row onto another row to make the target its new parent.
 */
export function useAssetNestDnd(assets: Asset[]) {
  const patchAsset = useAssetPatch();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ childId: string; parentId: string } | null>(null);
  const [moving, setMoving] = useState(false);

  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  // Would making `parentId` the parent of `childId` create a cycle?
  const wouldCycle = useCallback(
    (childId: string, parentId: string) => {
      let cursor: string | undefined = parentId;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor === childId) return true;
        if (seen.has(cursor)) return true;
        seen.add(cursor);
        cursor = byId.get(cursor)?.parent_asset_id;
      }
      return false;
    },
    [byId]
  );

  const canDrop = useCallback(
    (targetId: string) => {
      if (!draggingId || draggingId === targetId) return false;
      const dragged = byId.get(draggingId);
      if (dragged?.parent_asset_id === targetId) return false;
      return !wouldCycle(draggingId, targetId);
    },
    [draggingId, byId, wouldCycle]
  );

  const reparent = useCallback(
    async (childId: string, parentId: string | null, borrow = false) => {
      const child = byId.get(childId);
      const parent = parentId ? byId.get(parentId) : null;
      const originalParentId = borrow ? child?.parent_asset_id ?? null : null;
      const fromName = child?.parent_asset_id ? byId.get(child.parent_asset_id)?.asset_name : null;
      setMoving(true);
      try {
        // Optimistic: cache moves instantly, rolls back + toasts on failure.
        const pending = patchAsset.mutateAsync({
          id: childId,
          patch: { parent_asset_id: parentId ?? undefined, original_parent_id: originalParentId ?? undefined, is_borrowed: borrow },
          log: { action: borrow ? "Lent" : "Moved", details: `${borrow ? "Lent" : "Moved"} from ${kitLabel(fromName)} to ${kitLabel(parent?.asset_name)}` },
        });
        toast.success(
          borrow && parent
            ? `${child?.asset_name ?? "Item"} is borrowed into ${parent.asset_name}`
            : parent
            ? `${child?.asset_name ?? "Item"} now lives inside ${parent.asset_name}`
            : `${child?.asset_name ?? "Item"} moved to top level`
        );
        setMoving(false);
        await pending;
      } catch {
        setMoving(false);
        return false;
      }
      return true;
    },
    [byId, patchAsset]
  );

  const getDragProps = useCallback(
    (assetId: string) => ({
      draggable: true,
      onDragStart: (e: DragEvent) => {
        e.stopPropagation();
        e.dataTransfer.setData(MIME, assetId);
        e.dataTransfer.effectAllowed = "move";
        setDraggingId(assetId);
      },
      onDragEnd: () => {
        setDraggingId(null);
        setOverId(null);
      },
    }),
    []
  );

  const getDropProps = useCallback(
    (targetId: string) => ({
      onDragOver: (e: DragEvent) => {
        if (!canDrop(targetId)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setOverId(targetId);
      },
      onDragLeave: () => setOverId((prev) => (prev === targetId ? null : prev)),
      onDrop: (e: DragEvent) => {
        const id = e.dataTransfer.getData(MIME) || draggingId;
        e.preventDefault();
        e.stopPropagation();
        setOverId(null);
        setDraggingId(null);
        if (!id || !canDrop(targetId)) return;
        setPendingMove({ childId: id, parentId: targetId });
      },
    }),
    [canDrop, draggingId]
  );

  const resolvePendingMove = useCallback(async (borrow: boolean) => {
    if (!pendingMove) return;
    const moved = await reparent(pendingMove.childId, pendingMove.parentId, borrow);
    if (moved) setPendingMove(null);
  }, [pendingMove, reparent]);

  return {
    draggingId,
    overId,
    pendingMove,
    moving,
    getDragProps,
    getDropProps,
    reparent,
    canDrop,
    cancelPendingMove: () => setPendingMove(null),
    resolvePendingMove,
    getAsset: (id: string) => byId.get(id),
  };
}
