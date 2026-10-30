
-- 1. Prevent role escalation on INSERT: add a trigger that forces
--    non-admin/manager users to only insert rows with role = 'pending' or 'operator'
CREATE OR REPLACE FUNCTION public.guard_employee_role_insert()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  -- If the inserting user is NOT an admin/manager, force role to 'pending'
  IF lower(COALESCE(get_employee_role(auth.uid()), '')) NOT IN ('admin', 'manager') THEN
    NEW.role := 'pending';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_guard_employee_role_insert
  BEFORE INSERT ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_employee_role_insert();

-- 2. Ensure the existing UPDATE trigger is registered (it may exist already as a function but not as a trigger)
DROP TRIGGER IF EXISTS trg_guard_employee_role_update ON public.employees;
CREATE TRIGGER trg_guard_employee_role_update
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_employee_role_update();

-- 3. Tighten anon relay_messages policies: add job status gate so
--    closed/cancelled jobs block anonymous access
DROP POLICY IF EXISTS "Public read relay" ON public.relay_messages;
CREATE POLICY "Public read relay"
  ON public.relay_messages
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = relay_messages.job_id
        AND jobs.portal_token IS NOT NULL
        AND jobs.status NOT IN ('completed', 'cancelled')
        AND (jobs.portal_token)::text = (
          (current_setting('request.headers'::text, true))::json ->> 'x-portal-token'
        )
    )
  );

DROP POLICY IF EXISTS "Public insert relay" ON public.relay_messages;
CREATE POLICY "Public insert relay"
  ON public.relay_messages
  FOR INSERT
  TO anon
  WITH CHECK (
    sender_type = 'client'
    AND EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = relay_messages.job_id
        AND jobs.portal_token IS NOT NULL
        AND jobs.status NOT IN ('completed', 'cancelled')
        AND (jobs.portal_token)::text = (
          (current_setting('request.headers'::text, true))::json ->> 'x-portal-token'
        )
    )
  );

-- 4. Add check constraints on assignments for expense/mileage limits
ALTER TABLE public.assignments
  ADD CONSTRAINT chk_expense CHECK (expense_amount BETWEEN 0 AND 1000);

ALTER TABLE public.assignments
  ADD CONSTRAINT chk_mileage CHECK (mileage_amount BETWEEN 0 AND 500);

-- 5. Nullify portal_token when job is completed/cancelled to prevent stale access
CREATE OR REPLACE FUNCTION public.nullify_portal_token_on_close()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('completed', 'cancelled') AND OLD.status NOT IN ('completed', 'cancelled') THEN
    NEW.portal_token := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_nullify_portal_token
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.nullify_portal_token_on_close();
