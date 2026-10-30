import { Settings, Mail, MessageSquare, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAppSettings } from "@/hooks/useAppSettings";
import { SmsOptInCard } from "@/components/SmsOptInCard";
import { PushNotificationCard } from "@/components/PushNotificationCard";
import { toast } from "sonner";

export default function AdminSettings() {
  const { settings, updateSettings } = useAppSettings();

  const toggle = (key: keyof typeof settings) => {
    const newVal = !settings[key];
    updateSettings.mutate(
      { [key]: newVal },
      { onSuccess: () => toast.success(`Setting updated`) }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 glow-primary">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage app preferences and communications</p>
        </div>
      </div>

      <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5 text-primary" /> Communications
          </CardTitle>
          <CardDescription>Control automated email and SMS notifications for jobs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3.5 border border-border/30">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-primary" />
              <div>
                <Label className="text-sm font-semibold cursor-pointer">Send Client Emails</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Booking confirmations sent to clients on job creation</p>
              </div>
            </div>
            <Switch checked={settings.send_client_emails} onCheckedChange={() => toggle("send_client_emails")} />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3.5 border border-border/30">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-primary" />
              <div>
                <Label className="text-sm font-semibold cursor-pointer">Send Operator Emails</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Assignment notifications sent to operators on booking</p>
              </div>
            </div>
            <Switch checked={settings.send_operator_emails} onCheckedChange={() => toggle("send_operator_emails")} />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3.5 border border-border/30">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-primary" />
              <div>
                <Label className="text-sm font-semibold cursor-pointer">Send Operator SMS</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Text message alerts for new assignments</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={settings.send_operator_sms} onCheckedChange={() => toggle("send_operator_sms")} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <PushNotificationCard />

      {/* Manager's own SMS opt-in */}
      <SmsOptInCard />
    </div>
  );
}
