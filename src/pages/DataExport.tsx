import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Briefcase, Package, Users, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useJobs, useAssets, useAssignments, useEmployees } from "@/hooks/useSupabaseData";
import { DashboardSkeleton } from "@/components/LoadingSkeleton";

function toCsv(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataExport() {
  const { data: jobs = [], isLoading: jl } = useJobs();
  const { data: assets = [], isLoading: al } = useAssets();
  const { data: assignments = [], isLoading: asl } = useAssignments();
  const { data: employees = [], isLoading: el } = useEmployees();

  if (jl || al || asl || el) return <DashboardSkeleton />;

  const exports = [
    { label: "Export Jobs", icon: Briefcase, filename: "getchu_jobs_export.csv", generate: () => toCsv(["ID", "Job Number", "Client", "Date", "Status", "Location"], jobs.map((j) => [j.id, j.job_number, j.client_name, j.job_date, j.status, j.location_type])) },
    { label: "Export Assets", icon: Package, filename: "getchu_assets_export.csv", generate: () => toCsv(["ID", "Name", "Category", "Status", "Serial", "Color Code"], assets.map((a) => [a.id, a.asset_name, a.category, a.status, a.serial || "", a.color_code])) },
    { label: "Export Assignments", icon: ClipboardList, filename: "getchu_assignments_export.csv", generate: () => toCsv(["ID", "Job ID", "Operator ID", "Asset IDs"], assignments.map((a) => [a.id, a.job_id, a.operator_id, a.asset_ids.join("; ")])) },
    { label: "Export Users", icon: Users, filename: "getchu_users_export.csv", generate: () => toCsv(["ID", "Name", "Type", "Points", "Email", "Phone", "Status"], employees.map((u) => [u.id, u.name, u.user_type, String(u.points), u.email || "", u.phone || "", u.status || ""])) },
  ];

  const handleExport = (item: (typeof exports)[0]) => {
    const csv = item.generate();
    downloadCsv(item.filename, csv);
    toast.success(`${item.label} completed — ${item.filename} downloaded`);
  };

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-foreground">Data Export Hub</h1>
      <p className="text-muted-foreground">Download your operational data as CSV files.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">
        {exports.map((item) => (
          <Card key={item.label} className="glass border-border/50 hover:glow-primary transition-shadow duration-300">
            <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"><item.icon className="h-8 w-8 text-primary" /></div>
              <h2 className="text-lg font-semibold text-foreground">{item.label}</h2>
              <p className="text-sm text-muted-foreground font-mono">{item.filename}</p>
              <Button onClick={() => handleExport(item)} className="w-full glow-primary"><Download className="mr-2 h-4 w-4" />Download CSV</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
