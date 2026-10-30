import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, BellRing, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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

export function PushNotificationCard() {
  const { employee } = useAuth();
  const [status, setStatus] = useState<"idle" | "loading" | "enabled" | "denied" | "unsupported">("idle");

  useEffect(() => {
    if (!employee?.id) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    // Check if already subscribed
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            // Verify it's saved in DB
            const { data } = await supabase
              .from("push_subscriptions")
              .select("id")
              .eq("employee_id", employee.id)
              .maybeSingle();
            if (data) {
              setStatus("enabled");
              return;
            }
          }
        }
      } catch {
        // ignore
      }
      setStatus("idle");
    })();
  }, [employee?.id]);

  const handleEnable = async () => {
    if (!employee?.id || !VAPID_PUBLIC_KEY) {
      toast.error("Push notifications are not configured");
      return;
    }

    setStatus("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        toast.error("Notification permission was denied. Enable it in your browser settings.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const ready = await navigator.serviceWorker.ready;

      let subscription = await ready.pushManager.getSubscription();
      if (!subscription) {
        subscription = await ready.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
      }

      const { error } = await supabase
        .from("push_subscriptions" as any)
        .upsert(
          {
            employee_id: employee.id,
            subscription: subscription.toJSON(),
          } as any,
          { onConflict: "employee_id" }
        );

      if (error) throw error;

      setStatus("enabled");
      toast.success("Lock screen notifications enabled! 🔔");
    } catch (err: any) {
      console.error("[push] Setup failed:", err);
      toast.error(`Failed to enable: ${err.message}`);
      setStatus("idle");
    }
  };

  if (status === "unsupported") return null;

  return (
    <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BellRing className="h-5 w-5 text-primary" />
          Device Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Enable push notifications to receive real-time alerts on your lock screen — even when the app is closed.
        </p>

        {status === "enabled" ? (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-emerald-400">
            <Check className="h-5 w-5" />
            <span className="text-sm font-semibold">Notifications Enabled</span>
          </div>
        ) : status === "denied" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-destructive">
              <Bell className="h-5 w-5" />
              <span className="text-sm font-semibold">Permission Denied</span>
            </div>
            <p className="text-xs text-muted-foreground">
              You previously blocked notifications. To re-enable, go to your browser's site settings and allow notifications for this site.
            </p>
          </div>
        ) : (
          <Button
            onClick={handleEnable}
            disabled={status === "loading"}
            className="w-full"
            size="lg"
          >
            <Bell className="h-4 w-4 mr-2" />
            {status === "loading" ? "Enabling…" : "Enable Lock Screen Notifications"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
