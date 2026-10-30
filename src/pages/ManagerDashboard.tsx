import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle, Briefcase, Package, Clock, Users, ArrowRight, ArrowLeft,
  CalendarDays, MapPin, Pencil, User, Play, CheckCircle2, MessageCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useJobs, useAssets, useEmployees, useAssignments } from "@/hooks/useSupabaseData";
import { Job, JobStatus } from "@/lib/types";
import { DashboardSkeleton } from "@/components/LoadingSkeleton";
import MissionControlCards from "@/components/MissionControlCards";
import { PendingAccessRequests } from "@/components/PendingAccessRequests";
import {
  isSameDay, parseISO, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, addWeeks, subWeeks, addMonths, subMonths, isWithinInterval,
} from "date-fns";
import { cn } from "@/lib/utils";

const statusColors: Record<JobStatus, string> = {
  needs_prep: "border-primary/30 text-primary",
  ready_for_takeoff: "border-warning/30 text-warning",
  launched: "border-success/30 text-success",
  pending_sign_off: "border-accent/30 text-accent",
  completed: "border-muted-foreground/30 text-muted-foreground",
  cancelled: "border-destructive/30 text-destructive",
};

const pillColors: Record<JobStatus, string> = {
  needs_prep: "bg-primary/20 text-primary border-primary/30",
  ready_for_takeoff: "bg-warning/20 text-warning border-warning/30",
  launched: "bg-success/20 text-success border-success/30",
  pending_sign_off: "bg-accent/20 text-accent border-accent/30",
  completed: "bg-muted/40 text-muted-foreground border-border",
  cancelled: "bg-destructive/20 text-destructive border-destructive/30",
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.35 } }),
};

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

