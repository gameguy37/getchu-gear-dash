import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Briefcase, TrendingUp, Building2, Package, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useJobs, useAssets, useLostItems, useEmployees } from "@/hooks/useSupabaseData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { DashboardSkeleton } from "@/components/LoadingSkeleton";

const statusColors: Record<string, string> = {
  needs_prep: "hsl(217, 91%, 60%)",
  ready_for_takeoff: "hsl(38, 92%, 50%)",
  launched: "hsl(142, 71%, 45%)",
  completed: "hsl(220, 14%, 46%)",
  pending_sign_off: "hsl(280, 60%, 55%)",
};

const STATUS_LABELS: Record<string, string> = {
  needs_prep: "Needs Looking At",
  ready_for_takeoff: "Ready for Takeoff",
  launched: "Launched",
  completed: "Completed",
  pending_sign_off: "Pending Sign-Off",
  cancelled: "Cancelled",
};

const monthlyJobs = [
  { month: "Oct", jobs: 18 }, { month: "Nov", jobs: 24 }, { month: "Dec", jobs: 15 },
  { month: "Jan", jobs: 22 }, { month: "Feb", jobs: 28 }, { month: "Mar", jobs: 12 },
];

export default function Reporting() {
  const { data: jobs = [], isLoading: jobsLoading } = useJobs();
  const { data: assets = [], isLoading: assetsLoading } = useAssets();
  const { data: lostItems = [] } = useLostItems();
  const { data: employees = [] } = useEmployees();
  const [fromDate, setFromDate] = useState<Date | undefined>(new Date(2025, 9, 1));
  const [toDate, setToDate] = useState<Date | undefined>(new Date());

  if (jobsLoading || assetsLoading) return <DashboardSkeleton />;

  const jobsByStatus = () => {
    const counts: Record<string, number> = {};
    jobs.forEach((j) => { counts[j.status] = (counts[j.status] || 0) + 1; });
    return Object.entries(counts).map(([status, value]) => ({
      name: STATUS_LABELS[status] || status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), value,
      color: statusColors[status] || "hsl(220, 14%, 46%)",
    }));
  };

  const clientVolume = () => {
    const counts: Record<string, number> = {};
    jobs.forEach((j) => { counts[j.client_name] = (counts[j.client_name] || 0) + 1; });
    return Object.entries(counts).map(([name, j]) => ({ name, jobs: j })).sort((a, b) => b.jobs - a.jobs).slice(0, 5);
  };

  // Gear Loss by Operator
  const gearLossByOperator = () => {
    const empMap = new Map(employees.map(e => [e.id, e.name]));
    const counts: Record<string, number> = {};
    lostItems.forEach((li) => {
      const name = li.operator_name || empMap.get(li.operator_id ?? "") || "Unknown";
      counts[name] = (counts[name] || 0) + li.missing_quantity;
    });
    return Object.entries(counts).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 8);
  };

  const totalMissing = lostItems.reduce((sum, li) => sum + li.missing_quantity, 0);
  const completedJobs = jobs.filter((j) => j.status === "completed").length;
  const completionRate = jobs.length ? Math.round((completedJobs / jobs.length) * 100) : 0;
  const topClient = clientVolume()[0]?.name || "N/A";
  const availableAssets = assets.filter((a) => a.status === "available").length;
  const utilizationRate = assets.length ? Math.round(((assets.length - availableAssets) / assets.length) * 100) : 0;

  const metrics = [
    { label: "Total Jobs (YTD)", value: jobs.length, icon: Briefcase, glow: "glow-primary" },
    { label: "Completion Rate", value: `${completionRate}%`, icon: TrendingUp, glow: "glow-success" },
    { label: "Top Client", value: topClient, icon: Building2, glow: "glow-primary" },
    { label: "Asset Utilization", value: `${utilizationRate}%`, icon: Package, glow: "glow-warning" },
    { label: "Items Logged Missing", value: totalMissing, icon: AlertTriangle, glow: "glow-destructive" },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Reporting Dashboard</h1>
        <div className="flex items-center gap-2">
          <DatePicker label="From" date={fromDate} onSelect={setFromDate} />
          <span className="text-muted-foreground">→</span>
          <DatePicker label="To" date={toDate} onSelect={setToDate} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {metrics.map((m) => (
          <Card key={m.label} className="glass border-border/50">
            <CardContent className="flex items-center gap-4 p-5">
              <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10", m.glow)}><m.icon className="h-6 w-6 text-primary" /></div>
              <div><p className="text-xs text-muted-foreground">{m.label}</p><p className="text-2xl font-bold text-foreground">{m.value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass border-border/50">
          <CardHeader><CardTitle className="text-base">Jobs by Month</CardTitle></CardHeader>
          <CardContent><ResponsiveContainer width="100%" height={280}><BarChart data={monthlyJobs}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} /><YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} /><Tooltip contentStyle={{ background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} /><Bar dataKey="jobs" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></CardContent>
        </Card>
        <Card className="glass border-border/50">
          <CardHeader><CardTitle className="text-base">Jobs by Status</CardTitle></CardHeader>
          <CardContent><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={jobsByStatus()} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name} (${value})`}>{jobsByStatus().map((entry, i) => <Cell key={i} fill={entry.color} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></CardContent>
        </Card>
      </div>

      {/* Gear Loss by Operator */}
      {gearLossByOperator().length > 0 && (
        <Card className="glass border-border/50">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Gear Loss by Operator</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={gearLossByOperator()} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="total" fill="hsl(38, 92%, 50%)" radius={[0, 6, 6, 0]} name="Missing Items" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="glass border-border/50">
        <CardHeader><CardTitle className="text-base">Top Clients by Volume</CardTitle></CardHeader>
        <CardContent><ResponsiveContainer width="100%" height={280}><BarChart data={clientVolume()} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} /><YAxis dataKey="name" type="category" width={120} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} /><Tooltip contentStyle={{ background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} /><Bar dataKey="jobs" fill="hsl(var(--success))" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></CardContent>
      </Card>
    </div>
  );
}

function DatePicker({ label, date, onSelect }: { label: string; date?: Date; onSelect: (d?: Date) => void }) {
  return (
    <Popover><PopoverTrigger asChild><Button variant="outline" className={cn("w-[150px] justify-start text-left text-sm", !date && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{date ? format(date, "MMM d, yyyy") : label}</Button></PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={date} onSelect={onSelect} initialFocus className="p-3 pointer-events-auto" /></PopoverContent>
    </Popover>
  );
}
