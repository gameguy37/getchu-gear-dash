import { supabase } from "@/integrations/supabase/client";
import { useAppSettings } from "./useAppSettings";
import { useCallback } from "react";

interface NotifyParams {
  // In-app notification fields
  title: string;
  message: string;
  notification_type: string;
  job_id: string;
  operator_id: string; // required by table schema
  recipient_role?: string;
  recipient_id?: string;
  metadata?: any;
  // Email params
  email?: {
    type: string;
    to: string;
    recipientName: string;
    jobDetails: any;
  }[];
  // Push params
  pushEmployeeIds?: string[];
  // SMS params  
  sms?: { to: string; message: string }[];
}

export function useNotificationSender() {
  const { settings } = useAppSettings();

  const sendNotification = useCallback(async (params: NotifyParams) => {
    const promises: Promise<any>[] = [];

    // 1. Always write in-app notification
    promises.push(
      Promise.resolve(
        supabase.from("admin_notifications").insert({
          title: params.title,
          message: params.message,
          notification_type: params.notification_type,
          job_id: params.job_id,
          operator_id: params.operator_id,
          recipient_role: params.recipient_role || "manager",
          recipient_id: params.recipient_id,
          channel: "in_app",
          metadata: params.metadata || {},
        } as any)
      )
    );

    // 2. Email (if enabled)
    if (params.email?.length && settings.send_operator_emails) {
      promises.push(
        supabase.functions.invoke("send-job-emails", {
          body: { emails: params.email },
        })
      );
    }

    // 3. Push notifications
    if (params.pushEmployeeIds?.length) {
      promises.push(
        supabase.functions.invoke("send-push", {
          body: {
            employee_ids: params.pushEmployeeIds,
            title: params.title,
            message: params.message,
          },
        }).catch((err) => console.error("[push] Failed:", err))
      );
    }

    // 4. SMS (if enabled)
    if (params.sms?.length && settings.send_operator_sms) {
      promises.push(
        supabase.functions.invoke("send-sms", {
          body: { messages: params.sms },
        }).catch((err) => console.error("[sms] Failed:", err))
      );
    }

    await Promise.allSettled(promises);
  }, [settings]);

  return { sendNotification };
}
