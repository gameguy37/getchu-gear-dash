import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarDays, MapPin, Clock, Users, Package, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
  needs_prep: "Needs Looking At",
  ready_for_takeoff: "Ready for Takeoff",
  launched: "Launched",
  pending_sign_off: "Pending Sign-Off",
  completed: "Completed",
  cancelled: "Cancelled",
};

const statusBadgeColors: Record<string, string> = {
  needs_prep: "bg-muted text-muted-foreground",
  ready_for_takeoff: "bg-warning/15 text-warning",
  launched: "bg-success/15 text-success",
  pending_sign_off: "bg-accent/15 text-accent",
  completed: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase();
}

export default function ClientPortalPublic() {
  const { token } = useParams<{ token: string }>();
  const [job, setJob] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showKillFee, setShowKillFee] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (!token) { setError(true); setLoading(false); return; }
    (async () => {
      // Use secure RPC function instead of direct table query
      const { data, error: fetchErr } = await supabase.rpc("get_job_by_portal_token", { _token: token });
      if (fetchErr || !data || (Array.isArray(data) && data.length === 0)) {
        setError(true);
      } else {
        const jobData = Array.isArray(data) ? data[0] : data;
        setJob(jobData);
      }
      setLoading(false);
    })();
  }, [token]);

  const contactName = job?.client_name ?? "there";

  const canCancel = useMemo(() => {
    if (!job) return false;
    if (job.cancelled_by_client_at || job.status === "cancelled" || job.status === "completed" || job.status === "launched") return false;
    return true;
  }, [job]);

  const isInKillFeeWindow = useMemo(() => {
    if (!job?.job_date) return false;
    const jobDateStr = job.job_date;
    const callTime = job.call_time;
    let cutoff: Date;
    const baseDate = new Date(jobDateStr + "T08:00:00");
    if (callTime) {
      const [h, m] = callTime.split(":").map(Number);
      const callDate = new Date(jobDateStr + "T00:00:00");
      callDate.setHours(h, m || 0, 0, 0);
      cutoff = callDate < baseDate ? callDate : baseDate;
    } else {
      cutoff = baseDate;
    }
    const deadline = new Date(cutoff.getTime() - 24 * 60 * 60 * 1000);
    return new Date() >= deadline;
  }, [job]);

  const handleCancelClick = () => {
    if (isInKillFeeWindow) {
      setShowKillFee(true);
    } else {
      setShowCancel(true);
    }
  };

  const handleConfirmCancel = async () => {
    if (!token) return;
    setCancelling(true);
    try {
      // Use secure RPC function instead of direct table update
      const { error: cancelErr } = await supabase.rpc("cancel_job_by_portal_token", { _token: token });
      if (cancelErr) throw cancelErr;

      setCancelled(true);
      setJob((prev: any) => ({ ...prev, status: "cancelled", cancelled_by_client_at: new Date().toISOString() }));
    } catch (err: any) {
      toast.error(`Failed to cancel: ${err.message}`);
    } finally {
      setCancelling(false);
      setShowCancel(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center gap-4">
        <div className="text-5xl">😕</div>
        <h1 className="text-2xl font-bold text-foreground">We couldn't find that booking</h1>
        <p className="text-muted-foreground max-w-md">The link may have expired or the booking may have been removed. If you believe this is an error, please reach out to us at <a href="mailto:info@promptin.com" className="text-primary underline">info@promptin.com</a>.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <span className="text-sm font-bold text-primary-foreground">G</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">GetchüGear — Your Production Booking Details</h1>
            <p className="text-xs text-muted-foreground">Promptin' Circumstance</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-xl font-bold text-foreground">Hi {contactName}! 👋</h2>
          <p className="text-sm text-muted-foreground mt-1">Here are your booking details{job.job_number ? ` for Job #${job.job_number}` : ""}.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-border/50">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-bold text-foreground">{job.client_name}</p>
                  {job.job_number && <p className="text-xs text-muted-foreground">Job #{job.job_number}</p>}
                </div>
                <Badge className={cn("text-xs", statusBadgeColors[job.status] || "bg-muted text-muted-foreground")}>
                  {STATUS_LABELS[job.status] || job.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {job.job_date && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1"><CalendarDays className="h-3.5 w-3.5" /><span className="text-[10px] uppercase tracking-wider font-medium">Date</span></div>
                    <p className="text-sm font-semibold text-foreground">{format(parseISO(job.job_date + "T12:00:00"), "EEEE, MMM d, yyyy")}</p>
                  </div>
                )}
                {job.call_time && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1"><Clock className="h-3.5 w-3.5" /><span className="text-[10px] uppercase tracking-wider font-medium">Call Time</span></div>
                    <p className="text-sm font-semibold text-foreground">{job.call_time}</p>
                  </div>
                )}
                {job.location_type && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1"><MapPin className="h-3.5 w-3.5" /><span className="text-[10px] uppercase tracking-wider font-medium">Location</span></div>
                    <p className="text-sm font-semibold text-foreground">{job.location_type}</p>
                  </div>
                )}
                {job.address && (
                  <div className="rounded-lg bg-muted/50 p-3 col-span-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1"><MapPin className="h-3.5 w-3.5" /><span className="text-[10px] uppercase tracking-wider font-medium">Address</span></div>
                    <p className="text-sm font-semibold text-foreground">{job.address}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Disclaimer */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-border/50">
            <CardContent className="p-5">
              <div className="rounded-lg bg-warning/10 border border-warning/30 p-3">
                <p className="text-xs text-warning font-medium flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Please note</p>
                <p className="text-xs text-foreground/80 mt-1">Crew assignments and gear loadout are subject to change due to the many moving parts of live production. We'll always do our best to keep you updated!</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Cancellation */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-border/50">
            <CardContent className="p-5 space-y-3">
              {cancelled || job.cancelled_by_client_at ? (
                <div className="text-center py-4 space-y-2">
                  <p className="text-lg">✅</p>
                  <p className="text-foreground font-semibold">You've cancelled this booking.</p>
                  <p className="text-sm text-muted-foreground">We're sorry to see you go — hope to work together again soon! 💙</p>
                </div>
              ) : job.status === "cancelled" ? (
                <p className="text-sm text-muted-foreground text-center py-4">This job has already been cancelled.</p>
              ) : job.status === "completed" || job.status === "launched" ? (
                <p className="text-sm text-muted-foreground text-center py-4">This job is underway — cancellation is no longer available.</p>
              ) : canCancel ? (
                <Button variant="destructive" className="w-full" onClick={handleCancelClick}>
                  Cancel This Booking
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <AlertDialog open={showKillFee} onOpenChange={setShowKillFee}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Kill Fee Window</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/80 leading-relaxed">
              You are within the kill fee window. Our ops gave away other work and our gear was cordoned off just for you. Unfortunately, we can't cancel this job at this time. Please reach out to us directly at{" "}
              <a href="mailto:info@promptin.com" className="text-primary underline">info@promptin.com</a>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancel} onOpenChange={setShowCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Booking?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Booking</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel} disabled={cancelling} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cancelling ? "Cancelling…" : "Yes, Cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
