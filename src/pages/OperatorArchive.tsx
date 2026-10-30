import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, parseISO, differenceInMinutes } from "date-fns";
import {
  Clock, MapPin, Calendar, Car, Building2, ArrowLeft, Pencil,
  Package, Receipt, Trash2, Upload, Home,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { OperatorSkeleton } from "@/components/LoadingSkeleton";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";

function formatDuration(startISO: string, endISO: string): string {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  const totalMin = differenceInMinutes(end, start);
  if (totalMin < 0) return "—";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDecimalHours(startISO: string, endISO: string): string {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  const totalMin = differenceInMinutes(end, start);
  if (totalMin < 0) return "0";
  return (totalMin / 60).toFixed(1);
}

function formatTimestamp(iso: string): string {
  try {
    return format(parseISO(iso), "h:mm a");
  } catch {
    return iso;
  }
}

function isoToLocalInput(iso: string): string {
  try {
    return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm");
  } catch {
    return "";
  }
}

function parseGuaranteed(val?: string | number | null): number {
  if (val == null) return 8;
  if (typeof val === "number") return isFinite(val) && val > 0 ? val : 8;
  const s = String(val).trim();
  const colon = s.match(/^(\d+):(\d{1,2})$/);
  if (colon) return Number(colon[1]) + Number(colon[2]) / 60;
  const num = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isFinite(num) && num > 0 ? num : 8;
}

/**
 * OT/DT split based on guaranteed day length:
 * - 8h day:  REG 0–8,  OT 8–12,  DT 12+
 * - 10h day: REG 0–10, OT 10–12, DT 12+
 * - 12h day: REG 0–12, OT 12–14, DT 14+
 * - other:   REG up to guaranteed, OT next 2h, DT beyond
 */
function splitHours(totalH: number, guaranteed: number) {
  if (totalH <= 0) return { reg: 0, ot: 0, dt: 0 };
  let otCap: number;
  if (guaranteed <= 8) otCap = 12;
  else if (guaranteed <= 10) otCap = 12;
  else if (guaranteed <= 12) otCap = 14;
  else otCap = guaranteed + 2;

  const reg = Math.min(totalH, guaranteed);
  const ot = Math.max(0, Math.min(totalH, otCap) - guaranteed);
  const dt = Math.max(0, totalH - otCap);
  return { reg, ot, dt };
}

function fmtH(h: number): string {
  return `${h.toFixed(2)}h`;
}

interface PastJob {
  assignment_id: string;
  clock_in: string;
  clock_out: string;
  mileage_amount: number | null;
  expense_amount: number | null;
  end_of_day_notes: string | null;
  receipt_urls: string[] | null;
  asset_ids: string[] | null;
  job_id: string;
  job_number: string | null;
  client_name: string | null;
  job_date: string | null;
  address: string | null;
  location_type: string | null;
  distance_miles: number | null;
  call_time: string | null;
  guaranteed_hours: string | null;
}

interface AssetRow {
  id: string;
  asset_name: string | null;
  category: string | null;
  status: string | null;
}

export default function OperatorArchive({ onBack }: { onBack: () => void }) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();

  const [warningJob, setWarningJob] = useState<PastJob | null>(null);
  const [editingJob, setEditingJob] = useState<PastJob | null>(null);

  // Editable fields
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [editExpense, setEditExpense] = useState<number>(0);
  const [editMileage, setEditMileage] = useState<number>(0);
  const [editNotes, setEditNotes] = useState("");
  const [editReceipts, setEditReceipts] = useState<string[]>([]);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  // Asset ids the operator says they STILL have at home (will be re-flagged checked_out)
  const [stillHaveIds, setStillHaveIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: pastJobs, isLoading } = useQuery({
    queryKey: ["operator-archive", employee?.id],
    enabled: !!employee?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: assignmentRows, error: aErr } = await supabase
        .from("assignments")
        .select("id, job_id, actual_start_time, actual_end_time, mileage_amount, expense_amount, end_of_day_notes, receipt_urls, asset_ids")
        .eq("operator_id", employee!.id)
        .not("actual_end_time", "is", null)
        .order("actual_end_time", { ascending: false });

      if (aErr) throw aErr;
      if (!assignmentRows?.length) return [] as PastJob[];

      const jobIds = [...new Set(assignmentRows.map((a) => a.job_id).filter(Boolean))] as string[];

      const { data: jobRows, error: jErr } = await supabase
        .from("jobs")
        .select("id, job_number, client_name, job_date, address, location_type, distance_miles, call_time, guaranteed_hours")
        .in("id", jobIds);

      if (jErr) throw jErr;
      const jobMap = new Map((jobRows ?? []).map((j) => [j.id, j]));

      return assignmentRows
        .map((a) => {
          const job = a.job_id ? jobMap.get(a.job_id) : null;
          if (!job || !a.actual_start_time || !a.actual_end_time) return null;
          return {
            assignment_id: a.id,
            clock_in: a.actual_start_time,
            clock_out: a.actual_end_time,
            mileage_amount: a.mileage_amount,
            expense_amount: a.expense_amount,
            end_of_day_notes: a.end_of_day_notes,
            receipt_urls: a.receipt_urls,
            asset_ids: a.asset_ids,
            job_id: job.id,
            job_number: job.job_number,
            client_name: job.client_name,
            job_date: job.job_date,
            address: job.address,
            location_type: job.location_type,
            distance_miles: job.distance_miles,
            call_time: job.call_time,
            guaranteed_hours: (job as any).guaranteed_hours ?? null,
          } as PastJob;
        })
        .filter(Boolean) as PastJob[];
    },
  });

  // Load assets for the assignment currently being edited
  const { data: editAssets } = useQuery({
    queryKey: ["edit-timecard-assets", editingJob?.assignment_id, editingJob?.asset_ids],
    enabled: !!editingJob && !!editingJob.asset_ids?.length,
    queryFn: async () => {
      const ids = editingJob!.asset_ids ?? [];
      if (!ids.length) return [] as AssetRow[];
      const { data, error } = await supabase
        .from("assets")
        .select("id, asset_name, category, status")
        .in("id", ids);
      if (error) throw error;
      return (data ?? []) as AssetRow[];
    },
  });

  const openEditor = (job: PastJob) => {
    setEditingJob(job);
    setEditIn(isoToLocalInput(job.clock_in));
    setEditOut(isoToLocalInput(job.clock_out));
    setEditExpense(Number(job.expense_amount ?? 0));
    setEditMileage(Number(job.mileage_amount ?? 0));
    setEditNotes(job.end_of_day_notes ?? "");
    setEditReceipts(job.receipt_urls ?? []);
    setStillHaveIds(new Set());
    setWarningJob(null);
  };

  const closeEditor = () => {
    setEditingJob(null);
    setStillHaveIds(new Set());
  };

  const handleUploadReceipt = async (file: File) => {
    if (!editingJob) return;
    setUploadingReceipt(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${editingJob.assignment_id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, file);
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("receipts").createSignedUrl(path, 60 * 60 * 24 * 30);
      if (signed?.signedUrl) setEditReceipts((p) => [...p, signed.signedUrl]);
      toast({ title: "Receipt added" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleSave = async () => {
    if (!editingJob) return;
    const inDate = new Date(editIn);
    const outDate = new Date(editOut);
    if (isNaN(inDate.getTime()) || isNaN(outDate.getTime())) {
      toast({ title: "Invalid time", description: "Please enter valid clock in / out times.", variant: "destructive" });
      return;
    }
    if (outDate <= inDate) {
      toast({ title: "Out must be after In", description: "Clock-out has to come after clock-in.", variant: "destructive" });
      return;
    }
    if (editExpense > 1000) {
      toast({ title: "Expense too high", description: "Max $1000 per assignment.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("assignments")
      .update({
        actual_start_time: inDate.toISOString(),
        actual_end_time: outDate.toISOString(),
        expense_amount: editExpense || 0,
        mileage_amount: editMileage || 0,
        end_of_day_notes: editNotes || null,
        receipt_urls: editReceipts,
        time_manually_edited: true,
      })
      .eq("id", editingJob.assignment_id);

    if (error) {
      setSaving(false);
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
      return;
    }

    // For gear marked as "still have at home", flip asset status back to checked_out
    if (stillHaveIds.size > 0) {
      const ids = Array.from(stillHaveIds);
      const { error: assetErr } = await supabase
        .from("assets")
        .update({ status: "checked_out" })
        .in("id", ids);
      if (assetErr) {
        setSaving(false);
        toast({
          title: "Timecard saved, but gear update failed",
          description: assetErr.message,
          variant: "destructive",
        });
        return;
      }
    }

    setSaving(false);
    toast({ title: "Timecard updated", description: "Your changes are saved." });
    closeEditor();
    queryClient.invalidateQueries({ queryKey: ["operator-archive", employee?.id] });
    queryClient.invalidateQueries({ queryKey: ["assets"] });
  };

  if (isLoading) return <OperatorSkeleton />;

  return (
    <div className="min-h-screen px-4 py-6 pb-20 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Past Jobs</h1>
          <p className="text-sm text-muted-foreground">
            {pastJobs?.length ?? 0} completed timecard{(pastJobs?.length ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {(!pastJobs || pastJobs.length === 0) && (
        <div className="text-center py-16">
          <Clock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No completed jobs yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {pastJobs?.map((job, i) => (
          <motion.div
            key={job.assignment_id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
          >
            <Card className="glass-card border-border/40 overflow-hidden">
              <div className="border-b border-border/20 bg-muted/30 px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Building2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-semibold text-foreground truncate">
                    {job.client_name || "Untitled Job"}
                  </span>
                  {job.job_number && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      #{job.job_number}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setWarningJob(job)}
                    className="h-7 px-2 text-xs shrink-0 ml-1"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                </div>
                {job.job_date && (
                  <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(parseISO(job.job_date), "MMM d, yyyy")}
                  </span>
                )}
              </div>

              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 text-success">
                      <Clock className="h-3.5 w-3.5" />
                      <span className="font-medium">In: {formatTimestamp(job.clock_in)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-destructive">
                      <Clock className="h-3.5 w-3.5" />
                      <span className="font-medium">Out: {formatTimestamp(job.clock_out)}</span>
                    </div>
                  </div>
                  <Badge className="bg-primary/15 text-primary border-primary/30 text-sm font-bold px-3">
                    {formatDuration(job.clock_in, job.clock_out)} ({formatDecimalHours(job.clock_in, job.clock_out)} hrs)
                  </Badge>
                </div>

                {job.address && (
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{job.address}</span>
                  </div>
                )}

                {((job.distance_miles ?? 0) > 0 || (job.mileage_amount ?? 0) > 0 || (job.expense_amount ?? 0) > 0) && (
                  <div className="flex items-center gap-4 flex-wrap text-xs">
                    {(job.distance_miles ?? 0) > 0 && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Car className="h-3.5 w-3.5" />
                        <span>{Math.round(job.distance_miles!)} mi</span>
                      </div>
                    )}
                    {(job.mileage_amount ?? 0) > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        Mileage: ${Number(job.mileage_amount).toFixed(2)}
                      </Badge>
                    )}
                    {(job.expense_amount ?? 0) > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        Expenses: ${Number(job.expense_amount).toFixed(2)}
                      </Badge>
                    )}
                    {(job.receipt_urls?.length ?? 0) > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {job.receipt_urls!.length} receipt{job.receipt_urls!.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                )}

                {job.end_of_day_notes && (
                  <p className="text-xs text-muted-foreground italic border-t border-border/20 pt-2">
                    "{job.end_of_day_notes}"
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Warning before edit */}
      <AlertDialog open={!!warningJob} onOpenChange={(o) => !o && setWarningJob(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hold up ⚠️</AlertDialogTitle>
            <AlertDialogDescription>
              This is your timecard, bub, and you're signing off that it's 100% accurate.
              Changing it now is messing with time and space (not to mention legality). Do it wisely!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Never Mind</AlertDialogCancel>
            <AlertDialogAction onClick={() => warningJob && openEditor(warningJob)}>
              I Understand — Edit Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Full edit dialog */}
      <Dialog open={!!editingJob} onOpenChange={(o) => !o && closeEditor()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Timecard</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Times */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Clock In
                </Label>
                <Input type="datetime-local" value={editIn} onChange={(e) => setEditIn(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Clock Out
                </Label>
                <Input type="datetime-local" value={editOut} onChange={(e) => setEditOut(e.target.value)} />
              </div>
            </div>


            {/* Live hours / OT / DT breakdown */}
            {(() => {
              const inD = new Date(editIn);
              const outD = new Date(editOut);
              const validIn = !isNaN(inD.getTime());
              const validOut = !isNaN(outD.getTime());
              if (!validIn || !validOut) return null;
              if (outD <= inD) {
                return (
                  <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    Clock-out has to be <span className="font-semibold">after</span> clock-in. Time can't run backwards, bub.
                  </div>
                );
              }
              const totalH = (outD.getTime() - inD.getTime()) / 3_600_000;
              const guaranteed = parseGuaranteed(editingJob?.guaranteed_hours);
              const { reg, ot, dt } = splitHours(totalH, guaranteed);
              return (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      On-Site Total
                    </p>
                    <p className="text-lg font-bold text-foreground tabular-nums">{fmtH(totalH)}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Based on a {guaranteed}-hour scheduled day
                  </p>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="rounded-xl bg-muted/40 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Reg</p>
                      <p className="text-sm font-semibold text-foreground tabular-nums">{fmtH(reg)}</p>
                    </div>
                    <div className={`rounded-xl p-2 text-center ${ot > 0 ? "bg-warning/15" : "bg-muted/40"}`}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">OT</p>
                      <p className={`text-sm font-semibold tabular-nums ${ot > 0 ? "text-warning" : "text-foreground"}`}>{fmtH(ot)}</p>
                    </div>
                    <div className={`rounded-xl p-2 text-center ${dt > 0 ? "bg-destructive/15" : "bg-muted/40"}`}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">DT</p>
                      <p className={`text-sm font-semibold tabular-nums ${dt > 0 ? "text-destructive" : "text-foreground"}`}>{fmtH(dt)}</p>
                    </div>
                  </div>
                </div>
              );
            })()}


            {/* Expense / Mileage */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Expense ($)
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  step={0.01}
                  value={editExpense}
                  onChange={(e) => setEditExpense(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Mileage ($)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editMileage}
                  onChange={(e) => setEditMileage(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                End of Day Notes
              </Label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Anything notable about the job…"
                className="min-h-[90px]"
              />
            </div>

            {/* Receipts */}
            <div className="space-y-3 rounded-2xl border border-border/40 p-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Receipts</p>
              </div>
              {editReceipts.length === 0 && (
                <p className="text-xs text-muted-foreground">No receipts attached.</p>
              )}
              <div className="space-y-2">
                {editReceipts.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-xl bg-muted/40 p-2">
                    <img src={url} alt={`Receipt ${idx + 1}`} className="h-14 w-14 rounded-lg object-cover" />
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary underline-offset-2 hover:underline flex-1 truncate"
                    >
                      Receipt {idx + 1}
                    </a>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditReceipts((p) => p.filter((_, i) => i !== idx))}
                      className="h-8 w-8 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <label className="flex items-center justify-center gap-2 cursor-pointer rounded-xl border border-dashed border-primary/40 px-3 py-3 hover:bg-primary/5 transition-colors">
                <Upload className="h-4 w-4 text-primary" />
                <span className="text-sm text-primary">
                  {uploadingReceipt ? "Uploading…" : "Add Receipt Photo"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={uploadingReceipt}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadReceipt(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            {/* Gear list */}
            <div className="space-y-3 rounded-2xl border border-border/40 p-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Returned Gear</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Accidentally checked something in that's still at home? Flip it to{" "}
                <span className="font-semibold text-foreground">"Still at home"</span> — we'll mark it
                checked out to you again.
              </p>

              {(editingJob?.asset_ids?.length ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground italic">No gear was logged on this job.</p>
              )}

              <div className="space-y-2">
                {editAssets?.map((asset) => {
                  const stillHave = stillHaveIds.has(asset.id);
                  return (
                    <div
                      key={asset.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                        stillHave ? "border-warning/50 bg-warning/10" : "border-border/30 bg-muted/30"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {asset.asset_name || "Unnamed asset"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {asset.category || "—"} · status: {asset.status || "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Home className={`h-4 w-4 ${stillHave ? "text-warning" : "text-muted-foreground/50"}`} />
                        <span className="text-[11px] text-muted-foreground hidden sm:inline">
                          Still at home
                        </span>
                        <Switch
                          checked={stillHave}
                          onCheckedChange={(checked) => {
                            setStillHaveIds((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(asset.id);
                              else next.delete(asset.id);
                              return next;
                            });
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeEditor} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                !editIn ||
                !editOut ||
                isNaN(new Date(editIn).getTime()) ||
                isNaN(new Date(editOut).getTime()) ||
                new Date(editOut) <= new Date(editIn)
              }
            >
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
