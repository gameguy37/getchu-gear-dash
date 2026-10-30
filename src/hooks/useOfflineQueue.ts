import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export interface OfflineAction {
  id: string;
  table: string;
  type: "insert" | "update" | "upsert";
  payload: Record<string, any>;
  matchColumn?: string; // for updates, e.g. "id"
  matchValue?: string;
  createdAt: number;
}

const QUEUE_KEY = "offline_action_queue";

function readQueue(): OfflineAction[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineAction[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getQueueLength(): number {
  return readQueue().length;
}

export function useOfflineQueue(
  online: boolean,
  markSyncing: () => void,
  markSynced: () => void
) {
  const processing = useRef(false);
  const qc = useQueryClient();

  const enqueue = useCallback(
    (action: Omit<OfflineAction, "id" | "createdAt">) => {
      const entry: OfflineAction = {
        ...action,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      };
      const queue = readQueue();
      queue.push(entry);
      writeQueue(queue);
      toast.info("Saved offline. Will sync when connection is restored.", {
        icon: "📡",
      });
    },
    []
  );

  const processQueue = useCallback(async () => {
    if (processing.current) return;
    const queue = readQueue();
    if (queue.length === 0) {
      markSynced();
      return;
    }

    processing.current = true;
    markSyncing();

    let remaining = [...queue];

    for (const action of queue) {
      try {
        if (action.type === "update" && action.matchColumn && action.matchValue) {
          const { error } = await supabase
            .from(action.table as any)
            .update(action.payload)
            .eq(action.matchColumn, action.matchValue);
          if (error) throw error;
        } else if (action.type === "insert") {
          const { error } = await supabase
            .from(action.table as any)
            .insert(action.payload);
          if (error) throw error;
        } else if (action.type === "upsert") {
          const { error } = await supabase
            .from(action.table as any)
            .upsert(action.payload);
          if (error) throw error;
        }
        remaining = remaining.filter((a) => a.id !== action.id);
        writeQueue(remaining);
      } catch (err: any) {
        toast.error(`Sync failed for ${action.table}: ${err.message}`);
        break; // stop processing, retry next time
      }
    }

    writeQueue(remaining);

    if (remaining.length === 0) {
      toast.success("All offline changes synced!", { icon: "✅" });
      // Invalidate all queries to refresh data
      qc.invalidateQueries();
      markSynced();
    }

    processing.current = false;
  }, [markSyncing, markSynced, qc]);

  // Auto-process when coming back online
  useEffect(() => {
    if (online) {
      processQueue();
    }
  }, [online, processQueue]);

  return { enqueue, processQueue, getQueueLength };
}
