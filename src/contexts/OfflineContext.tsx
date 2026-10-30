import React, { createContext, useContext } from "react";
import { useNetworkStatus, SyncStatus } from "@/hooks/useNetworkStatus";
import { useOfflineQueue, OfflineAction } from "@/hooks/useOfflineQueue";

interface OfflineContextValue {
  online: boolean;
  syncStatus: SyncStatus;
  enqueue: (action: Omit<OfflineAction, "id" | "createdAt">) => void;
}

const OfflineContext = createContext<OfflineContextValue>({
  online: true,
  syncStatus: "synced",
  enqueue: () => {},
});

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { online, syncStatus, markSyncing, markSynced } = useNetworkStatus();
  const { enqueue } = useOfflineQueue(online, markSyncing, markSynced);

  return (
    <OfflineContext.Provider value={{ online, syncStatus, enqueue }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}
