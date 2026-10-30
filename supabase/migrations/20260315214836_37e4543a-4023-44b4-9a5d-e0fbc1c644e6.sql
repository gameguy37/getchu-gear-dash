
-- 1. Create a security definer function to check employee role
create or replace function public.get_employee_role(_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.employees where user_id = _user_id limit 1
$$;

-- 2. Remove the anon read policy from jobs
drop policy if exists "Anon read access on jobs" on public.jobs;

-- 3. Drop existing permissive policy on clients
drop policy if exists "Authenticated full access on clients" on public.clients;

-- 4. Admin-only policy for clients (select)
create policy "Admins can select clients"
on public.clients for select to authenticated
using (public.get_employee_role(auth.uid()) in ('admin', 'manager'));

-- 5. Admin-only policy for clients (insert)
create policy "Admins can insert clients"
on public.clients for insert to authenticated
with check (public.get_employee_role(auth.uid()) in ('admin', 'manager'));

-- 6. Admin-only policy for clients (update)
create policy "Admins can update clients"
on public.clients for update to authenticated
using (public.get_employee_role(auth.uid()) in ('admin', 'manager'))
with check (public.get_employee_role(auth.uid()) in ('admin', 'manager'));

-- 7. Admin-only policy for clients (delete)
create policy "Admins can delete clients"
on public.clients for delete to authenticated
using (public.get_employee_role(auth.uid()) in ('admin', 'manager'));
