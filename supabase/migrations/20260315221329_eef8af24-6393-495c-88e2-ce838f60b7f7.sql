-- Drop the existing permissive policy on employees
drop policy if exists "Authenticated full access on employees" on public.employees;

-- Allow all authenticated users to view employees (for leaderboard, team directory, etc.)
create policy "Authenticated users can view employees"
on public.employees for select to authenticated
using (true);

-- Only admins/managers can insert new employees
create policy "Admins can insert employees"
on public.employees for insert to authenticated
with check (public.get_employee_role(auth.uid()) in ('admin', 'manager'));

-- Only admins/managers can update employees (prevents privilege escalation)
create policy "Admins can update employees"
on public.employees for update to authenticated
using (public.get_employee_role(auth.uid()) in ('admin', 'manager'))
with check (public.get_employee_role(auth.uid()) in ('admin', 'manager'));

-- Only admins/managers can delete employees
create policy "Admins can delete employees"
on public.employees for delete to authenticated
using (public.get_employee_role(auth.uid()) in ('admin', 'manager'));