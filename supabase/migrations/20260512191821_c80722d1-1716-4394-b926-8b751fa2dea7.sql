
-- Enable pg_net for HTTP calls from Postgres
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger function: posts the assignment id to the send-call-sheet edge function
CREATE OR REPLACE FUNCTION public.notify_call_sheet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  should_send boolean := false;
  fn_url text := 'https://lrnifksjfxnvyfdnqaqm.supabase.co/functions/v1/send-call-sheet';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxybmlma3NqZnhudnlmZG5xYXFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNTk4MTgsImV4cCI6MjA4ODkzNTgxOH0.oELea-IFM1XRcOZ6YoxiZ17gHkRA9oH3RozNLvYiUd4';
BEGIN
  IF TG_OP = 'INSERT' AND NEW.operator_id IS NOT NULL THEN
    should_send := true;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Operator newly assigned
    IF NEW.operator_id IS NOT NULL AND (OLD.operator_id IS NULL OR OLD.operator_id <> NEW.operator_id) THEN
      should_send := true;
    -- Mission accepted toggled true
    ELSIF NEW.mission_accepted = true AND COALESCE(OLD.mission_accepted, false) = false THEN
      should_send := true;
    END IF;
  END IF;

  IF should_send THEN
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object(
        'assignment_id', NEW.id,
        'job_id', NEW.job_id,
        'operator_id', NEW.operator_id,
        'reason', CASE WHEN TG_OP = 'INSERT' THEN 'assigned'
                       WHEN NEW.mission_accepted = true AND COALESCE(OLD.mission_accepted, false) = false THEN 'accepted'
                       ELSE 'assigned' END
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_call_sheet ON public.assignments;
CREATE TRIGGER trg_notify_call_sheet
AFTER INSERT OR UPDATE ON public.assignments
FOR EACH ROW
EXECUTE FUNCTION public.notify_call_sheet();
