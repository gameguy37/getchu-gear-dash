
-- Drop all existing policies on employees
DROP POLICY IF EXISTS "Authenticated users can view employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can insert employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can update employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can delete employees" ON public.employees;

-- Operator: can only view their own record
CREATE POLICY "Users can view own employee record"
ON public.employees FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Operator: can update their own record
CREATE POLICY "Users can update own employee record"
ON public.employees FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Admin/Manager: full SELECT
CREATE POLICY "Admins can select all employees"
ON public.employees FOR SELECT TO authenticated
USING (public.get_employee_role(auth.uid()) IN ('admin', 'manager'));

-- Admin/Manager: INSERT
CREATE POLICY "Admins can insert employees"
ON public.employees FOR INSERT TO authenticated
WITH CHECK (public.get_employee_role(auth.uid()) IN ('admin', 'manager'));

-- Admin/Manager: UPDATE
CREATE POLICY "Admins can update employees"
ON public.employees FOR UPDATE TO authenticated
USING (public.get_employee_role(auth.uid()) IN ('admin', 'manager'))
WITH CHECK (public.get_employee_role(auth.uid()) IN ('admin', 'manager'));

-- Admin/Manager: DELETE
CREATE POLICY "Admins can delete employees"
ON public.employees FOR DELETE TO authenticated
USING (public.get_employee_role(auth.uid()) IN ('admin', 'manager'));
