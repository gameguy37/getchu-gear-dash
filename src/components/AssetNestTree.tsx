import { useState } from "react";
import { ChevronRight, GripVertical, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BorrowedBadge } from "@/components/BorrowedBadge";
import { AssetStatusBadge } from "@/components/AssetStatusBadge";
import { useAssetNestDnd } from "@/hooks/useAssetNestDnd";
import { cn, getAssetDisplayName } from "@/lib/utils";
import type { Asset } from "@/lib/types";
import { AssetNestMoveDialog } from "@/components/AssetNestMoveDialog";

interface AssetNestTreeProps {
  /** Top-level assets to display */
  roots: Asset[];
  /** Full asset list — used to build nesting + validate drops */
  allAssets: Asset[];
  /** Allow drag-to-nest (admins only) */
  editable?: boolean;
  /** Called with an asset id when its Borrowed badge is clicked */
  onOpenAsset?: (assetId: string) => void;
  className?: string;
}

/**
 * Candy-style, multi-level asset tree (Parent Kit → Sub-Kit → Individual Cable).
 * Drag a row onto another row to make that row its new parent.
 */
export function AssetNestTree({ roots, allAssets, editable = false, onOpenAsset, className }: AssetNestTreeProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const dnd = useAssetNestDnd(allAssets);

  const childrenOf = (id: string) =>
    allAssets
      .filter((a) => a.parent_asset_id === id)
      .sort((a, b) => (a.asset_name ?? "").localeCompare(b.asset_name ?? ""));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const renderRow = (asset: Asset, depth: number) => {
    const kids = childrenOf(asset.id);
    const isOpen = open.has(asset.id);
    const isOver = dnd.overId === asset.id;
    const isDragging = dnd.draggingId === asset.id;

    return (
      <div key={asset.id} style={{ marginLeft: depth * 16 }}>
        <div
          {...(editable ? dnd.getDragProps(asset.id) : {})}
          {...(editable ? dnd.getDropProps(asset.id) : {})}
          onClick={() => kids.length > 0 && toggle(asset.id)}
          className={cn(
            "flex items-center gap-2.5 rounded-2xl px-3 py-2.5 transition-all",
            depth === 0 ? "candy-panel" : "bg-foreground/[0.03] border border-border/40",
            kids.length > 0 && "cursor-pointer",
            isDragging && "opacity-40",
            isOver && "bg-blue-500/20 ring-2 ring-blue-400/70 shadow-[0_0_24px_hsl(211_100%_50%/0.35)]"
          )}
        >
          {editable && (
            <GripVertical
              className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/70 active:cursor-grabbing"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <span
            className={cn("shrink-0 rounded-full", depth === 0 ? "h-7 w-1.5" : "h-2 w-2")}
            style={{ background: asset.color_code || "hsl(var(--primary))" }}
          />
          <div className="min-w-0 flex-1">
            <p className={cn("truncate font-semibold text-foreground", depth === 0 ? "text-sm" : "text-[13px]")}>
              {getAssetDisplayName(asset)}
              {(asset.original_parent_id || asset.is_borrowed) && (
                <BorrowedBadge
                  asset={asset}
                  className="px-1.5 py-0 text-[9px]"
                  onOpen={onOpenAsset ? (id) => onOpenAsset(id) : undefined}
                />
              )}
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              {asset.category && <span className="truncate">{asset.category}</span>}
              {kids.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  {kids.length} item{kids.length === 1 ? "" : "s"}
                </span>
              )}
            </p>
          </div>
          {(asset.quantity ?? 1) > 1 && (
            <Badge className="shrink-0 rounded-full border-primary/25 bg-primary/15 text-[10px] font-bold text-primary">
              ×{asset.quantity}
            </Badge>
          )}
          <AssetStatusBadge status={asset.status} size="sm" className="rounded-full" />
          {kids.length > 0 && (
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform",
                isOpen ? "rotate-90 bg-primary/20 text-primary" : "bg-foreground/5 text-muted-foreground"
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
        {isOpen && kids.length > 0 && (
          <div className="mt-1.5 space-y-1.5 border-l border-border/40 pl-2">
            {kids.map((k) => renderRow(k, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (roots.length === 0) return null;

  const pendingItem = dnd.pendingMove ? dnd.getAsset(dnd.pendingMove.childId) : null;
  const pendingParent = dnd.pendingMove ? dnd.getAsset(dnd.pendingMove.parentId) : null;

  return (
    <>
      <div className={cn("space-y-2", className)}>{roots.map((r) => renderRow(r, 0))}</div>
      <AssetNestMoveDialog
        open={!!dnd.pendingMove}
        itemName={pendingItem?.asset_name ?? "This item"}
        parentName={pendingParent?.asset_name ?? "this kit"}
        pending={dnd.moving}
        onOpenChange={(open) => !open && dnd.cancelPendingMove()}
        onPermanent={() => void dnd.resolvePendingMove(false)}
        onBorrow={() => void dnd.resolvePendingMove(true)}
      />
    </>
  );
}
