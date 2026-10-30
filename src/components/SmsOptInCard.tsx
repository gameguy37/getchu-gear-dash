import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function SmsOptInCard() {
  const { employee } = useAuth();
  const [optedIn, setOptedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load current opt-in status
  useEffect(() => {
    if (!employee?.id) return;
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select("sms_opt_in")
        .eq("id", employee.id)
        .maybeSingle();
      if (data) setOptedIn(!!data.sms_opt_in);
      setLoading(false);
    })();
  }, [employee?.id]);

  const handleToggle = async (checked: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("operator_update_own_profile", {
        _sms_opt_in: checked,
      });
      if (error) throw error;
      setOptedIn(checked);
      toast.success(checked ? "SMS notifications enabled" : "SMS notifications disabled");
    } catch (err: any) {
      toast.error(`Failed to update: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <Card className="glass-dark border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4 text-primary" />
          SMS Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1">
            <Label className="text-sm font-semibold cursor-pointer">
              {optedIn ? "SMS notifications enabled ✅" : "I agree to receive text messages from Getchoo Gear."}
            </Label>
            {optedIn && (
              <button
                className="text-[11px] text-muted-foreground hover:text-destructive underline underline-offset-2 transition-colors"
                onClick={() => handleToggle(false)}
                disabled={saving}
              >
                Revoke consent
              </button>
            )}
          </div>
          {!optedIn && (
            <Switch
              checked={optedIn}
              onCheckedChange={handleToggle}
              disabled={saving}
            />
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          By checking this box, you consent to receive transactional and conversational text messages from Getchoo Gear regarding your rentals, gear status, and account. Because production schedules vary, you acknowledge that messages may be sent outside of standard business hours. Message frequency varies. Message and data rates may apply. You can reply STOP at any time to cancel.
        </p>
      </CardContent>
    </Card>
  );
}
