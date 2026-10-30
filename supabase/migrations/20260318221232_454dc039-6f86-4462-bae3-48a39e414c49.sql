CREATE OR REPLACE FUNCTION public.operator_set_job_status(_job_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _employee_id uuid;
BEGIN
  IF lower(coalesce(public.get_employee_role(auth.uid()), '')) <> 'operator' THEN
    RAISE EXCEPTION 'Only operators can set operational job status';
  END IF;

  IF _status NOT IN ('ready_for_takeoff', 'launched', 'pending_sign_off') THEN
    RAISE EXCEPTION 'Invalid operational status: %', _status;
  END IF;

  SELECT e.id INTO _employee_id
  FROM public.employees e
  WHERE e.user_id = auth.uid()
  LIMIT 1;

  IF _employee_id IS NULL THEN
    RAISE EXCEPTION 'Operator employee record not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.job_id = _job_id
      AND a.operator_id = _employee_id
  ) THEN
    RAISE EXCEPTION 'Operator is not assigned to this job';
  END IF;

  UPDATE public.jobs
  SET status = _status
  WHERE id = _job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.operator_set_job_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_set_job_status(uuid, text) TO authenticated;