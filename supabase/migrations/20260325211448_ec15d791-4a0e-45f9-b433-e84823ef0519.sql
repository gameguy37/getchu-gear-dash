CREATE POLICY "Operators can view own notifications"
ON public.admin_notifications
FOR SELECT
TO authenticated
USING (
  recipient_id IN (
    SELECT e.id::text FROM employees e WHERE e.user_id = auth.uid()
  )
);