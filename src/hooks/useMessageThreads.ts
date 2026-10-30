import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ThreadMessage {
  id: string;
  job_id: string;
  sender_id: string | null;
  sender_name: string;
  sender_type: string;
  message: string;
  created_at: string | null;
  read_by_operator: boolean | null;
  read_by_client: boolean | null;
}

export interface JobLite {
  id: string;
  job_number: string | null;
  client_name: string | null;
  job_date: string | null;
  status: string;
}

export interface MessageThread {
  job: JobLite;
  lastMessage: ThreadMessage | null;
  unreadCount: number;
  totalMessages: number;
}

const LAST_READ_KEY = "gg_thread_last_read_v1";

function loadLastReadMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LAST_READ_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveLastReadMap(map: Record<string, string>) {
  localStorage.setItem(LAST_READ_KEY, JSON.stringify(map));
}

export function markThreadRead(jobId: string, opts?: { employeeId?: string | null; role?: string | null }) {
  const map = loadLastReadMap();
  map[jobId] = new Date().toISOString();
  saveLastReadMap(map);
  window.dispatchEvent(new CustomEvent("gg-thread-read", { detail: { jobId } }));

  // Persist read state in Supabase (best-effort) so badges clear across devices
  const column = opts?.role === "manager" ? "read_by_client" : "read_by_operator";
  void supabase
    .from("relay_messages")
    .update({ [column]: true } as never)
    .eq("job_id", jobId)
    .eq(column, false)
    .then(({ error }) => {
      if (error) console.warn("[markThreadRead] failed:", error.message);
    });
}

export function useMessageThreads() {
  const { employee, role } = useAuth();
  const queryClient = useQueryClient();

  // Fetch jobs the user can see
  const jobsQuery = useQuery({
    queryKey: ["threads-jobs", employee?.id, role],
    enabled: !!employee?.id,
    queryFn: async () => {
      if (role === "manager") {
        const { data, error } = await supabase
          .from("jobs")
          .select("id, job_number, client_name, job_date, status")
          .order("job_date", { ascending: false })
          .limit(500);
        if (error) throw error;
        return (data || []) as JobLite[];
      }
      // Operator: only assigned jobs
      const { data: assigns, error: aErr } = await supabase
        .from("assignments")
        .select("job_id")
        .eq("operator_id", employee!.id);
      if (aErr) throw aErr;
      const ids = Array.from(new Set((assigns || []).map((a) => a.job_id).filter(Boolean))) as string[];
      if (ids.length === 0) return [] as JobLite[];
      const { data, error } = await supabase
        .from("jobs")
        .select("id, job_number, client_name, job_date, status")
        .in("id", ids)
        .order("job_date", { ascending: false });
      if (error) throw error;
      return (data || []) as JobLite[];
    },
    staleTime: 30_000,
  });

  // Fetch all messages the user can see (RLS will filter for operators).
  const messagesQuery = useQuery({
    queryKey: ["threads-messages", employee?.id, role],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("relay_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as ThreadMessage[];
    },
    staleTime: 10_000,
  });

  // Realtime: invalidate on any new message
  useEffect(() => {
    const empId = employee?.id;
    if (!empId) return;

    const channelNonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // 1. Initialize the channel first (unique name per mount to avoid stale-channel reuse)
    const channel = supabase.channel(`inbox-relay:${empId}:${channelNonce}`);

    // 2. Attach ALL .on() listeners BEFORE subscribing
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "relay_messages" },
      () => {
        queryClient.invalidateQueries({ queryKey: ["threads-messages"] });
      },
    );

    // 3. Subscribe ONCE at the end
    channel.subscribe();

    // 4. Cleanup
    return () => {
      supabase.removeChannel(channel);
    };
  }, [employee?.id, queryClient]);

  // Re-render on local read marker changes
  useEffect(() => {
    const handler = () => queryClient.invalidateQueries({ queryKey: ["threads-messages"] });
    window.addEventListener("gg-thread-read", handler);
    return () => window.removeEventListener("gg-thread-read", handler);
  }, [queryClient]);

  const threads: MessageThread[] = useMemo(() => {
    const jobs = jobsQuery.data || [];
    const messages = messagesQuery.data || [];
    const lastReadMap = loadLastReadMap();

    const byJob = new Map<string, ThreadMessage[]>();
    for (const m of messages) {
      if (!m.job_id) continue;
      const list = byJob.get(m.job_id) || [];
      list.push(m);
      byJob.set(m.job_id, list);
    }

    const result: MessageThread[] = [];
    const seenJobIds = new Set<string>();

    for (const job of jobs) {
      const list = byJob.get(job.id) || [];
      const lastRead = lastReadMap[job.id];
      const unreadCount = list.filter(
        (m) =>
          m.sender_id !== employee?.id &&
          (!lastRead || (m.created_at && m.created_at > lastRead)),
      ).length;
      result.push({
        job,
        lastMessage: list[0] || null,
        unreadCount,
        totalMessages: list.length,
      });
      seenJobIds.add(job.id);
    }

    // Show only threads with at least one message OR active jobs
    const filtered = result.filter(
      (t) => t.totalMessages > 0 || !["completed", "cancelled"].includes(t.job.status),
    );

    // Sort: unread first, then by last message recency, then by job_date
    filtered.sort((a, b) => {
      if ((b.unreadCount > 0 ? 1 : 0) - (a.unreadCount > 0 ? 1 : 0) !== 0) {
        return (b.unreadCount > 0 ? 1 : 0) - (a.unreadCount > 0 ? 1 : 0);
      }
      const aTime = a.lastMessage?.created_at || a.job.job_date || "";
      const bTime = b.lastMessage?.created_at || b.job.job_date || "";
      return bTime.localeCompare(aTime);
    });

    return filtered;
  }, [jobsQuery.data, messagesQuery.data, employee?.id]);

  const totalUnread = threads.reduce((sum, t) => sum + t.unreadCount, 0);

  return {
    threads,
    totalUnread,
    loading: jobsQuery.isLoading || messagesQuery.isLoading,
  };
}
