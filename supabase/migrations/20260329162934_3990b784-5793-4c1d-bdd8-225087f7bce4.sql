
-- 1. Fix relay_messages: restrict authenticated read to assigned jobs or admin/manager
DROP POLICY IF EXISTS "Auth read relay" ON public.relay_messages;
CREATE POLICY "Auth read relay" ON public.relay_messages
  FOR SELECT TO authenticated
  USING (
    get_employee_role(auth.uid()) = ANY(ARRAY['admin','manager'])
    OR EXISTS (
      SELECT 1 FROM assignments a
      JOIN employees e ON e.id = a.operator_id
      WHERE a.job_id = relay_messages.job_id AND e.user_id = auth.uid()
    )
  );

-- 2. Fix relay_messages: restrict anon read to client-type messages only
DROP POLICY IF EXISTS "Public read relay" ON public.relay_messages;
CREATE POLICY "Public read relay" ON public.relay_messages
  FOR SELECT TO anon
  USING (
    sender_type = 'client'
    AND EXISTS (
      SELECT 1 FROM jobs WHERE jobs.id = relay_messages.job_id AND jobs.portal_token IS NOT NULL
    )
  );

-- 3. Drop self-insert policy on point_activities
DROP POLICY IF EXISTS "Users can insert own point activities" ON public.point_activities;

-- 4. Make receipts bucket private
UPDATE storage.buckets SET public = false WHERE id = 'receipts';

-- 5. Add storage RLS for receipts
CREATE POLICY "Operators upload own receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
  );

CREATE POLICY "Auth read receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts' AND (
      get_employee_role(auth.uid()) = ANY(ARRAY['admin','manager'])
      OR (storage.foldername(name))[1] IN (
        SELECT id::text FROM assignments
        WHERE operator_id IN (
          SELECT id FROM employees WHERE user_id = auth.uid()
        )
      )
    )
  );
