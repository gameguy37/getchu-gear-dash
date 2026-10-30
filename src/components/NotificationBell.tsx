import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, MessageSquare } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { useMessageThreads, markThreadRead } from "@/hooks/useMessageThreads";
import { useAuth } from "@/contexts/AuthContext";
import { getNotificationRoute } from "@/lib/notificationRoutes";
import { cn } from "@/lib/utils";

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
  job_deleted: "😢",
  client_cancellation: "❌",
  force_clockout: "🕐",
  time_edit: "✏️",
  theyre_here: "🎉",
  mission_accepted: "🚀",
  client_message: "💬",
  missing_item_ping: "📦",
};

function NotificationItem({
  notification,
  onRead,
  onNavigate,
  role,
}: {
  notification: AppNotification;
  onRead: (id: string) => void;
  onNavigate: (path: string) => void;
  role?: string;
}) {
  const isUnread = !notification.read_at;
  const icon = TYPE_ICONS[notification.notification_type] || "🔔";
  const targetPath = getNotificationRoute(
    notification.notification_type,
    notification.job_id,
    notification.metadata,
    role
  );

  const handleClick = () => {
    if (isUnread) onRead(notification.id);
    if (targetPath) onNavigate(targetPath);
  };

  return (
    <button
      className={cn(
        "w-full text-left px-4 py-3 border-b border-border/20 transition-colors hover:bg-muted/50 group",
        isUnread && "border-l-2 border-l-primary bg-primary/5",
        targetPath && "cursor-pointer"
      )}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">
            {notification.title || notification.notification_type.replace(/_/g, " ")}
          </p>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {notification.message}
          </p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[10px] text-muted-foreground/70">
              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
            </p>
            {targetPath && (
              <span className="text-[10px] text-primary font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                View →
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export function NotificationBell({ collapsed }: { collapsed?: boolean }) {
  const { employee, role } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(
    employee?.id,
    role
  );
  const { threads, totalUnread: chatUnread } = useMessageThreads();

  const totalBadge = unreadCount + chatUnread;

  const handleNavigate = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const openThread = (jobId: string) => {
    markThreadRead(jobId);
    setOpen(false);
    navigate(`/messages?job=${jobId}`);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="relative flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-sidebar-accent w-full">
          <Bell className="h-4 w-4 shrink-0 text-muted-foreground" />
          {!collapsed && (
            <span className="text-xs font-medium text-muted-foreground">Notifications</span>
          )}
          {totalBadge > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 left-5 h-4 min-w-4 px-1 text-[10px] font-bold flex items-center justify-center"
            >
              {totalBadge > 9 ? "9+" : totalBadge}
            </Badge>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border/30">
          <SheetTitle className="text-lg">Inbox</SheetTitle>
        </SheetHeader>
        <Tabs defaultValue="alerts" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 mt-2 grid grid-cols-2">
            <TabsTrigger value="alerts" className="gap-1.5">
              <Bell className="h-3.5 w-3.5" />
              Alerts
              {unreadCount > 0 && (
                <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="chats" className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              Chats
              {chatUnread > 0 && (
                <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">
                  {chatUnread > 9 ? "9+" : chatUnread}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="alerts" className="flex-1 overflow-hidden m-0">
            <div className="flex justify-end px-4 py-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1 text-primary"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </Button>
              )}
            </div>
            <ScrollArea className="h-[calc(100vh-180px)]">
              {notifications.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onRead={(id) => markRead.mutate(id)}
                    onNavigate={handleNavigate}
                    role={role}
                  />
                ))
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="chats" className="flex-1 overflow-hidden m-0">
            <div className="flex justify-end px-4 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1 text-primary"
                onClick={() => {
                  setOpen(false);
                  navigate("/messages");
                }}
              >
                Open inbox →
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-180px)]">
              {threads.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No conversations yet</p>
                </div>
              ) : (
                threads.slice(0, 30).map((t) => (
                  <button
                    key={t.job.id}
                    onClick={() => openThread(t.job.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-border/20 hover:bg-muted/50 transition-colors",
                      t.unreadCount > 0 && "border-l-2 border-l-primary bg-primary/5",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">
                        {t.job.client_name || "Untitled job"}
                      </p>
                      {t.lastMessage?.created_at && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {format(new Date(t.lastMessage.created_at), "MMM d, h:mm a")}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      #{t.job.job_number || "—"}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-muted-foreground line-clamp-1 flex-1">
                        {t.lastMessage
                          ? `${t.lastMessage.sender_name}: ${t.lastMessage.message}`
                          : "No messages yet"}
                      </p>
                      {t.unreadCount > 0 && (
                        <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-[10px]">
                          {t.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </button>
                ))
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
