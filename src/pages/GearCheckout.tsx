import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Package, CheckCircle2, AlertTriangle, ArrowLeft, ShieldAlert, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useJobs, useAssets, useAssignments, useUpdateAssetStatus, useUpdateAsset, useCreateAdminNotification, useUpdateAssignment } from "@/hooks/useSupabaseData";
import { tryGetCurrentMapsUrl } from "@/lib/geofence";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Asset } from "@/lib/types";
import { cn, getAssetDisplayName } from "@/lib/utils";
import { parseISO, format } from "date-fns";

type GearCondition = "okay" | "iffy" | "broken" | "donezo" | "lost";

function expandAssignedKitAssets(assignedAssetIds: string[] | null | undefined, allAssets: Asset[]): Asset[] {
  if (!assignedAssetIds?.length) return [];
  const assetById = new Map(allAssets.map((a) => [a.id, a]));
  const childrenByParent = new Map<string, Asset[]>();
  allAssets.forEach((a) => {
    if (!a.parent_asset_id) return;
    const siblings = childrenByParent.get(a.parent_asset_id) ?? [];
    siblings.push(a);
    childrenByParent.set(a.parent_asset_id, siblings);
  });
  const expandedIds = new Set<string>();
  const queue = [...assignedAssetIds];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || expandedIds.has(id)) continue;
    const asset = assetById.get(id);
    if (!asset) continue;
    expandedIds.add(id);
    if (asset.parent_asset_id && !expandedIds.has(asset.parent_asset_id)) queue.push(asset.parent_asset_id);
    if (!asset.parent_asset_id) {
      (childrenByParent.get(asset.id) ?? []).forEach((c) => { if (!expandedIds.has(c.id)) queue.push(c.id); });
    }
  }
  const expanded = [...expandedIds].map((id) => assetById.get(id)).filter(Boolean) as Asset[];
  const expandedSet = new Set(expanded.map((a) => a.id));
  const byName = (a: Asset, b: Asset) => (a.asset_name ?? "").localeCompare(b.asset_name ?? "");
  const roots = expanded.filter((a) => !a.parent_asset_id || !expandedSet.has(a.parent_asset_id)).sort(byName);
  const ordered: Asset[] = [];
  roots.forEach((root) => {
    ordered.push(root);
    (childrenByParent.get(root.id) ?? []).filter((c) => expandedSet.has(c.id)).sort(byName).forEach((c) => ordered.push(c));
  });
  const orderedIds = new Set(ordered.map((a) => a.id));
  return [...ordered, ...expanded.filter((a) => !orderedIds.has(a.id)).sort(byName)];
}

