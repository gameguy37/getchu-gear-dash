-- Phase 54: Case-insensitive role checks + asset cascade deletion

-- 1) Normalize role function output to lowercase (bulletproof against Admin/admin casing)
CREATE OR REPLACE FUNCTION public.get_employee_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(role)
  FROM public.employees
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- 2) Ensure parent->child asset FK cascades on parent delete
ALTER TABLE public.assets
DROP CONSTRAINT IF EXISTS assets_parent_asset_id_fkey;

ALTER TABLE public.assets
ADD CONSTRAINT assets_parent_asset_id_fkey
FOREIGN KEY (parent_asset_id)
REFERENCES public.assets(id)
ON DELETE CASCADE;

-- 3) Recreate ASSETS policies with explicit case-insensitive checks
DROP POLICY IF EXISTS "Admins can select assets" ON public.assets;
DROP POLICY IF EXISTS "Operators can view assets" ON public.assets;
DROP POLICY IF EXISTS "Admins can insert assets" ON public.assets;
DROP POLICY IF EXISTS "Admins can update assets" ON public.assets;
DROP POLICY IF EXISTS "Operators can update assets on checkout" ON public.assets;
DROP POLICY IF EXISTS "Admins can delete assets" ON public.assets;

CREATE POLICY "Admins can select assets"
ON public.assets
FOR SELECT
TO authenticated
USING (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'));

CREATE POLICY "Operators can view assets"
ON public.assets
FOR SELECT
TO authenticated
USING (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) = 'operator');

CREATE POLICY "Admins can insert assets"
ON public.assets
FOR INSERT
TO authenticated
WITH CHECK (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'));

CREATE POLICY "Admins can update assets"
ON public.assets
FOR UPDATE
TO authenticated
USING (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'))
WITH CHECK (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'));

CREATE POLICY "Operators can update assets on checkout"
ON public.assets
FOR UPDATE
TO authenticated
USING (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) = 'operator')
WITH CHECK (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) = 'operator');

CREATE POLICY "Admins can delete assets"
ON public.assets
FOR DELETE
TO authenticated
USING (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'));

-- 4) Recreate JOBS policies with explicit case-insensitive checks
DROP POLICY IF EXISTS "Operators can view assigned jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins can select jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins can insert jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins can update jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins can delete jobs" ON public.jobs;

CREATE POLICY "Operators can view assigned jobs"
ON public.jobs
FOR SELECT
TO authenticated
USING (
  LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) = 'operator'
  AND EXISTS (
    SELECT 1
    FROM public.assignments a
    JOIN public.employees e ON e.id = a.operator_id
    WHERE a.job_id = jobs.id
      AND e.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can select jobs"
ON public.jobs
FOR SELECT
TO authenticated
USING (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'));

CREATE POLICY "Admins can insert jobs"
ON public.jobs
FOR INSERT
TO authenticated
WITH CHECK (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'));

CREATE POLICY "Admins can update jobs"
ON public.jobs
FOR UPDATE
TO authenticated
USING (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'))
WITH CHECK (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'));

CREATE POLICY "Admins can delete jobs"
ON public.jobs
FOR DELETE
TO authenticated
USING (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'));

-- 5) Recreate ASSIGNMENTS policies with explicit case-insensitive checks
DROP POLICY IF EXISTS "Operators can view own assignments" ON public.assignments;
DROP POLICY IF EXISTS "Operators can update own assignments" ON public.assignments;
DROP POLICY IF EXISTS "Admins can select assignments" ON public.assignments;
DROP POLICY IF EXISTS "Admins can insert assignments" ON public.assignments;
DROP POLICY IF EXISTS "Admins can update assignments" ON public.assignments;
DROP POLICY IF EXISTS "Admins can delete assignments" ON public.assignments;

CREATE POLICY "Operators can view own assignments"
ON public.assignments
FOR SELECT
TO authenticated
USING (
  LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) = 'operator'
  AND operator_id = (
    SELECT e.id
    FROM public.employees e
    WHERE e.user_id = auth.uid()
    LIMIT 1
  )
);

CREATE POLICY "Operators can update own assignments"
ON public.assignments
FOR UPDATE
TO authenticated
USING (
  LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) = 'operator'
  AND operator_id = (
    SELECT e.id
    FROM public.employees e
    WHERE e.user_id = auth.uid()
    LIMIT 1
  )
)
WITH CHECK (
  LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) = 'operator'
  AND operator_id = (
    SELECT e.id
    FROM public.employees e
    WHERE e.user_id = auth.uid()
    LIMIT 1
  )
);

CREATE POLICY "Admins can select assignments"
ON public.assignments
FOR SELECT
TO authenticated
USING (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'));

CREATE POLICY "Admins can insert assignments"
ON public.assignments
FOR INSERT
TO authenticated
WITH CHECK (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'));

CREATE POLICY "Admins can update assignments"
ON public.assignments
FOR UPDATE
TO authenticated
USING (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'))
WITH CHECK (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'));

CREATE POLICY "Admins can delete assignments"
ON public.assignments
FOR DELETE
TO authenticated
USING (LOWER(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager'));