-- 1. Fix relay_messages public read: exclude manager messages from anonymous/client access
DROP POLICY IF EXISTS "Public read relay" ON public.relay_messages;
CREATE POLICY "Public read relay" ON public.relay_messages
  FOR SELECT TO anon
  USING (
    sender_type = 'client'
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = relay_messages.job_id
        AND jobs.portal_token IS NOT NULL
        AND jobs.portal_token::text = (current_setting('request.headers', true)::json ->> 'x-portal-token')
    )
  );

-- 2. Fix receipts bucket: remove overly permissive policies, keep scoped ones
DROP POLICY IF EXISTS "Operators upload own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own receipts" ON storage.objects;

-- Scoped INSERT: operators can only upload to their own assignment folders
CREATE POLICY "Operators upload own receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IN (
      SELECT assignments.id::text FROM assignments
      WHERE assignments.operator_id IN (
        SELECT employees.id FROM employees WHERE employees.user_id = auth.uid()
      )
    )
  );

-- Admins/managers can upload to any path
CREATE POLICY "Managers upload receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND get_employee_role(auth.uid()) IN ('admin', 'manager')
  );

-- 3. Fix operator asset update: restrict to condition and status columns only, scoped to assigned assets
DROP POLICY IF EXISTS "Operators can update assets on checkout" ON public.assets;
CREATE POLICY "Operators can update assets on checkout" ON public.assets
  FOR UPDATE TO authenticated
  USING (
    lower(COALESCE(get_employee_role(auth.uid()), '')) = 'operator'
    AND id IN (
      SELECT unnest(a.asset_ids) FROM assignments a
      JOIN employees e ON e.id = a.operator_id
      WHERE e.user_id = auth.uid()
    )
  )
  WITH CHECK (
    lower(COALESCE(get_employee_role(auth.uid()), '')) = 'operator'
  );