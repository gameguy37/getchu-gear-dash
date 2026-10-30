import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Package, Radar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AssetStatusBadge } from "@/components/AssetStatusBadge";
import { cn } from "@/lib/utils";
import { getAssetDisplayName } from "@/lib/utils";
import type { Asset } from "@/lib/types";

interface GearLoadoutAccordionProps {
  roots: Asset[];
  childMap: Map<string, Asset[]>;
  className?: string;
}

/** Recursive nested child row — supports Kit → Sub-Kit → Item with indentation */
function ChildRow({
  asset,
  childMap,
  depth,
}: {
  asset: Asset;
  childMap: Map<string, Asset[]>;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const kids = childMap.get(asset.id) ?? [];

  return (
    <li style={{ marginLeft: depth * 12 }}>
      <div
        className={cn(
          "flex items-center gap-2.5 text-[13px]",
          kids.length > 0 && "cursor-pointer"
        )}
        onClick={() => kids.length > 0 && setOpen((o) => !o)}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
        <span className="min-w-0 flex-1 truncate text-foreground/90">
          {getAssetDisplayName(asset)}
          {(asset.original_parent_id || asset.is_borrowed) && (
            <Badge className="ml-2 rounded-full border-warning/40 bg-warning/15 px-1.5 py-0 text-[9px] font-bold text-warning">
              ⚠ Borrowed
            </Badge>
          )}
          {asset.serial && (
            <span className="ml-2 font-technical text-[11px] text-muted-foreground">
              S/N {asset.serial}
            </span>
          )}
        </span>
        {asset.tracking_id && (
          <span title={`Tracking: ${asset.tracking_id}`} className="shrink-0">
            <Radar className="h-3.5 w-3.5 text-primary" />
          </span>
        )}
        {(asset.quantity ?? 1) > 1 && (
          <span className="font-technical text-[11px] font-bold text-primary">×{asset.quantity}</span>
        )}
        <AssetStatusBadge status={asset.status} size="sm" className="rounded-full" />
        {kids.length > 0 && (
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        )}
      </div>
      {open && kids.length > 0 && (
        <ul className="mt-1.5 space-y-1.5 border-l border-border/40 pl-2">
          {kids.map((k) => (
            <ChildRow key={k.id} asset={k} childMap={childMap} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Candy-style collapsible Parent/Child gear loadout.
 * Parents render as thick tactile pills; tapping reveals their child assets.
 */

export function GearLoadoutAccordion({ roots, childMap, className }: GearLoadoutAccordionProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (roots.length === 0) return null;

  return (
    <div className={cn("space-y-2.5", className)}>
      {roots.map((parent) => {
        const children = childMap.get(parent.id) ?? [];
        const isOpen = openIds.has(parent.id);
        const hasChildren = children.length > 0;

        return (
          <div
            key={parent.id}
            className={cn(
              "candy-panel overflow-hidden transition-shadow duration-200",
              isOpen && "candy-glow"
            )}
          >
            <button
              type="button"
              onClick={() => hasChildren && toggle(parent.id)}
              disabled={!hasChildren}
              aria-expanded={isOpen}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-4 text-left bouncy-press",
                hasChildren ? "cursor-pointer" : "cursor-default"
              )}
            >
              <span
                className="h-9 w-2 shrink-0 rounded-full"
                style={{ background: parent.color_code || "hsl(var(--primary))" }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-foreground">
                  {getAssetDisplayName(parent)}
                  {(parent.original_parent_id || parent.is_borrowed) && (
                    <Badge className="ml-2 rounded-full border-warning/40 bg-warning/15 px-1.5 py-0 text-[9px] font-bold text-warning">
                      ⚠ Borrowed
                    </Badge>
                  )}
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  {parent.category && <span className="truncate">{parent.category}</span>}
                  {hasChildren && (
                    <span className="inline-flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {children.length} item{children.length === 1 ? "" : "s"}
                    </span>
                  )}
                  {parent.tracking_id && (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Radar className="h-3 w-3" />
                      Tracked
                    </span>
                  )}
                </span>
              </span>
              {(parent.quantity ?? 1) > 1 && (
                <Badge className="rounded-full bg-primary/15 text-primary border-primary/25 text-[10px] font-bold">
                  ×{parent.quantity}
                </Badge>
              )}
              <AssetStatusBadge status={parent.status} size="sm" className="rounded-full" />
              {hasChildren && (
                <motion.span
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 24 }}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    isOpen ? "bg-primary/20 text-primary" : "bg-foreground/5 text-muted-foreground"
                  )}
                >
                  <ChevronDown className="h-4 w-4" />
                </motion.span>
              )}
            </button>

            <AnimatePresence initial={false}>
              {isOpen && hasChildren && (
                <motion.div
                  key="content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                  className="overflow-hidden"
                >
                  <ul className="space-y-1.5 border-t border-border/40 px-4 py-3">
                    {children.map((child) => (
                      <ChildRow key={child.id} asset={child} childMap={childMap} depth={0} />
                    ))}
                  </ul>

                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
