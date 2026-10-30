import { useMemo, useEffect, useState } from "react";
import { Timer, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useJobs, useAssignments } from "@/hooks/useSupabaseData";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
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

export function ActiveTimersSidebarContent({ collapsed }: { collapsed: boolean }) {
  const { employee } = useAuth();
  const { data: jobs } = useJobs();
  const { data: assignments } = useAssignments();

  const activeTimers = useMemo(() => {
    if (!employee || !jobs || !assignments) return [];
    return assignments
      .filter((a) => a.operator_id === employee.id && a.actual_start_time && !a.actual_end_time)
      .map((a) => {
        const job = jobs.find((j) => j.id === a.job_id);
        return job ? { assignment: a, job } : null;
      })
      .filter(Boolean) as { assignment: Assignment; job: Job }[];
  }, [employee, jobs, assignments]);

  if (activeTimers.length === 0) return null;

  return (
    <div className="px-3 py-2 space-y-2">
      {!collapsed && (
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Active Timers</p>
      )}
      {activeTimers.map((t) => (
        <ActiveTimerPill key={t.assignment.id} assignment={t.assignment} job={t.job} collapsed={collapsed} />
      ))}
    </div>
  );
}

function ActiveTimerPill({ assignment, job, collapsed }: { assignment: Assignment; job: Job; collapsed: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/?job=${job.id}`);
  };

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

  if (collapsed) {
    return (
      <button onClick={handleClick} className={cn(
        "flex items-center justify-center rounded-lg p-2 w-full cursor-pointer hover:opacity-80 transition-opacity",
        isOT ? "bg-destructive/20 glow-destructive" : isOTWarning ? "bg-warning/20" : "bg-primary/10 glow-primary"
      )}>
        <Timer className={cn("h-4 w-4", isOT ? "text-destructive animate-pulse" : "text-primary")} />
      </button>
    );
  }

  return (
    <button onClick={handleClick} className={cn(
      "rounded-lg p-2.5 space-y-1 border backdrop-blur-sm w-full text-left cursor-pointer hover:opacity-90 transition-opacity",
      isOT ? "bg-destructive/10 border-destructive/30 glow-destructive" : isOTWarning ? "bg-warning/10 border-warning/30" : "bg-primary/5 border-primary/20 glow-primary"
    )}>
      <div className="flex items-center gap-1.5">
        <Play className="h-3 w-3 text-success" />
        <span className="text-[11px] font-medium text-foreground truncate">{job.client_name}</span>
      </div>
      <p className={cn(
        "text-lg font-bold font-technical tracking-wider text-center",
        isOT ? "text-destructive animate-pulse" : "text-primary"
      )}>
        {formatTimer(elapsed)}
      </p>
      {guaranteedSecs > 0 && (
        <div className="text-center">
          {isOT ? (
            <p className="text-[10px] text-destructive font-semibold">⚡ OT: {formatTimer(Math.abs(remaining))}</p>
          ) : (
            <p className={cn("text-[10px] font-medium", isOTWarning ? "text-warning" : "text-muted-foreground")}>
              {isOTWarning ? "⚠ " : ""}Remaining: {formatTimer(remaining)}
            </p>
          )}
        </div>
      )}
    </button>
  );
}
