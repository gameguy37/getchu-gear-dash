import { useState } from "react";
import { motion } from "framer-motion";
import { Users, UserPlus, Mail, Phone, CalendarDays, MapPin, Star, Briefcase } from "lucide-react";
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
import { useEmployees, useJobs, useAssignments } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/LoadingSkeleton";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }),
};

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase();
}

export default function TeamDirectory() {
  const { data: employees = [], isLoading } = useEmployees();
  const { data: jobs = [] } = useJobs();
  const { data: assignments = [] } = useAssignments();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("operator");
  const [creating, setCreating] = useState(false);
  const [detailUser, setDetailUser] = useState<any | null>(null);

  if (isLoading) return <TableSkeleton />;

  const handleAddOperator = async () => {
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) return;
    setCreating(true);
    try {
      const res = await supabase.functions.invoke("create-user", {
        body: { email: newEmail, password: newPassword, name: newName, phone: newPhone || undefined, role: newRole },
      });
      if (res.error) {
        // Edge function returned non-2xx — parse the body for a message
        const msg = typeof res.data === "object" && res.data?.error ? res.data.error : res.error.message;
        toast.error(msg || "Failed to create user");
      } else if (res.data?.error) {
        toast.error(res.data.error);
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

  const userAssignments = detailUser ? assignments.filter((a) => a.operator_id === detailUser.id) : [];
  const userJobs = userAssignments.map((a) => jobs.find((j) => j.id === a.job_id)).filter(Boolean).sort((a, b) => a!.job_date.localeCompare(b!.job_date));

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
          <div><h1 className="text-2xl font-bold text-foreground">Team Directory</h1><p className="text-sm text-muted-foreground">{employees.length} team members</p></div>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-1.5"><UserPlus className="h-4 w-4" />Add Operator</Button>
      </div>
      <Card className="rounded-lg overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead className="hidden sm:table-cell">Contact</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Points</TableHead></TableRow></TableHeader>
          <TableBody>
            {employees.map((user, i) => (
              <motion.tr key={user.id} custom={i} variants={fadeUp} initial="hidden" animate="show" className="cursor-pointer hover:bg-muted/50 transition-colors border-b" onClick={() => setDetailUser(user)}>
                <TableCell><div className="flex items-center gap-3"><Avatar className="h-8 w-8"><AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{getInitials(user.name)}</AvatarFallback></Avatar><span className="font-medium text-foreground">{user.name}</span></div></TableCell>
                <TableCell><Badge variant="secondary" className={user.user_type === "manager" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}>{user.user_type}</Badge></TableCell>
                <TableCell className="hidden sm:table-cell"><div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{user.email}</div></TableCell>
                <TableCell><span className={`inline-flex items-center gap-1 text-xs font-medium ${user.status === "active" ? "text-success" : "text-muted-foreground"}`}><span className={`h-1.5 w-1.5 rounded-full ${user.status === "active" ? "bg-success" : "bg-muted-foreground"}`} />{user.status === "active" ? "Active" : "Inactive"}</span></TableCell>
                <TableCell className="text-right"><span className="flex items-center justify-end gap-1 text-sm font-semibold text-foreground"><Star className="h-3 w-3 text-warning" />{user.points}</span></TableCell>
              </motion.tr>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="add-name" className="text-[16px] md:text-sm">Name</Label><Input id="add-name" placeholder="Full name" className="text-[16px] md:text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="add-email" className="text-[16px] md:text-sm">Email</Label><Input id="add-email" type="email" placeholder="name@company.com" className="text-[16px] md:text-sm" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="add-password" className="text-[16px] md:text-sm">Password</Label><Input id="add-password" type="password" placeholder="Min 6 characters" className="text-[16px] md:text-sm" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="add-phone" className="text-[16px] md:text-sm">Phone</Label><Input id="add-phone" type="tel" placeholder="(555) 123-4567" className="text-[16px] md:text-sm" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} /></div>
            <div className="space-y-2">
              <Label htmlFor="add-role" className="text-[16px] md:text-sm">Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="text-[16px] md:text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button onClick={handleAddOperator} disabled={creating || !newName.trim() || !newEmail.trim() || newPassword.length < 6}>{creating ? "Creating..." : "Add Member"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Sheet open={!!detailUser} onOpenChange={(open) => !open && setDetailUser(null)}>
        <SheetContent className="sm:max-w-[440px] overflow-y-auto">
          {detailUser && (
            <div className="space-y-6 pt-2">
              <SheetHeader><SheetTitle className="text-xl">{detailUser.name}</SheetTitle></SheetHeader>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16"><AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">{getInitials(detailUser.name)}</AvatarFallback></Avatar>
                <div>
                  <Badge variant="secondary" className={detailUser.user_type === "manager" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}>{detailUser.user_type}</Badge>
                  <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground"><Mail className="h-3.5 w-3.5" />{detailUser.email}</div>
                  {detailUser.phone && <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground"><Phone className="h-3.5 w-3.5" />{detailUser.phone}</div>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-3 text-center"><p className="text-2xl font-bold text-foreground">{detailUser.points}</p><p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Star className="h-3 w-3 text-warning" /> Total Points</p></Card>
                <Card className="p-3 text-center"><p className="text-2xl font-bold text-foreground">{userJobs.length}</p><p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Briefcase className="h-3 w-3" /> Assigned Jobs</p></Card>
              </div>
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
            </div>
          )}
        </SheetContent>
      </Sheet>
    </motion.div>
  );
}
