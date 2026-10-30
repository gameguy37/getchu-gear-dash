import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Bell, Trash2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const TYPE_ICONS: Record<string, string> = {
  live_note: "🔔",
  traffic_delay: "🚗",
  tardy: "⚠️",
  broken_gear: "🔧",
  change_request: "📋",
  lost_item: "📦",
  new_assignment: "🎯",
  job_status_change: "🔄",
  gear_issue: "🔧",
  pending_sign_off: "✍️",
};

export function NotificationLog() {
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["all_notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = notifications.filter((n: any) => {
    if (typeFilter !== "all" && n.notification_type !== typeFilter) return false;
    if (roleFilter !== "all" && n.recipient_role !== roleFilter) return false;
    return true;
  });

  const types = [...new Set(notifications.map((n: any) => n.notification_type))];
  const roles = [...new Set(notifications.map((n: any) => n.recipient_role).filter(Boolean))];

  const clearRead = async () => {
    const readIds = notifications.filter((n: any) => n.read_at).map((n: any) => n.id);
    if (readIds.length === 0) return;
    const { error } = await supabase.from("admin_notifications").delete().in("id", readIds);
    if (error) {
      toast.error("Failed to clear read notifications");
    } else {
      toast.success(`Cleared ${readIds.length} read notifications`);
      qc.invalidateQueries({ queryKey: ["all_notifications"] });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={clearRead}>
          <Trash2 className="h-3 w-3" /> Clear Read
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="hidden md:table-cell">Message</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((n: any) => (
              <TableRow key={n.id} className={n.read_at ? "opacity-60" : ""}>
                <TableCell className="text-center">{TYPE_ICONS[n.notification_type] || "🔔"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">{n.notification_type?.replace(/_/g, " ")}</Badge>
                </TableCell>
                <TableCell className="font-medium text-sm">{n.title || "—"}</TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">{n.message || "—"}</TableCell>
                <TableCell className="text-xs">{n.recipient_role || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </TableCell>
                <TableCell>
                  <Badge variant={n.read_at ? "secondary" : "default"} className="text-[10px]">
                    {n.read_at ? "Read" : "Unread"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {isLoading ? "Loading..." : "No notifications found"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
