import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MapPin } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { toast } from "sonner";
import { getNotificationRoute } from "@/lib/notificationRoutes";
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

interface NotificationContextType {
  unreadCount: number;
  markAllRead: () => void;
}

const NotificationContext = createContext<NotificationContextType>({ unreadCount: 0, markAllRead: () => {} });

interface PopupNotif {
  id: string;
  title: string;
  message: string;
  type: string;
  emoji: string;
  variant: "default" | "warning" | "destructive" | "success";
  jobId?: string;
  targetPath?: string | null;
  metadata?: Record<string, any> | null;
}

function getNotifDisplay(notif: any): { emoji: string; variant: PopupNotif["variant"] } {
  const type = notif.notification_type;
  switch (type) {
    case "new_assignment": return { emoji: "📋", variant: "success" };
    case "tardy": return { emoji: "⏰", variant: "warning" };
    case "traffic_delay": return { emoji: "🚗", variant: "warning" };
    case "broken_gear": return { emoji: "🔧", variant: "destructive" };
    case "live_note": return { emoji: "📝", variant: "default" };
    case "lost_item":
    case "missing_item_ping": return { emoji: "📦", variant: "warning" };
    case "change_request": return { emoji: "📋", variant: "default" };
    case "job_deleted": return { emoji: "😢", variant: "warning" };
    case "client_cancellation": return { emoji: "❌", variant: "destructive" };
    case "force_clockout": return { emoji: "🕐", variant: "default" };
    case "time_edit": return { emoji: "✏️", variant: "warning" };
    case "theyre_here": return { emoji: "🎉", variant: "success" };
    case "mission_accepted": return { emoji: "🚀", variant: "success" };
    case "client_message": return { emoji: "💬", variant: "default" };
    case "gear_checkout": return { emoji: "📦", variant: "success" };
    default: return { emoji: "🔔", variant: "default" };
  }
}

const variantBorder: Record<PopupNotif["variant"], string> = {
  default: "border-primary/30",
  warning: "border-warning/30",
  destructive: "border-destructive/30",
  success: "border-success/30",
};

const variantTitleColor: Record<PopupNotif["variant"], string> = {
  default: "text-primary",
  warning: "text-warning",
  destructive: "text-destructive",
  success: "text-success",
};

