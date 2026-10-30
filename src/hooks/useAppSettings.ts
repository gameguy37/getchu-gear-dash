import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AppSettings {
  send_client_emails: boolean;
  send_operator_emails: boolean;
  send_operator_sms: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  send_client_emails: true,
  send_operator_emails: true,
  send_operator_sms: false,
};

export function useAppSettings() {
  const qc = useQueryClient();

  const { data: settings = DEFAULT_SETTINGS, isLoading } = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings" as any)
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) {
        console.error("[useAppSettings]", error);
        return DEFAULT_SETTINGS;
      }
      if (!data) return DEFAULT_SETTINGS;
      return {
        send_client_emails: (data as any).send_client_emails ?? true,
        send_operator_emails: (data as any).send_operator_emails ?? true,
        send_operator_sms: (data as any).send_operator_sms ?? false,
      } as AppSettings;
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<AppSettings>) => {
      const { error } = await supabase
        .from("app_settings" as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app_settings"] }),
  });

  return { settings, isLoading, updateSettings };
}
