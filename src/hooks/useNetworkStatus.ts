import { useState, useEffect, useCallback } from "react";

export type SyncStatus = "synced" | "offline" | "syncing";

export function useNetworkStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    navigator.onLine ? "synced" : "offline"
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => {
      setOnline(false);
      setSyncStatus("offline");
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const markSyncing = useCallback(() => setSyncStatus("syncing"), []);
  const markSynced = useCallback(() => setSyncStatus("synced"), []);

  // When back online, if not already synced, mark syncing (caller handles queue)
  useEffect(() => {
    if (online && syncStatus === "offline") {
      setSyncStatus("syncing");
    }
  }, [online, syncStatus]);

  return { online, syncStatus, setSyncStatus, markSyncing, markSynced };
}
