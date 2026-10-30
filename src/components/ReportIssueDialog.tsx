import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAssets, useAssignments, useUpdateAsset, useCreateLostItem, useCreateAdminNotification } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";

interface ReportIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetIds?: string[];
  jobId?: string;
}

export function ReportIssueDialog({ open, onOpenChange, assetIds, jobId }: ReportIssueDialogProps) {
  const { data: allAssets = [] } = useAssets();
  const { data: assignments = [] } = useAssignments();
  const { employee } = useAuth();
  const updateAsset = useUpdateAsset();
  const createLostItem = useCreateLostItem();
  const createNotification = useCreateAdminNotification();
  const [assetId, setAssetId] = useState("");
  const [issueType, setIssueType] = useState("");
  const [priority, setPriority] = useState("");
  const [description, setDescription] = useState("");
  const [missingQty, setMissingQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Derive available assets: use explicit assetIds, or fall back to operator's assigned assets
  const availableAssets = useMemo(() => {
    if (assetIds && assetIds.length > 0) {
      return allAssets.filter((a) => assetIds.includes(a.id));
    }
    // Fall back to assets from operator's active assignments
    if (employee?.id) {
      const myAssignments = assignments.filter(
        (a) => a.operator_id === employee.id && !a.actual_end_time
      );
      const myAssetIds = new Set(myAssignments.flatMap((a) => a.asset_ids || []));
      if (myAssetIds.size > 0) {
        // Include assigned assets + their children
        const directAssets = allAssets.filter((a) => myAssetIds.has(a.id));
        const childAssets = allAssets.filter((a) => a.parent_asset_id && myAssetIds.has(a.parent_asset_id));
        const combined = new Map<string, typeof allAssets[0]>();
        [...directAssets, ...childAssets].forEach((a) => combined.set(a.id, a));
        return Array.from(combined.values());
      }
    }
    return allAssets;
  }, [assetIds, allAssets, assignments, employee?.id]);

  const selectedAsset = allAssets.find((a) => a.id === assetId);
  const parentAsset = selectedAsset?.parent_asset_id
    ? allAssets.find((a) => a.id === selectedAsset.parent_asset_id)
    : null;
  const maxQty = Math.max(1, selectedAsset?.quantity ?? 1);
  const isMissing = issueType === "Missing";

  const handleSubmit = async () => {
    if (!assetId || !issueType || !priority) { toast.error("Please fill in all required fields."); return; }
    setSubmitting(true);
    try {
      const newStatus = issueType === "Missing" ? "missing" : issueType === "Broken" ? "broken" : "broken";
      const qty = isMissing ? Math.min(Math.max(1, missingQty), maxQty) : 1;
      await updateAsset.mutateAsync({
        id: assetId,
        status: newStatus,
        damage_notes: description || `${issueType} - ${priority} priority`,
      });

      await createLostItem.mutateAsync({
        item_name: selectedAsset?.asset_name ?? "Unknown",
        missing_quantity: qty,
        condition: newStatus,
        parent_asset_id: selectedAsset?.parent_asset_id ?? null,
        parent_rig_name: parentAsset?.asset_name ?? null,
        job_id: jobId ?? null,
        operator_id: employee?.id ?? null,
        notes: `Reported mid-job: ${description || issueType} (${priority} priority)`,
      });

      if (employee?.id && jobId) {
        await createNotification.mutateAsync({
          operator_id: employee.id,
          job_id: jobId,
          notification_type: "broken_gear",
          recipient_role: "manager",
          title: `${issueType} Gear Reported`,
          message: `${employee.name ?? "Operator"} reported ${selectedAsset?.asset_name} as ${issueType.toLowerCase()} — ${description || "no details"}`,
        });
      }

      toast.success(`${issueType} reported for ${selectedAsset?.asset_name}. Managers notified.`);
      setAssetId(""); setIssueType(""); setPriority(""); setDescription(""); setMissingQty(1);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Failed to report: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-xl"><AlertTriangle className="h-6 w-6 text-warning" />Report Lost or Broken Gear</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-base">Asset</Label>
            <Select value={assetId} onValueChange={(v) => { setAssetId(v); setMissingQty(1); }}>
              <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select asset..." /></SelectTrigger>
              <SelectContent>
                {availableAssets.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2 text-center">No gear assigned to your active jobs.</p>
                )}
                {availableAssets.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.asset_name}{a.serial ? ` (${a.serial})` : ""}{(a.quantity ?? 1) > 1 ? ` ×${a.quantity}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label className="text-base">Issue Type</Label><Select value={issueType} onValueChange={setIssueType}><SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select type..." /></SelectTrigger><SelectContent><SelectItem value="Broken">Broken</SelectItem><SelectItem value="Missing">Lost / Missing</SelectItem><SelectItem value="Maintenance">Needs Maintenance</SelectItem></SelectContent></Select></div>
          {isMissing && maxQty > 1 && (
            <div className="space-y-2">
              <Label className="text-base">How many are missing?</Label>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="icon" className="h-12 w-12 text-xl" onClick={() => setMissingQty((q) => Math.max(1, q - 1))} disabled={missingQty <= 1}>−</Button>
                <div className="flex-1 text-center text-2xl font-semibold tabular-nums">{missingQty} <span className="text-sm text-muted-foreground font-normal">of {maxQty}</span></div>
                <Button type="button" variant="outline" size="icon" className="h-12 w-12 text-xl" onClick={() => setMissingQty((q) => Math.min(maxQty, q + 1))} disabled={missingQty >= maxQty}>+</Button>
              </div>
            </div>
          )}
          <div className="space-y-2"><Label className="text-base">Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select priority..." /></SelectTrigger><SelectContent><SelectItem value="Low">Low</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="High">High</SelectItem><SelectItem value="Critical">Critical</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label className="text-base">What happened?</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what happened..." rows={3} className="text-base" /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2"><Button variant="outline" size="lg" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button><Button size="lg" onClick={handleSubmit} disabled={submitting} className="glow-primary flex-1 sm:flex-none">{submitting ? <><Loader2 className="h-5 w-5 animate-spin mr-1" />Reporting...</> : "Submit Report"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
