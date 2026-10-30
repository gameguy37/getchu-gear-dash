import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AppNotification {
  id: string;
  notification_type: string;
  title: string | null;
  message: string | null;
  job_id: string;
  operator_id: string;
  recipient_role: string | null;
  recipient_id: string | null;
  channel: string | null;
  metadata: any;
  read_at: string | null;
  created_at: string;
  acknowledged: boolean;
}

export function useNotifications(employeeId?: string, role?: string) {
  const qc = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", employeeId, role],
    queryFn: async () => {
      if (!employeeId) return [];
      // Fetch notifications targeted at this user or their role
      const { data, error } = await supabase
        .from("admin_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      // Filter client-side for recipient matching.
      // Admins see everything targeted at managers (and vice-versa for ops staff).
      const isOps = role === "admin" || role === "manager";
      return (data ?? []).filter((n: any) =>
        n.recipient_id === employeeId ||
        n.recipient_role === role ||
        n.recipient_role === "all" ||
        (isOps && (n.recipient_role === "manager" || n.recipient_role === "admin")) ||
        (!n.recipient_id && !n.recipient_role && isOps)
      ) as AppNotification[];
    },
    enabled: !!employeeId,
  });

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  // Realtime subscription
  useEffect(() => {
    if (!employeeId) return;

    // Clean up any lingering channels for this user/role pair before creating a new one
    const channelPrefix = `realtime:admin-notifications-realtime:${employeeId}:${role ?? "none"}`;
    supabase
      .getChannels()
      .filter((ch) => ch.topic.startsWith(channelPrefix))
      .forEach((staleChannel) => {
        supabase.removeChannel(staleChannel);
      });

    const uniqueSuffix =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const channel = supabase.channel(
      `admin-notifications-realtime:${employeeId}:${role ?? "none"}:${uniqueSuffix}`
    );

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "admin_notifications" },
      () => {
        qc.invalidateQueries({ queryKey: ["notifications", employeeId, role] });
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeId, role, qc]);

  const markRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("admin_notifications")
        .update({ read_at: new Date().toISOString() } as any)
        .eq("id", notificationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!employeeId) return;
      const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
      if (unreadIds.length === 0) return;
      const { error } = await supabase
        .from("admin_notifications")
        .update({ read_at: new Date().toISOString() } as any)
        .in("id", unreadIds);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return { notifications, unreadCount, isLoading, markRead, markAllRead };
}
