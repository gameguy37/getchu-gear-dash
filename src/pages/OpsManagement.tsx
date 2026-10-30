import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Users, UserPlus, Mail, Phone, CalendarDays, MapPin, Star, Briefcase, Shield, UserCheck, Clock, Pencil, Trash2, Bell, History, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useEmployees, useJobs, useAssignments, useUpdateEmployee, useAddPoints } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/LoadingSkeleton";
import { NotificationLog } from "@/components/NotificationLog";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }),
};

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase();
}

const roleBadge: Record<string, { className: string; icon: typeof Users }> = {
  admin: { className: "bg-primary/15 text-primary", icon: Shield },
  manager: { className: "bg-primary/15 text-primary", icon: Shield },
  operator: { className: "bg-success/15 text-success", icon: UserCheck },
  pending: { className: "bg-warning/15 text-warning", icon: Clock },
};

export default function OpsManagement() {
  const { data: employees = [], isLoading } = useEmployees();
  const navigate = useNavigate();
  const { data: jobs = [] } = useJobs();
  const { data: assignments = [] } = useAssignments();
  const queryClient = useQueryClient();
  const updateEmployee = useUpdateEmployee();
  const addPointsMutation = useAddPoints();

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("operator");
  const [creating, setCreating] = useState(false);

  const [detailUser, setDetailUser] = useState<any | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", role: "" });
  const [editId, setEditId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [awardPoints, setAwardPoints] = useState(0);
  const [awardReason, setAwardReason] = useState("");
  const [recentAwards, setRecentAwards] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Load recent awards when detail user changes
  useEffect(() => {
    if (!detailUser) return;
    supabase.from("point_activities").select("*").eq("employee_id", detailUser.id).order("created_at", { ascending: false }).limit(5)
      .then(({ data }) => setRecentAwards(data || []));
  }, [detailUser]);

  const openHistory = async () => {
    if (!detailUser) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const { data: assigns } = await supabase
        .from("assignments")
        .select("id, job_id, asset_ids, actual_start_time, actual_end_time")
        .eq("operator_id", detailUser.id)
        .order("actual_start_time", { ascending: false, nullsFirst: false });

      const rows = assigns || [];
      const jobIds = [...new Set(rows.map((r) => r.job_id).filter(Boolean))];
      const assetIds = [...new Set(rows.flatMap((r) => r.asset_ids || []))];

      const [jobsRes, assetsRes] = await Promise.all([
        jobIds.length
          ? supabase.from("jobs").select("id, job_number, client_name, job_date, location_type, address").in("id", jobIds)
          : Promise.resolve({ data: [] as any[] }),
        assetIds.length
          ? supabase.from("assets").select("id, asset_name, category").in("id", assetIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const jobMap = new Map((jobsRes.data || []).map((j: any) => [j.id, j]));
      const assetMap = new Map((assetsRes.data || []).map((a: any) => [a.id, a]));

      const enriched = rows.map((r) => ({
        ...r,
        job: r.job_id ? jobMap.get(r.job_id) : null,
        assets: (r.asset_ids || []).map((id: string) => assetMap.get(id)).filter(Boolean),
      }));
      setHistoryRows(enriched);
    } catch (err: any) {
      toast.error(err.message || "Failed to load history");
    }
    setHistoryLoading(false);
  };

  if (isLoading) return <TableSkeleton />;

  const handleAddOperator = async () => {
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) return;
    setCreating(true);
    try {
      const res = await supabase.functions.invoke("create-user", {
        body: { email: newEmail, password: newPassword, name: newName, phone: newPhone || undefined, role: newRole },
      });
      if (res.error || res.data?.error) {
        toast.error(res.data?.error || res.error?.message || "Failed to create user");
      } else {
        toast.success(`${newName} added with login credentials`);
        setNewName(""); setNewEmail(""); setNewPhone(""); setNewPassword(""); setNewRole("operator");
        setAddOpen(false);
        queryClient.invalidateQueries({ queryKey: ["employees"] });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    }
    setCreating(false);
  };

  const openEdit = (emp: any) => {
    setEditId(emp.id);
    setEditForm({ name: emp.name, email: emp.email, phone: emp.phone || "", role: emp.role || "operator" });
    setEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editId || !editForm.name.trim()) return;
    updateEmployee.mutate(
      {
        id: editId,
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || undefined,
        role: editForm.role,
      },
      {
        onSuccess: () => {
          toast.success("Team member updated!");
          setEditOpen(false);
          setEditId(null);
        },
      }
    );
  };

  const deleteEmployee = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("employees").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error("Failed to delete crew member");
    } else {
      toast.success(`${deleteTarget.name} removed`);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    }
    setDeleteTarget(null);
  };

  const userAssignments = detailUser ? assignments.filter((a) => a.operator_id === detailUser.id) : [];
  const userJobs = userAssignments.map((a) => jobs.find((j) => j.id === a.job_id)).filter(Boolean).sort((a, b) => a!.job_date.localeCompare(b!.job_date));

  const pending = employees.filter((e) => e.role === "pending");
  const active = employees.filter((e) => e.role !== "pending");

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
          <div><h1 className="text-2xl font-bold text-foreground">Ops</h1><p className="text-sm text-muted-foreground">{employees.length} team members</p></div>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-1.5"><UserPlus className="h-4 w-4" />Add Member</Button>
      </div>

      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team" className="gap-1"><Users className="h-3.5 w-3.5" /> Team</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1"><Bell className="h-3.5 w-3.5" /> Notification Log</TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="space-y-6 mt-4">

      {/* Pending section */}
      {pending.length > 0 && (
        <Card className="border-warning/30 bg-warning/5 p-4 space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2"><Clock className="h-4 w-4 text-warning" />Pending Approval ({pending.length})</p>
          {pending.map((emp) => {
            const config = roleBadge.pending;
            return (
              <div key={emp.id} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar className="h-8 w-8"><AvatarFallback className="bg-warning/10 text-warning text-xs font-semibold">{getInitials(emp.name)}</AvatarFallback></Avatar>
                  <div className="min-w-0"><p className="text-sm font-semibold text-foreground truncate">{emp.name}</p><p className="text-xs text-muted-foreground truncate">{emp.email}</p></div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openEdit(emp)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget({ id: emp.id, name: emp.name })}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Active table */}
      <Card className="rounded-lg overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead className="hidden sm:table-cell">Contact</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Points</TableHead><TableHead className="w-[80px]"></TableHead></TableRow></TableHeader>
          <TableBody>
            {active.map((user, i) => {
              const config = roleBadge[user.role] || roleBadge.pending;
              const RoleIcon = config.icon;
              return (
                <motion.tr key={user.id} custom={i} variants={fadeUp} initial="hidden" animate="show" className="cursor-pointer hover:bg-muted/50 transition-colors border-b" onClick={() => setDetailUser(user)}>
                  <TableCell><div className="flex items-center gap-3"><Avatar className="h-8 w-8"><AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{getInitials(user.name)}</AvatarFallback></Avatar><span className="font-medium text-foreground">{user.name}</span></div></TableCell>
                  <TableCell><Badge variant="secondary" className={config.className}><RoleIcon className="h-3 w-3 mr-1" />{user.role}</Badge></TableCell>
                  <TableCell className="hidden sm:table-cell"><div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{user.email}</div></TableCell>
                  <TableCell><span className={`inline-flex items-center gap-1 text-xs font-medium ${user.status === "active" ? "text-success" : "text-muted-foreground"}`}><span className={`h-1.5 w-1.5 rounded-full ${user.status === "active" ? "bg-success" : "bg-muted-foreground"}`} />{user.status === "active" ? "Active" : "Inactive"}</span></TableCell>
                  <TableCell className="text-right"><span className="flex items-center justify-end gap-1 text-sm font-semibold text-foreground"><Star className="h-3 w-3 text-warning" />{user.points}</span></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(user)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget({ id: user.id, name: user.name })}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </motion.tr>
              );
            })}
            {active.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No active team members</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <NotificationLog />
        </TabsContent>
      </Tabs>

      {/* Add Member Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label className="text-[16px] md:text-sm">Name</Label><Input placeholder="Full name" className="text-[16px] md:text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            <div className="space-y-2"><Label className="text-[16px] md:text-sm">Email</Label><Input type="email" placeholder="name@company.com" className="text-[16px] md:text-sm" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label className="text-[16px] md:text-sm">Password</Label><Input type="password" placeholder="Min 6 characters" className="text-[16px] md:text-sm" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
            <div className="space-y-2"><Label className="text-[16px] md:text-sm">Phone</Label><Input type="tel" placeholder="(555) 123-4567" className="text-[16px] md:text-sm" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} /></div>
            <div className="space-y-2">
              <Label className="text-[16px] md:text-sm">Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="text-[16px] md:text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button onClick={handleAddOperator} disabled={creating || !newName.trim() || !newEmail.trim() || newPassword.length < 6}>{creating ? "Creating..." : "Add Member"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Edit Team Member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label className="text-[16px] md:text-sm">Name</Label><Input className="text-[16px] md:text-sm" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label className="text-[16px] md:text-sm">Email</Label><Input type="email" className="text-[16px] md:text-sm" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div className="space-y-2"><Label className="text-[16px] md:text-sm">Phone</Label><Input type="tel" className="text-[16px] md:text-sm" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label className="text-[16px] md:text-sm">Role</Label>
              <Select value={editForm.role} onValueChange={(val) => setEditForm((f) => ({ ...f, role: val }))}>
                <SelectTrigger className="text-[16px] md:text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={!editForm.name.trim() || updateEmployee.isPending}>
              {updateEmployee.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Sheet */}
      <Sheet open={!!detailUser} onOpenChange={(open) => !open && setDetailUser(null)}>
        <SheetContent className="sm:max-w-[440px] overflow-y-auto">
          {detailUser && (
            <div className="space-y-6 pt-2">
              <SheetHeader><SheetTitle className="text-xl">{detailUser.name}</SheetTitle></SheetHeader>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16"><AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">{getInitials(detailUser.name)}</AvatarFallback></Avatar>
                <div>
                  <Badge variant="secondary" className={roleBadge[detailUser.role]?.className || ""}>{detailUser.role}</Badge>
                  <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground"><Mail className="h-3.5 w-3.5" />{detailUser.email}</div>
                  {detailUser.phone && <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground"><Phone className="h-3.5 w-3.5" />{detailUser.phone}</div>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-3 text-center"><p className="text-2xl font-bold text-foreground">{detailUser.points}</p><p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Star className="h-3 w-3 text-warning" /> Total Points</p></Card>
                <Card className="p-3 text-center"><p className="text-2xl font-bold text-foreground">{userJobs.length}</p><p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Briefcase className="h-3 w-3" /> Assigned Jobs</p></Card>
              </div>
              <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={openHistory}>
                <History className="h-3.5 w-3.5" /> View Gear History
              </Button>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Upcoming Schedule</p>
                {userJobs.length === 0 && <p className="text-sm text-muted-foreground">No upcoming jobs</p>}
                {userJobs.map((job) => job && (
                  <div key={job.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                    <div className="min-w-0"><p className="text-sm font-medium text-foreground truncate">{job.client_name}</p><div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5"><CalendarDays className="h-3 w-3" />{job.job_date}<MapPin className="h-3 w-3 ml-1" />{job.location_type}</div></div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{job.status.replace(/_/g, " ")}</Badge>
                  </div>
                ))}
              </div>

              {/* Award Points */}
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">🏆 Award Points</p>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Points (+/-)"
                      className="w-24 text-[16px] md:text-sm"
                      value={awardPoints || ""}
                      onChange={(e) => setAwardPoints(Number(e.target.value))}
                    />
                    <Input
                      placeholder="Reason (e.g. 'Great attitude!')"
                      className="flex-1 text-[16px] md:text-sm"
                      value={awardReason}
                      onChange={(e) => setAwardReason(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!awardPoints || !awardReason.trim() || addPointsMutation.isPending}
                    onClick={async () => {
                      if (!detailUser) return;
                      try {
                        await addPointsMutation.mutateAsync({
                          employeeId: detailUser.id,
                          points: awardPoints,
                          reason: awardReason,
                          awardSlug: "admin_custom",
                        });
                        toast.success(`🏆 ${awardPoints > 0 ? "+" : ""}${awardPoints} pts awarded to ${detailUser.name} — '${awardReason}'`);
                        setAwardPoints(0);
                        setAwardReason("");
                        // Refresh recent awards
                        const { data } = await supabase.from("point_activities").select("*").eq("employee_id", detailUser.id).order("created_at", { ascending: false }).limit(5);
                        setRecentAwards(data || []);
                        queryClient.invalidateQueries({ queryKey: ["employees"] });
                      } catch (err: any) {
                        toast.error(err.message || "Failed to award points");
                      }
                    }}
                  >
                    {addPointsMutation.isPending ? "Awarding…" : "Give Award"}
                  </Button>
                </div>
              </div>

              {/* Recent Awards */}
              {recentAwards.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Recent Awards</p>
                  {recentAwards.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <span className={`text-sm font-bold ${a.points >= 0 ? "text-success" : "text-destructive"}`}>
                          {a.points >= 0 ? "+" : ""}{a.points}
                        </span>
                        <span className="text-sm text-foreground ml-2">{a.reason}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {a.created_at ? new Date(a.created_at).toLocaleDateString() : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Gear History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Gear History — {detailUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {historyLoading && <p className="text-sm text-muted-foreground text-center py-8">Loading history…</p>}
            {!historyLoading && historyRows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No assignment history found.</p>
            )}
            {!historyLoading && historyRows.map((row) => {
              const dateStr = row.actual_start_time
                ? new Date(row.actual_start_time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                : row.job?.job_date
                  ? new Date(row.job.job_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                  : "—";
              const timeStr = row.actual_start_time && row.actual_end_time
                ? `${new Date(row.actual_start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${new Date(row.actual_end_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : row.actual_start_time
                  ? `Started ${new Date(row.actual_start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : "Not clocked in";
              return (
                <Card
                  key={row.id}
                  className={`p-4 space-y-2 ${row.job?.id ? "cursor-pointer hover:border-primary/50 transition-colors" : ""}`}
                  onClick={() => {
                    if (!row.job?.id) return;
                    setHistoryOpen(false);
                    setDetailUser(null);
                    navigate(`/jobs?job=${row.job.id}`);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {row.job?.client_name || "Unknown job"}
                        {row.job?.job_number && <span className="text-xs text-muted-foreground ml-2">#{row.job.job_number}</span>}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                        <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{dateStr}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeStr}</span>
                        {row.job?.location_type && <Badge variant="outline" className="text-[10px]">{row.job.location_type}</Badge>}
                      </div>
                      {row.job?.address && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                          <MapPin className="h-3 w-3 mt-0.5 shrink-0" />{row.job.address}
                        </p>
                      )}
                    </div>
                  </div>
                  {row.assets.length > 0 ? (
                    <div className="pt-2 border-t border-border/40">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 flex items-center gap-1">
                        <Package className="h-3 w-3" /> Gear ({row.assets.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {row.assets.map((a: any) => (
                          <Badge key={a.id} variant="secondary" className="text-[11px]">
                            {a.asset_name}
                            {a.category && <span className="text-muted-foreground ml-1">· {a.category}</span>}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No gear recorded</p>
                  )}
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Crew Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <span className="font-semibold">{deleteTarget?.name}</span>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteEmployee} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
