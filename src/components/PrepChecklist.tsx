import { useEffect, useMemo, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Rocket } from "lucide-react";
import { useAssets, useAssignments, useCreateLostItem, useUpdateJobStatus, useUpdateAssetStatus } from "@/hooks/useSupabaseData";
import { toast } from "sonner";
import { cn, getAssetDisplayName } from "@/lib/utils";
import { PrepQuickResolveDialog } from "@/components/PrepQuickResolveDialog";
import type { Asset, Job } from "@/lib/types";
type PrepCondition = "okay" | "iffy" | "broken";

interface PrepChecklistProps {
  job: Job;
  open: boolean;
  onClose: () => void;
}

export function PrepChecklist({ job, open, onClose }: PrepChecklistProps) {
  const { data: assets = [] } = useAssets();
  const { data: assignments = [] } = useAssignments();
  const updateJobStatus = useUpdateJobStatus();
  const updateAssetStatus = useUpdateAssetStatus();
  const createLostItem = useCreateLostItem();

  const jobAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.job_id === job.id),
    [assignments, job.id],
  );

  const assignedAssetIds = useMemo(() => {
    const idSet = new Set<string>();
    jobAssignments.forEach((assignment) => {
      (assignment.asset_ids ?? []).forEach((id) => idSet.add(id));
    });
    return [...idSet];
  }, [jobAssignments]);

  // Build a recursive tree: each parent contains children, which may contain grandchildren.
  const hierarchy = useMemo(() => {
    const byId = new Map(assets.map((asset) => [asset.id, asset]));

    // Resolve assigned items up to their TOP-level ancestor so the whole rig
    // (parent → child → grandchild) is included on the checklist.
    const topParentIds = new Set<string>();
    assignedAssetIds.forEach((id) => {
      let cur = byId.get(id);
      while (cur?.parent_asset_id && byId.has(cur.parent_asset_id)) {
        cur = byId.get(cur.parent_asset_id);
      }
      if (cur) topParentIds.add(cur.id);
    });

    // Group ALL assets by parent_asset_id so we can walk the full subtree.
    const childrenOf = new Map<string, Asset[]>();
    assets.forEach((a) => {
      if (!a.parent_asset_id) return;
      const list = childrenOf.get(a.parent_asset_id) ?? [];
      list.push(a);
      childrenOf.set(a.parent_asset_id, list);
    });
    childrenOf.forEach((list, key) => {
      childrenOf.set(
        key,
        [...list].sort((a, b) => (a.asset_name ?? "").localeCompare(b.asset_name ?? "")),
      );
    });

    const parents = [...topParentIds]
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => (a!.asset_name ?? "").localeCompare(b!.asset_name ?? "")) as Asset[];

    // Flatten descendants for each parent (children + grandchildren), preserving depth.
    const descendantsOf = new Map<string, { asset: Asset; depth: number }[]>();
    const collect = (rootId: string): { asset: Asset; depth: number }[] => {
      const out: { asset: Asset; depth: number }[] = [];
      const walk = (id: string, depth: number) => {
        const kids = childrenOf.get(id) ?? [];
        kids.forEach((kid) => {
          out.push({ asset: kid, depth });
          walk(kid.id, depth + 1);
        });
      };
      walk(rootId, 1);
      return out;
    };
    parents.forEach((p) => descendantsOf.set(p.id, collect(p.id)));

    return { parents, descendantsOf };
  }, [assets, assignedAssetIds]);

  // Items that need confirmation: descendants if present, otherwise parent itself.
  const checklistItemsByParent = useMemo(() => {
    const map = new Map<string, { asset: Asset; depth: number }[]>();
    hierarchy.parents.forEach((parent) => {
      const desc = hierarchy.descendantsOf.get(parent.id) ?? [];
      map.set(parent.id, desc.length > 0 ? desc : [{ asset: parent, depth: 0 }]);
    });
    return map;
  }, [hierarchy]);

  const checklistItems = useMemo(() => {
    const seen = new Set<string>();
    const items: Asset[] = [];
    checklistItemsByParent.forEach((list) => {
      list.forEach(({ asset }) => {
        if (seen.has(asset.id)) return;
        seen.add(asset.id);
        items.push(asset);
      });
    });
    return items;
  }, [checklistItemsByParent]);

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [viewedParents, setViewedParents] = useState<Set<string>>(new Set());
  const [conditions, setConditions] = useState<Record<string, PrepCondition>>({});
  // foundCounts[id] = how many were actually present (defaults to expected qty).
  const [foundCounts, setFoundCounts] = useState<Record<string, number>>({});
  const [resolveAsset, setResolveAsset] = useState<Asset | null>(null);

  const handleAssetResolved = useCallback((assetId: string) => {
    setConditions((prev) => ({ ...prev, [assetId]: "okay" }));
    setCheckedIds((prev) => new Set(prev).add(assetId));
  }, []);

  useEffect(() => {
    if (!open) return;
    setCheckedIds(new Set());
    setViewedParents(new Set());

    const initialConditions: Record<string, PrepCondition> = {};
    const initialCounts: Record<string, number> = {};
    checklistItems.forEach((item) => {
      initialConditions[item.id] = item.status === "broken" ? "broken" : "okay";
      initialCounts[item.id] = Math.max(1, item.quantity ?? 1);
    });
    setConditions(initialConditions);
    setFoundCounts(initialCounts);
  }, [open, job.id, checklistItems]);

  const checklistIdSet = useMemo(() => new Set(checklistItems.map((item) => item.id)), [checklistItems]);
  const checkedCount = useMemo(
    () => [...checklistIdSet].filter((id) => checkedIds.has(id)).length,
    [checklistIdSet, checkedIds],
  );
  const missingCount = checklistIdSet.size - checkedCount;
  // Total units missing across partial-shortfall rows
  const shortfallUnits = useMemo(() => {
    let total = 0;
    checklistItems.forEach((item) => {
      if (!checkedIds.has(item.id)) return;
      const expected = Math.max(1, item.quantity ?? 1);
      const found = Math.min(expected, Math.max(0, foundCounts[item.id] ?? expected));
      if (found < expected) total += expected - found;
    });
    return total;
  }, [checklistItems, checkedIds, foundCounts]);
  const noAssets = checklistIdSet.size === 0;

  const allViewed = hierarchy.parents.every((parent) => {
    const hasDescendants = (hierarchy.descendantsOf.get(parent.id) ?? []).length > 0;
    return !hasDescendants || viewedParents.has(parent.id);
  });

  const canMarkReady = noAssets || allViewed;

  const toggleItem = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleParent = (parentId: string) => {
    const items = checklistItemsByParent.get(parentId) ?? [];
    const ids = items.map(({ asset }) => asset.id);
    const allSelected = ids.length > 0 && ids.every((id) => checkedIds.has(id));

    setCheckedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const handleMarkReady = async () => {
    try {
      const assetById = new Map(assets.map((asset) => [asset.id, asset]));
      const operatorId = jobAssignments[0]?.operator_id;

      const logs: Promise<unknown>[] = [];

      checklistItems.forEach((item) => {
        const expected = Math.max(1, item.quantity ?? 1);
        // Walk up to top ancestor for "rig" naming
        let topAncestor: Asset | undefined = item;
        while (topAncestor?.parent_asset_id) {
          const next = assetById.get(topAncestor.parent_asset_id);
          if (!next) break;
          topAncestor = next;
        }
        const parentRigName = topAncestor?.asset_name ?? item.asset_name;

        if (!checkedIds.has(item.id)) {
          // Entire row missing — log the full expected quantity.
          logs.push(
            createLostItem.mutateAsync({
              item_name: item.asset_name || "Unknown Item",
              missing_quantity: expected,
              condition: "missing",
              parent_asset_id: item.parent_asset_id ?? item.id,
              parent_rig_name: parentRigName,
              job_id: job.id,
              operator_id: operatorId,
              notes: `All ${expected} marked missing during prep checklist on ${new Date().toLocaleDateString()}`,
            }),
          );
          logs.push(
            updateAssetStatus.mutateAsync({ id: item.id, status: "missing" }),
          );
          return;
        }

        // Checked — but did we find them all?
        const found = Math.min(expected, Math.max(0, foundCounts[item.id] ?? expected));
        if (found < expected) {
          const short = expected - found;
          logs.push(
            createLostItem.mutateAsync({
              item_name: item.asset_name || "Unknown Item",
              missing_quantity: short,
              condition: "missing",
              parent_asset_id: item.parent_asset_id ?? item.id,
              parent_rig_name: parentRigName,
              job_id: job.id,
              operator_id: operatorId,
              notes: `${short} of ${expected} missing (found ${found}) during prep checklist on ${new Date().toLocaleDateString()}`,
            }),
          );
        }

        const condition = conditions[item.id] ?? "okay";
        if (condition === "broken" || condition === "iffy") {
          logs.push(
            createLostItem.mutateAsync({
              item_name: item.asset_name || "Unknown Item",
              missing_quantity: 1,
              condition,
              parent_asset_id: item.parent_asset_id ?? item.id,
              parent_rig_name: parentRigName,
              job_id: job.id,
              operator_id: operatorId,
              notes: `Marked ${condition} during prep checklist on ${new Date().toLocaleDateString()}`,
            }),
          );
          logs.push(
            updateAssetStatus.mutateAsync({ id: item.id, status: condition }),
          );
        }
      });

      if (logs.length > 0) await Promise.allSettled(logs);

      await updateJobStatus.mutateAsync({ id: job.id, status: "ready_for_takeoff" });

      const totalShort = missingCount + shortfallUnits;
      if (totalShort > 0) {
        toast.warning(`⚠ ${totalShort} item${totalShort === 1 ? "" : "s"} sent to Sea of Missing.`);
      }

      toast.success(`🚀 ${job.job_number || job.client_name} is ready for takeoff!`);
      onClose();
    } catch (error: any) {
      toast.error(error?.message || "Failed to mark job ready.");
    }
  };

  const renderChecklistRow = (item: Asset, depth = 0) => {
    const checked = checkedIds.has(item.id);
    const condition = conditions[item.id] ?? "okay";
    const expected = Math.max(1, item.quantity ?? 1);
    const found = foundCounts[item.id] ?? expected;
    const short = checked && found < expected ? expected - found : 0;

    return (
      <div
        key={item.id}
        className={cn(
          "rounded-md border border-border/30 bg-card/40 p-2.5",
          depth >= 1 && "ml-6 border-l-2 border-primary/20 pl-3",
          depth >= 2 && "ml-10 border-l-2 border-primary/10 pl-3 bg-card/30",
          !checked && "border-warning/40",
        )}
      >
        <div
          className="flex items-center gap-2"
          onClick={() => toggleItem(item.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleItem(item.id);
            }
          }}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={checked} onCheckedChange={() => toggleItem(item.id)} className="h-4 w-4" />
          </div>

          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color_code }} />
          <span className="text-xs font-semibold text-foreground flex-1 truncate">
            {item.metadata?.macbook_type ? getAssetDisplayName(item) : item.asset_name}
            {expected > 1 && (
              <span className="ml-1.5 text-muted-foreground font-normal">×{expected}</span>
            )}
          </span>
          {item.status && !["available", "good", "checked_out"].includes(item.status) && (
            <Badge
              className={cn(
                "text-[9px] px-1.5 py-0 font-black uppercase tracking-wider shrink-0 cursor-pointer hover:opacity-80 transition-opacity",
                item.status === "broken" ? "bg-destructive/20 text-destructive border-destructive/30" :
                item.status === "missing" ? "bg-warning/20 text-warning border-warning/30" :
                item.status === "iffy" ? "bg-amber-500/20 text-amber-500 border-amber-500/30" :
                "bg-muted/20 text-muted-foreground border-muted/30"
              )}
              onClick={(e) => { e.stopPropagation(); setResolveAsset(item); }}
            >
              ⚠️ {item.status}
            </Badge>
          )}
          {item.serial && <span className="text-[10px] text-muted-foreground">#{item.serial}</span>}

          {!checked ? (
            <Badge
              className="bg-warning/20 text-warning border-warning/30 text-[10px] cursor-pointer hover:bg-warning/30 transition-colors"
              onClick={(e) => { e.stopPropagation(); setResolveAsset(item); }}
            >
              All {expected} missing
            </Badge>
          ) : short > 0 ? (
            <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px]">
              {short} missing
            </Badge>
          ) : (
            condition !== "okay" && (
              <Badge
                className={cn(
                  "text-[10px]",
                  condition === "broken"
                    ? "bg-destructive/20 text-destructive border-destructive/30"
                    : "bg-warning/20 text-warning border-warning/30",
                )}
              >
                {condition}
              </Badge>
            )
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
          {expected > 1 && checked ? (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>Found:</span>
              <Input
                type="number"
                min={0}
                max={expected}
                value={found}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setFoundCounts((prev) => ({
                    ...prev,
                    [item.id]: isNaN(v) ? 0 : Math.max(0, Math.min(expected, v)),
                  }));
                }}
                className="h-7 w-14 text-xs"
              />
              <span>/ {expected}</span>
            </div>
          ) : (
            <span />
          )}
          <Select
            value={condition}
            onValueChange={(value) =>
              setConditions((prev) => ({ ...prev, [item.id]: value as PrepCondition }))
            }
          >
            <SelectTrigger className="h-7 w-[120px] text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="okay">✅ Good</SelectItem>
              <SelectItem value="iffy">⚠️ Iffy</SelectItem>
              <SelectItem value="broken">🔴 Issue</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto glass-dark border-primary/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Rocket className="h-5 w-5 text-primary" />
            Prep Checklist — {job.client_name}
          </DialogTitle>
        </DialogHeader>

        {noAssets && (
          <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <span className="text-sm text-warning">⚠ No gear assigned to this job.</span>
          </div>
        )}

        {!noAssets && (
          <div className="rounded-lg border border-border/40 bg-card/40 p-2 text-xs text-muted-foreground">
            {checkedCount} of {checklistIdSet.size} checked
            {(missingCount > 0 || shortfallUnits > 0) && (
              <> · <span className="text-warning">{missingCount + shortfallUnits} unit{missingCount + shortfallUnits === 1 ? "" : "s"} short</span></>
            )}
          </div>
        )}

        <div className="space-y-3 pb-2">
          {hierarchy.parents.map((parent) => {
            const rows = checklistItemsByParent.get(parent.id) ?? [];
            const hasDescendants = (hierarchy.descendantsOf.get(parent.id) ?? []).length > 0;
            const allSelected = rows.length > 0 && rows.every(({ asset }) => checkedIds.has(asset.id));
            const isViewed = viewedParents.has(parent.id);

            if (!hasDescendants) {
              return (
                <div key={parent.id} className="space-y-2 rounded-lg border border-border/30 bg-card/30 p-3">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={allSelected} onCheckedChange={() => toggleParent(parent.id)} className="h-4 w-4" />
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: parent.color_code }} />
                    <span className="text-sm font-bold text-foreground flex-1">{parent.asset_name}</span>
                    <Badge variant="outline" className="text-[10px]">{parent.category}</Badge>
                  </div>
                  {rows.map(({ asset, depth }) => renderChecklistRow(asset, depth))}
                </div>
              );
            }

            return (
              <Collapsible
                key={parent.id}
                onOpenChange={(value) => {
                  if (value) setViewedParents((prev) => new Set(prev).add(parent.id));
                }}
              >
                <div className="rounded-lg border border-border/30 bg-card/30 p-3 space-y-2">
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-2 w-full text-left group">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={() => toggleParent(parent.id)}
                          className="h-4 w-4"
                        />
                      </div>
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: parent.color_code }} />
                      <span className="text-sm font-bold text-foreground flex-1">{parent.asset_name}</span>
                      <Badge variant="outline" className="text-[10px]">{parent.category}</Badge>
                      {isViewed && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                      <ChevronDown className="h-4 w-4 text-muted-foreground group-data-[state=open]:hidden" />
                      <ChevronUp className="h-4 w-4 text-muted-foreground hidden group-data-[state=open]:block" />
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="space-y-1.5 mt-2">
                      {rows.map(({ asset, depth }) => renderChecklistRow(asset, depth))}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            className="w-full gap-2 rounded-full bg-gradient-to-r from-primary to-primary/80"
            disabled={!canMarkReady || updateJobStatus.isPending}
            onClick={handleMarkReady}
          >
            <Rocket className="h-4 w-4" />
            {updateJobStatus.isPending ? "Processing…" : "Mark as Ready for Takeoff"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <PrepQuickResolveDialog
      asset={resolveAsset}
      open={!!resolveAsset}
      onClose={() => setResolveAsset(null)}
      onResolved={handleAssetResolved}
    />
    </>
  );
}
