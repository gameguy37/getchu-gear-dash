import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useJobs, useAssets, useParentAssets, useEmployees, useAssignments, useClients, useUpdateJob, useUpdateJobStatus, useCreateAssignment, useUpdateAssignment, useDeleteAssignment, useDeleteJob, useLostItems, useCreateLostItem, useUpdateAssetStatus } from "@/hooks/useSupabaseData";
import { useNotificationSender } from "@/hooks/useNotificationSender";
import { Job, JobStatus, Asset } from "@/lib/types";
import { AssetNestTree } from "@/components/AssetNestTree";

import { CalendarDays, Users, Pencil, MapPin, Package, User, Plus, Car, CheckCircle2, PartyPopper, Send, Trash2, XCircle, AlertTriangle, Play, Clock, Timer, Building2, ChevronDown, ChevronUp, Rocket } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CreateJobDialog } from "@/components/CreateJobDialog";
import { PrepChecklist } from "@/components/PrepChecklist";
import { KanbanSkeleton } from "@/components/LoadingSkeleton";
import { sendCancellationEmail } from "@/lib/bookingEmail";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { cn } from "@/lib/utils";
import { LiveJobCards } from "@/components/LiveJobCards";
import { LiveChatThread } from "@/components/LiveChatThread";
import { useAuth } from "@/contexts/AuthContext";
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

