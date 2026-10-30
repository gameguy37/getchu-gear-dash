-- ============================================
-- 1. Double-booking prevention trigger
-- ============================================
CREATE OR REPLACE FUNCTION public.prevent_asset_double_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job_date date;
  _conflict_asset uuid;
  _conflict_job_number text;
  _conflict_client text;
  _asset_name text;
BEGIN
  IF NEW.asset_ids IS NULL OR array_length(NEW.asset_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT job_date INTO _job_date FROM public.jobs WHERE id = NEW.job_id;
  IF _job_date IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find first conflicting asset assigned to another job on the same date
  SELECT a_id, j.job_number, j.client_name
  INTO _conflict_asset, _conflict_job_number, _conflict_client
  FROM (
    SELECT unnest(NEW.asset_ids) AS a_id
  ) candidates
  JOIN public.assignments other
    ON other.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
   AND other.job_id <> NEW.job_id
   AND candidates.a_id = ANY(other.asset_ids)
  JOIN public.jobs j
    ON j.id = other.job_id
   AND j.job_date = _job_date
   AND j.status <> 'cancelled'
  LIMIT 1;

  IF _conflict_asset IS NOT NULL THEN
    SELECT asset_name INTO _asset_name FROM public.assets WHERE id = _conflict_asset;
    RAISE EXCEPTION 'DOUBLE_BOOKING: % is already assigned to job % (%) on %',
      COALESCE(_asset_name, 'This item'),
      COALESCE(_conflict_job_number, 'another'),
      COALESCE(_conflict_client, 'unknown client'),
      _job_date
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_asset_double_booking ON public.assignments;
CREATE TRIGGER trg_prevent_asset_double_booking
BEFORE INSERT OR UPDATE OF asset_ids, job_id ON public.assignments
FOR EACH ROW EXECUTE FUNCTION public.prevent_asset_double_booking();

-- ============================================
-- 2. Asset history audit log
-- ============================================
CREATE TABLE IF NOT EXISTS public.asset_history_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  previous_status text,
  new_status text,
  changed_by uuid,
  changed_by_name text,
  job_id uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_history_asset ON public.asset_history_logs(asset_id, created_at DESC);

ALTER TABLE public.asset_history_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view asset history" ON public.asset_history_logs;
CREATE POLICY "Admins view asset history"
ON public.asset_history_logs FOR SELECT
TO authenticated
USING (lower(coalesce(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'));

-- No INSERT/UPDATE/DELETE policies → only the trigger (security definer) can write.

CREATE OR REPLACE FUNCTION public.log_asset_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _changer_name text;
  _job_id uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT name INTO _changer_name FROM public.employees WHERE user_id = auth.uid() LIMIT 1;

    -- Best-effort: find an active assignment that includes this asset
    SELECT a.job_id INTO _job_id
    FROM public.assignments a
    WHERE NEW.id = ANY(a.asset_ids)
      AND a.actual_start_time IS NOT NULL
      AND a.actual_end_time IS NULL
    ORDER BY a.actual_start_time DESC
    LIMIT 1;

    INSERT INTO public.asset_history_logs (asset_id, previous_status, new_status, changed_by, changed_by_name, job_id)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), _changer_name, _job_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_asset_status_change ON public.assets;
CREATE TRIGGER trg_log_asset_status_change
AFTER UPDATE OF status ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.log_asset_status_change();

-- ============================================
-- 3. Geofence flag on assignments
-- ============================================
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS geofence_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS geofence_distance_miles numeric;