function NotificationPopup({ notif, onDismiss }: { notif: PopupNotif; onDismiss: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const didDismiss = React.useRef(false);

  const handleDismiss = React.useCallback(() => {
    if (didDismiss.current) return;
    didDismiss.current = true;
    setOpen(false);
    onDismiss();
  }, [onDismiss]);

  const handleView = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (didDismiss.current) return;
    didDismiss.current = true;
    setOpen(false);
    onDismiss();
    if (notif.targetPath) {
      setTimeout(() => navigate(notif.targetPath!), 0);
    }
  };
  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <AlertDialogContent className={`glass-dark ${variantBorder[notif.variant]} max-w-sm`}>
        <AlertDialogHeader>
          <AlertDialogTitle className={`flex items-center gap-2 ${variantTitleColor[notif.variant]}`}>
            <span className="text-xl">{notif.emoji}</span>
            {notif.title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-foreground/80 text-sm leading-relaxed">
            {notif.message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel className="sm:flex-1" onClick={handleDismiss} disabled={!open}>
            Dismiss
          </AlertDialogCancel>
          {notif.targetPath && (
            <AlertDialogAction className="sm:flex-1 gap-1.5" onClick={handleView} disabled={!open}>
              👀 View
            </AlertDialogAction>
          )}
          {!notif.targetPath && (
            <AlertDialogAction onClick={handleDismiss} disabled={!open}>
              Got it
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TrafficDelayPopup({ notif, onDismiss }: { notif: PopupNotif; onDismiss: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const didDismiss = React.useRef(false);

  const handleDismiss = React.useCallback(() => {
    if (didDismiss.current) return;
    didDismiss.current = true;
    setOpen(false);
    onDismiss();
  }, [onDismiss]);

  const handleViewDispatch = () => {
    if (didDismiss.current) return;
    didDismiss.current = true;
    setOpen(false);
    onDismiss();
    if (notif.jobId) {
      setTimeout(() => navigate(`/live-dispatch/${notif.jobId}`), 0);
    }
  };

  const lat = notif.metadata?.lat;
  const lng = notif.metadata?.lng;
  const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null;

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <AlertDialogContent className="glass-dark border-warning/30 max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-warning text-lg">
            <span className="text-xl">🚗</span>
            {notif.title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-foreground/80 text-sm leading-relaxed space-y-3">
              <p>{notif.message}</p>
              {mapsUrl && (
                <div className="space-y-2">
                  <div className="rounded-lg overflow-hidden border border-border aspect-video">
                    <iframe
                      title="Operator location"
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(lng) - 0.01},${Number(lat) - 0.01},${Number(lng) + 0.01},${Number(lat) + 0.01}&layer=mapnik&marker=${lat},${lng}`}
                    />
                  </div>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/30 px-3 py-2 text-primary font-semibold hover:bg-primary/20 transition-colors text-xs"
                  >
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>Open in Google Maps</span>
                  </a>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel className="sm:flex-1" onClick={handleDismiss} disabled={!open}>
            Dismiss
          </AlertDialogCancel>
          <AlertDialogAction className="sm:flex-1 gap-1.5" onClick={handleViewDispatch} disabled={!open}>
            📡 Live Dispatch
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MissionAcceptedPopup({ notif, onDismiss }: { notif: PopupNotif; onDismiss: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const didDismiss = React.useRef(false);

  const handleDismiss = React.useCallback(() => {
    if (didDismiss.current) return;
    didDismiss.current = true;
    setOpen(false);
    onDismiss();
  }, [onDismiss]);

  const handleCheckGear = () => {
    if (didDismiss.current) return;
    didDismiss.current = true;
    setOpen(false);
    onDismiss();
    setTimeout(() => navigate("/jobs"), 0);
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <AlertDialogContent className="glass-dark border-success/30 max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-success text-lg">
            <span className="text-xl">🚀</span>
            {notif.title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-foreground/80 text-sm leading-relaxed">
            {notif.message}
            <span className="block mt-2 text-foreground/60 text-xs italic">
              Would you like to check gear and move the job to Ready for Takeoff?
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel className="sm:flex-1" onClick={handleDismiss} disabled={!open}>
            Dismiss
          </AlertDialogCancel>
          <AlertDialogAction className="sm:flex-1 gap-1.5" onClick={handleCheckGear} disabled={!open}>
            ✅ Check Gear & Prep
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { employee, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { unreadCount, markAllRead } = useNotifications(employee?.id, role);
  const [popupQueue, setPopupQueue] = useState<PopupNotif[]>([]);

  const dismissCurrent = () => {
    setPopupQueue((prev) => prev.slice(1));
  };

  useEffect(() => {
    if (!employee?.id) return;

    let removed = false;
    const channelName = "global-notifications";
    const stale = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (stale) supabase.removeChannel(stale);

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications" },
        (payload) => {
          if (removed) return;
          const notif = payload.new as any;
          const isManager = role === "manager";
          const isTargetedToMe = notif.recipient_id === employee.id;
          const isTargetedToMyRole = notif.recipient_role === (employee.role?.toLowerCase() || "");
          const isForAll = notif.recipient_role === "all";

          // Skip notifications explicitly targeted to another role
          const operatorOnlyTypes = ["force_clockout"];
          if (isManager && operatorOnlyTypes.includes(notif.notification_type) && notif.recipient_role === "operator") {
            return;
          }

          if (isManager || isTargetedToMe || isTargetedToMyRole || isForAll) {
            const { emoji, variant } = getNotifDisplay(notif);
            const msg = notif.message || notif.title || "New notification";
            const title = notif.title || notif.notification_type?.replace(/_/g, " ") || "Notification";
            const targetPath = getNotificationRoute(notif.notification_type, notif.job_id, notif.metadata, role);
            
            setPopupQueue((prev) => [
              ...prev,
              {
                id: notif.id || String(Date.now()),
                title,
                message: msg,
                type: notif.notification_type,
                emoji,
                variant,
                jobId: notif.job_id,
                targetPath,
                metadata: notif.metadata || null,
              },
            ]);
          }
        }
      )
      .subscribe();

    return () => {
      removed = true;
      supabase.removeChannel(channel);
    };
  }, [employee?.id, employee?.role, role]);

  // ─── Asset Updates Realtime (status changes — ADMIN/MANAGER only) ───
  useEffect(() => {
    if (!employee?.id) return;
    const r = (role || "").toLowerCase();
    if (r !== "admin" && r !== "manager") return;

    let removed = false;
    const channelName = "asset-updates";
    const stale = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (stale) supabase.removeChannel(stale);

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "assets" },
        (payload) => {
          if (removed) return;
          const asset = payload.new as any;
          const old = payload.old as any;
          if (asset.status === old?.status) return;

          const statusLabel = (asset.status || "unknown").replace(/_/g, " ");
          setPopupQueue((prev) => [
            ...prev,
            {
              id: `asset-${asset.id}-${Date.now()}`,
              title: "Asset Status Changed",
              message: `📦 "${asset.asset_name || "Unknown"}" → ${statusLabel}`,
              type: "asset_update",
              emoji: "📦",
              variant: "default" as const,
              targetPath: "/assets",
            },
          ]);
        }
      )
      .subscribe();

    return () => { removed = true; supabase.removeChannel(channel); };
  }, [employee?.id, role]);


  // ─── Jobs & Assignments Realtime (instant cache update + popups) ───
  useEffect(() => {
    if (!employee?.id) return;

    let removed = false;
    const channelName = "global-jobs-assignments";
    const stale = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (stale) supabase.removeChannel(stale);

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs" },
        (payload) => {
          if (removed) return;
          queryClient.invalidateQueries({ queryKey: ["jobs"] });
          if (payload.eventType === "INSERT" && role === "manager") {
            const job = payload.new as any;
            setPopupQueue((prev) => [
              ...prev,
              {
                id: `job-${job.id}-${Date.now()}`,
                title: "Job Dispatched",
                message: `${job.client_name || "New job"} on ${job.job_date || "TBD"}`,
                type: "job_created",
                emoji: "📋",
                variant: "success" as const,
                jobId: job.id,
                targetPath: "/jobs",
              },
            ]);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assignments" },
        (payload) => {
          if (removed) return;
          queryClient.invalidateQueries({ queryKey: ["assignments"] });
          if (payload.eventType === "INSERT" && role === "operator") {
            const asgn = payload.new as any;
            if (asgn.operator_id === employee.id) {
              supabase.from("jobs").select("client_name, job_date, job_number").eq("id", asgn.job_id).single()
                .then(({ data: job }) => {
                  if (removed) return;
                  const name = job?.client_name || "New Job";
                  const date = job?.job_date || "";
                  setPopupQueue((prev) => [
                    ...prev,
                    {
                      id: `asgn-${asgn.id}-${Date.now()}`,
                      title: "New Job Assigned",
                      message: `📋 ${name} on ${date}`,
                      type: "new_assignment",
                      emoji: "📋",
                      variant: "success" as const,
                      jobId: asgn.job_id,
                      targetPath: "/",
                    },
                  ]);
                });
            }
          }
        }
      )
      .subscribe();

    return () => { removed = true; supabase.removeChannel(channel); };
  }, [employee?.id, role, queryClient]);

  const currentPopup = popupQueue[0] || null;
  const isManagerMissionAccepted = currentPopup?.type === "mission_accepted" && role === "manager";
  const isManagerTrafficDelay = currentPopup?.type === "traffic_delay" && role === "manager";

  return (
    <NotificationContext.Provider value={{ unreadCount, markAllRead: () => markAllRead.mutate() }}>
      {children}
      {currentPopup && isManagerMissionAccepted && (
        <MissionAcceptedPopup notif={currentPopup} onDismiss={dismissCurrent} />
      )}
      {currentPopup && isManagerTrafficDelay && (
        <TrafficDelayPopup notif={currentPopup} onDismiss={dismissCurrent} />
      )}
      {currentPopup && !isManagerMissionAccepted && !isManagerTrafficDelay && (
        <NotificationPopup notif={currentPopup} onDismiss={dismissCurrent} />
      )}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  return useContext(NotificationContext);
}
