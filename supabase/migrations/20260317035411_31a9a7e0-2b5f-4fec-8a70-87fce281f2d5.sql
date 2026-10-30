
-- =========================================================
-- Phase 52: RLS Lockdown for jobs, assignments, assets, admin_notifications
-- =========================================================

-- Drop existing permissive "USING (true)" policies
DROP POLICY IF EXISTS "Authenticated full access on jobs" ON public.jobs;
DROP POLICY IF EXISTS "Authenticated full access on assignments" ON public.assignments;
DROP POLICY IF EXISTS "Authenticated full access on assets" ON public.assets;
DROP POLICY IF EXISTS "Authenticated full access on admin_notifications" ON public.admin_notifications;

-- ─── JOBS ───
-- Admins/Managers: full CRUD
CREATE POLICY "Admins full access on jobs"
  ON public.jobs FOR ALL TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]))
  WITH CHECK (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

-- Operators: SELECT only jobs they are assigned to
CREATE POLICY "Operators can view assigned jobs"
  ON public.jobs FOR SELECT TO authenticated
  USING (
    get_employee_role(auth.uid()) = 'operator'
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      JOIN public.employees e ON e.id = a.operator_id
      WHERE a.job_id = jobs.id AND e.user_id = auth.uid()
    )
  );

-- ─── ASSIGNMENTS ───
-- Admins/Managers: full CRUD
CREATE POLICY "Admins full access on assignments"
  ON public.assignments FOR ALL TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]))
  WITH CHECK (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

-- Operators: SELECT only their own assignments
CREATE POLICY "Operators can view own assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (
    get_employee_role(auth.uid()) = 'operator'
    AND operator_id = (SELECT id FROM public.employees WHERE user_id = auth.uid() LIMIT 1)
  );

-- Operators: UPDATE only their own assignments (clock in/out, notes)
CREATE POLICY "Operators can update own assignments"
  ON public.assignments FOR UPDATE TO authenticated
  USING (
    get_employee_role(auth.uid()) = 'operator'
    AND operator_id = (SELECT id FROM public.employees WHERE user_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    get_employee_role(auth.uid()) = 'operator'
    AND operator_id = (SELECT id FROM public.employees WHERE user_id = auth.uid() LIMIT 1)
  );

-- ─── ASSETS ───
-- Admins/Managers: full CRUD
CREATE POLICY "Admins full access on assets"
  ON public.assets FOR ALL TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]))
  WITH CHECK (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

-- Operators: SELECT only (read gear data for checkout)
CREATE POLICY "Operators can view assets"
  ON public.assets FOR SELECT TO authenticated
  USING (get_employee_role(auth.uid()) = 'operator');

-- Operators: UPDATE assets (needed for checkout status changes and quantity updates)
CREATE POLICY "Operators can update assets on checkout"
  ON public.assets FOR UPDATE TO authenticated
  USING (get_employee_role(auth.uid()) = 'operator')
  WITH CHECK (get_employee_role(auth.uid()) = 'operator');

-- ─── ADMIN NOTIFICATIONS ───
-- Admins/Managers: full CRUD
CREATE POLICY "Admins full access on admin_notifications"
  ON public.admin_notifications FOR ALL TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]))
  WITH CHECK (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

-- Operators: INSERT only (they create tardy notifications)
CREATE POLICY "Operators can insert notifications"
  ON public.admin_notifications FOR INSERT TO authenticated
  WITH CHECK (get_employee_role(auth.uid()) = 'operator');
