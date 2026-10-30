import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Users, Shield, UserCheck, Clock, ChevronDown, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useEmployees } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const roleBadge: Record<string, { className: string; icon: typeof Users }> = {
  admin: { className: "bg-primary/15 text-primary", icon: Shield },
  manager: { className: "bg-primary/15 text-primary", icon: Shield },
  operator: { className: "bg-success/15 text-success", icon: UserCheck },
  pending: { className: "bg-warning/15 text-warning", icon: Clock },
};

export default function CrewManagement() {
  const { data: employees = [], isLoading } = useEmployees();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const pending = employees.filter((e) => e.user_type === "pending" || e.role === "pending");
  const active = employees.filter((e) => e.user_type !== "pending" && e.role !== "pending");

  const changeRole = async (employeeId: string, newRole: string) => {
    setUpdating(employeeId);
    const { error } = await supabase
      .from("employees")
      .update({ role: newRole, status: "active" })
      .eq("id", employeeId);

    if (error) {
      toast.error("Failed to update role");
    } else {
      toast.success(`Role updated to ${newRole}`);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    }
    setUpdating(null);
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

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const EmployeeRow = ({ emp }: { emp: any }) => {
    const role = emp.role || "pending";
    const config = roleBadge[role] || roleBadge.pending;
    const RoleIcon = config.icon;

    return (
      <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground shrink-0">
            {(emp.name || "?")[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{emp.name || "Unknown"}</p>
            <p className="text-xs text-muted-foreground truncate">{emp.email || "No email"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge className={`${config.className} text-xs`} variant="secondary">
            <RoleIcon className="h-3 w-3 mr-1" />
            {role}
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={updating === emp.id}
              >
                {updating === emp.id ? "..." : "Role"}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => changeRole(emp.id, "operator")}>
                <UserCheck className="h-3.5 w-3.5 mr-2 text-success" />
                Operator
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => changeRole(emp.id, "manager")}>
                <Shield className="h-3.5 w-3.5 mr-2 text-primary" />
                Manager
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => changeRole(emp.id, "pending")}>
                <Clock className="h-3.5 w-3.5 mr-2 text-warning" />
                Pending
              </DropdownMenuItem>
             </DropdownMenuContent>
           </DropdownMenu>

           <Button
             variant="ghost"
             size="sm"
             className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
             onClick={() => setDeleteTarget({ id: emp.id, name: emp.name || "Unknown" })}
           >
             <Trash2 className="h-3.5 w-3.5" />
           </Button>
         </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-bold text-foreground">Crew Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Approve new signups and manage team roles
        </p>
      </motion.div>

      {/* Pending Approvals */}
      {pending.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-warning/30 bg-warning/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning" />
                Pending Approval ({pending.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pending.map((emp) => (
                <EmployeeRow key={emp.id} emp={emp} />
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Active Team */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Active Team ({active.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {active.map((emp) => (
              <EmployeeRow key={emp.id} emp={emp} />
            ))}
            {active.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No active team members</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

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
    </div>
  );
}
