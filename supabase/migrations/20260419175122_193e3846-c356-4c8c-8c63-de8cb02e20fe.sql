CREATE OR REPLACE FUNCTION public.handle_new_relay_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text := 'https://lrnifksjfxnvyfdnqaqm.supabase.co/functions/v1/notify-relay-message';
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
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
  RETURN NEW;
END;
$$;