import { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Radio, Timer, Users, Zap, ArrowLeft, AlertTriangle, MessageSquare, Car, Wrench, LogOut, Package, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useJobs, useAssets, useAssignments, useEmployees, useLostItems, useUpdateAssignment, useUpdateAssetStatus, useUpdateJobStatus } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { LiveChatThread } from "@/components/LiveChatThread";
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
import type { Job, Assignment } from "@/lib/types";

function formatTimer(totalSeconds: number): string {
  const h = Math.floor(Math.abs(totalSeconds) / 3600);
  const m = Math.floor((Math.abs(totalSeconds) % 3600) / 60);
  const s = Math.abs(totalSeconds) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getGuaranteedSeconds(hours?: string): number {
  return parseFloat(hours || "0") * 3600;
}

function OperatorTimerCard({ assignment, job, operatorName, onClick }: { assignment: Assignment; job: Job; operatorName: string; onClick: () => void }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!assignment.actual_start_time) return;
    const start = new Date(assignment.actual_start_time).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [assignment.actual_start_time]);

  const guaranteedSecs = getGuaranteedSeconds(job.guaranteed_hours);
  const remaining = guaranteedSecs - elapsed;
  const isOT = guaranteedSecs > 0 && remaining <= 0;
  const isOTWarning = guaranteedSecs > 0 && remaining > 0 && remaining <= 1800;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card
        className={cn(
          "border backdrop-blur-sm transition-all cursor-pointer hover:ring-2 hover:ring-primary/30",
          isOT ? "border-destructive/40 bg-destructive/5 glow-destructive" : isOTWarning ? "border-warning/40 bg-warning/5" : "border-primary/20 bg-card/60 glow-primary"
        )}
        onClick={onClick}
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <p className="text-lg font-bold text-foreground truncate">{operatorName}</p>
              <p className="text-sm text-muted-foreground truncate">{job.client_name} — {job.job_number}</p>
              {job.location_type && (
                <Badge variant="outline" className="text-[10px] mt-1">{job.location_type}</Badge>
              )}
            </div>
            <div className="text-right shrink-0 space-y-1">
              <p className={cn(
                "text-3xl font-bold font-technical tracking-wider",
                isOT ? "text-destructive animate-pulse" : "text-primary"
              )}>
                {formatTimer(elapsed)}
              </p>
              {guaranteedSecs > 0 && (
                isOT ? (
                  <p className="text-xs text-destructive font-semibold flex items-center justify-end gap-1">
                    <Zap className="h-3 w-3" /> OT: {formatTimer(Math.abs(remaining))}
                  </p>
                ) : (
                  <p className={cn("text-xs font-medium", isOTWarning ? "text-warning" : "text-muted-foreground")}>
                    {isOTWarning ? "⚠ " : ""}Remaining: {formatTimer(remaining)}
                  </p>
                )
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── Job Detail View (Admin real-time) ─── */
function LiveJobDetail({ jobId }: { jobId: string }) {
  const navigate = useNavigate();
  const { employee: currentEmployee } = useAuth();
  const { data: jobs = [] } = useJobs();
  const { data: allAssets = [] } = useAssets();
  const { data: assignments = [] } = useAssignments();
  const { data: employees = [] } = useEmployees();
  const { data: lostItems = [] } = useLostItems();
  const updateAssignmentMutation = useUpdateAssignment();
  const updateAssetStatus = useUpdateAssetStatus();
  const updateJobStatus = useUpdateJobStatus();
  const [elapsed, setElapsed] = useState(0);
  const [liveNotes, setLiveNotes] = useState<{ note: string; ts: string; type?: string; metadata?: any }[]>([]);
  const [forceClockOutTarget, setForceClockOutTarget] = useState<{ assignmentId: string; operatorName: string; operatorId: string } | null>(null);
  const [checkInTarget, setCheckInTarget] = useState<{ assignmentId: string; operatorName: string; assetIds: string[] } | null>(null);

  const job = jobs.find((j) => j.id === jobId);
  const jobAssignments = assignments.filter((a) => a.job_id === jobId);
  const activeAssignment = jobAssignments.find((a) => a.actual_start_time && !a.actual_end_time);
  const operator = activeAssignment ? employees.find((e) => e.id === activeAssignment.operator_id) : null;
  const jobLostItems = lostItems.filter((li) => li.job_id === jobId);

  // Poll for admin notifications (traffic/delay notes) for this job
  useEffect(() => {
    if (!jobId) return;
    const fetchNotes = async () => {
      const { data } = await supabase
        .from("admin_notifications")
        .select("message, created_at, notification_type, metadata")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      if (data) {
        setLiveNotes(data.map((n: any) => ({ note: n.message ?? "", ts: n.created_at, type: n.notification_type, metadata: n.metadata })));
      }
    };
    fetchNotes();
    const interval = setInterval(fetchNotes, 10000); // poll every 10s
    return () => clearInterval(interval);
  }, [jobId]);

  useEffect(() => {
    if (!activeAssignment?.actual_start_time) return;
    const start = new Date(activeAssignment.actual_start_time).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeAssignment?.actual_start_time]);

  if (!job) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/live-dispatch")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Live Dispatch
        </Button>
        <p className="text-muted-foreground">Job not found.</p>
      </div>
    );
  }

  const guaranteedSecs = getGuaranteedSeconds(job.guaranteed_hours);
  const remaining = guaranteedSecs - elapsed;
  const isOT = guaranteedSecs > 0 && remaining <= 0;

  // Collect all asset IDs across all assignments for this job
  const allJobAssetIds = jobAssignments.flatMap((a) => a.asset_ids || []);

  const handleForceClockOut = async () => {
    if (!forceClockOutTarget) return;
    await updateAssignmentMutation.mutateAsync({
      id: forceClockOutTarget.assignmentId,
      actual_end_time: new Date().toISOString(),
      time_manually_edited: true,
    });
    // Notification to operator
    await supabase.from("admin_notifications").insert({
      operator_id: forceClockOutTarget.operatorId,
      job_id: jobId,
      notification_type: "force_clockout",
      recipient_role: "operator",
      recipient_id: forceClockOutTarget.operatorId,
      title: "Time to wrap up! 👋",
      message: "Forgot something? Looks like you forgot to check yourself out (and/or your gear). Please remember that the only way we keep track of items is by you doing this process. Let's remember to leave it better for the next person!",
    });
    // Send email to operator
    const op = employees.find((e) => e.id === forceClockOutTarget.operatorId);
    if (op?.email) {
      supabase.functions.invoke("send-job-emails", {
        body: {
          emails: [{
            type: "force_clockout",
            to: op.email,
            recipientName: op.name,
            jobDetails: {
              jobNumber: job.job_number || "",
              clientName: job.client_name || "",
              jobDate: job.job_date || "",
            },
          }],
        },
      }).catch((err) => console.error("[force_clockout email]", err));
    }
    toast.success(`✅ ${forceClockOutTarget.operatorName} has been clocked out.`);
    setForceClockOutTarget(null);
  };

  const handleGearCheckIn = async () => {
    if (!checkInTarget) return;
    try {
      // Mark all assets (and their children) as available
      for (const assetId of checkInTarget.assetIds) {
        await updateAssetStatus.mutateAsync({ id: assetId, status: "available" });
        const children = allAssets.filter((a) => a.parent_asset_id === assetId);
        for (const child of children) {
          await updateAssetStatus.mutateAsync({ id: child.id, status: "available" });
        }
      }
      // Move job to pending_sign_off if still launched
      if (job.status === "launched") {
        await updateJobStatus.mutateAsync({ id: job.id, status: "pending_sign_off" });
      }
      toast.success(`📦 Gear checked in for ${checkInTarget.operatorName}. Job moved to Pending Sign-Off.`);
      setCheckInTarget(null);
    } catch (err: any) {
      toast.error(`Failed to check in gear: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/live-dispatch")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{job.client_name}</h1>
          <p className="text-sm text-muted-foreground">Job #{job.job_number} · {job.job_date}</p>
        </div>
        <Badge variant="outline" className="ml-auto">{job.status.replace(/_/g, " ")}</Badge>
      </div>

      {/* Live Timer */}
      {activeAssignment && (
        <Card className={cn("border", isOT ? "border-destructive/40 bg-destructive/5" : "border-primary/20 bg-primary/5")}>
          <CardContent className="p-6 text-center space-y-2">
            {operator && (
              <p className="text-sm text-muted-foreground">Operator: <span className="text-foreground font-semibold">{operator.name}</span></p>
            )}
            {activeAssignment.actual_start_time && (
              <p className="text-xs text-muted-foreground">
                Clocked In: {new Date(activeAssignment.actual_start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            <p className={cn("text-5xl font-bold font-technical tracking-wider", isOT ? "text-destructive animate-pulse" : "text-primary")}>
              {formatTimer(elapsed)}
            </p>
            {guaranteedSecs > 0 && (
              isOT ? (
                <p className="text-sm text-destructive font-semibold flex items-center justify-center gap-1">
                  <Zap className="h-4 w-4" /> Overtime: {formatTimer(Math.abs(remaining))}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Remaining: {formatTimer(remaining)}</p>
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* Admin Actions — Operators on this job */}
      <Card className="border-primary/20">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Operators & Admin Actions
          </p>
          {jobAssignments.length === 0 && (
            <p className="text-sm text-muted-foreground">No operators assigned.</p>
          )}
          {jobAssignments.map((asgn) => {
            const op = employees.find((e) => e.id === asgn.operator_id);
            const opName = op?.name || "Unknown";
            const isClockedIn = !!asgn.actual_start_time && !asgn.actual_end_time;
            const isClockedOut = !!asgn.actual_end_time;
            const assetIds = asgn.asset_ids || [];

            return (
              <div key={asgn.id} className="rounded-lg border border-border/40 bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                    {opName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{opName}</p>
                    {asgn.actual_start_time && (
                      <p className="text-xs text-muted-foreground">
                        Clocked in: {new Date(asgn.actual_start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {isClockedOut && asgn.actual_end_time && ` → Out: ${new Date(asgn.actual_end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                      </p>
                    )}
                    {!asgn.actual_start_time && (
                      <p className="text-xs text-muted-foreground">Not yet clocked in</p>
                    )}
                  </div>
                  {isClockedIn && (
                    <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">Live</Badge>
                  )}
                  {isClockedOut && (
                    <Badge className="bg-muted text-muted-foreground text-[10px]">Done</Badge>
                  )}
                  {(asgn as any).geofence_flagged && (
                    <Badge
                      variant="outline"
                      className="bg-warning/15 text-warning border-warning/40 text-[10px]"
                      title={(asgn as any).geofence_distance_miles ? `Clocked in ~${Number((asgn as any).geofence_distance_miles).toFixed(2)} mi from venue` : "Clocked in outside geofence"}
                    >
                      ⚠ Off-site clock-in
                    </Badge>
                  )}
                </div>

                {/* GPS Breadcrumbs */}
                {((asgn as any).checkout_location_url || (asgn as any).checkin_location_url) && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] pl-11">
                    {(asgn as any).checkout_location_url && (
                      <a
                        href={(asgn as any).checkout_location_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                        title="Where this operator checked out the gear"
                      >
                        📍 Checkout map
                      </a>
                    )}
                    {(asgn as any).checkin_location_url && (
                      <a
                        href={(asgn as any).checkin_location_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                        title="Where this operator returned the gear"
                      >
                        📍 Check-in map
                      </a>
                    )}
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  {isClockedIn && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="text-xs h-8 gap-1.5"
                      onClick={() => setForceClockOutTarget({
                        assignmentId: asgn.id,
                        operatorName: opName,
                        operatorId: asgn.operator_id || "",
                      })}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Force Clock Out
                    </Button>
                  )}
                  {assetIds.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 gap-1.5"
                      onClick={() => setCheckInTarget({
                        assignmentId: asgn.id,
                        operatorName: opName,
                        assetIds,
                      })}
                    >
                      <Package className="h-3.5 w-3.5" />
                      Check In Gear
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Live Notes / Traffic Alerts */}
      {liveNotes.length > 0 && (
        <Card className="border-primary/20">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Operator Notes & Alerts
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {liveNotes.map((n, i) => (
                <div key={i} className={cn(
                  "rounded-xl p-3 text-sm",
                  n.type === "traffic_delay"
                    ? "bg-warning/10 border border-warning/30"
                    : n.note?.includes("broken") || n.note?.includes("Broken")
                    ? "bg-destructive/10 border border-destructive/30"
                    : "bg-muted/50 border border-border"
                )}>
                  <p className="text-foreground">{n.note}</p>
                  {n.type === "traffic_delay" && n.metadata?.lat && n.metadata?.lng && (
                    <div className="mt-2 space-y-2">
                      <div className="rounded-lg overflow-hidden border border-border aspect-video max-h-52">
                        <iframe
                          title="Operator location"
                          width="100%"
                          height="100%"
                          style={{ border: 0 }}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(n.metadata.lng) - 0.01},${Number(n.metadata.lat) - 0.01},${Number(n.metadata.lng) + 0.01},${Number(n.metadata.lat) + 0.01}&layer=mapnik&marker=${n.metadata.lat},${n.metadata.lng}`}
                        />
                      </div>
                      <a
                        href={`https://www.google.com/maps?q=${n.metadata.lat},${n.metadata.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                      >
                        <MapPin className="h-3.5 w-3.5" /> Open in Google Maps
                      </a>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(n.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gear Issues */}
      {jobLostItems.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-destructive flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" /> Gear Issues
            </p>
            {jobLostItems.map((li) => (
              <div key={li.id} className="flex items-center gap-2 text-sm">
                <Badge className={cn(
                  "text-[10px]",
                  li.condition === "broken" ? "bg-destructive/20 text-destructive border-destructive/30" :
                  li.condition === "iffy" ? "bg-warning/20 text-warning border-warning/30" :
                  "bg-muted text-muted-foreground"
                )}>{li.condition}</Badge>
                <span className="text-foreground">{li.item_name} ×{li.missing_quantity}</span>
                {li.notes && <span className="text-xs text-muted-foreground">— {li.notes}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Live Chat with Operators */}
      {currentEmployee && (
        <LiveChatThread
          jobId={jobId}
          senderId={currentEmployee.id}
          senderName={currentEmployee.name || "Admin"}
          senderType="manager"
          maxHeight="280px"
        />
      )}


      {jobAssignments.filter(a => a.end_of_day_notes).map(a => (
        <Card key={a.id} className="border-border/50">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">End of Day Notes</p>
            <p className="text-sm text-foreground">{a.end_of_day_notes}</p>
          </CardContent>
        </Card>
      ))}

      {/* Force Clock Out Alert Dialog */}
      <AlertDialog open={!!forceClockOutTarget} onOpenChange={(open) => !open && setForceClockOutTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force Clock Out</AlertDialogTitle>
            <AlertDialogDescription>
              Force clock out {forceClockOutTarget?.operatorName}? This will set their end time to right now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={handleForceClockOut}>
              Force Clock Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Gear Check-In Alert Dialog */}
      <AlertDialog open={!!checkInTarget} onOpenChange={(open) => !open && setCheckInTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Check In Gear</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Mark all {checkInTarget?.assetIds.length} gear item(s) from {checkInTarget?.operatorName} as returned? This will set all assets back to "available" and move the job to Pending Sign-Off.</p>
                {(() => {
                  if (!checkInTarget) return null;
                  const flagged = checkInTarget.assetIds.flatMap((id) => {
                    const parent = allAssets.find((a) => a.id === id);
                    const children = allAssets.filter((a) => a.parent_asset_id === id);
                    return [parent, ...children].filter((a) => a && (a.status === "broken" || a.status === "missing"));
                  });
                  if (flagged.length === 0) return null;
                  return (
                    <div className="rounded-md border border-warning/40 bg-warning/10 p-3 space-y-1">
                      <p className="text-xs font-semibold text-warning flex items-center gap-1">⚠️ Admin Override — {flagged.length} flagged item(s) will be restored:</p>
                      {flagged.map((a) => (
                        <p key={a!.id} className="text-xs text-foreground">
                          {a!.asset_name} — <span className={a!.status === "broken" ? "text-destructive" : "text-warning"}>{a!.status}</span>
                        </p>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGearCheckIn}>
              Override & Check In All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function LiveDispatch() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { data: jobs = [] } = useJobs();
  const { data: assignments = [] } = useAssignments();
  const { data: employees = [] } = useEmployees();

  const activeTimers = useMemo(() => {
    return assignments
      .filter((a) => a.actual_start_time && !a.actual_end_time)
      .map((a) => {
        const job = jobs.find((j) => j.id === a.job_id);
        const op = employees.find((e) => e.id === a.operator_id);
        return job && op ? { assignment: a, job, operatorName: op.name } : null;
      })
      .filter(Boolean) as { assignment: Assignment; job: Job; operatorName: string }[];
  }, [jobs, assignments, employees]);


  // If we have a jobId param, show detail view
  if (jobId) {
    return <LiveJobDetail jobId={jobId} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 glow-primary">
          <Radio className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Live Dispatch</h1>
          <p className="text-sm text-muted-foreground">All currently clocked-in operators across the company</p>
        </div>
        <Badge variant="outline" className="ml-auto text-sm gap-1.5 px-3 py-1.5">
          <Users className="h-3.5 w-3.5" /> {activeTimers.length} Active
        </Badge>
      </div>

      {activeTimers.length === 0 ? (
        <Card className="border-dashed border-border/50 bg-card/30 backdrop-blur-sm">
          <CardContent className="p-12 text-center">
            <Timer className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg font-semibold text-muted-foreground">No Active Timers</p>
            <p className="text-sm text-muted-foreground/70 mt-1">No operators are currently clocked in.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeTimers.map((t) => (
            <OperatorTimerCard
              key={t.assignment.id}
              assignment={t.assignment}
              job={t.job}
              operatorName={t.operatorName}
              onClick={() => navigate(`/live-dispatch/${t.job.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
