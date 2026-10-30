-- 1) Allow operators to keep viewing/posting on relay_messages for their PAST assignments too.
-- Replace existing auth policies with versions that don't depend on job status.

DROP POLICY IF EXISTS "Auth read relay" ON public.relay_messages;
DROP POLICY IF EXISTS "Auth insert relay" ON public.relay_messages;
DROP POLICY IF EXISTS "Auth update relay" ON public.relay_messages;

CREATE POLICY "Auth read relay"
ON public.relay_messages
FOR SELECT
TO authenticated
USING (
  (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]))
  OR EXISTS (
    SELECT 1 FROM assignments a
    JOIN employees e ON e.id = a.operator_id
    WHERE a.job_id = relay_messages.job_id
      AND e.user_id = auth.uid()
  )
);

CREATE POLICY "Auth insert relay"
ON public.relay_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_type = ANY (ARRAY['operator'::text, 'manager'::text])
  AND (
    get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text])
    OR EXISTS (
      SELECT 1 FROM assignments a
      JOIN employees e ON e.id = a.operator_id
      WHERE a.job_id = relay_messages.job_id
        AND e.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Auth update relay"
ON public.relay_messages
FOR UPDATE
TO authenticated
USING (
  get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text])
  OR EXISTS (
    SELECT 1 FROM assignments a
    JOIN employees e ON e.id = a.operator_id
    WHERE a.job_id = relay_messages.job_id
      AND e.user_id = auth.uid()
  )
);

-- 2) Add an index for fast inbox queries
CREATE INDEX IF NOT EXISTS idx_relay_messages_job_created
  ON public.relay_messages (job_id, created_at DESC);

-- 3) Make sure realtime works
ALTER TABLE public.relay_messages REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='relay_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.relay_messages';
  END IF;
END$$;