interface KanbanColumn {
  id: string;
  title: string;
  icon: React.ReactNode;
  borderColor: string;
  jobs: Job[];
}

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const { data: jobs = [], isLoading: jobsLoading } = useJobs();
  const { data: assets = [], isLoading: assetsLoading } = useAssets();
  const { data: employees = [], isLoading: employeesLoading } = useEmployees();
  const { data: assignments = [] } = useAssignments();
  const [detailJob, setDetailJob] = useState<Job | null>(null);

  // Calendar state
  const [calView, setCalView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(new Date());

  const loading = jobsLoading || assetsLoading || employeesLoading;

  const today = useMemo(() => new Date(), []);

  // Calendar days
  const calDays = useMemo(() => {
    if (calView === "week") {
      const s = startOfWeek(anchor, { weekStartsOn: 0 });
      const e = endOfWeek(anchor, { weekStartsOn: 0 });
      return eachDayOfInterval({ start: s, end: e });
    } else {
      const s = startOfMonth(anchor);
      const e = endOfMonth(anchor);
      return eachDayOfInterval({ start: s, end: e });
    }
  }, [calView, anchor]);

  const jobsByDay = useMemo(() => {
    const map = new Map<string, Job[]>();
    jobs.forEach((j) => {
      if (!j.job_date) return;
      const key = j.job_date;
      const arr = map.get(key) ?? [];
      arr.push(j);
      map.set(key, arr);
    });
    return map;
  }, [jobs]);

  const navPrev = () => setAnchor(calView === "week" ? subWeeks(anchor, 1) : subMonths(anchor, 1));
  const navNext = () => setAnchor(calView === "week" ? addWeeks(anchor, 1) : addMonths(anchor, 1));

  const columns: KanbanColumn[] = useMemo(() => {
    if (loading) return [];

    const upcoming = jobs.filter(j => {
      if (j.status === "completed" || j.status === "cancelled") return false;
      if (!j.job_date) return false;
      const d = parseISO(j.job_date);
      return d > today && !isSameDay(d, today);
    });

    const activeToday = jobs.filter(j => {
      if (j.status === "completed" || j.status === "cancelled") return false;
      if (!j.job_date) return false;
      const d = parseISO(j.job_date);
      if (!isSameDay(d, today)) return false;
      const jobAssignments = assignments.filter(a => a.job_id === j.id);
      return !jobAssignments.some(a => a.actual_start_time && !a.actual_end_time);
    });

    const inProgress = jobs.filter(j => {
      if (j.status === "completed" || j.status === "cancelled") return false;
      const jobAssignments = assignments.filter(a => a.job_id === j.id);
      return jobAssignments.some(a => a.actual_start_time && !a.actual_end_time);
    });

    const completed = jobs.filter(j => j.status === "completed").slice(0, 10);

    return [
      { id: "upcoming", title: "Upcoming", icon: <CalendarDays className="h-4 w-4" />, borderColor: "border-t-primary", jobs: upcoming },
      { id: "today", title: "Active Today", icon: <Clock className="h-4 w-4" />, borderColor: "border-t-warning", jobs: activeToday },
      { id: "progress", title: "In Progress", icon: <Play className="h-4 w-4" />, borderColor: "border-t-success", jobs: inProgress },
      { id: "completed", title: "Completed", icon: <CheckCircle2 className="h-4 w-4" />, borderColor: "border-t-muted-foreground", jobs: completed },
    ];
  }, [jobs, assignments, today]);

  if (loading) return <DashboardSkeleton />;

  const detailAssignments = detailJob ? assignments.filter(a => a.job_id === detailJob.id) : [];
  const detailOperators = detailAssignments.map(a => employees.find(u => u.id === a.operator_id));
  const detailAssets = detailAssignments.flatMap(a => a.asset_ids.map(aid => assets.find(asset => asset.id === aid)).filter(Boolean));

  return (
    <div className="p-4 md:p-6 space-y-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mission Control</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-technical">
            {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <Button onClick={() => navigate("/messages")} className="gap-2 shrink-0">
          <MessageCircle className="h-4 w-4" />
          Messages
        </Button>
      </motion.div>

      {/* Mission Control Stat Cards */}
      <MissionControlCards />
      <PendingAccessRequests />

      {/* Schedule Overview Calendar */}
      <Card className="glass-card border-primary/10">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Schedule Overview
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <Button size="sm" variant={calView === "week" ? "default" : "ghost"} className="h-7 text-xs" onClick={() => setCalView("week")}>Week</Button>
                <Button size="sm" variant={calView === "month" ? "default" : "ghost"} className="h-7 text-xs" onClick={() => setCalView("month")}>Month</Button>
              </div>
              <Button size="icon" variant="ghost" aria-label="Previous period" className="h-7 w-7" onClick={navPrev}><ArrowLeft className="h-3.5 w-3.5" /></Button>
              <span className="text-xs font-technical text-muted-foreground min-w-[120px] text-center">
                {calView === "week"
                  ? `${format(calDays[0], "MMM d")} – ${format(calDays[calDays.length - 1], "MMM d")}`
                  : format(anchor, "MMMM yyyy")
                }
              </span>
              <Button size="icon" variant="ghost" aria-label="Next period" className="h-7 w-7" onClick={navNext}><ArrowRight className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className={cn(
            "grid gap-1",
            calView === "week" ? "grid-cols-7" : "grid-cols-7"
          )}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-[10px] text-center text-muted-foreground font-semibold uppercase py-1">{d}</div>
            ))}
            {/* pad start for month view */}
            {calView === "month" && Array.from({ length: calDays[0].getDay() }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {calDays.map((day) => {
              const dayStr = format(day, "yyyy-MM-dd");
              const dayJobs = jobsByDay.get(dayStr) ?? [];
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={dayStr}
                  className={cn(
                    "rounded-md p-1 min-h-[60px] border border-transparent transition-colors",
                    isToday && "border-primary/30 bg-primary/5",
                  )}
                >
                  <p className={cn(
                    "text-[10px] font-technical text-center mb-0.5",
                    isToday ? "text-primary font-bold" : "text-muted-foreground"
                  )}>
                    {format(day, "d")}
                  </p>
                  <div className="space-y-0.5">
                    {dayJobs.slice(0, 3).map((j) => (
                      <button
                        key={j.id}
                        className={cn(
                          "w-full text-left rounded px-1 py-0.5 text-[9px] font-medium truncate border cursor-pointer hover:opacity-80 transition-opacity backdrop-blur-sm",
                          pillColors[j.status]
                        )}
                        onClick={() => setDetailJob(j)}
                        title={`${j.client_name} · ${j.call_time || ""}`}
                      >
                        {j.client_name}
                        {j.call_time && <span className="opacity-70 ml-0.5">· {j.call_time}</span>}
                      </button>
                    ))}
                    {dayJobs.length > 3 && (
                      <p className="text-[8px] text-muted-foreground text-center">+{dayJobs.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {columns.map((col) => (
          <Card key={col.id} className={`glass-card border-t-2 ${col.borderColor} min-h-[300px]`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                {col.icon}
                {col.title}
                <Badge variant="outline" className="ml-auto text-[10px] border-border">{col.jobs.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
              {col.jobs.map((job) => (
                <motion.div
                  key={job.id}
                  whileHover={{ scale: 1.01 }}
                  className="rounded-lg border border-border/50 bg-card/60 p-3 cursor-pointer hover:border-primary/30 transition-all"
                  onClick={() => setDetailJob(job)}
                >
                  <p className="text-sm font-semibold text-foreground truncate">{job.client_name}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    {job.call_time && (
                      <span className="flex items-center gap-1 font-technical">
                        <Clock className="h-3 w-3" /> {job.call_time}
                      </span>
                    )}
                    {job.location_type && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {job.location_type}
                      </span>
                    )}
                  </div>
                  {job.guaranteed_hours && (
                    <Badge variant="outline" className="mt-1.5 text-[10px] border-primary/20 text-primary">
                      {job.guaranteed_hours}h guaranteed
                    </Badge>
                  )}
                </motion.div>
              ))}
              {col.jobs.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No jobs</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Job Detail Sheet */}
      <Sheet open={!!detailJob} onOpenChange={(open) => !open && setDetailJob(null)}>
        <SheetContent className="sm:max-w-[440px] overflow-y-auto glass-dark">
          {detailJob && (
            <div className="space-y-6 pt-2">
              <SheetHeader>
                <SheetTitle className="text-xl text-foreground">{detailJob.client_name}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4">
                <Badge variant="outline" className={statusColors[detailJob.status]}>
                  {detailJob.status.replace(/_/g, " ")}
                </Badge>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Job Number</p>
                    <p className="text-sm font-medium text-foreground font-technical">{detailJob.job_number}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="text-sm font-medium text-foreground">{detailJob.job_date}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-sm font-medium text-foreground">{detailJob.location_type}</p>
                  </div>
                  {detailJob.guaranteed_hours && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Guaranteed</p>
                      <p className="text-sm font-medium text-primary font-technical">{detailJob.guaranteed_hours}h</p>
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
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Assigned Operators</p>
                  {detailOperators.length === 0 && <p className="text-sm text-muted-foreground">None assigned</p>}
                  {detailOperators.map(op => op && (
                    <div key={op.id} className="flex items-center gap-2 rounded-lg glass-card px-3 py-2">
                      <User className="h-4 w-4 text-primary" />
                      <span className="text-sm text-foreground">{op.name}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Assigned Gear</p>
                  {detailAssets.length === 0 && <p className="text-sm text-muted-foreground">No gear assigned</p>}
                  {detailAssets.map(asset => asset && (
                    <div key={asset.id} className="flex items-center gap-2 rounded-lg glass-card px-3 py-2">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: asset.color_code }} />
                      <p className="text-sm text-foreground truncate flex-1">{asset.asset_name}</p>
                      <Badge variant="outline" className="text-[10px]">{asset.category}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              <Button className="w-full sci-fi-btn text-primary" variant="outline" onClick={() => { setDetailJob(null); navigate("/jobs"); }}>
                <Pencil className="h-4 w-4 mr-1.5" /> Edit Job
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
