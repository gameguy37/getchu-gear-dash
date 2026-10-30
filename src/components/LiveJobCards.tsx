import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Timer, Clock, MapPin, User, AlertTriangle, Package, Play, ArrowRight } from "lucide-react";
import type { Job, Assignment, Asset, LostItem } from "@/lib/types";
import { cn } from "@/lib/utils";

interface LiveJobCardsProps {
  jobs: Job[];
  assignments: Assignment[];
  employees: { id: string; name: string; user_type: string }[];
  assets: Asset[];
  lostItems: LostItem[];
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function LiveJobCard({
  job,
  jobAssignments,
  employees,
  assets,
  lostItems,
}: {
  job: Job;
  jobAssignments: Assignment[];
  employees: { id: string; name: string }[];
  assets: Asset[];
  lostItems: LostItem[];
}) {
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const activeAssignments = jobAssignments.filter((a) => a.actual_start_time && !a.actual_end_time);
  const guaranteedSecs = parseFloat(job.guaranteed_hours || "0") * 3600;

  // Earliest clock-in
  const earliestClockIn = activeAssignments.reduce<string | null>((earliest, a) => {
    if (!earliest) return a.actual_start_time!;
    return new Date(a.actual_start_time!).getTime() < new Date(earliest).getTime()
      ? a.actual_start_time!
      : earliest;
  }, null);

  const elapsedSecs = earliestClockIn
    ? Math.floor((now - new Date(earliestClockIn).getTime()) / 1000)
    : 0;

  const remaining = guaranteedSecs - elapsedSecs;
  const isOT = guaranteedSecs > 0 && remaining <= 0;
  const isOTWarning = guaranteedSecs > 0 && remaining > 0 && remaining <= 1800;

  const clockInFormatted = earliestClockIn
    ? new Date(earliestClockIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

  const jobLostItems = lostItems.filter((li) => li.job_id === job.id);

  const assignedAssetIds = jobAssignments.flatMap((a) => a.asset_ids || []);
  const assignedAssets = assignedAssetIds
    .map((id) => assets.find((a) => a.id === id))
    .filter(Boolean) as Asset[];

  const operatorNames = activeAssignments
    .map((a) => employees.find((e) => e.id === a.operator_id)?.name)
    .filter(Boolean);

  return (
    <Card
      className={cn(
        "p-4 border-l-4 cursor-pointer hover:ring-1 hover:ring-primary/20 transition-all",
        isOT
          ? "border-l-destructive bg-destructive/5"
          : isOTWarning
          ? "border-l-warning bg-warning/5"
          : "border-l-primary bg-primary/5"
      )}
      onClick={() => navigate(`/live-dispatch/${job.id}`)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Play className="h-3.5 w-3.5 text-success fill-success" />
          <span className="text-sm font-bold text-foreground">{job.client_name}</span>
          <span className="text-[10px] font-mono text-muted-foreground">{job.job_number}</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Timer row */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-2">
          <Timer className={cn("h-4 w-4", isOT ? "text-destructive animate-pulse" : "text-primary")} />
          <span
            className={cn(
              "text-xl font-bold font-mono tracking-wider",
              isOT ? "text-destructive" : "text-primary"
            )}
          >
            {formatElapsed(elapsedSecs)}
          </span>
        </div>
        {guaranteedSecs > 0 && (
          <div className="text-xs">
            {isOT ? (
              <span className="text-destructive font-semibold">⚡ OT: {formatElapsed(Math.abs(remaining))}</span>
            ) : (
              <span className={cn("font-medium", isOTWarning ? "text-warning" : "text-muted-foreground")}>
                {isOTWarning ? "⚠ " : ""}Left: {formatElapsed(remaining)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span>Call: <span className="text-foreground font-medium">{job.call_time || "—"}</span></span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Play className="h-3 w-3 shrink-0" />
          <span>In: <span className="text-foreground font-medium">{clockInFormatted}</span></span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="text-foreground font-medium truncate">{job.location_type || "—"}</span>
        </div>
        {job.guaranteed_hours && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Timer className="h-3 w-3 shrink-0" />
            <span>Guar: <span className="text-foreground font-medium">{job.guaranteed_hours}h</span></span>
          </div>
        )}
      </div>

      {/* Operators */}
      {operatorNames.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
          <User className="h-3 w-3 shrink-0" />
          <span className="text-foreground">{operatorNames.join(", ")}</span>
        </div>
      )}

      {/* Gear */}
      {assignedAssets.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
          <Package className="h-3 w-3 shrink-0" />
          <span className="text-foreground truncate">{assignedAssets.map((a) => a.asset_name).join(", ")}</span>
        </div>
      )}

      {/* Missing gear alert */}
      {jobLostItems.length > 0 && (
        <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 space-y-0.5">
          <p className="text-[10px] font-semibold text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Gear Issues ({jobLostItems.length})
          </p>
          {jobLostItems.slice(0, 3).map((li) => (
            <p key={li.id} className="text-[10px] text-foreground">
              {li.item_name} ×{li.missing_quantity} — <span className="text-destructive font-medium">{li.condition}</span>
            </p>
          ))}
          {jobLostItems.length > 3 && (
            <p className="text-[10px] text-muted-foreground">+{jobLostItems.length - 3} more</p>
          )}
        </div>
      )}
    </Card>
  );
}

export function LiveJobCards({ jobs, assignments, employees, assets, lostItems }: LiveJobCardsProps) {
  const activeJobs = useMemo(() => {
    // Jobs that are "launched" AND have at least one active clock-in
    return jobs.filter((job) => {
      if (job.status !== "launched") return false;
      return assignments.some(
        (a) => a.job_id === job.id && a.actual_start_time && !a.actual_end_time
      );
    });
  }, [jobs, assignments]);

  if (activeJobs.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Live — Clocked In ({activeJobs.length})
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {activeJobs.map((job) => (
          <LiveJobCard
            key={job.id}
            job={job}
            jobAssignments={assignments.filter((a) => a.job_id === job.id)}
            employees={employees}
            assets={assets}
            lostItems={lostItems}
          />
        ))}
      </div>
    </div>
  );
}
