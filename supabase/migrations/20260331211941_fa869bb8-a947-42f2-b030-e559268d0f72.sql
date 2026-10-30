-- Fix 1: Scope anon relay_messages SELECT to client messages only
DROP POLICY IF EXISTS "Public read relay" ON public.relay_messages;
CREATE POLICY "Public read relay"
ON public.relay_messages
FOR SELECT
TO anon
USING (
  sender_type = 'client' AND EXISTS (
    SELECT 1 FROM public.jobs
    WHERE jobs.id = relay_messages.job_id
      AND jobs.portal_token IS NOT NULL
      AND (jobs.portal_token)::text = (
        (current_setting('request.headers', true))::json ->> 'x-portal-token'
      )
  )
);

-- Fix 2: Guard trigger to prevent operators from escalating their role
CREATE OR REPLACE FUNCTION public.guard_employee_role_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If role is being changed, only allow admin/manager to do it
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF lower(COALESCE(get_employee_role(auth.uid()), '')) NOT IN ('admin', 'manager') THEN
      NEW.role := OLD.role; -- silently revert
    END IF;
  END IF;
  -- Also prevent non-admins from changing status
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF lower(COALESCE(get_employee_role(auth.uid()), '')) NOT IN ('admin', 'manager') THEN
      NEW.status := OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_employee_role_update ON public.employees;
CREATE TRIGGER guard_employee_role_update
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_employee_role_update();