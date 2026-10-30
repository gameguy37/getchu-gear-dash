import { useEffect, useState } from "react";
import { Smartphone, Share, Plus, Bell, Check, Apple } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // @ts-ignore iOS-only
    window.navigator.standalone === true
  );
}

export default function Install() {
  const { employee } = useAuth();
  usePushNotifications(employee?.id);

  const [platform] = useState<Platform>(detectPlatform());
  const [installed, setInstalled] = useState(isStandalone());
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      toast.success("App installed! Look for it on your home screen.");
      setInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const enableNotifications = async () => {
    if (!("Notification" in window)) {
      toast.error("This browser doesn't support notifications");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      toast.success("Notifications enabled! 🔔");
    } else {
      toast.error("Notifications were blocked. Enable them in your browser settings.");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 glow-primary">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Install GetchüGear</h1>
          <p className="text-sm text-muted-foreground">
            Get it on your home screen and receive real notifications
          </p>
        </div>
      </div>

      {/* Step 1: Install */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/20 text-primary text-xs font-bold">
                1
              </span>
              Add to Home Screen
            </div>
            {installed && (
              <Badge variant="default" className="gap-1">
                <Check className="h-3 w-3" /> Installed
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {installed ? (
            <p className="text-sm text-muted-foreground">
              Nice — you're already running the installed app. ✨
            </p>
          ) : platform === "ios" ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm">
                <Apple className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <p>
                  In <strong>Safari</strong> (not Chrome), tap the <Share className="inline h-4 w-4 mx-1" />
                  <strong>Share</strong> button at the bottom of the screen.
                </p>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <Plus className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <p>
                  Scroll down and tap <strong>"Add to Home Screen"</strong>, then{" "}
                  <strong>Add</strong>.
                </p>
              </div>
              <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3 mt-3">
                💡 You need iOS 16.4 or newer for push notifications to work.
              </p>
            </div>
          ) : platform === "android" ? (
            <div className="space-y-3">
              {deferredPrompt ? (
                <Button onClick={handleInstall} className="w-full h-12">
                  <Plus className="h-4 w-4 mr-2" />
                  Install App
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Open the browser menu (⋮ in the top right) and tap{" "}
                  <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong>.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {deferredPrompt ? (
                <Button onClick={handleInstall} className="w-full h-12">
                  <Plus className="h-4 w-4 mr-2" />
                  Install App
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Look for the install icon in your browser's address bar, or open this page on
                  your phone for the best experience.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Notifications */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/20 text-primary text-xs font-bold">
                2
              </span>
              Turn on Notifications
            </div>
            {permission === "granted" && (
              <Badge variant="default" className="gap-1">
                <Check className="h-3 w-3" /> On
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {permission === "granted" ? (
            <p className="text-sm text-muted-foreground">
              You're all set. Alerts will pop up like any other app — even when GetchüGear is
              closed.
            </p>
          ) : permission === "denied" ? (
            <p className="text-sm text-destructive">
              Notifications are blocked. Open your browser/app settings → Notifications and allow
              GetchüGear.
            </p>
          ) : (
            <Button onClick={enableNotifications} className="w-full h-12">
              <Bell className="h-4 w-4 mr-2" />
              Enable Notifications
            </Button>
          )}
          {platform === "ios" && !installed && (
            <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
              ⚠️ On iPhone, you must <strong>install the app first</strong> (Step 1). Push
              notifications don't work in Safari otherwise.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 3: What you'll get */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">What you'll get</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              Lock-screen alerts with sound and vibration
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              Tap a notification → jump straight to the right page
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              Works even when GetchüGear is closed
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              Full-screen app with no browser bars
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
