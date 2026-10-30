import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import {
  Zap, Calendar as CalendarIcon, Clock, Building2, MapPin, Package,
  CheckCircle2, XCircle, Rocket, Sparkles,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateAssignment } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Job, Asset, Assignment } from "@/lib/types";

interface CallSheetData {
  job: Job;
  assets: Asset[];
  assignment: Assignment;
}

interface Props {
  sheets: CallSheetData[];
}

const SKIP_KEY_PREFIX = "pending-mission-skipped:";

export function PendingMissionAlert({ sheets }: Props) {
  const { employee } = useAuth();
  const updateAssignment = useUpdateAssignment();
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [confirmDeny, setConfirmDeny] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset session-skips on mount (each app load = fresh nag)
  useEffect(() => {
    const raw = sessionStorage.getItem(SKIP_KEY_PREFIX + "session");
    if (raw) {
      try { setSkippedIds(new Set(JSON.parse(raw))); } catch { /* ignore */ }
    }
  }, []);

  const pending = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return sheets.filter((s) => {
      if (skippedIds.has(s.assignment.id)) return false;
      if (s.assignment.mission_accepted === true) return false;
      if (s.assignment.mission_accepted === false) return false; // already declined
      if (["cancelled", "completed"].includes(s.job.status)) return false;
      if (s.job.job_date && s.job.job_date < today) return false; // past
      return true;
    });
  }, [sheets, skippedIds]);

  const sheet = pending[0];

  if (!sheet) return null;
  const { job, assignment, assets } = sheet;
  const gear = assets.filter((a) => !a.id.startsWith("virtual-") && !a.parent_asset_id);

  const skip = (id: string) => {
    const next = new Set(skippedIds);
    next.add(id);
    setSkippedIds(next);
    sessionStorage.setItem(SKIP_KEY_PREFIX + "session", JSON.stringify(Array.from(next)));
  };

  const notifyAdmin = async (type: "mission_accepted" | "mission_declined", title: string, message: string) => {
    if (!employee) return;
    await supabase.from("admin_notifications").insert({
      notification_type: type,
      operator_id: employee.id,
      job_id: job.id,
      title,
      message,
      recipient_role: "manager",
    } as any);
  };

  const handleAccept = async () => {
    setBusy(true);
    try {
      await updateAssignment.mutateAsync({ id: assignment.id, mission_accepted: true });
      await notifyAdmin(
        "mission_accepted",
        "Mission Accepted! 🚀",
        `${employee?.name ?? "Operator"} accepted the mission for ${job.client_name} on ${job.job_date}`
      );
      toast.success("Mission accepted — let's go! 🚀");
    } finally {
      setBusy(false);
    }
  };

  const handleDeny = async () => {
    setBusy(true);
    try {
      await updateAssignment.mutateAsync({ id: assignment.id, mission_accepted: false });
      await notifyAdmin(
        "mission_declined",
        "Mission Declined ⚠️",
        `${employee?.name ?? "Operator"} declined the mission for ${job.client_name} on ${job.job_date}`
      );
      toast.info("Mission declined. Manager notified.");
      setConfirmDeny(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) skip(assignment.id); }}>
        <DialogContent
          className="max-w-lg p-0 overflow-hidden border-primary/40 bg-gradient-to-br from-background via-background to-primary/10 shadow-[0_0_60px_hsl(var(--primary)/0.35)]"
        >
          {/* Animated glow bar */}
          <div className="relative h-1.5 w-full overflow-hidden bg-primary/10">
            <motion.div
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent"
              animate={{ x: ["-100%", "300%"] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
            />
          </div>

          <div className="px-6 pt-6 pb-2 text-center space-y-2">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 14 }}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30"
            >
              <Rocket className="h-8 w-8 text-primary" />
            </motion.div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-primary/80 font-semibold flex items-center justify-center gap-1.5">
              <Sparkles className="h-3 w-3" /> Incoming Mission <Sparkles className="h-3 w-3" />
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              {job.client_name}
            </h2>
            {pending.length > 1 && (
              <p className="text-xs text-muted-foreground">
                {pending.length - 1} more pending after this one
              </p>
            )}
          </div>

          <div className="px-6 pb-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <Row icon={<CalendarIcon className="h-4 w-4 text-primary" />}
                label={job.job_date ? format(parseISO(job.job_date + "T12:00:00"), "EEEE, MMMM d, yyyy") : "TBD"} />
              {job.call_time && (
                <Row icon={<Clock className="h-4 w-4 text-primary" />}
                  label={<>Call Time: <span className="font-semibold text-foreground">{job.call_time}</span></>} />
              )}
              <Row icon={<Building2 className="h-4 w-4 text-primary" />} label={job.location_type || "Location TBD"} />
              {job.address && (
                <Row icon={<MapPin className="h-4 w-4 text-primary" />} label={<span className="text-xs">{job.address}</span>} />
              )}
              {job.guaranteed_hours && (
                <Row icon={<Zap className="h-4 w-4 text-primary" />}
                  label={<>Guaranteed: <span className="font-semibold text-foreground">{job.guaranteed_hours}h</span></>} />
              )}
              {gear.length > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <Package className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">Gear ({gear.length})</p>
                    <ul className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                      {gear.slice(0, 5).map((a) => (<li key={a.id}>• {a.asset_name}</li>))}
                      {gear.length > 5 && <li className="italic">+ {gear.length - 5} more…</li>}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {job.notes && (
              <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
                <p className="text-xs text-foreground/90 whitespace-pre-wrap">{job.notes}</p>
              </div>
            )}
          </div>

          <div className="px-6 pb-6 pt-2 grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              size="lg"
              className="h-14 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive gap-2 text-base"
              onClick={() => setConfirmDeny(true)}
              disabled={busy}
            >
              <XCircle className="h-5 w-5" /> Decline
            </Button>
            <Button
              size="lg"
              className="h-14 bg-primary hover:bg-primary/90 gap-2 text-base font-semibold shadow-[0_0_24px_hsl(var(--primary)/0.4)]"
              onClick={handleAccept}
              disabled={busy}
            >
              <CheckCircle2 className="h-5 w-5" />
              {busy ? "Accepting…" : "Accept Mission"}
            </Button>
          </div>

          <button
            className="text-[11px] text-muted-foreground hover:text-foreground pb-4 mx-auto block underline underline-offset-2"
            onClick={() => skip(assignment.id)}
            disabled={busy}
          >
            Remind me later
          </button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDeny} onOpenChange={setConfirmDeny}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this mission?</AlertDialogTitle>
            <AlertDialogDescription>
              Your manager will be notified immediately so they can reassign {job.client_name} on {job.job_date}. This can't be undone from the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Never mind</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeny(); }}
              disabled={busy}
              className="bg-destructive hover:bg-destructive/90"
            >
              {busy ? "Declining…" : "Yes, decline"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Row({ icon, label }: { icon: React.ReactNode; label: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-foreground/90">
      {icon}
      <span>{label}</span>
    </div>
  );
}
