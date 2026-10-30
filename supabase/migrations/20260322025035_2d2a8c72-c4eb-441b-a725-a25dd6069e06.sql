-- Tighten relay_messages insert to require job association
DROP POLICY IF EXISTS "Auth insert relay" ON public.relay_messages;
CREATE POLICY "Auth insert relay" ON public.relay_messages 
  FOR INSERT TO authenticated WITH CHECK (
    sender_type IN ('operator', 'manager') AND
    EXISTS (SELECT 1 FROM public.assignments a JOIN public.employees e ON e.id = a.operator_id WHERE a.job_id = relay_messages.job_id AND (e.user_id = auth.uid() OR get_employee_role(auth.uid()) IN ('admin', 'manager')))
  );

-- Tighten update to managers only
DROP POLICY IF EXISTS "Auth update relay" ON public.relay_messages;
CREATE POLICY "Auth update relay" ON public.relay_messages 
  FOR UPDATE TO authenticated USING (get_employee_role(auth.uid()) IN ('admin', 'manager'));