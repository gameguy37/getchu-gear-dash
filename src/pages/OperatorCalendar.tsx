import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useJobs, useAssignments } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronLeft, ChevronRight, Clock, MapPin, FileText } from "lucide-react";
import { motion } from "framer-motion";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths,
  isSameMonth, isToday, startOfWeek, endOfWeek,
} from "date-fns";
import type { Job } from "@/lib/types";
import { WeeklyHoursSummary } from "@/components/WeeklyHoursSummary";
import { hoursForAssignment, formatHours } from "@/lib/hours";

const statusColors: Record<string, string> = {
  needs_prep: "hsl(215 15% 55%)",
  ready_for_takeoff: "hsl(38 92% 50%)",
  launched: "hsl(152 69% 45%)",
  pending_sign_off: "hsl(217 91% 60%)",
  completed: "hsl(199 89% 55%)",
  cancelled: "hsl(0 72% 55%)",
};

const statusLabels: Record<string, string> = {
  needs_prep: "Needs Looking At",
  ready_for_takeoff: "Ready for Takeoff",
  launched: "Launched",
  pending_sign_off: "Pending Sign-Off",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function OperatorCalendar() {
  const { employee } = useAuth();
  const { data: allJobs = [] } = useJobs();
  const { data: allAssignments = [] } = useAssignments();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Filter to this operator's assignments + jobs only
  const myAssignments = useMemo(
    () => (employee ? allAssignments.filter((a) => a.operator_id === employee.id) : []),
    [allAssignments, employee],
  );
  const myJobIds = useMemo(() => new Set(myAssignments.map((a) => a.job_id)), [myAssignments]);
  const myJobs = useMemo(() => allJobs.filter((j) => myJobIds.has(j.id)), [allJobs, myJobIds]);

  const selectedJob = useMemo(
    () => myJobs.find((j) => j.id === selectedJobId) ?? null,
    [selectedJobId, myJobs],
  );
  const selectedAssignment = selectedJob
    ? myAssignments.find((a) => a.job_id === selectedJob.id)
    : undefined;

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const jobsByDate = useMemo(() => {
    const map = new Map<string, Job[]>();
    myJobs.forEach((job) => {
      if (!job.job_date) return;
      const list = map.get(job.job_date) ?? [];
      list.push(job);
      map.set(job.job_date, list);
    });
    return map;
  }, [myJobs]);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-4 md:p-6">
      <h1 className="text-2xl font-bold text-foreground mb-6">My Calendar</h1>

      {/* Header nav */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-bold text-foreground">{format(currentMonth, "MMMM yyyy")}</h2>
        <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <WeeklyHoursSummary
        referenceDate={currentMonth}
        assignments={myAssignments}
        jobs={myJobs}
        operatorId={employee?.id}
      />

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-2" style={{ fontFamily: "var(--font-sans)" }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 py-1.5"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        className="grid grid-cols-7 border-t border-l border-white/5 dark:border-white/10 rounded-md overflow-hidden"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {days.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayJobs = jobsByDate.get(dateKey) ?? [];
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);

          return (
            <div
              key={dateKey}
              className={`min-h-[100px] md:min-h-[130px] p-1.5 md:p-2 border-r border-b border-white/5 dark:border-white/10 ${
                inMonth ? "bg-transparent" : "bg-muted/10"
              }`}
            >
              <div className="flex justify-end mb-1">
                {today ? (
                  <div className="flex items-center justify-center h-6 w-6 rounded-full bg-destructive">
                    <span className="text-[12px] font-semibold text-white leading-none">
                      {format(day, "d")}
                    </span>
                  </div>
                ) : (
                  <span
                    className={`text-[12px] font-semibold leading-none px-1 ${
                      inMonth ? "text-foreground" : "text-muted-foreground/40"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {dayJobs.slice(0, 4).map((job) => {
                  const c = statusColors[job.status];
                  return (
                    <button
                      key={job.id}
                      onClick={(e) => { e.stopPropagation(); setSelectedJobId(job.id); }}
                      className="w-full text-left rounded-md px-1.5 py-0.5 text-[10px] md:text-xs font-medium truncate block transition-opacity hover:opacity-80"
                      style={{
                        backgroundColor: `${c}26`,
                        color: c,
                      }}
                    >
                      {job.client_name}{job.call_time ? ` · ${job.call_time}` : ""}
                    </button>
                  );
                })}
                {dayJobs.length > 4 && (
                  <div className="text-[10px] text-muted-foreground pl-1">+{dayJobs.length - 4} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Job detail dialog */}
      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJobId(null)}>
        <DialogContent className="glass-dark border-primary/10 max-w-md min-h-[200px]">
          {selectedJob && (
            <>
              <DialogHeader>
                <DialogTitle className="text-foreground">{selectedJob.client_name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge style={{ backgroundColor: statusColors[selectedJob.status] }} className="text-white text-[10px]">
                    {statusLabels[selectedJob.status] || selectedJob.status.replace(/_/g, " ")}
                  </Badge>
                  {selectedJob.job_number && (
                    <span className="text-xs text-muted-foreground font-mono">{selectedJob.job_number}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selectedJob.call_time && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span className="text-foreground">{selectedJob.call_time}</span>
                    </div>
                  )}
                  {selectedJob.location_type && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="text-foreground">{selectedJob.location_type}</span>
                    </div>
                  )}
                </div>

                {selectedAssignment && (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Hours
                    </p>
                    <p className="text-sm text-foreground font-semibold">
                      {formatHours(hoursForAssignment(selectedAssignment, selectedJob))}
                      {!selectedAssignment.actual_end_time && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (guaranteed)
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {selectedJob.notes && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm text-foreground/80">{selectedJob.notes}</p>
                  </div>
                )}

                {selectedAssignment?.end_of_day_notes && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Your Notes</p>
                    <p className="text-sm text-foreground/80 flex items-start gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      {selectedAssignment.end_of_day_notes}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
