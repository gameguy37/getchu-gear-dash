-- Ensure pg_net is available for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger function: posts the new message to the notify-relay-message edge function
CREATE OR REPLACE FUNCTION public.handle_new_relay_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text := 'https://lrnifksjfxnvyfdnqaqm.supabase.co/functions/v1/notify-relay-message';
  _service_key text;
BEGIN
  -- Service-role key is needed to call our own edge function
  _service_key := current_setting('app.settings.service_role_key', true);

  -- Build the JSON payload and dispatch (fire-and-forget via pg_net)
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(_service_key, '')
    ),
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', NEW.id,
        'job_id', NEW.job_id,
        'sender_id', NEW.sender_id,
        'sender_name', NEW.sender_name,
        'sender_type', NEW.sender_type,
        'message', NEW.message,
        'created_at', NEW.created_at
      )
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the insert if notification dispatch fails
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_relay_message_notify ON public.relay_messages;
CREATE TRIGGER trg_relay_message_notify
AFTER INSERT ON public.relay_messages
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_relay_message();