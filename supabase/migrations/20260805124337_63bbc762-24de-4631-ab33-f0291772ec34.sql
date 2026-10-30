
-- 1) Tighten operator SELECT policy on admin_notifications
DROP POLICY IF EXISTS "Operators can view own notifications" ON public.admin_notifications;
CREATE POLICY "Operators can view own notifications"
ON public.admin_notifications
FOR SELECT
TO authenticated
USING (
  lower(COALESCE(public.get_employee_role(auth.uid()), '')) = 'operator'
  AND recipient_id IN (
    SELECT (e.id)::text FROM public.employees e WHERE e.user_id = auth.uid()
  )
);

-- 2) Remove asset_history_logs from realtime publication so changes don't broadcast
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'asset_history_logs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.asset_history_logs';
  END IF;
END $$;

-- 3) Restrict asset-photos storage bucket reads
DROP POLICY IF EXISTS "Authenticated can read asset-photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view asset photos" ON storage.objects;

CREATE POLICY "Admins read asset-photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'asset-photos'
  AND lower(COALESCE(public.get_employee_role(auth.uid()), '')) = ANY (ARRAY['admin','manager'])
);

CREATE POLICY "Operators read asset-photos for their assignments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'asset-photos'
  AND lower(COALESCE(public.get_employee_role(auth.uid()), '')) = 'operator'
  AND (
    -- storage path convention: <asset_id>/<file>
    CASE
      WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        THEN ((storage.foldername(name))[1])::uuid IN (
          SELECT unnest(a.asset_ids)
          FROM public.assignments a
          JOIN public.employees e ON e.id = a.operator_id
          WHERE e.user_id = auth.uid()
        )
      ELSE false
    END
  )
);
