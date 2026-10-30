
-- FIX 2: Drop unsafe operator self-update policy
DROP POLICY IF EXISTS "Users can update own employee record" ON public.employees;

-- FIX 2: Create safe profile update function
CREATE OR REPLACE FUNCTION public.operator_update_own_profile(
  _name text DEFAULT NULL,
  _phone text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(coalesce(public.get_employee_role(auth.uid()), '')) NOT IN ('operator', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.employees
  SET
    name = COALESCE(_name, name),
    phone = COALESCE(_phone, phone)
  WHERE user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.operator_update_own_profile(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_update_own_profile(text, text) TO authenticated;

-- FIX 2: Role constraint
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_role_check
  CHECK (role IN ('admin', 'manager', 'operator', 'pending'));

-- FIX 3: Drop overly-broad portal policies
DROP POLICY IF EXISTS "Public portal token access" ON public.jobs;
DROP POLICY IF EXISTS "Client cancel via token" ON public.jobs;

-- FIX 3: Secure portal token lookup
CREATE OR REPLACE FUNCTION public.get_job_by_portal_token(_token uuid)
RETURNS TABLE (
  id uuid, job_number text, client_name text, job_date text,
  status text, location_type text, address text, call_time text,
  notes text, portal_token uuid, cancelled_by_client_at timestamptz,
  guaranteed_hours text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT j.id, j.job_number, j.client_name, j.job_date::text, j.status,
         j.location_type, j.address, j.call_time, j.notes, j.portal_token,
         j.cancelled_by_client_at, j.guaranteed_hours
  FROM public.jobs j WHERE j.portal_token = _token LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_job_by_portal_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_job_by_portal_token(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_job_by_portal_token(uuid) TO authenticated;

-- FIX 3: Secure portal cancellation
CREATE OR REPLACE FUNCTION public.cancel_job_by_portal_token(_token uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _job_id uuid; _status text;
BEGIN
  SELECT j.id, j.status INTO _job_id, _status FROM public.jobs j WHERE j.portal_token = _token LIMIT 1;
  IF _job_id IS NULL THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF _status IN ('completed', 'launched', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot cancel job in status: %', _status;
  END IF;
  UPDATE public.jobs SET status = 'cancelled', cancelled_by_client_at = now() WHERE id = _job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_job_by_portal_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_job_by_portal_token(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.cancel_job_by_portal_token(uuid) TO authenticated;

-- FIX 4: Replace broad point_activities SELECT policy
DROP POLICY IF EXISTS "Authenticated can view point activities" ON public.point_activities;

CREATE POLICY "Users view own point activity" ON public.point_activities FOR SELECT TO authenticated
  USING (
    employee_id = (SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid() LIMIT 1)
    OR get_employee_role(auth.uid()) IN ('admin', 'manager')
  );

-- PART B: Rewards table
CREATE TABLE IF NOT EXISTS public.rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  emoji text NOT NULL DEFAULT '🎁',
  points_cost integer NOT NULL DEFAULT 100,
  quantity_available integer,
  quantity_redeemed integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active rewards" ON public.rewards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage rewards" ON public.rewards FOR ALL TO authenticated
  USING (get_employee_role(auth.uid()) IN ('admin', 'manager'))
  WITH CHECK (get_employee_role(auth.uid()) IN ('admin', 'manager'));

-- PART B: Reward redemptions table
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  points_spent integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  notes text
);

ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own redemptions" ON public.reward_redemptions FOR SELECT TO authenticated
  USING (employee_id = (SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid() LIMIT 1)
    OR get_employee_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "Operators can redeem" ON public.reward_redemptions FOR INSERT TO authenticated
  WITH CHECK (employee_id = (SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid() LIMIT 1));

CREATE POLICY "Admins manage redemptions" ON public.reward_redemptions FOR UPDATE TO authenticated
  USING (get_employee_role(auth.uid()) IN ('admin', 'manager'));

-- PART B: Atomic redeem function
CREATE OR REPLACE FUNCTION public.redeem_reward(_reward_id uuid, _employee_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cost integer;
  _available integer;
  _redeemed integer;
  _current_points integer;
BEGIN
  SELECT points_cost, quantity_available, quantity_redeemed
  INTO _cost, _available, _redeemed
  FROM public.rewards WHERE id = _reward_id AND active = true FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Reward not found or inactive'; END IF;

  IF _available IS NOT NULL AND _redeemed >= _available THEN
    RAISE EXCEPTION 'Reward is out of stock';
  END IF;

  SELECT points INTO _current_points FROM public.employees WHERE id = _employee_id FOR UPDATE;

  IF _current_points < _cost THEN RAISE EXCEPTION 'Not enough points'; END IF;

  UPDATE public.employees SET points = points - _cost WHERE id = _employee_id;
  UPDATE public.rewards SET quantity_redeemed = quantity_redeemed + 1 WHERE id = _reward_id;

  INSERT INTO public.reward_redemptions (reward_id, employee_id, points_spent)
    VALUES (_reward_id, _employee_id, _cost);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_reward(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_reward(uuid, uuid) TO authenticated;