const COLUMNS: { id: JobStatus; label: string }[] = [
  { id: "needs_prep", label: "Needs Looking At" },
  { id: "ready_for_takeoff", label: "Ready for Takeoff" },
  { id: "launched", label: "Launched" },
  { id: "pending_sign_off", label: "Pending Sign-Off" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

const statusColors: Record<JobStatus, string> = {
  needs_prep: "bg-muted text-muted-foreground",
  ready_for_takeoff: "bg-warning/15 text-warning",
  launched: "bg-primary/15 text-primary",
  pending_sign_off: "bg-accent/15 text-accent",
  completed: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

const headerBgColors: Record<JobStatus, string> = {
  needs_prep: "bg-muted/30 border-border",
  ready_for_takeoff: "bg-warning/10 border-warning/30",
  launched: "bg-success/10 border-success/30",
  pending_sign_off: "bg-accent/10 border-accent/30",
  completed: "bg-destructive/10 border-destructive/30",
  cancelled: "bg-destructive/10 border-destructive/30",
};

const statusBadgeColors: Record<JobStatus, string> = {
  needs_prep: "bg-muted/40 text-muted-foreground border-border",
  ready_for_takeoff: "bg-warning/20 text-warning border-warning/30",
  launched: "bg-success/20 text-success border-success/30",
  pending_sign_off: "bg-accent/20 text-accent border-accent/30",
  completed: "bg-destructive/20 text-destructive border-destructive/30",
  cancelled: "bg-destructive/20 text-destructive border-destructive/30",
};

type SignOffItemState = "good" | "missing" | "broken";

function DetailCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md bg-card/50 border border-border/30 p-2">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-xs font-semibold text-foreground">{value}</p>
    </div>
  );
}

function LiveOperatorRow({
  operatorName,
  startTime,
  startMs,
  guaranteedSec,
  onForceClockOut,
  isClockedOut,
  endTime,
}: {
  operatorName: string;
  startTime: string | null;
  startMs: number;
  guaranteedSec: number;
  onForceClockOut: () => void;
  isClockedOut: boolean;
  endTime: string | null;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startTime || isClockedOut) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startMs) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime, startMs, isClockedOut]);

  const isOT = guaranteedSec > 0 && elapsed > guaranteedSec;
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const timerStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const initials = operatorName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="rounded-lg border border-border/40 bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{operatorName}</p>
          {startTime && (
            <p className="text-xs text-muted-foreground">
              Clocked in at {new Date(startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        {isOT && <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">🔴 OT</Badge>}
      </div>
      {!isClockedOut && startTime && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" />
            <span className="text-sm font-mono font-bold text-primary">{timerStr}</span>
          </div>
          <Button size="sm" variant="destructive" className="text-xs h-7" onClick={onForceClockOut}>
            Force Clock Out
          </Button>
        </div>
      )}
      {isClockedOut && endTime && (
        <p className="text-xs text-muted-foreground">
          Clocked out at {new Date(endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}

function JobCard({
  job,
  index,
  onEdit,
  onClick,
  onDelete,
  assignmentCount,
  operatorName,
}: {
  job: Job;
  index: number;
  onEdit: (job: Job) => void;
  onClick: (job: Job) => void;
  onDelete: (job: Job) => void;
  assignmentCount: number;
  operatorName?: string;
}) {
  const isLive = job.status === "launched";
  const isDone = job.status === "completed";
  const isPending = job.status === "pending_sign_off";

  return (
    <Draggable draggableId={job.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
        >
          <Card
            className={cn(
              "mb-2 cursor-grab active:cursor-grabbing transition-shadow hover:ring-1 hover:ring-primary/20 overflow-hidden",
              snapshot.isDragging ? "shadow-lg ring-2 ring-primary/30" : "",
              isLive && "shadow-[0_0_12px_rgba(34,197,94,0.15)]"
            )}
            onClick={() => onClick(job)}
          >
            {/* Header bar */}
            <div className={cn("border-b px-3 py-2.5", headerBgColors[job.status])}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-sm font-semibold text-foreground truncate">{job.client_name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit(job); }}
                    className="p-1 rounded-md hover:bg-muted transition-colors"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(job); }}
                    className="p-1 rounded-md hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              </div>
              {/* Status badge + operator below client name */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {isLive && (
                  <Badge className="bg-success/20 text-success border-success/30 text-[10px]">
                    <Play className="h-3 w-3 mr-0.5 fill-success" /> LIVE
                  </Badge>
                )}
                {isDone && (
                  <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">
                    <CheckCircle2 className="h-3 w-3 mr-0.5" /> DONE
                  </Badge>
                )}
                {isPending && (
                  <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px]">
                    <Clock className="h-3 w-3 mr-0.5" /> PENDING
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] border-primary/20 text-muted-foreground">
                  {job.status.replace(/_/g, " ")}
                </Badge>
                {operatorName && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <User className="h-3 w-3" /> {operatorName}
                  </span>
                )}
              </div>
            </div>

            {/* Detail sub-cards */}
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-mono text-muted-foreground">{job.job_number}</span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" /> {assignmentCount}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {job.call_time && (
                  <DetailCell icon={<Clock className="h-3 w-3" />} label="Call Time" value={job.call_time} />
                )}
                {job.job_date && (
                  <DetailCell
                    icon={<CalendarDays className="h-3 w-3" />}
                    label="Date"
                    value={(() => {
                      try {
                        const d = new Date(job.job_date + "T12:00:00");
                        return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                      } catch { return job.job_date; }
                    })()}
                  />
                )}
                {(job.address || job.location_type) && (
                  <DetailCell icon={<MapPin className="h-3 w-3" />} label="Location" value={job.address || job.location_type || ""} />
                )}
                {job.guaranteed_hours && (
                  <DetailCell icon={<Timer className="h-3 w-3" />} label="Guaranteed" value={`${job.guaranteed_hours}h`} />
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </Draggable>
  );
}

export default function JobManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { employee } = useAuth();
  const { data: jobs = [], isLoading } = useJobs();
  const { data: assets = [] } = useAssets();
  const { data: parentAssetsQuery = [] } = useParentAssets();
  const { data: employees = [] } = useEmployees();
  const { data: assignments = [] } = useAssignments();
  const { data: clients = [] } = useClients();
  const { data: lostItems = [] } = useLostItems();
  const updateJobMutation = useUpdateJob();
  const updateJobStatusMutation = useUpdateJobStatus();
  const createAssignmentMutation = useCreateAssignment();
  const updateAssignmentMutation = useUpdateAssignment();
  const deleteAssignmentMutation = useDeleteAssignment();
  const deleteJobMutation = useDeleteJob();
  const createLostItemMutation = useCreateLostItem();
  const updateAssetStatusMutation = useUpdateAssetStatus();
  const { sendNotification } = useNotificationSender();

  // Realtime subscription: auto-refresh when jobs or assignments change
  useEffect(() => {
    const channel = supabase
      .channel("job-management-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => {
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, () => {
        queryClient.invalidateQueries({ queryKey: ["assignments"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);


  const [editJob, setEditJob] = useState<Job | null>(null);
  const [editForm, setEditForm] = useState<Partial<Job>>({});
  const [editMileageOverridden, setEditMileageOverridden] = useState(false);
  const [editOperatorId, setEditOperatorId] = useState("");
  const [editAssetIds, setEditAssetIds] = useState<string[]>([]);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const detailJob = detailJobId ? jobs.find((j) => j.id === detailJobId) ?? null : null;
  const setDetailJob = useCallback((j: Job | null) => setDetailJobId(j?.id ?? null), []);
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: ?job=<id> auto-opens that job's detail sheet (used by notifications)
  // ?job=<id>&prep=1 opens the Prep Checklist instead (used by Calendar for "Needs Looking At")
  useEffect(() => {
    const jobParam = searchParams.get("job");
    const prepParam = searchParams.get("prep");
    if (!jobParam || jobs.length === 0) return;
    const target = jobs.find((j) => j.id === jobParam);
    if (target) {
      if (prepParam && target.status === "needs_prep") {
        setPrepJob(target);
      } else {
        setDetailJobId(target.id);
      }
      // Clean the URL so back-nav / re-open works cleanly
      const next = new URLSearchParams(searchParams);
      next.delete("job");
      next.delete("prep");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, jobs, setSearchParams]);
  const [createOpen, setCreateOpen] = useState(false);
  const [sentComms, setSentComms] = useState<Record<string, Set<string>>>({});
  const [cancelAlertOpen, setCancelAlertOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [signOffJobId, setSignOffJobId] = useState<string | null>(null);
  const [prepJob, setPrepJob] = useState<Job | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [gearChecklistOpen, setGearChecklistOpen] = useState(false);
  const [checklistChecked, setChecklistChecked] = useState<Set<string>>(new Set());
  const [checklistConditions, setChecklistConditions] = useState<Record<string, string>>({});
  const [checklistIssueNotes, setChecklistIssueNotes] = useState<Record<string, string>>({});
  const [forceClockOutTarget, setForceClockOutTarget] = useState<{ assignmentId: string; operatorName: string; operatorId: string } | null>(null);
  const [deleteJobTarget, setDeleteJobTarget] = useState<Job | null>(null);
  const [gearCheckInTarget, setGearCheckInTarget] = useState<{ assignmentId: string; operatorName: string; assetIds: string[] } | null>(null);
  const [signOffItemStates, setSignOffItemStates] = useState<Record<string, SignOffItemState>>({});
  const [signOffItemNotes, setSignOffItemNotes] = useState<Record<string, string>>({});
  const [signOffIssueQty, setSignOffIssueQty] = useState<Record<string, number>>({});
  const [signOffNotes, setSignOffNotes] = useState("");
  const [jobArchive, setJobArchive] = useState<{ blob: Blob; filename: string } | null>(null);

  if (isLoading) return <KanbanSkeleton />;

  const operators = employees.filter((e) => e.user_type === "operator");
  const assignableParentAssets = parentAssetsQuery.length > 0
    ? parentAssetsQuery
    : assets.filter((a) => !a.parent_asset_id);

  const openEdit = (job: Job) => {
    setEditJob(job);
    setEditForm({ ...job });
    setEditMileageOverridden(false);
    // Load current assignment
    const jobAssignment = assignments.find((a) => a.job_id === job.id);
    setEditOperatorId(jobAssignment?.operator_id ?? "");
    setEditAssetIds(jobAssignment?.asset_ids ?? []);
  };

  const saveEdit = () => {
    if (!editJob) return;
    const previousAssignment = assignments.find((a) => a.job_id === editJob.id);
    const previousOperatorId = previousAssignment?.operator_id;

    // Detect if crucial details changed (for smart email trigger)
    const crucialChanged =
      editForm.job_date !== editJob.job_date ||
      editForm.call_time !== editJob.call_time ||
      editForm.location_type !== editJob.location_type ||
      editForm.address !== editJob.address ||
      editForm.guaranteed_hours !== editJob.guaranteed_hours ||
      editOperatorId !== (previousOperatorId ?? "");

    updateJobMutation.mutate(
      {
        id: editJob.id,
        job_number: editForm.job_number,
        client_name: editForm.client_name,
        job_date: editForm.job_date,
        call_time: editForm.call_time,
        location_type: editForm.location_type,
        notes: editForm.notes,
        address: editForm.address,
        distance_miles: editForm.distance_miles ?? null,
        mileage_reimbursement: editForm.mileage_reimbursement ?? null,
      },
      {
        onSuccess: () => {
          // Handle assignment update
          const operatorChanged = editOperatorId !== previousOperatorId;
          if (editOperatorId) {
            if (previousAssignment) {
              updateAssignmentMutation.mutate({
                id: previousAssignment.id,
                operator_id: editOperatorId,
                asset_ids: editAssetIds,
              });
            } else {
              createAssignmentMutation.mutate({
                job_id: editJob.id,
                operator_id: editOperatorId,
                asset_ids: editAssetIds,
              });
            }
          } else if (previousAssignment) {
            deleteAssignmentMutation.mutate(previousAssignment.id);
          }

          // Send update emails only if crucial details changed
          if (crucialChanged) {
            const emails: any[] = [];
            const appBaseUrl = window.location.origin;

            // Operator email (new assignment = booking, existing = update)
            if (editOperatorId) {
              const op = employees.find((e) => e.id === editOperatorId);
              if (op?.email) {
                const assetNames = editAssetIds.map((id) => {
                  const a = assets.find((x) => x.id === id);
                  return a ? `${a.asset_name} (${a.category})` : id;
                });
                emails.push({
                  type: operatorChanged ? "operator" : "operator_update",
                  to: op.email,
                  recipientName: op.name,
                  jobDetails: {
                    jobNumber: editForm.job_number ?? "",
                    clientName: editForm.client_name ?? "",
                    jobDate: editForm.job_date ?? "",
                    callTime: editForm.call_time ?? undefined,
                    locationType: editForm.location_type ?? undefined,
                    address: editForm.address ?? undefined,
                    guaranteedHours: editForm.guaranteed_hours ?? undefined,
                    assets: assetNames,
                    jobUrl: `${appBaseUrl}/`,
                  },
                });
              }
            }

            // Client email
            const client = (clients as any[]).find((c: any) => c.company_name === editForm.client_name);
            if (client?.email) {
              emails.push({
                type: "client_update",
                to: client.email,
                recipientName: editForm.client_name ?? "",
                jobDetails: {
                  jobNumber: editForm.job_number ?? "",
                  clientName: editForm.client_name ?? "",
                  jobDate: editForm.job_date ?? "",
                  callTime: editForm.call_time ?? undefined,
                  locationType: editForm.location_type ?? undefined,
                  address: editForm.address ?? undefined,
                },
              });
            }

            if (emails.length > 0) {
              supabase.functions.invoke("send-job-emails", { body: { emails } })
                .then(({ error }) => {
                  if (error) {
                    console.error("[send-job-emails] Update error:", error);
                    toast.success(`Updated ${editForm.client_name} (email send failed)`);
                  } else {
                    toast.success(`Updated ${editForm.client_name} & Update Emails Sent!`);
                  }
                });
            } else {
              toast.success(`Updated ${editForm.client_name}`);
            }
          } else {
            toast.success(`Updated ${editForm.client_name}`);
          }

          setEditJob(null);
        },
      }
    );
  };

  const onDragEnd = (result: DropResult) => {
    const { destination, draggableId } = result;
    if (!destination) return;

    const newStatus = destination.droppableId as JobStatus;
    const job = jobs.find((j) => j.id === draggableId);
    updateJobStatusMutation.mutate(
      { id: draggableId, status: newStatus },
      {
        onSuccess: () => {
          if (job) {
            toast.success(`${job.client_name} → ${newStatus.replace(/_/g, " ")}`);

            // Fire notifications based on status change
            const jobAssignments = assignments.filter((a) => a.job_id === job.id);
            const assignedOperatorIds = jobAssignments.map((a) => a.operator_id).filter(Boolean);
            const statusLabel = newStatus.replace(/_/g, " ");

            if (newStatus === "ready_for_takeoff" || newStatus === "launched") {
              assignedOperatorIds.forEach((opId) => {
                const op = employees.find((e) => e.id === opId);
                sendNotification({
                  title: "Job Status Update",
                  message: `${job.client_name} is now ${statusLabel}`,
                  notification_type: "job_status_change",
                  job_id: job.id,
                  operator_id: opId,
                  recipient_role: "operator",
                  recipient_id: opId,
                  pushEmployeeIds: [opId],
                  email: newStatus === "ready_for_takeoff" && op?.email ? [{
                    type: "job_status_change",
                    to: op.email,
                    recipientName: op.name,
                    jobDetails: { jobNumber: job.job_number, clientName: job.client_name, jobDate: job.job_date, statusLabel },
                  }] : undefined,
                });
              });
            }

            if (newStatus === "cancelled") {
              assignedOperatorIds.forEach((opId) => {
                const op = employees.find((e) => e.id === opId);
                sendNotification({
                  title: "Job Cancelled",
                  message: `${job.client_name} on ${job.job_date} has been cancelled`,
                  notification_type: "job_status_change",
                  job_id: job.id,
                  operator_id: opId,
                  recipient_role: "operator",
                  recipient_id: opId,
                  pushEmployeeIds: [opId],
                  sms: op?.phone ? [{ to: op.phone, message: `Job ${job.job_number} on ${job.job_date} has been cancelled.` }] : undefined,
                });
              });
            }

            if (newStatus === "pending_sign_off") {
              const managerIds = employees.filter((e) => e.role === "manager" || e.role === "admin").map((e) => e.id);
              const firstOp = assignedOperatorIds[0] || managerIds[0] || job.id;
              sendNotification({
                title: "Pending Sign-Off",
                message: `${job.client_name} (${job.job_number}) is awaiting sign-off`,
                notification_type: "pending_sign_off",
                job_id: job.id,
                operator_id: firstOp,
                recipient_role: "manager",
                pushEmployeeIds: managerIds,
              });
            }
          }
        },
      }
    );
  };

  // Get detail data for sheet
  const detailAssignments = detailJob
    ? assignments.filter((a) => a.job_id === detailJob.id)
    : [];
  const detailOperators = detailAssignments.map((a) =>
    employees.find((u) => u.id === a.operator_id)
  );
  const detailAssets = detailAssignments.flatMap((a) =>
    a.asset_ids.map((aid) => assets.find((asset) => asset.id === aid)).filter(Boolean)
  );
  const allJobAssetIds = detailAssignments.flatMap((a) => a.asset_ids || []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Job Management</h1>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Create New Job
        </Button>
      </div>

      <LiveJobCards
        jobs={jobs}
        assignments={assignments}
        employees={employees}
        assets={assets}
        lostItems={lostItems}
      />

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const colJobs = jobs.filter((j) => j.status === col.id);
            return (
              <div key={col.id} className="min-w-[240px] w-[240px] flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-foreground">{col.label}</h3>
                  <span className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-full">
                    {colJobs.length}
                  </span>
                </div>
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-[200px] rounded-lg p-2 transition-colors ${
                        snapshot.isDraggingOver
                          ? "bg-primary/5 border-2 border-dashed border-primary/30"
                          : "bg-muted/50 border border-border"
                      }`}
                    >
                      {colJobs.map((job, i) => {
                        const jobAssignment = assignments.find((a) => a.job_id === job.id);
                        const opName = jobAssignment ? employees.find((e) => e.id === jobAssignment.operator_id)?.name : undefined;
                        return (
                          <JobCard
                            key={job.id}
                            job={job}
                            index={i}
                            onEdit={openEdit}
                            onClick={(j) => j.status === "needs_prep" ? setPrepJob(j) : setDetailJob(j)}
                            onDelete={(j) => setDeleteTarget({ id: j.id, name: j.client_name })}
                            assignmentCount={assignments.filter((a) => a.job_id === job.id).length}
                            operatorName={opName ?? undefined}
                          />
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Job Detail Sheet */}
      <Sheet open={!!detailJob} onOpenChange={(open) => !open && setDetailJob(null)}>
        <SheetContent className="sm:max-w-[440px] overflow-y-auto">
          {detailJob && (
            <div className="space-y-6 pt-2">
              <SheetHeader>
                <SheetTitle className="text-xl">{detailJob.client_name}</SheetTitle>
              </SheetHeader>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge className={`${statusColors[detailJob.status]}`} variant="secondary">
                    {detailJob.status.replace(/_/g, " ")}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Job Number</p>
                    <p className="text-sm font-medium text-foreground font-mono">{detailJob.job_number}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="text-sm font-medium text-foreground">{detailJob.job_date}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Address
                    </p>
                    <p className="text-sm font-medium text-foreground">{detailJob.address || <span className="text-muted-foreground">TBD</span>}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p className="text-sm font-medium text-foreground">{detailJob.location_type || "—"}</p>
                  </div>
                  {detailJob.call_time && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Call Time</p>
                      <p className="text-sm font-medium text-foreground">{detailJob.call_time}</p>
                    </div>
                  )}
                  {detailJob.guaranteed_hours && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Guaranteed</p>
                      <p className="text-sm font-medium text-foreground">{detailJob.guaranteed_hours}h</p>
                    </div>
                  )}
                  {detailJob.distance_miles != null && detailJob.distance_miles > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Car className="h-3 w-3" /> Distance</p>
                      <p className="text-sm font-medium text-foreground">{detailJob.distance_miles} mi</p>
                    </div>
                  )}
                  {detailJob.mileage_reimbursement != null && detailJob.mileage_reimbursement > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Mileage Reimb.</p>
                      <p className="text-sm font-medium text-foreground">${detailJob.mileage_reimbursement.toFixed(2)}</p>
                    </div>
                  )}
                </div>

                {detailJob.notes && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm text-foreground">{detailJob.notes}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                    Assigned Operators
                  </p>
                  {detailOperators.length === 0 && (
                    <p className="text-sm text-muted-foreground">None assigned</p>
                  )}
                  {detailOperators.map(
                    (op) =>
                      op && (
                        <div key={op.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-foreground">{op.name}</span>
                        </div>
                      )
                  )}
                </div>

                {/* Assigned Gear — Expandable Parent/Child */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                    Assigned Gear
                  </p>
                  {detailAssets.length === 0 && (
                    <p className="text-sm text-muted-foreground">No gear assigned</p>
                  )}
                  {detailAssets.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Drag a row onto another to nest it inside that kit.
                    </p>
                  )}
                  {(() => {
                    const roots = detailAssets.filter((a): a is Asset => !!a && !a.parent_asset_id);
                    const rootIds = new Set(roots.map((a) => a.id));
                    // Directly-assigned children whose parent isn't in this loadout show at top level
                    detailAssets
                      .filter((a): a is Asset => !!a && !!a.parent_asset_id && !rootIds.has(a.parent_asset_id))
                      .forEach((a) => {
                        if (!rootIds.has(a.id)) {
                          roots.push(a);
                          rootIds.add(a.id);
                        }
                      });
                    return <AssetNestTree roots={roots} allAssets={assets} editable onOpenAsset={(id) => navigate(`/assets?asset=${id}`)} />;
                  })()}

                </div>

                {/* Admin Lifecycle Actions */}
                {detailJob.status === "needs_prep" && (
                  <Button
                    className="w-full gap-2 rounded-full bg-gradient-to-r from-primary to-primary/80"
                    onClick={() => {
                      setGearChecklistOpen(true);
                      setChecklistChecked(new Set());
                      setChecklistConditions({});
                      setChecklistIssueNotes({});
                    }}
                  >
                    <Rocket className="h-4 w-4" /> Verify Gear & Prep
                  </Button>
                )}

                {detailJob.status === "launched" && (() => {
                  const jobLostItems = lostItems.filter((li) => li.job_id === detailJob.id);
                  return (
                    <div className="space-y-4">
                      {/* Operator live status */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Live Mission — Operators</p>
                        {detailAssignments.map((asgn) => {
                          const op = employees.find((e) => e.id === asgn.operator_id);
                          const startMs = asgn.actual_start_time ? new Date(asgn.actual_start_time).getTime() : 0;
                          const guaranteedSec = parseFloat(detailJob.guaranteed_hours || "0") * 3600;
                          return (
                            <div key={asgn.id} className="space-y-1">
                              <LiveOperatorRow
                                operatorName={op?.name || "Unknown"}
                                startTime={asgn.actual_start_time}
                                startMs={startMs}
                                guaranteedSec={guaranteedSec}
                                onForceClockOut={() => setForceClockOutTarget({ assignmentId: asgn.id, operatorName: op?.name || "Unknown", operatorId: asgn.operator_id || "" })}
                                isClockedOut={!!asgn.actual_end_time}
                                endTime={asgn.actual_end_time}
                              />
                              {((asgn as any).checkout_location_url || (asgn as any).checkin_location_url) && (
                                <div className="flex flex-wrap items-center gap-3 pl-2 text-[11px]">
                                  {(asgn as any).checkout_location_url && (
                                    <a
                                      href={(asgn as any).checkout_location_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline"
                                      title="Where the operator checked out the gear"
                                    >
                                      📍 View Handoff Map (checkout)
                                    </a>
                                  )}
                                  {(asgn as any).checkin_location_url && (
                                    <a
                                      href={(asgn as any).checkin_location_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline"
                                      title="Where the operator returned the gear"
                                    >
                                      📍 View Handoff Map (check-in)
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Location */}
                      {detailJob.address && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Location</p>
                          <a
                            href={`https://maps.google.com/?q=${encodeURIComponent(detailJob.address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center gap-1"
                          >
                            <MapPin className="h-3 w-3" /> {detailJob.address}
                          </a>
                        </div>
                      )}

                      {jobLostItems.length > 0 && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 space-y-1">
                          <p className="text-xs font-semibold text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Gear Issues</p>
                          {jobLostItems.map((li) => (
                            <p key={li.id} className="text-xs text-foreground">{li.item_name} ×{li.missing_quantity} — <span className="text-destructive">{li.condition}</span></p>
                          ))}
                        </div>
                      )}

                      {/* Live Chat with Operators */}
                      {employee && (
                        <LiveChatThread
                          jobId={detailJob.id}
                          senderId={employee.id}
                          senderName={employee.name || "Admin"}
                          senderType="manager"
                          maxHeight="200px"
                        />
                      )}

                      {/* Admin Gear Check-In */}
                      {allJobAssetIds.length > 0 && (
                        <Button
                          className="w-full gap-2"
                          variant="outline"
                          onClick={() => {
                            const firstAsgn = detailAssignments[0];
                            const op = firstAsgn ? employees.find((e) => e.id === firstAsgn.operator_id) : null;
                            setGearCheckInTarget({
                              assignmentId: firstAsgn?.id || "",
                              operatorName: op?.name || detailJob.client_name || "Operator",
                              assetIds: allJobAssetIds,
                            });
                          }}
                        >
                          <Package className="h-4 w-4" />
                          Check In Gear (Return All)
                        </Button>
                      )}
                    </div>
                  );
                })()}

                {detailJob.status === "pending_sign_off" && (
                  <Button
                    className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                    onClick={() => {
                      // Pre-populate states for assets already flagged as broken/missing
                      const jobAssignments = assignments.filter((a) => a.job_id === detailJob.id);
                      const jobAssetIds = jobAssignments.flatMap((a) => a.asset_ids);
                      const jobLostItems = lostItems.filter((li) => li.job_id === detailJob.id);
                      const preStates: Record<string, SignOffItemState> = {};
                      const preNotes: Record<string, string> = {};
                      // Check asset status
                      jobAssetIds.forEach((id) => {
                        if (!id) return;
                        const asset = assets.find((a) => a.id === id);
                        if (!asset) return;
                        if (asset.status === "broken") {
                          preStates[asset.id] = "broken";
                          if (asset.damage_notes) preNotes[asset.id] = asset.damage_notes;
                        } else if (asset.status === "missing") {
                          preStates[asset.id] = "missing";
                        }
                        // Also check children of this parent
                        if (!asset.parent_asset_id) {
                          assets.filter((c) => c.parent_asset_id === asset.id).forEach((child) => {
                            if (child.status === "broken") {
                              preStates[child.id] = "broken";
                              if (child.damage_notes) preNotes[child.id] = child.damage_notes;
                            } else if (child.status === "missing") {
                              preStates[child.id] = "missing";
                            }
                          });
                        }
                      });
                      // Also pull notes from sea_of_lost_items
                      jobLostItems.forEach((li) => {
                        // Try to match by parent_asset_id (the actual asset)
                        if (li.parent_asset_id && !preNotes[li.parent_asset_id]) {
                          if (li.notes) preNotes[li.parent_asset_id] = li.notes;
                        }
                      });
                      setSignOffItemStates(preStates);
                      setSignOffItemNotes(preNotes);
                      setSignOffIssueQty({});
                      setSignOffNotes("");
                      setSignOffJobId(detailJob.id);
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Review & Sign-Off
                  </Button>
                )}
              </div>

              {/* Client Comms */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Send className="h-3 w-3" /> Client Comms
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "en_route", icon: Car, label: "Team En Route", emoji: "🚗" },
                    { key: "arrived", icon: CheckCircle2, label: "Team Arrived", emoji: "✅" },
                    { key: "completed", icon: PartyPopper, label: "Job Completed", emoji: "🎉" },
                  ].map((comm) => {
                    const jobComms = sentComms[detailJob.id] ?? new Set<string>();
                    const isSent = jobComms.has(comm.key);
                    return (
                      <Button
                        key={comm.key}
                        variant={isSent ? "secondary" : "outline"}
                        size="sm"
                        className="flex-col gap-1 h-auto py-3 text-xs relative"
                        disabled={isSent}
                        onClick={() => {
                          // For en_route, send actual email via edge function
                          if (comm.key === "en_route") {
                            const client = (clients as any[]).find((c: any) => c.company_name === detailJob.client_name);
                            if (client?.email) {
                              supabase.functions.invoke("send-job-emails", {
                                body: {
                                  emails: [{
                                    type: "en_route",
                                    to: client.email,
                                    recipientName: detailJob.client_name,
                                    jobDetails: {
                                      jobNumber: detailJob.job_number ?? "",
                                      clientName: detailJob.client_name ?? "",
                                      jobDate: detailJob.job_date ?? "",
                                      callTime: detailJob.call_time ?? undefined,
                                      address: detailJob.address ?? undefined,
                                    },
                                  }],
                                },
                              }).then(({ error }) => {
                                if (error) {
                                  console.error("[send-job-emails] En route error:", error);
                                  toast.error("Failed to send en route email");
                                } else {
                                  toast.success(`En Route email sent to ${detailJob.client_name}!`);
                                }
                              });
                            } else {
                              toast.warning(`No email on file for ${detailJob.client_name}`);
                            }
                          } else {
                            toast.success(`Mock Email & SMS sent to ${detailJob.client_name}!`);
                          }
                          setSentComms((prev) => {
                            const updated = { ...prev };
                            const set = new Set(updated[detailJob.id] ?? []);
                            set.add(comm.key);
                            updated[detailJob.id] = set;
                            return updated;
                          });
                        }}
                      >
                        <span className="text-lg">{comm.emoji}</span>
                        <span className="truncate">{comm.label}</span>
                        {isSent && (
                          <Badge className="absolute -top-1.5 -right-1.5 text-[9px] px-1 py-0 bg-success text-success-foreground">
                            Sent
                          </Badge>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <Button
                className="w-full"
                variant="outline"
                onClick={() => {
                  setDetailJob(null);
                  openEdit(detailJob);
                }}
              >
                <Pencil className="h-4 w-4 mr-1.5" />
                Edit Job
              </Button>

              <Button
                className="w-full gap-2"
                variant="destructive"
                onClick={() => setDeleteJobTarget(detailJob)}
              >
                <Trash2 className="h-4 w-4" />
                Delete Job
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Force Clock Out Alert */}
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
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={async () => {
                if (!forceClockOutTarget || !detailJob) return;
                await updateAssignmentMutation.mutateAsync({
                  id: forceClockOutTarget.assignmentId,
                  actual_end_time: new Date().toISOString(),
                  time_manually_edited: true,
                });
                // Notification to operator
                await supabase.from("admin_notifications").insert({
                  operator_id: forceClockOutTarget.operatorId || detailJob.id,
                  job_id: detailJob.id,
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
                          jobNumber: detailJob.job_number || "",
                          clientName: detailJob.client_name || "",
                          jobDate: detailJob.job_date || "",
                        },
                      }],
                    },
                  }).catch((err) => console.error("[force_clockout email]", err));
                }
                toast.success(`✅ ${forceClockOutTarget.operatorName} has been clocked out.`);
                setForceClockOutTarget(null);
              }}
            >
              Force Clock Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Job from Detail Sheet Alert */}
      <AlertDialog open={!!deleteJobTarget} onOpenChange={(open) => !open && setDeleteJobTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteJobTarget?.job_number || deleteJobTarget?.client_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the job and all its assignments. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={async () => {
                if (!deleteJobTarget) return;
                const jobAsgn = assignments.find((a: any) => a.job_id === deleteJobTarget.id);
                const assignedOp = jobAsgn ? employees.find((e: any) => e.id === jobAsgn.operator_id) : null;
                await deleteJobMutation.mutateAsync(deleteJobTarget.id);
                toast.success("Job deleted.");
                const allJobAsgns = assignments.filter((a: any) => a.job_id === deleteJobTarget.id);
                for (const asgn of allJobAsgns) {
                  const op = employees.find((e: any) => e.id === asgn.operator_id);
                  if (op) {
                    sendNotification({
                      title: "Awwww Booo 😢",
                      message: `Job ${deleteJobTarget.job_number || deleteJobTarget.client_name} was either cancelled or rescheduled. We'll get em next time! Meanwhile, if they reach out to you without us (they will), keep us on copy!`,
                      notification_type: "job_deleted",
                      job_id: deleteJobTarget.id,
                      operator_id: op.id,
                      recipient_role: "operator",
                      recipient_id: op.id,
                      pushEmployeeIds: [op.id],
                    });
                  }
                }
                setDeleteJobTarget(null);
                setDetailJob(null);
              }}
            >
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Gear Check-In Alert */}
      <AlertDialog open={!!gearCheckInTarget} onOpenChange={(open) => !open && setGearCheckInTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Check In Gear</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Mark all {gearCheckInTarget?.assetIds.length} gear item(s) from {gearCheckInTarget?.operatorName} as returned? This will set all assets back to "available" and move the job to Pending Sign-Off.</p>
                {(() => {
                  if (!gearCheckInTarget) return null;
                  const flagged = gearCheckInTarget.assetIds.flatMap((id) => {
                    const parent = assets.find((a) => a.id === id);
                    const children = assets.filter((a) => a.parent_asset_id === id);
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
            <AlertDialogAction
              onClick={async () => {
                if (!gearCheckInTarget || !detailJob) return;
                try {
                  for (const assetId of gearCheckInTarget.assetIds) {
                    await updateAssetStatusMutation.mutateAsync({ id: assetId, status: "available" });
                    const children = assets.filter((a) => a.parent_asset_id === assetId);
                    for (const child of children) {
                      await updateAssetStatusMutation.mutateAsync({ id: child.id, status: "available" });
                    }
                  }
                  if (detailJob.status === "launched") {
                    await updateJobStatusMutation.mutateAsync({ id: detailJob.id, status: "pending_sign_off" });
                  }
                  toast.success(`📦 Gear checked in. All items restored to available.`);
                  setGearCheckInTarget(null);
                } catch (err: any) {
                  toast.error(`Failed: ${err.message}`);
                }
              }}
            >
              Override & Check In All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editJob} onOpenChange={(open) => !open && setEditJob(null)}>
        <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-job_number" className="text-[16px] md:text-sm">Job Number</Label>
              <Input
                id="edit-job_number"
                className="text-[16px] md:text-sm"
                value={editForm.job_number ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, job_number: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-client_name" className="text-[16px] md:text-sm">Client Name</Label>
              <Input
                id="edit-client_name"
                className="text-[16px] md:text-sm"
                value={editForm.client_name ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, client_name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-job_date" className="text-[16px] md:text-sm">Date</Label>
                <Input
                  id="edit-job_date"
                  type="date"
                  className="text-[16px] md:text-sm"
                  value={editForm.job_date ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, job_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-call_time" className="text-[16px] md:text-sm">Call Time</Label>
                <Input
                  id="edit-call_time"
                  type="time"
                  className="text-[16px] md:text-sm"
                  value={editForm.call_time ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, call_time: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] md:text-sm">Location Type</Label>
              <Select
                value={editForm.location_type ?? ""}
                onValueChange={(v) => setEditForm((f) => ({ ...f, location_type: v }))}
              >
                <SelectTrigger className="text-[16px] md:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Manhattan">Manhattan</SelectItem>
                  <SelectItem value="Outer Boro">Outer Boro</SelectItem>
                  <SelectItem value="Tri-State / Road Trip">Tri-State / Road Trip</SelectItem>
                  <SelectItem value="Studio">Studio</SelectItem>
                  <SelectItem value="Remote">Remote</SelectItem>
                  <SelectItem value="Field">Field</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] md:text-sm">Status</Label>
              <Select
                value={editForm.status ?? "needs_prep"}
                onValueChange={(v) => setEditForm((f) => ({ ...f, status: v as JobStatus }))}
              >
                <SelectTrigger className="text-[16px] md:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUMNS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label className="text-[16px] md:text-sm">Address</Label>
              <AddressAutocomplete
                value={editForm.address ?? ""}
                onChange={(v) => setEditForm((f) => ({ ...f, address: v }))}
                placeholder="Job site address"
              />
            </div>

            {/* Mileage Reimbursement */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-distance" className="text-[16px] md:text-sm">Miles from Office</Label>
                <Input
                  id="edit-distance"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="e.g. 65"
                  className="text-[16px] md:text-sm"
                  value={editForm.distance_miles ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    const miles = parseFloat(val);
                    setEditForm((f) => ({
                      ...f,
                      distance_miles: val ? miles : undefined,
                      ...(!editMileageOverridden ? {
                        mileage_reimbursement: !isNaN(miles) && miles > 50 ? parseFloat((miles * 0.725).toFixed(2)) : 0,
                      } : {}),
                    }));
                  }}
                />
                <p className="text-[10px] text-muted-foreground">From 131 Varick St</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-mileage" className="text-[16px] md:text-sm">Mileage Reimb. ($)</Label>
                <Input
                  id="edit-mileage"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Auto-calculated"
                  className="text-[16px] md:text-sm"
                  value={editForm.mileage_reimbursement ?? ""}
                  onChange={(e) => {
                    setEditMileageOverridden(true);
                    setEditForm((f) => ({ ...f, mileage_reimbursement: e.target.value ? parseFloat(e.target.value) : undefined }));
                  }}
                />
                {editMileageOverridden && (
                  <p className="text-[10px] text-warning">Manual override</p>
                )}
              </div>
            </div>

            {/* Operator assignment */}
            <div className="space-y-2">
              <Label className="text-[16px] md:text-sm">Assigned Operator</Label>
              <Select value={editOperatorId} onValueChange={setEditOperatorId}>
                <SelectTrigger className="text-[16px] md:text-sm">
                  <SelectValue placeholder="Select operator" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Unassigned —</SelectItem>
                  {operators.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.name} {op.email ? `— ${op.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Gear assignment */}
            <div className="space-y-2">
              <Label className="text-[16px] md:text-sm">Assigned Gear</Label>
              <Select value="" onValueChange={(val) => {
                if (!editAssetIds.includes(val)) setEditAssetIds((prev) => [...prev, val]);
              }}>
                <SelectTrigger className="text-[16px] md:text-sm">
                  <SelectValue placeholder="Add gear..." />
                </SelectTrigger>
                <SelectContent>
                  {assignableParentAssets.filter((a) => !editAssetIds.includes(a.id)).map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>{asset.asset_name} ({asset.category})</SelectItem>
                  ))}
                  {assignableParentAssets.filter((a) => !editAssetIds.includes(a.id)).length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No parent rigs available to add</div>
                  )}
                </SelectContent>
              </Select>
              {editAssetIds.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  {editAssetIds.map((id) => {
                    const asset = assets.find((a) => a.id === id);
                    if (!asset) return null;
                    return (
                      <div key={id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                        <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: asset.color_code }} />
                        <span className="text-sm text-foreground flex-1 truncate">{asset.asset_name}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{asset.category}</Badge>
                        <button onClick={() => setEditAssetIds((prev) => prev.filter((x) => x !== id))} className="p-1 rounded-md hover:bg-destructive/10 transition-colors">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes" className="text-[16px] md:text-sm">Notes</Label>
              <Textarea
                id="edit-notes"
                className="text-[16px] md:text-sm min-h-[80px]"
                value={editForm.notes ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="destructive"
              className="gap-1.5"
              onClick={() => setCancelAlertOpen(true)}
            >
              <XCircle className="h-4 w-4" />
              Cancel Job
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setEditJob(null)}>Close</Button>
            <Button onClick={saveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Job Confirmation */}
      <AlertDialog open={cancelAlertOpen} onOpenChange={setCancelAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you suuuuuure you want to cancel this job?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!editJob) return;
                const jobAssignment = assignments.find((a) => a.job_id === editJob.id);
                const assignedOp = jobAssignment ? employees.find((e) => e.id === jobAssignment.operator_id) : null;
                updateJobMutation.mutate(
                  { id: editJob.id, status: "cancelled" },
                  {
                    onSuccess: () => {
                      toast.success(`${editJob.client_name} has been cancelled`);
                      if (assignedOp) {
                        sendCancellationEmail(assignedOp.email, assignedOp.name, editJob.client_name);
                        // Push notification to operator
                        supabase.functions.invoke("send-push", {
                          body: {
                            employee_ids: [assignedOp.id],
                            title: "Job Cancelled",
                            message: `${editJob.client_name} on ${editJob.job_date} has been cancelled.`,
                          },
                        }).catch((err) => console.error("[push] Failed:", err));
                      }
                      setEditJob(null);
                      setCancelAlertOpen(false);
                    },
                  }
                );
              }}
            >
              Yes, Cancel Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Job Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                const jobAssignment = assignments.find((a) => a.job_id === deleteTarget.id);
                const assignedOp = jobAssignment ? employees.find((e) => e.id === jobAssignment.operator_id) : null;
                deleteJobMutation.mutate(deleteTarget.id, {
                  onSuccess: () => {
                    toast.success(`${deleteTarget.name} deleted`);
                    const allAsgns = assignments.filter((a) => a.job_id === deleteTarget.id);
                    for (const asgn of allAsgns) {
                      const op = employees.find((e) => e.id === asgn.operator_id);
                      if (op) {
                        sendNotification({
                          title: "Awwww Booo 😢",
                          message: `Job ${deleteTarget.name} was either cancelled or rescheduled. We'll get em next time! Meanwhile, if they reach out to you without us (they will), keep us on copy!`,
                          notification_type: "job_deleted",
                          job_id: deleteTarget.id,
                          operator_id: op.id,
                          recipient_role: "operator",
                          recipient_id: op.id,
                          pushEmployeeIds: [op.id],
                        });
                      }
                    }
                    setDeleteTarget(null);
                  },
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Prep Checklist for needs_prep jobs */}
      {prepJob && (
        <PrepChecklist job={prepJob} open={!!prepJob} onClose={() => setPrepJob(null)} />
      )}

      {/* Sign-Off Review Modal */}
      {(() => {
        const signOffJob = jobs.find((j) => j.id === signOffJobId);
        if (!signOffJob) return (
          <AlertDialog open={!!signOffJobId} onOpenChange={(open) => !open && setSignOffJobId(null)}>
            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Job not found</AlertDialogTitle></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Close</AlertDialogCancel></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );

        const soJobAssignments = assignments.filter((a) => a.job_id === signOffJob.id);
        const soJobLostItems = lostItems.filter((li) => li.job_id === signOffJob.id);
        const soAssetIds = soJobAssignments.flatMap((a) => a.asset_ids);
        const soAssignedGear = soAssetIds.map((id) => assets.find((a) => a.id === id)).filter(Boolean);
        const soParents = soAssignedGear.filter((a) => a && !a.parent_asset_id);
        const soParentIdSet = new Set(soParents.map((a) => a!.id));
        const soChildMap = new Map<string, typeof assets>();
        assets.filter((a) => a.parent_asset_id && soParentIdSet.has(a.parent_asset_id)).forEach((child) => {
          const list = soChildMap.get(child.parent_asset_id!) ?? [];
          list.push(child);
          soChildMap.set(child.parent_asset_id!, list);
        });
        soAssignedGear.filter((a) => a && a.parent_asset_id && !soParentIdSet.has(a.parent_asset_id)).forEach((a) => soParents.push(a));

        // Build flat list of all items with expected quantities
        const allItems: { id: string; name: string; expected: number; parentName?: string; isChild: boolean }[] = [];
        soParents.forEach((a) => {
          if (!a) return;
          allItems.push({ id: a.id, name: a.asset_name || "Unknown", expected: a.quantity || 1, isChild: false });
          (soChildMap.get(a.id) ?? []).forEach((c) => {
            allItems.push({ id: c.id, name: c.asset_name || "Unknown", expected: c.quantity || 1, parentName: a.asset_name || "", isChild: true });
          });
        });

        const getItemState = (id: string): SignOffItemState => signOffItemStates[id] ?? "good";
        const getIssueQty = (id: string, expected: number): number => signOffIssueQty[id] ?? expected;
        const totalExpected = allItems.reduce((s, i) => s + i.expected, 0);
        const totalMissingQty = allItems.reduce((s, item) => s + (getItemState(item.id) === "missing" ? getIssueQty(item.id, item.expected) : 0), 0);
        const totalBrokenQty = allItems.reduce((s, item) => s + (getItemState(item.id) === "broken" ? getIssueQty(item.id, item.expected) : 0), 0);
        const returnedCount = totalExpected - totalMissingQty - totalBrokenQty;
        const missingCount = totalMissingQty;
        const brokenCount = totalBrokenQty;
        const issueCount = missingCount + brokenCount;

        return (
          <Dialog open={!!signOffJobId} onOpenChange={(open) => !open && setSignOffJobId(null)}>
            <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
              <DialogHeader className="p-6 pb-3">
                <DialogTitle className="flex items-center gap-2 text-foreground">
                  <CheckCircle2 className="h-5 w-5 text-success" /> Final Review & Sign-Off — {signOffJob.client_name}
                </DialogTitle>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-3">
                <p className="text-sm font-medium text-foreground">{signOffJob.job_number}</p>

                {/* Summary counts */}
                {allItems.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-success/10 border border-success/30 p-2 text-center">
                      <p className="text-lg font-bold text-success">{returnedCount}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Returned</p>
                    </div>
                    <div className="rounded-lg bg-warning/10 border border-warning/30 p-2 text-center">
                      <p className="text-lg font-bold text-warning">{missingCount}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Missing</p>
                    </div>
                    <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-2 text-center">
                      <p className="text-lg font-bold text-destructive">{brokenCount}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Broken</p>
                    </div>
                  </div>
                )}

                {allItems.length === 0 && (
                  <p className="text-sm text-muted-foreground">No gear assigned — sign off to complete.</p>
                )}

                {/* Gear list with per-item status buttons */}
                {allItems.map((item) => {
                  const state = getItemState(item.id);
                  const hasIssue = state === "missing" || state === "broken";
                  return (
                    <div key={item.id} className={cn(
                      "rounded-lg border p-3 space-y-2",
                      item.isChild ? "ml-6 border-border/20 bg-card/30" : "border-border/30 bg-card/50",
                      state === "missing" && "border-warning/40 bg-warning/5",
                      state === "broken" && "border-destructive/40 bg-destructive/5"
                    )}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className={cn("font-medium", item.isChild ? "text-xs" : "text-sm")}>{item.name}</p>
                            {(() => {
                              const asset = assets.find((a) => a.id === item.id);
                              const dbStatus = asset?.status;
                              if (dbStatus && !["available", "good", "checked_out"].includes(dbStatus)) {
                                return (
                                  <Badge className={cn(
                                    "text-[8px] px-1.5 py-0 font-black uppercase tracking-wider",
                                    dbStatus === "broken" ? "bg-destructive/20 text-destructive border-destructive/30" :
                                    dbStatus === "missing" ? "bg-warning/20 text-warning border-warning/30" :
                                    dbStatus === "iffy" ? "bg-amber-500/20 text-amber-500 border-amber-500/30" :
                                    "bg-muted/20 text-muted-foreground border-muted/30"
                                  )}>
                                    ⚠️ {dbStatus}
                                  </Badge>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          {item.parentName && <p className="text-[10px] text-muted-foreground">from {item.parentName}</p>}
                        </div>
                        <Badge variant="outline" className="text-xs font-bold">Expected: {item.expected}</Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {[
                          { value: "good" as const, label: "✅ Good", activeClass: "bg-success/15 text-success border-success/30" },
                          { value: "missing" as const, label: "❌ Missing", activeClass: "bg-warning/15 text-warning border-warning/30" },
                          { value: "broken" as const, label: "⚠️ Broken", activeClass: "bg-destructive/15 text-destructive border-destructive/30" },
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={cn(
                              "px-2.5 py-1 text-xs rounded-full border transition-colors",
                              state === option.value
                                ? option.activeClass + " font-semibold"
                                : "bg-muted/40 text-muted-foreground border-border/40 hover:bg-muted/60"
                            )}
                            onClick={() => {
                              setSignOffItemStates((prev) => ({ ...prev, [item.id]: option.value }));
                              if (option.value === "good") {
                                setSignOffIssueQty((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
                              }
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      {hasIssue && (
                        <div className="space-y-2">
                          {item.expected > 1 && (
                            <div className="flex items-center gap-2">
                              <Label className="text-[11px] font-semibold text-foreground whitespace-nowrap">
                                How many {state}?
                              </Label>
                              <Input
                                type="number"
                                min={1}
                                max={item.expected}
                                value={getIssueQty(item.id, item.expected)}
                                onChange={(e) => {
                                  const val = Math.max(1, Math.min(item.expected, parseInt(e.target.value) || 1));
                                  setSignOffIssueQty((prev) => ({ ...prev, [item.id]: val }));
                                }}
                                className="w-16 h-8 text-center text-sm font-bold"
                              />
                              <span className="text-[11px] text-muted-foreground">of {item.expected}</span>
                            </div>
                          )}
                          <Label className="text-[11px] font-semibold text-foreground">Notes / Details</Label>
                          <Input
                            placeholder={`Describe why this item is ${state}...`}
                            value={signOffItemNotes[item.id] ?? ""}
                            onChange={(e) => setSignOffItemNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            className="h-8 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                {soJobLostItems.length > 0 && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 space-y-1">
                    <p className="text-xs font-semibold text-destructive">Previous Shrinkage / Damage</p>
                    {soJobLostItems.map((li) => (
                      <p key={li.id} className="text-xs text-foreground">{li.item_name} ×{li.missing_quantity} — <span className="text-destructive font-medium">{li.condition}</span></p>
                    ))}
                  </div>
                )}

                {/* Final Gear Notes */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Final Gear Notes</Label>
                  <Textarea
                    placeholder="Describe the overall condition of the gear, any notes for the record…"
                    value={signOffNotes}
                    onChange={(e) => setSignOffNotes(e.target.value)}
                    className="min-h-[60px] text-xs rounded-xl"
                  />
                </div>
              </div>

              <div className="border-t border-border/40 p-4 space-y-3 bg-card/80 backdrop-blur">
                {allItems.length > 0 && (
                  <div className={cn("text-center text-sm font-semibold", issueCount === 0 ? "text-success" : "text-warning")}>
                    {returnedCount} of {totalExpected} items returned good
                    {issueCount > 0 && ` · ${missingCount} missing · ${brokenCount} broken`}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setSignOffJobId(null)}>Go Back</Button>
                  <Button
                    className="flex-1 bg-success text-success-foreground hover:bg-success/90 font-bold"
                    disabled={updateJobStatusMutation.isPending}
                    onClick={async () => {
                      if (!signOffJobId || !signOffJob) return;

                      const issueItems: { id: string; name: string; condition: "missing" | "broken"; note: string; issueQty: number; returnedQty: number }[] = [];
                      for (const item of allItems) {
                        const itemState = getItemState(item.id);
                      if (itemState === "good") {
                          await updateAssetStatusMutation.mutateAsync({ id: item.id, status: "available" });
                        } else {
                          const qty = getIssueQty(item.id, item.expected);
                          const returnedGood = item.expected - qty;
                          // Always update the asset's global status to the reported condition
                          await updateAssetStatusMutation.mutateAsync({ id: item.id, status: itemState });
                          issueItems.push({
                            id: item.id,
                            name: item.name,
                            condition: itemState,
                            note: signOffItemNotes[item.id]?.trim() ?? "",
                            issueQty: qty,
                            returnedQty: returnedGood,
                          });
                        }
                      }

                      // Log missing/broken items to Sea of Lost Items
                      for (const issue of issueItems) {
                        const asset = assets.find((a) => a.id === issue.id);
                        const parentAsset = asset?.parent_asset_id ? assets.find((a) => a.id === asset.parent_asset_id) : null;
                        await createLostItemMutation.mutateAsync({
                          item_name: issue.name,
                          missing_quantity: issue.issueQty,
                          condition: issue.condition,
                          job_id: signOffJob.id,
                          operator_id: soJobAssignments[0]?.operator_id || null,
                          parent_asset_id: asset?.parent_asset_id || null,
                          parent_rig_name: parentAsset?.asset_name || null,
                          notes: issue.note || `${issue.condition} during sign-off of ${signOffJob.job_number}`,
                        } as any);
                      }

                      // Notify operator of sign-off issues
                      if (issueItems.length > 0) {
                        const opIds = [...new Set(soJobAssignments.map((a) => a.operator_id).filter(Boolean))];
                        const issueList = issueItems
                          .map((item) => `${item.name} ×${item.issueQty} ${item.condition}${item.note ? `: ${item.note}` : ""}`)
                          .join(", ");
                        for (const opId of opIds) {
                          const op = employees.find((e) => e.id === opId);
                          await sendNotification({
                            title: "⚠️ Gear Issue Alert",
                            message: `The following items were marked missing/broken during sign-off for ${signOffJob.client_name} (${signOffJob.job_number}): ${issueList}`,
                            notification_type: "missing_item_ping",
                            job_id: signOffJob.id,
                            operator_id: opId!,
                            recipient_role: "operator",
                            recipient_id: opId,
                            pushEmployeeIds: [opId!],
                            email: op?.email ? [{
                              type: "missing_gear_alert",
                              to: op.email,
                              recipientName: op.name || "Operator",
                              jobDetails: {
                                jobNumber: signOffJob.job_number,
                                clientName: signOffJob.client_name,
                                missingItems: issueList,
                              },
                            }] : undefined,
                          });
                        }
                      }

                      // Build archive
                      const soOps = soJobAssignments.map((a) => {
                        const emp = employees.find((e) => e.id === a.operator_id);
                        return { name: emp?.name || "Unknown", start: a.actual_start_time, end: a.actual_end_time };
                      });
                      const archiveText = [
                        `GETCHÜGEAR — JOB ARCHIVE`,
                        `${"=".repeat(40)}`,
                        `Job #: ${signOffJob.job_number || "—"}`,
                        `Client: ${signOffJob.client_name || "—"}`,
                        `Date: ${signOffJob.job_date || "—"}`,
                        `Call Time: ${signOffJob.call_time || "—"}`,
                        `Location: ${signOffJob.address || "—"} (${signOffJob.location_type || "—"})`,
                        `Guaranteed Hours: ${signOffJob.guaranteed_hours || "—"}`,
                        ``,
                        `OPERATORS`,
                        `${"-".repeat(40)}`,
                        ...soOps.map((o) => `• ${o.name} | In: ${o.start ? new Date(o.start).toLocaleString() : "—"} | Out: ${o.end ? new Date(o.end).toLocaleString() : "—"}`),
                        ``,
                        `GEAR RETURN SUMMARY (${returnedCount} returned good, ${missingCount} missing, ${brokenCount} broken out of ${totalExpected} total)`,
                        `${"-".repeat(40)}`,
                        ...allItems.map((item) => {
                          const prefix = item.isChild ? "    └ " : "▸ ";
                          const st = getItemState(item.id);
                          const itemNote = signOffItemNotes[item.id]?.trim();
                          const iqty = st !== "good" ? getIssueQty(item.id, item.expected) : 0;
                          const status = st === "good"
                            ? "✅ GOOD"
                            : st === "missing"
                              ? `❌ MISSING ×${iqty}`
                              : `⚠️ BROKEN ×${iqty}`;
                          const expectedSuffix = ` (expected: ${item.expected})`;
                          const noteSuffix = itemNote ? ` | Note: ${itemNote}` : "";
                          return `${prefix}${item.name} — ${status}${expectedSuffix}${noteSuffix}`;
                        }),
                        ``,
                        ...(issueItems.length > 0 ? [
                          `SIGN-OFF ISSUES`,
                          `${"-".repeat(40)}`,
                          ...issueItems.map((item) => `• ${item.name} — ${item.condition.toUpperCase()} ×${item.issueQty} (${item.returnedQty} returned good)${item.note ? ` | ${item.note}` : ""}`),
                          ``,
                        ] : []),
                        ...(soJobLostItems.length > 0 ? [
                          `PREVIOUS SHRINKAGE / DAMAGE`,
                          `${"-".repeat(40)}`,
                          ...soJobLostItems.map((li) => `• ${li.item_name} ×${li.missing_quantity} — ${li.condition}${li.notes ? ` (${li.notes})` : ""}`),
                          ``,
                        ] : []),
                        `FINAL NOTES`,
                        `${"-".repeat(40)}`,
                        signOffNotes.trim() || "(none)",
                        ``,
                        `Signed off: ${new Date().toLocaleString()}`,
                        `${"=".repeat(40)}`,
                      ].join("\n");

                      const blob = new Blob([archiveText], { type: "text/plain" });
                      const filename = `job-archive-${signOffJob.job_number || signOffJob.id}.txt`;

                      updateJobStatusMutation.mutate(
                        { id: signOffJobId, status: "completed" },
                        {
                          onSuccess: () => {
                            toast.success(issueItems.length > 0
                              ? `Job Completed with ${issueItems.length} issue item(s) logged`
                              : "Job Completed! 🎉");
                            setJobArchive({ blob, filename });
                            setSignOffJobId(null);
                            setDetailJob(null);
                            setSignOffItemStates({});
                            setSignOffItemNotes({});
                            setSignOffIssueQty({});
                            setSignOffNotes("");
                          },
                        }
                      );
                    }}
                  >
                    {updateJobStatusMutation.isPending ? "Processing…" : issueCount > 0 ? `Complete with ${issueCount} Issue${issueCount === 1 ? "" : "s"}` : "Render Job Completed"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Job Archive Download Dialog */}
      <AlertDialog open={!!jobArchive} onOpenChange={(open) => !open && setJobArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <PartyPopper className="h-5 w-5 text-success" /> Job Complete — Archive Ready
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/80">
              This job has been archived. Download the full record including gear inventory, operator times, shrinkage reports, and your final notes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel className="sm:flex-1">Dismiss</AlertDialogCancel>
            <AlertDialogAction
              className="sm:flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
              onClick={() => {
                if (!jobArchive) return;
                const url = URL.createObjectURL(jobArchive.blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = jobArchive.filename;
                a.click();
                URL.revokeObjectURL(url);
                setJobArchive(null);
              }}
            >
              📥 Download Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Gear Sign-Off Checklist Dialog (Fix 3) */}
      {detailJob && (
        <Dialog open={gearChecklistOpen} onOpenChange={(open) => !open && setGearChecklistOpen(false)}>
          <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
            <DialogHeader className="p-6 pb-3">
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <Rocket className="h-5 w-5 text-primary" />
                Gear Sign-Off — {detailJob.client_name}
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-3 relative">
              {/* Bottom fade indicator */}
              <div className="pointer-events-none sticky bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent z-10" />

              {detailAssets.length === 0 && (
                <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                  <span className="text-sm text-warning">No gear assigned to this job.</span>
                </div>
              )}

              {(() => {
                const clParents = detailAssets.filter((a) => a && !a.parent_asset_id);
                const clParentIdSet = new Set(clParents.map((a) => a!.id));
                const clChildMap = new Map<string, typeof assets>();
                assets.filter((a) => a.parent_asset_id && clParentIdSet.has(a.parent_asset_id)).forEach((child) => {
                  const list = clChildMap.get(child.parent_asset_id!) ?? [];
                  list.push(child);
                  clChildMap.set(child.parent_asset_id!, list);
                });
                detailAssets.filter((a) => a && a.parent_asset_id && !clParentIdSet.has(a.parent_asset_id)).forEach((a) => clParents.push(a));

                return clParents.map((asset) => {
                  if (!asset) return null;
                  const children = clChildMap.get(asset.id) ?? [];
                  const childIds = children.map((c) => c.id);
                  const allChildrenChecked = childIds.length > 0 && childIds.every((id) => checklistChecked.has(id));
                  const parentChecked = checklistChecked.has(asset.id);

                  const toggleParent = () => {
                    setChecklistChecked((prev) => {
                      const next = new Set(prev);
                      const newState = !parentChecked;
                      if (newState) { next.add(asset.id); childIds.forEach((id) => next.add(id)); }
                      else { next.delete(asset.id); childIds.forEach((id) => next.delete(id)); }
                      return next;
                    });
                  };

                  return (
                    <div key={asset.id} className="rounded-lg bg-card/50 border border-border/30 overflow-hidden">
                      {/* Parent row */}
                      <div
                        className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        style={{ borderLeft: `4px solid ${asset.color_code || 'hsl(var(--primary))'}` }}
                        onClick={toggleParent}
                      >
                        <Checkbox checked={parentChecked || allChildrenChecked} className="h-5 w-5" onCheckedChange={() => toggleParent()} onClick={(e) => e.stopPropagation()} />
                        <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: asset.color_code }} />
                        <span className="text-sm font-bold text-foreground flex-1">{asset.asset_name}</span>
                        <Badge variant="outline" className="text-[10px]">{asset.category}</Badge>
                      </div>

                      {/* Children — always visible in checklist */}
                      {children.length > 0 && (
                        <div className="ml-6 pl-3 border-l-2 border-primary/20 space-y-1 pb-2 pr-3">
                          {children.map((child) => {
                            const condition = checklistConditions[child.id] ?? "good";
                            return (
                              <div key={child.id} className="space-y-1">
                                <div
                                  className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-muted/30 rounded px-1 transition-colors"
                                  onClick={() => {
                                    setChecklistChecked((prev) => {
                                      const next = new Set(prev);
                                      next.has(child.id) ? next.delete(child.id) : next.add(child.id);
                                      return next;
                                    });
                                  }}
                                >
                                  <Checkbox checked={checklistChecked.has(child.id)} className="h-4 w-4" onCheckedChange={() => {
                                    setChecklistChecked((prev) => {
                                      const next = new Set(prev);
                                      next.has(child.id) ? next.delete(child.id) : next.add(child.id);
                                      return next;
                                    });
                                  }} onClick={(e) => e.stopPropagation()} />
                                  <span className="text-xs font-medium text-foreground flex-1">{child.asset_name}</span>
                                  {(child as any).serial_number && <span className="text-[10px] text-muted-foreground font-mono">{(child as any).serial_number}</span>}
                                </div>
                                {/* Condition selector */}
                                <div className="flex items-center gap-1 ml-6">
                                  {[
                                    { val: "good", label: "✅ Good", cls: "bg-success/10 text-success border-success/30" },
                                    { val: "iffy", label: "⚠️ Iffy", cls: "bg-warning/10 text-warning border-warning/30" },
                                    { val: "issue", label: "🔴 Issue", cls: "bg-destructive/10 text-destructive border-destructive/30" },
                                  ].map((opt) => (
                                    <button
                                      key={opt.val}
                                      className={cn(
                                        "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                                        condition === opt.val ? opt.cls + " font-semibold" : "bg-muted/30 text-muted-foreground border-border/30"
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setChecklistConditions((prev) => ({ ...prev, [child.id]: opt.val }));
                                      }}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                                {(condition === "iffy" || condition === "issue") && (
                                  <Input
                                    placeholder="Describe issue..."
                                    className="ml-6 h-7 text-xs"
                                    value={checklistIssueNotes[child.id] ?? ""}
                                    onChange={(e) => setChecklistIssueNotes((prev) => ({ ...prev, [child.id]: e.target.value }))}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* Sticky bottom bar */}
            {(() => {
              const allIds = new Set<string>();
              detailAssets.filter((a) => a && !a.parent_asset_id).forEach((a) => {
                if (!a) return;
                allIds.add(a.id);
                assets.filter((c) => c.parent_asset_id === a.id).forEach((c) => allIds.add(c.id));
              });
              detailAssets.filter((a) => a && a.parent_asset_id).forEach((a) => a && allIds.add(a.id));
              const total = allIds.size;
              const checked = [...allIds].filter((id) => checklistChecked.has(id)).length;
              const allCheckedOrNoGear = detailAssets.length === 0 || checked === total;

              return (
                <div className="border-t border-border/40 p-4 space-y-3 bg-card/80 backdrop-blur">
                  {total > 0 && (
                    <div className={cn("text-center text-sm font-semibold", allCheckedOrNoGear ? "text-success" : "text-warning")}>
                      {checked} of {total} items checked
                    </div>
                  )}
                  <Button
                    className="w-full gap-2 rounded-full bg-gradient-to-r from-primary to-primary/80"
                    disabled={!allCheckedOrNoGear || updateJobStatusMutation.isPending}
                    onClick={() => {
                      // Log issues for children marked "issue"
                      const issueChildren = Object.entries(checklistConditions).filter(([, cond]) => cond === "issue");
                      issueChildren.forEach(([childId]) => {
                        const child = assets.find((a) => a.id === childId);
                        if (!child) return;
                        const parent = assets.find((a) => a.id === child.parent_asset_id);
                        createLostItemMutation.mutate({
                          item_name: child.asset_name ?? "Unknown",
                          missing_quantity: 1,
                          condition: "broken",
                          parent_asset_id: child.parent_asset_id ?? undefined,
                          parent_rig_name: parent?.asset_name ?? undefined,
                          job_id: detailJob.id,
                          notes: checklistIssueNotes[childId] || "Flagged during prep checklist",
                        });
                        toast.warning(`⚠ ${child.asset_name} flagged as broken`);
                      });

                      updateJobStatusMutation.mutate(
                        { id: detailJob.id, status: "ready_for_takeoff" },
                        {
                          onSuccess: () => {
                            toast.success(`🚀 ${detailJob.job_number || detailJob.client_name} is ready for takeoff!`);
                            setGearChecklistOpen(false);
                            setDetailJob(null);
                          },
                        }
                      );
                    }}
                  >
                    <Rocket className="h-4 w-4" />
                    {updateJobStatusMutation.isPending ? "Processing…" : "Mark as Ready for Takeoff 🚀"}
                  </Button>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      )}

      {/* Create Job Dialog */}
      <CreateJobDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </motion.div>
  );
}
