
-- Tighten sea_of_lost_items INSERT policy to require operator role
DROP POLICY IF EXISTS "Authenticated can insert lost items" ON public.sea_of_lost_items;

CREATE POLICY "Operators can insert lost items"
  ON public.sea_of_lost_items FOR INSERT TO authenticated
  WITH CHECK (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text, 'operator'::text]));
