
-- ============================================================
-- 1. Privatize the asset-photos bucket
-- ============================================================
UPDATE storage.buckets SET public = false WHERE id = 'asset-photos';

-- Add a SELECT policy so authenticated users (any role) can read objects
-- in this bucket via signed URL flow. createSignedUrl works server-side
-- with the service role, but listing/reading via the JS client requires
-- a SELECT policy. We restrict to authenticated users only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated can read asset-photos'
  ) THEN
    CREATE POLICY "Authenticated can read asset-photos"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'asset-photos');
  END IF;
END $$;

-- ============================================================
-- 2. Realtime channel authorization (realtime.messages RLS)
-- ============================================================
-- Helper: extract the table name a topic refers to. Topics in this app are
-- channel names like "admin-notifications-realtime:<id>:..." or
-- "relay-<jobId>-<nonce>". We'll match by prefix.

ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

-- Drop any prior policies we created so re-runs are idempotent
DROP POLICY IF EXISTS "rt_admins_managers_all" ON realtime.messages;
DROP POLICY IF EXISTS "rt_operator_relay_assigned" ON realtime.messages;
DROP POLICY IF EXISTS "rt_authenticated_other_topics" ON realtime.messages;

-- Admins and managers may subscribe to / broadcast on any topic
CREATE POLICY "rt_admins_managers_all"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  lower(COALESCE(public.get_employee_role(auth.uid()), '')) IN ('admin', 'manager')
);

-- Operators may subscribe to relay channels only for jobs they are assigned to.
-- Relay topic format: "relay-<jobId>-<nonce>" or "relay-messages-realtime:..."
-- We allow when the topic contains a job id they're assigned to.
CREATE POLICY "rt_operator_relay_assigned"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  lower(COALESCE(public.get_employee_role(auth.uid()), '')) = 'operator'
  AND (
    -- per-job relay channel: "relay-<jobId>-<nonce>"
    EXISTS (
      SELECT 1 FROM public.assignments a
      JOIN public.employees e ON e.id = a.operator_id
      WHERE e.user_id = auth.uid()
        AND extension = 'broadcast'
        AND topic LIKE 'relay-' || a.job_id::text || '-%'
    )
    -- operator's own admin-notifications channel (employee id in the topic)
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid()
        AND topic LIKE 'admin-notifications-realtime:' || e.id::text || ':%'
    )
    -- operator's own relay-messages listener (auth uid in topic)
    OR topic LIKE 'relay-messages-realtime:' || auth.uid()::text || ':%'
  )
);

-- Allow any authenticated user to subscribe to topics that aren't tied to
-- the sensitive tables we care about (presence, custom non-postgres broadcasts, etc.)
-- This intentionally excludes the prefixes covered by the policies above so
-- non-admin/non-operator authenticated users don't gain access to them.
CREATE POLICY "rt_authenticated_other_topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  topic NOT LIKE 'admin-notifications-realtime:%'
  AND topic NOT LIKE 'relay-%'
  AND topic NOT LIKE 'realtime:public:admin_notifications%'
  AND topic NOT LIKE 'realtime:public:assignments%'
  AND topic NOT LIKE 'realtime:public:jobs%'
  AND topic NOT LIKE 'realtime:public:assets%'
  AND topic NOT LIKE 'realtime:public:relay_messages%'
);
