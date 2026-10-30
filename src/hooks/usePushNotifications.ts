import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(employeeId?: string) {
  const subscribed = useRef(false);

  useEffect(() => {
    if (!employeeId || subscribed.current || !VAPID_PUBLIC_KEY) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const setup = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const registration = await navigator.serviceWorker.register("/sw.js");
        const ready = await navigator.serviceWorker.ready;

        let subscription = await ready.pushManager.getSubscription();
        if (!subscription) {
          subscription = await ready.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
          });
        }

        // Save to Supabase
        const { error } = await supabase
          .from("push_subscriptions" as any)
          .upsert(
            {
              employee_id: employeeId,
              subscription: subscription.toJSON(),
            } as any,
            { onConflict: "employee_id" }
          );

        if (error) console.error("[push] Failed to save subscription:", error);
        else subscribed.current = true;
      } catch (err) {
        console.error("[push] Setup failed:", err);
      }
    };

    setup();
  }, [employeeId]);
}