export default function GearCheckout() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { employee } = useAuth();
  const { data: jobs = [] } = useJobs();
  const { data: allAssets = [] } = useAssets();
  const { data: assignments = [] } = useAssignments();
  const updateAssetStatus = useUpdateAssetStatus();
  const updateAsset = useUpdateAsset();
  const updateAssignment = useUpdateAssignment();
  const createNotification = useCreateAdminNotification();

  const job = jobs.find((j) => j.id === jobId);
  const assignment = assignments.find((a) => a.job_id === jobId && a.operator_id === employee?.id);
  const assignedAssets = useMemo(
    () => (assignment ? expandAssignedKitAssets(assignment.asset_ids, allAssets) : []),
    [assignment, allAssets]
  );

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [gearConditions, setGearConditions] = useState<Record<string, GearCondition>>({});
  const [gearNotes, setGearNotes] = useState<Record<string, string>>({});
  const [showLiability, setShowLiability] = useState(false);
  const [showUncheckedWarning, setShowUncheckedWarning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [prepOverrideAcked, setPrepOverrideAcked] = useState(false);
  const [showPrepWarning, setShowPrepWarning] = useState(false);
  const [healAsset, setHealAsset] = useState<Asset | null>(null);
  const [healLoading, setHealLoading] = useState(false);

  // Track which items were pre-flagged from mid-job reports
  const preFlaggedIds = useMemo(() => {
    const flagged = new Map<string, "donezo" | "lost">();
    assignedAssets.forEach((a) => {
      if (a.status === "broken") flagged.set(a.id, "donezo");
      else if (a.status === "missing") flagged.set(a.id, "lost");
    });
    return flagged;
  }, [assignedAssets]);

  // Auto-check and set conditions for pre-flagged items on mount
  useEffect(() => {
    if (preFlaggedIds.size === 0) return;
    setCheckedIds((prev) => {
      const next = new Set(prev);
      preFlaggedIds.forEach((_, id) => next.add(id));
      return next;
    });
    setGearConditions((prev) => {
      const next = { ...prev };
      preFlaggedIds.forEach((condition, id) => {
        if (!next[id]) next[id] = condition;
      });
      return next;
    });
  }, [preFlaggedIds]);

  // Build hierarchy
  const hierarchy = useMemo(() => {
    const assetById = new Map(assignedAssets.map((a) => [a.id, a]));
    const childMap = new Map<string, Asset[]>();
    const roots: Asset[] = [];
    assignedAssets.forEach((a) => {
      if (a.parent_asset_id && assetById.has(a.parent_asset_id)) {
        const siblings = childMap.get(a.parent_asset_id) ?? [];
        siblings.push(a);
        childMap.set(a.parent_asset_id, siblings);
        return;
      }
      roots.push(a);
    });
    const byName = (a: Asset, b: Asset) => (a.asset_name ?? "").localeCompare(b.asset_name ?? "");
    roots.sort(byName);
    childMap.forEach((children, pid) => childMap.set(pid, [...children].sort(byName)));
    return { roots, childMap };
  }, [assignedAssets]);

  const allAssetIds = useMemo(() => new Set(assignedAssets.map((a) => a.id)), [assignedAssets]);
  const allChecked = allAssetIds.size > 0 && checkedIds.size === allAssetIds.size;

  // Check all conditions are set for checked items (pre-flagged bypass notes)
  const allConditionsSet = useMemo(() => {
    for (const id of checkedIds) {
      const cond = gearConditions[id];
      if (!cond) return false;
      // Pre-flagged items (donezo/lost) don't need notes — already reported
      if (cond === "donezo" || cond === "lost") continue;
      if ((cond === "iffy" || cond === "broken") && !gearNotes[id]?.trim()) return false;
    }
    return true;
  }, [checkedIds, gearConditions, gearNotes]);

  const canConfirm = allChecked && allConditionsSet;

  const uncheckedIds = useMemo(() => {
    const missing = new Set<string>();
    allAssetIds.forEach((id) => { if (!checkedIds.has(id)) missing.add(id); });
    return missing;
  }, [allAssetIds, checkedIds]);

  const toggleId = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      const nowChecked = !next.has(id);
      if (nowChecked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      // Cascade to children when toggling a parent
      const children = hierarchy.childMap.get(id) ?? [];
      children.forEach((child) => {
        if (nowChecked) {
          next.add(child.id);
        } else {
          next.delete(child.id);
        }
      });
      return next;
    });
    // Also set default "okay" condition for newly checked items
    setGearConditions((prev) => {
      const children = hierarchy.childMap.get(id) ?? [];
      const asset = assignedAssets.find((a) => a.id === id);
      const isChecking = !checkedIds.has(id);
      if (!isChecking) return prev;
      const next = { ...prev };
      if (!next[id]) next[id] = preFlaggedIds.get(id) ?? "okay";
      children.forEach((child) => {
        if (!next[child.id]) next[child.id] = preFlaggedIds.get(child.id) ?? "okay";
      });
      return next;
    });
    setShowUncheckedWarning(false);
  };

  const setCondition = (id: string, condition: GearCondition) => {
    setGearConditions((prev) => ({ ...prev, [id]: condition }));
    if (condition === "okay") {
      setGearNotes((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const handleHealConfirm = async () => {
    if (!healAsset) return;
    setHealLoading(true);
    try {
      await updateAsset.mutateAsync({ id: healAsset.id, status: "available", damage_notes: "" });
      await supabase.from("sea_of_lost_items").delete().eq("parent_asset_id", healAsset.id);
      setCheckedIds((prev) => new Set(prev).add(healAsset.id));
      setGearConditions((prev) => ({ ...prev, [healAsset.id]: "okay" }));
      toast.success(`✅ ${healAsset.asset_name} marked as available!`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to update asset");
    } finally {
      setHealLoading(false);
      setHealAsset(null);
    }
  };

  const handleSelectAll = () => {
    setShowLiability(true);
  };

  const handleLiabilityProceed = () => {
    const allIds = new Set(allAssetIds);
    setCheckedIds(allIds);
    // Set all conditions to "okay" except pre-flagged items
    const conditions: Record<string, GearCondition> = {};
    allIds.forEach((id) => {
      const preFlag = preFlaggedIds.get(id);
      conditions[id] = preFlag ?? "okay";
    });
    setGearConditions(conditions);
    setGearNotes({});
    setShowLiability(false);
  };

  const handleConfirmCheckout = async () => {
    if (!allChecked) {
      setShowUncheckedWarning(true);
      toast.error("Check off every item before completing checkout.");
      return;
    }

    // Validate damage notes (skip pre-flagged donezo/lost)
    for (const [id, cond] of Object.entries(gearConditions)) {
      if (cond === "donezo" || cond === "lost") continue;
      if ((cond === "iffy" || cond === "broken") && !gearNotes[id]?.trim()) {
        toast.error("Describe the damage for all flagged items.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // 📍 Capture GPS breadcrumb (best-effort)
      setCapturingLocation(true);
      const checkoutLocationUrl = await tryGetCurrentMapsUrl();
      setCapturingLocation(false);

      for (const id of checkedIds) {
        const condition = gearConditions[id] ?? "okay";
        if (condition === "donezo" || condition === "broken") {
          await updateAsset.mutateAsync({ id, status: "broken", damage_notes: gearNotes[id] || allAssets.find(a => a.id === id)?.damage_notes || "" });
        } else if (condition === "lost") {
          await updateAsset.mutateAsync({ id, status: "missing", damage_notes: gearNotes[id] || allAssets.find(a => a.id === id)?.damage_notes || "" });
        } else if (condition === "iffy") {
          await updateAsset.mutateAsync({ id, status: "iffy", damage_notes: gearNotes[id] ?? "" });
        } else {
          await updateAssetStatus.mutateAsync({ id, status: "checked_out" });
        }
      }

      // Save the breadcrumb to the assignment
      if (assignment?.id && checkoutLocationUrl) {
        await updateAssignment.mutateAsync({ id: assignment.id, checkout_location_url: checkoutLocationUrl });
      }

      // Notify admins about gear checkout
      if (employee?.id && jobId) {
        const assetNames = assignedAssets.map(a => a.asset_name).filter(Boolean).slice(0, 3).join(", ");
        const suffix = assignedAssets.length > 3 ? ` +${assignedAssets.length - 3} more` : "";
        await createNotification.mutateAsync({
          operator_id: employee.id,
          job_id: jobId,
          notification_type: "gear_checkout",
          recipient_role: "manager",
          title: "Gear Checked Out 📦",
          message: `${employee.name ?? "Operator"} has checked out gear for ${job.client_name ?? "a job"}: ${assetNames}${suffix}`,
        });
      }
      toast.success("Gear checked out! Returning to dashboard.");
      navigate("/");
    } catch (err: any) {
      toast.error(`Checkout failed: ${err.message}`);
    } finally {
      setCapturingLocation(false);
      setIsSubmitting(false);
    }
  };

  const isParentChecked = (parentId: string) => checkedIds.has(parentId);

  if (!job || !assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <Package className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-muted-foreground">Job or assignment not found.</p>
          <Button variant="outline" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 pb-32 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">Gear Checkout</h1>
          <p className="text-sm text-muted-foreground">
            {job.client_name}
            {job.job_number && ` · #${job.job_number}`}
            {job.job_date && ` · ${format(parseISO(job.job_date), "EEE, MMM d")}`}
          </p>
        </div>
      </div>

      {/* Prep not done warning */}
      {job.status === "needs_prep" && !prepOverrideAcked && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-xl border-2 border-yellow-500/60 bg-yellow-500/10 p-4 space-y-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-yellow-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">Heads Up — Gear Not Prepped Yet</p>
              <p className="text-sm text-muted-foreground">
                This job is still in <span className="font-medium text-yellow-500">"Needs Looking At"</span> status.
                An admin or gear manager hasn't completed the Prep Checklist yet. So now YOU have to be that person — make sure you check it, recheck it and check it again before you leave the office. Some items may be missing or in unknown condition.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/")}>
              <ArrowLeft className="h-3.5 w-3.5" /> Go Back
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5"
              onClick={() => setPrepOverrideAcked(true)}
            >
              I Understand — Proceed Anyway
            </Button>
          </div>
        </motion.div>
      )}

      {/* Select All Button */}
      {allAssetIds.size > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <Button
            variant="outline"
            className="w-full gap-2 py-3 text-primary border-primary/30 hover:bg-primary/10"
            onClick={handleSelectAll}
            disabled={allChecked}
          >
            <ShieldAlert className="h-4 w-4" />
            {allChecked ? "All Items Selected" : "Select All (I'm in a hurry)"}
          </Button>
        </motion.div>
      )}

      {/* Gear Hierarchy */}
      <div className="space-y-4">
        {hierarchy.roots.map((parent, idx) => {
          const children = hierarchy.childMap.get(parent.id) ?? [];
          const parentIsChecked = checkedIds.has(parent.id);
          return (
            <motion.div
              key={parent.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="rounded-xl glass-card border border-border/40 overflow-hidden"
            >
              {/* Parent */}
              <div className={cn(
                "p-4 flex items-center gap-3",
                showUncheckedWarning && uncheckedIds.has(parent.id) && "ring-2 ring-destructive/60 bg-destructive/5",
              )}>
                <Checkbox
                  checked={parentIsChecked}
                  onCheckedChange={() => toggleId(parent.id)}
                  className="h-5 w-5"
                />
                <span className="rounded-full w-3 h-3 shrink-0" style={{ backgroundColor: parent.color_code }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-foreground">{parent.asset_name}</p>
                    {parent.status && !["available", "good", "checked_out"].includes(parent.status) && !preFlaggedIds.has(parent.id) && (
                      <Badge
                        className={cn(
                        "text-[9px] px-1.5 py-0 font-black uppercase tracking-wider",
                        "cursor-pointer hover:opacity-80",
                        parent.status === "broken" ? "bg-destructive/20 text-destructive border-destructive/30" :
                        parent.status === "missing" ? "bg-warning/20 text-warning border-warning/30" :
                        parent.status === "iffy" ? "bg-amber-500/20 text-amber-500 border-amber-500/30" :
                        "bg-muted/20 text-muted-foreground border-muted/30"
                        )}
                        onClick={(e) => { e.stopPropagation(); setHealAsset(parent); }}
                      >
                        ⚠️ {parent.status}
                      </Badge>
                    )}
                    {preFlaggedIds.has(parent.id) && (
                      <Badge className={cn(
                        "text-[9px] px-1.5 py-0 font-black uppercase tracking-wider",
                        preFlaggedIds.get(parent.id) === "donezo"
                          ? "bg-destructive/20 text-destructive border-destructive/30"
                          : "bg-warning/20 text-warning border-warning/30"
                      )}>
                        {preFlaggedIds.get(parent.id) === "donezo" ? "Donezo" : "Lost"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{parent.category}</p>
                </div>
                {showUncheckedWarning && uncheckedIds.has(parent.id) && (
                  <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[9px] animate-pulse">MISSED</Badge>
                )}
                <ConditionSelect
                  value={gearConditions[parent.id] ?? "okay"}
                  onChange={(v) => setCondition(parent.id, v)}
                  disabled={!parentIsChecked}
                />
              </div>

              {/* Damage notes for parent */}
              {parentIsChecked && (gearConditions[parent.id] === "iffy" || gearConditions[parent.id] === "broken") && (
                <div className="px-4 pb-3">
                  <Textarea
                    placeholder="Describe the damage (required)…"
                    value={gearNotes[parent.id] ?? ""}
                    onChange={(e) => setGearNotes((prev) => ({ ...prev, [parent.id]: e.target.value }))}
                    className={cn("min-h-[50px] text-xs",
                      gearConditions[parent.id] === "iffy" ? "border-warning/30 focus-visible:ring-warning" : "border-destructive/30 focus-visible:ring-destructive"
                    )}
                  />
                </div>
              )}

              {/* Children */}
              {children.length > 0 && (
                <div className="border-t border-border/20">
                  {children.map((child) => {
                    const childDisabled = !parentIsChecked;
                    const childChecked = checkedIds.has(child.id);
                    return (
                      <div key={child.id}>
                        <div className={cn(
                          "px-4 py-3 flex items-center gap-3 ml-4 border-l-2 border-primary/15",
                          childDisabled && "opacity-40",
                          showUncheckedWarning && uncheckedIds.has(child.id) && !childDisabled && "ring-2 ring-destructive/60 bg-destructive/5",
                        )}>
                          <Checkbox
                            checked={childChecked}
                            onCheckedChange={() => toggleId(child.id)}
                            disabled={childDisabled}
                            className="h-4 w-4"
                          />
                          <span className="rounded-full w-2 h-2 shrink-0" style={{ backgroundColor: child.color_code }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-medium text-foreground">{child.metadata?.macbook_type ? getAssetDisplayName(child) : child.asset_name}</p>
                              {child.status && !["available", "good", "checked_out"].includes(child.status) && !preFlaggedIds.has(child.id) && (
                                <Badge
                                  className={cn(
                                  "text-[8px] px-1 py-0 font-black uppercase tracking-wider",
                                  "cursor-pointer hover:opacity-80",
                                  child.status === "broken" ? "bg-destructive/20 text-destructive border-destructive/30" :
                                  child.status === "missing" ? "bg-warning/20 text-warning border-warning/30" :
                                  child.status === "iffy" ? "bg-amber-500/20 text-amber-500 border-amber-500/30" :
                                  "bg-muted/20 text-muted-foreground border-muted/30"
                                  )}
                                  onClick={(e) => { e.stopPropagation(); setHealAsset(child); }}
                                >
                                  ⚠️ {child.status}
                                </Badge>
                              )}
                              {preFlaggedIds.has(child.id) && (
                                <Badge className={cn(
                                  "text-[8px] px-1 py-0 font-black uppercase tracking-wider",
                                  preFlaggedIds.get(child.id) === "donezo"
                                    ? "bg-destructive/20 text-destructive border-destructive/30"
                                    : "bg-warning/20 text-warning border-warning/30"
                                )}>
                                  {preFlaggedIds.get(child.id) === "donezo" ? "Donezo" : "Lost"}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {showUncheckedWarning && uncheckedIds.has(child.id) && !childDisabled && (
                            <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[9px] animate-pulse">MISSED</Badge>
                          )}
                          <ConditionSelect
                            value={gearConditions[child.id] ?? "okay"}
                            onChange={(v) => setCondition(child.id, v)}
                            disabled={childDisabled || !childChecked}
                            small
                          />
                        </div>
                        {/* Damage notes for child */}
                        {childChecked && !childDisabled && (gearConditions[child.id] === "iffy" || gearConditions[child.id] === "broken") && (
                          <div className="px-4 pb-2 ml-4">
                            <Textarea
                              placeholder="Describe the damage (required)…"
                              value={gearNotes[child.id] ?? ""}
                              onChange={(e) => setGearNotes((prev) => ({ ...prev, [child.id]: e.target.value }))}
                              className={cn("min-h-[40px] text-xs",
                                gearConditions[child.id] === "iffy" ? "border-warning/30 focus-visible:ring-warning" : "border-destructive/30 focus-visible:ring-destructive"
                              )}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {assignedAssets.length === 0 && (
        <div className="text-center py-16">
          <Package className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">No gear assigned to this job.</p>
        </div>
      )}

      {/* Sticky Confirm Button */}
      {allAssetIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-lg border-t border-border/40 z-50">
          <div className="max-w-2xl mx-auto">
            <Button
              className={cn(
                "w-full py-6 text-lg font-bold gap-2 transition-all",
                canConfirm
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 glow-primary"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              disabled={!canConfirm || isSubmitting}
              onClick={handleConfirmCheckout}
            >
              <CheckCircle2 className="h-5 w-5" />
              {capturingLocation
                ? "📍 Capturing location…"
                : isSubmitting
                  ? "Processing…"
                  : canConfirm
                    ? "Confirm Gear Checkout"
                    : `Check all items (${checkedIds.size}/${allAssetIds.size})`}
            </Button>
          </div>
        </div>
      )}

      {/* Liability Warning Modal */}
      <AlertDialog open={showLiability} onOpenChange={setShowLiability}>
        <AlertDialogContent className="glass-dark border-warning/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning text-lg">
              <AlertTriangle className="h-6 w-6" /> Hold Up!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground text-base leading-relaxed">
              By clicking <strong>Proceed</strong>, you are verifying that <strong>every single piece</strong> of this kit is physically in your possession.
              If a cable or computer is missing on set, <strong className="text-warning">it's on you</strong>. Are you sure you have everything?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel className="sm:flex-1">Cancel (Let me check)</AlertDialogCancel>
            <AlertDialogAction
              className="sm:flex-1 bg-warning text-warning-foreground hover:bg-warning/90 font-bold"
              onClick={handleLiabilityProceed}
            >
              Proceed (I have everything)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Heal Confirmation Dialog */}
      <AlertDialog open={!!healAsset} onOpenChange={(v) => { if (!v) setHealAsset(null); }}>
        <AlertDialogContent className="glass-dark border-primary/10 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <Wrench className="h-5 w-5 text-warning" />
              Resolve Flagged Gear
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/80 text-sm leading-relaxed">
              <strong>{healAsset?.asset_name}</strong> is currently marked as{" "}
              <span className="font-bold uppercase">{healAsset?.status}</span>.
              <br /><br />
              Are you sure this item is currently present and working?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel className="sm:flex-1" disabled={healLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="sm:flex-1 gap-1.5"
              onClick={(e) => { e.preventDefault(); handleHealConfirm(); }}
              disabled={healLoading}
            >
              <CheckCircle2 className="h-4 w-4" />
              {healLoading ? "Updating…" : "Yes, it's fine"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── Condition Dropdown ─── */
function ConditionSelect({
  value,
  onChange,
  disabled,
  small,
}: {
  value: GearCondition;
  onChange: (v: GearCondition) => void;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as GearCondition)} disabled={disabled}>
      <SelectTrigger
        className={cn(
          small ? "w-[80px] h-6 text-[10px]" : "w-[88px] h-7 text-[10px]",
          value === "iffy" && "border-warning/50 text-warning",
          value === "broken" && "border-destructive/50 text-destructive",
          value === "donezo" && "border-destructive/50 text-destructive bg-destructive/10",
          value === "lost" && "border-warning/50 text-warning bg-warning/10",
          disabled && "opacity-40",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="okay">Okay</SelectItem>
        <SelectItem value="iffy">Iffy</SelectItem>
        <SelectItem value="broken">Broken</SelectItem>
        <SelectItem value="donezo">Donezo</SelectItem>
        <SelectItem value="lost">Lost</SelectItem>
      </SelectContent>
    </Select>
  );
}
