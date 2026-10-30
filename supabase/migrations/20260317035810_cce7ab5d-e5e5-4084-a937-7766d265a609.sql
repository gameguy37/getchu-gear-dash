
-- Replace FOR ALL policies with explicit per-operation policies
-- This fixes potential issues where FOR ALL doesn't correctly match all operations

-- ─── ASSETS ───
DROP POLICY IF EXISTS "Admins full access on assets" ON public.assets;

CREATE POLICY "Admins can select assets"
  ON public.assets FOR SELECT TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

CREATE POLICY "Admins can insert assets"
  ON public.assets FOR INSERT TO authenticated
  WITH CHECK (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

CREATE POLICY "Admins can update assets"
  ON public.assets FOR UPDATE TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]))
  WITH CHECK (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

CREATE POLICY "Admins can delete assets"
  ON public.assets FOR DELETE TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

-- ─── JOBS ───
DROP POLICY IF EXISTS "Admins full access on jobs" ON public.jobs;

CREATE POLICY "Admins can select jobs"
  ON public.jobs FOR SELECT TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

CREATE POLICY "Admins can insert jobs"
  ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

CREATE POLICY "Admins can update jobs"
  ON public.jobs FOR UPDATE TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]))
  WITH CHECK (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

CREATE POLICY "Admins can delete jobs"
  ON public.jobs FOR DELETE TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

-- ─── ASSIGNMENTS ───
DROP POLICY IF EXISTS "Admins full access on assignments" ON public.assignments;

CREATE POLICY "Admins can select assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

CREATE POLICY "Admins can insert assignments"
  ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

CREATE POLICY "Admins can update assignments"
  ON public.assignments FOR UPDATE TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]))
  WITH CHECK (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

CREATE POLICY "Admins can delete assignments"
  ON public.assignments FOR DELETE TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

-- ─── ADMIN NOTIFICATIONS ───
DROP POLICY IF EXISTS "Admins full access on admin_notifications" ON public.admin_notifications;

CREATE POLICY "Admins can select notifications"
  ON public.admin_notifications FOR SELECT TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

CREATE POLICY "Admins can insert notifications"
  ON public.admin_notifications FOR INSERT TO authenticated
  WITH CHECK (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

CREATE POLICY "Admins can update notifications"
  ON public.admin_notifications FOR UPDATE TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]))
  WITH CHECK (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

CREATE POLICY "Admins can delete notifications"
  ON public.admin_notifications FOR DELETE TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));
