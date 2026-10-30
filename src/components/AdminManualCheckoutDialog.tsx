import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldAlert, Package, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useJobs, useAssets, useAssignments, useEmployees, useUpdateAssetStatus, useCreateAssignment, useUpdateAssignment } from "@/hooks/useSupabaseData";
import { useActivelyCheckedOutAssetIds } from "@/hooks/useAssetAvailability";
import { useKitIndex } from "@/hooks/useMeemawKits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Asset } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminManualCheckoutDialog({ open, onOpenChange }: Props) {
  const { data: allAssets = [] } = useAssets();
  const { data: jobs = [] } = useJobs();
  const { data: assignments = [] } = useAssignments();
  const { data: employees = [] } = useEmployees();
  const updateAssetStatus = useUpdateAssetStatus();
  const createAssignment = useCreateAssignment();

  const activelyCheckedOut = useActivelyCheckedOutAssetIds(assignments);

  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedOperatorId, setSelectedOperatorId] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [missingChildIds, setMissingChildIds] = useState<Set<string>>(new Set());
  const [childSectionOpen, setChildSectionOpen] = useState<Record<string, boolean>>({});
  const updateAssignment = useUpdateAssignment();

  // Only show active/upcoming jobs
  const availableJobs = useMemo(() =>
    jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled"),
    [jobs]
  );

  const operators = employees.filter((e) => e.user_type === "operator" && e.status === "active");

  const { kits, lockedAssetIds, kitMemberIds, assetIdToKit } = useKitIndex();

  // Parent-level assets — admins can also pick missing assets to track them.
  // Exclude parents locked inside a Meemaw kit (they must be checked out via the kit).
  const availableAssets = useMemo(() =>
    allAssets.filter((a) =>
      !a.parent_asset_id &&
      !lockedAssetIds.has(a.id) &&
      (!activelyCheckedOut.has(a.id) || a.status === "missing")
    ),
    [allAssets, activelyCheckedOut, lockedAssetIds]
  );

  // Kits whose members are not all already added; if any locked member is actively checked out, mark unavailable.
  const availableKits = useMemo(() => kits.map((k) => {
    const memberIds = kitMemberIds.get(k.id) ?? [];
    if (memberIds.length === 0) return null;
    const allSelected = memberIds.every((id) => selectedAssetIds.includes(id));
    if (allSelected) return null;
    const anyBusy = memberIds.some((id) => {
      const a = allAssets.find((x) => x.id === id);
      // Allow re-checkout of missing items (admin override)
      if (a?.status === "missing") return false;
      return activelyCheckedOut.has(id);
    });
    return { id: k.id, name: k.name, emoji: k.emoji, memberIds, busy: anyBusy };
  }).filter(Boolean) as { id: string; name: string; emoji: string | null; memberIds: string[]; busy: boolean }[],
  [kits, kitMemberIds, allAssets, activelyCheckedOut, selectedAssetIds]);

  // Children of selected parents
  const selectedChildren = useMemo(() => {
    const children: Record<string, Asset[]> = {};
    for (const parentId of selectedAssetIds) {
      children[parentId] = allAssets.filter((a) => a.parent_asset_id === parentId);
    }
    return children;
  }, [allAssets, selectedAssetIds]);

  const handleAddAsset = (val: string) => {
    if (val.startsWith("kit:")) {
      const kitId = val.slice(4);
      const row = availableKits.find((k) => k.id === kitId);
      if (!row) return;
      setSelectedAssetIds((prev) => {
        const next = [...prev];
        row.memberIds.forEach((id) => { if (!next.includes(id)) next.push(id); });
        return next;
      });
      return;
    }
    if (!selectedAssetIds.includes(val)) {
      setSelectedAssetIds((prev) => [...prev, val]);
    }
  };

  const handleRemoveAsset = (id: string) => {
    setSelectedAssetIds((prev) => prev.filter((x) => x !== id));
    // Clean up missing child selections for removed parent
    setMissingChildIds((prev) => {
      const next = new Set(prev);
      const children = allAssets.filter((a) => a.parent_asset_id === id);
      children.forEach((c) => next.delete(c.id));
      return next;
    });
  };

  const toggleMissingChild = (childId: string) => {
    setMissingChildIds((prev) => {
      const next = new Set(prev);
      if (next.has(childId)) next.delete(childId);
      else next.add(childId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!selectedJobId || selectedAssetIds.length === 0) {
      toast.error("Select a job and at least one asset.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Mark all selected assets (and their non-missing children) as checked_out
      const childAssetIds: string[] = [];
      for (const parentId of selectedAssetIds) {
        await updateAssetStatus.mutateAsync({ id: parentId, status: "checked_out" });
        const children = allAssets.filter((a) => a.parent_asset_id === parentId);
        for (const child of children) {
          if (missingChildIds.has(child.id)) {
            // Leave missing children as-is (don't check them out)
            continue;
          }
          await updateAssetStatus.mutateAsync({ id: child.id, status: "checked_out" });
          childAssetIds.push(child.id);
        }
      }

      // Build missing_asset_notes for flagged children
      const missingNotes = [...missingChildIds].map((childId) => {
        const child = allAssets.find((a) => a.id === childId);
        const parent = child?.parent_asset_id ? allAssets.find((a) => a.id === child.parent_asset_id) : undefined;
        return {
          asset_id: childId,
          asset_name: child?.asset_name ?? "Unknown",
          parent_name: parent?.asset_name ?? "Unknown",
        };
      });

      // Create an assignment linking this gear to the job
      if (selectedOperatorId) {
        const existing = assignments.find(
          (a) => a.job_id === selectedJobId && a.operator_id === selectedOperatorId
        );
        if (existing) {
          // Update existing assignment with new asset_ids and missing notes
          const mergedAssetIds = [...new Set([...(existing.asset_ids || []), ...selectedAssetIds, ...childAssetIds])];
          const existingNotes = (existing as any).missing_asset_notes ?? [];
          await supabase.from("assignments").update({
            asset_ids: mergedAssetIds,
            missing_asset_notes: [...existingNotes, ...missingNotes],
          }).eq("id", existing.id);
        } else {
          const { data: newAssignment } = await supabase.from("assignments").insert({
            job_id: selectedJobId,
            operator_id: selectedOperatorId,
            asset_ids: [...selectedAssetIds, ...childAssetIds],
            missing_asset_notes: missingNotes,
          }).select().single();
        }
      }

      const assetNames = selectedAssetIds
        .map((id) => allAssets.find((a) => a.id === id)?.asset_name)
        .filter(Boolean)
        .join(", ");

      toast.success(`Admin override: ${assetNames} checked out.${missingNotes.length > 0 ? ` ${missingNotes.length} item(s) flagged missing.` : ""}`);
      setSelectedJobId("");
      setSelectedOperatorId("");
      setSelectedAssetIds([]);
      setMissingChildIds(new Set());
      setReason("");
      onOpenChange(false);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("DOUBLE_BOOKING")) {
        toast.error("Conflict: This item is already assigned to another job on this date.");
      } else {
        toast.error(`Override failed: ${err.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" />
            Admin Manual Checkout
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Override the system to manually check out gear. Use this when an operator forgot to log items during a shoot.
        </p>

        <div className="space-y-4 py-2">
          {/* Job Selection */}
          <div className="space-y-1.5">
            <Label className="text-sm">Job</Label>
            <Select value={selectedJobId} onValueChange={setSelectedJobId}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Select a job" /></SelectTrigger>
              <SelectContent>
                {availableJobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.client_name} {j.job_number ? `#${j.job_number}` : ""} — {j.job_date || "No date"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Operator Selection */}
          <div className="space-y-1.5">
            <Label className="text-sm">Operator (optional)</Label>
            <Select value={selectedOperatorId} onValueChange={setSelectedOperatorId}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Select operator" /></SelectTrigger>
              <SelectContent>
                {operators.map((op) => (
                  <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Asset Selection */}
          <div className="space-y-1.5">
            <Label className="text-sm">Gear to Check Out</Label>
            <Select value="" onValueChange={handleAddAsset}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Add gear or Meemaw kit" /></SelectTrigger>
              <SelectContent>
                {availableKits.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      👵 Meemaw Kits — checks out whole bundle
                    </div>
                    {availableKits.map((k) => (
                      <SelectItem key={`kit:${k.id}`} value={`kit:${k.id}`} disabled={k.busy}>
                        {k.emoji ?? "👵"} {k.name} — {k.memberIds.length} pcs{k.busy ? " (member busy)" : ""}
                      </SelectItem>
                    ))}
                    <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t mt-1 pt-1.5">
                      Individual Parent Rigs
                    </div>
                  </>
                )}
                {availableAssets
                  .filter((a) => !selectedAssetIds.includes(a.id))
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.asset_name} ({a.category}){a.status === "missing" ? " ⚠ Missing" : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {selectedAssetIds.length > 0 && (
              <div className="space-y-2 mt-2">
                {selectedAssetIds.map((id) => {
                  const asset = allAssets.find((a) => a.id === id);
                  if (!asset) return null;
                  const children = selectedChildren[id] || [];
                  const isOpen = childSectionOpen[id] ?? false;
                  return (
                    <div key={id} className="rounded-lg bg-muted/50 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{asset.asset_name}</div>
                          {assetIdToKit.get(id) && (
                            <div className="text-[10px] text-muted-foreground truncate">
                              {assetIdToKit.get(id)!.emoji ?? "👵"} from {assetIdToKit.get(id)!.name}
                            </div>
                          )}
                        </div>
                        {asset.status === "missing" && (
                          <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[9px] font-bold gap-1">
                            <AlertTriangle className="h-2.5 w-2.5" /> Missing
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">{asset.category}</Badge>
                        <button
                          onClick={() => handleRemoveAsset(id)}
                          className="text-destructive hover:text-destructive/80 text-xs font-medium"
                        >
                          ✕
                        </button>
                      </div>
                      {/* Child asset toggles */}
                      {children.length > 0 && (
                        <Collapsible open={isOpen} onOpenChange={(o) => setChildSectionOpen((p) => ({ ...p, [id]: o }))}>
                          <CollapsibleTrigger asChild>
                            <button className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/80 border-t border-border/30">
                              {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              {children.length} child item{children.length !== 1 ? "s" : ""} — flag missing
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="px-3 pb-2 space-y-1">
                            {children.map((child) => (
                              <label key={child.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-muted/30 rounded px-1">
                                <Checkbox
                                  checked={missingChildIds.has(child.id)}
                                  onCheckedChange={() => toggleMissingChild(child.id)}
                                />
                                <span className="text-xs flex-1">{child.asset_name}</span>
                                {child.status === "missing" && (
                                  <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[8px]">Already Missing</Badge>
                                )}
                                {missingChildIds.has(child.id) && child.status !== "missing" && (
                                  <Badge className="bg-warning/20 text-warning border-warning/30 text-[8px]">Will Flag Missing</Badge>
                                )}
                              </label>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label className="text-sm">Reason (optional)</Label>
            <Textarea
              placeholder="e.g. Operator forgot to log during shoot"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[60px] text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedJobId || selectedAssetIds.length === 0 || isSubmitting}
            className="gap-1.5 bg-warning text-warning-foreground hover:bg-warning/90"
          >
            <ShieldAlert className="h-4 w-4" />
            {isSubmitting ? "Processing…" : "Override & Check Out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
