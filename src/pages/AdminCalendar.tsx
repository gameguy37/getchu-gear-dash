import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useJobs, useAssignments, useEmployees, useLostItems } from "@/hooks/useSupabaseData";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, MapPin, User, FileText, Receipt, Download, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameMonth, isToday, startOfWeek, endOfWeek } from "date-fns";
import type { Job } from "@/lib/types";
import { WeeklyHoursSummary } from "@/components/WeeklyHoursSummary";

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

export default function AdminCalendar() {
  const navigate = useNavigate();
  const { data: jobs = [] } = useJobs();
  const { data: assignments = [] } = useAssignments();
  const { data: employees = [] } = useEmployees();
  const { data: lostItems = [] } = useLostItems();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [receiptOpen, setReceiptOpen] = useState(false);

  const selectedJob = useMemo(() => {
    if (!selectedJobId) return null;
    return jobs.find((j) => j.id === selectedJobId) ?? null;
  }, [selectedJobId, jobs]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const jobsByDate = useMemo(() => {
    const map = new Map<string, Job[]>();
    jobs.forEach((job) => {
      if (!job.job_date) return;
      const key = job.job_date;
      const list = map.get(key) ?? [];
      list.push(job);
      map.set(key, list);
    });
    // Sort each day by call_time so the earliest sits on top, like Google Calendar
    map.forEach((list) =>
      list.sort((a, b) => (a.call_time ?? "99:99").localeCompare(b.call_time ?? "99:99")),
    );
    return map;
  }, [jobs]);

  const selectedAssignments = selectedJob ? assignments.filter((a) => a.job_id === selectedJob.id) : [];
  const selectedOperators = selectedAssignments.map((a) => employees.find((e) => e.id === a.operator_id)).filter(Boolean);
  const selectedLostItems = selectedJob ? lostItems.filter((li) => li.job_id === selectedJob.id) : [];

  const totalExpenses = selectedAssignments.reduce(
    (sum, a) => sum + Number(a.expense_amount ?? 0),
    0,
  );
  const totalMileage = Number((selectedJob as any)?.mileage_reimbursement ?? 0);
  const allReceiptUrls = selectedAssignments.flatMap((a) => a.receipt_urls ?? []);
  const reimbursementTotal = totalExpenses + totalMileage;

  const goToJob = (job: Job) => {
    if (job.status === "needs_prep") {
      navigate(`/jobs?job=${job.id}&prep=1`);
    } else {
      navigate(`/jobs?job=${job.id}`);
    }
  };

  const downloadAllReceipts = async () => {
    for (const url of allReceiptUrls) {
      const a = document.createElement("a");
      a.href = url;
      a.download = url.split("/").pop() ?? "receipt";
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-4 md:p-6">
      <h1 className="text-2xl font-bold text-foreground mb-6">Calendar</h1>

      {/* Header nav — Google Calendar style */}
      <div className="flex items-center gap-2 mb-4">
        <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())} className="rounded-full">
          Today
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="rounded-full h-9 w-9">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="rounded-full h-9 w-9">
          <ChevronRight className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-semibold text-foreground ml-2">{format(currentMonth, "MMMM yyyy")}</h2>
      </div>

      <WeeklyHoursSummary
        referenceDate={currentMonth}
        assignments={assignments}
        jobs={jobs}
        showBreakdown
        employees={employees as any}
      />

      {/* Day headers */}
      <div className="grid grid-cols-7 border-t border-l border-border/40 rounded-t-lg overflow-hidden bg-card/40">
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
          <div
            key={d}
            className="text-center text-[10px] tracking-[0.12em] font-semibold text-muted-foreground py-2 border-r border-border/40"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid — Google-style */}
      <div className="grid grid-cols-7 border-l border-border/40 rounded-b-lg overflow-hidden">
        {days.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayJobs = jobsByDate.get(dateKey) ?? [];
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);

          return (
            <div
              key={dateKey}
              className={`min-h-[110px] md:min-h-[140px] p-1 border-r border-b border-border/40 transition-colors ${
                inMonth ? "bg-background hover:bg-muted/20" : "bg-muted/10"
              }`}
            >
              <div className="flex justify-center mb-1">
                <span
                  className={`inline-flex items-center justify-center text-xs font-medium h-6 min-w-6 px-1.5 rounded-full ${
                    today
                      ? "bg-primary text-primary-foreground"
                      : inMonth
                      ? "text-foreground"
                      : "text-muted-foreground/40"
                  }`}
                >
                  {format(day, "d")}
                </span>
              </div>
              <div className="space-y-[2px]">
                {dayJobs.slice(0, 3).map((job) => {
                  const color = statusColors[job.status];
                  return (
                    <button
                      key={job.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedJobId(job.id);
                      }}
                      className="w-full text-left rounded-sm px-1.5 py-[2px] text-[10px] md:text-[11px] font-medium truncate flex items-center gap-1 transition-colors hover:opacity-80"
                      style={{
                        backgroundColor: color + "26",
                        color: color,
                      }}
                    >
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      {job.call_time && <span className="font-semibold tabular-nums">{job.call_time}</span>}
                      <span className="truncate">{job.client_name}</span>
                    </button>
                  );
                })}
                {dayJobs.length > 3 && (
                  <button
                    onClick={() => setSelectedJobId(dayJobs[3].id)}
                    className="text-[10px] text-muted-foreground hover:text-foreground pl-1 font-medium"
                  >
                    +{dayJobs.length - 3} more
                  </button>
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
                <DialogTitle
                  className="text-foreground cursor-pointer hover:text-primary transition-colors flex items-center gap-1.5 group"
                  onClick={() => goToJob(selectedJob)}
                >
                  {selectedJob.client_name}
                  <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => goToJob(selectedJob)}
                    className="rounded-full transition-transform hover:scale-105"
                    title={`Open in ${statusLabels[selectedJob.status]}`}
                  >
                    <Badge
                      style={{ backgroundColor: statusColors[selectedJob.status] }}
                      className="text-white text-[10px] cursor-pointer"
                    >
                      {statusLabels[selectedJob.status] || selectedJob.status.replace(/_/g, " ")}
                    </Badge>
                  </button>
                  {selectedJob.job_number && (
                    <button
                      onClick={() => goToJob(selectedJob)}
                      className="text-xs text-muted-foreground font-mono hover:text-foreground transition-colors"
                    >
                      {selectedJob.job_number}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selectedJob.call_time && (
                    <button
                      onClick={() => goToJob(selectedJob)}
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Clock className="h-3.5 w-3.5" /> <span className="text-foreground">{selectedJob.call_time}</span>
                    </button>
                  )}
                  {selectedJob.location_type && (
                    <button
                      onClick={() => goToJob(selectedJob)}
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <MapPin className="h-3.5 w-3.5" /> <span className="text-foreground">{selectedJob.location_type}</span>
                    </button>
                  )}
                </div>
                {((selectedJob as any).distance_miles > 0 || reimbursementTotal > 0 || allReceiptUrls.length > 0) && (
                  <button
                    onClick={() => setReceiptOpen(true)}
                    className="w-full flex items-center justify-between gap-3 text-sm rounded-lg border border-border/40 bg-card/40 px-3 py-2 hover:bg-card/70 transition-colors"
                  >
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Receipt className="h-4 w-4" />
                      {(selectedJob as any).distance_miles > 0 && (
                        <span>{(selectedJob as any).distance_miles} mi</span>
                      )}
                    </span>
                    <span className="text-foreground font-semibold">
                      ${reimbursementTotal.toFixed(2)}
                      <span className="text-muted-foreground font-normal text-xs ml-1">total</span>
                    </span>
                  </button>
                )}

                {selectedOperators.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Operators</p>
                    {selectedOperators.map((op) => op && (
                      <button
                        key={op.id}
                        onClick={() => navigate(`/crew?operator=${op.id}`)}
                        className="flex items-center gap-2 text-sm text-foreground w-full text-left py-0.5 hover:text-primary transition-colors"
                      >
                        <User className="h-3.5 w-3.5 text-muted-foreground" /> {op.name}
                      </button>
                    ))}
                  </div>
                )}

                {selectedJob.notes && (
                  <button
                    onClick={() => goToJob(selectedJob)}
                    className="w-full text-left"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm text-foreground/80 hover:text-foreground transition-colors">{selectedJob.notes}</p>
                  </button>
                )}

                {selectedAssignments.some((a) => a.end_of_day_notes) && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Operator Notes</p>
                    {selectedAssignments.filter((a) => a.end_of_day_notes).map((a) => (
                      <p key={a.id} className="text-sm text-foreground/80 flex items-start gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        {a.end_of_day_notes}
                      </p>
                    ))}
                  </div>
                )}

                {selectedLostItems.length > 0 && (
                  <button
                    onClick={() => navigate("/missing")}
                    className="w-full text-left rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1 hover:bg-destructive/10 transition-colors"
                  >
                    <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Gear Issues
                    </p>
                    {selectedLostItems.map((li) => (
                      <p key={li.id} className="text-xs text-foreground">
                        {li.item_name} ×{li.missing_quantity} —{" "}
                        <span className="text-destructive font-medium">{li.condition}</span>
                      </p>
                    ))}
                  </button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Receipt / Reimbursement dialog */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="glass-dark border-primary/10 max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Receipt className="h-5 w-5" /> Receipt
            </DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                {selectedJob.client_name}
                {selectedJob.job_number && <span className="font-mono ml-2">{selectedJob.job_number}</span>}
              </div>

              <div className="rounded-lg border border-border/40 divide-y divide-border/30 bg-card/40">
                {totalMileage > 0 && (
                  <div className="flex items-center justify-between px-3 py-2.5 text-sm">
                    <span className="text-muted-foreground">
                      Mileage{" "}
                      {(selectedJob as any).distance_miles > 0 && (
                        <span className="text-xs">({(selectedJob as any).distance_miles} mi)</span>
                      )}
                    </span>
                    <span className="text-foreground font-semibold tabular-nums">${totalMileage.toFixed(2)}</span>
                  </div>
                )}
                {totalExpenses > 0 && (
                  <div className="flex items-center justify-between px-3 py-2.5 text-sm">
                    <span className="text-muted-foreground">Operator expenses</span>
                    <span className="text-foreground font-semibold tabular-nums">${totalExpenses.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-3 py-2.5 text-sm bg-muted/20">
                  <span className="text-foreground font-semibold">Total reimbursement</span>
                  <span className="text-foreground font-bold tabular-nums">${reimbursementTotal.toFixed(2)}</span>
                </div>
              </div>

              {allReceiptUrls.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Receipts ({allReceiptUrls.length})
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={downloadAllReceipts}
                      className="h-7 text-xs gap-1"
                    >
                      <Download className="h-3.5 w-3.5" /> Download all
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {allReceiptUrls.map((url, i) => (
                      <a
                        key={url + i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-md border border-border/40 overflow-hidden bg-muted/20 aspect-square relative group"
                      >
                        <img src={url} alt={`Receipt ${i + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <ExternalLink className="h-5 w-5 text-white" />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {allReceiptUrls.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No receipt photos uploaded.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
