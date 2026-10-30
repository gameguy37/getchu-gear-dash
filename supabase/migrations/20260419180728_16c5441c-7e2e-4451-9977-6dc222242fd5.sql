-- 1. Update handle_new_relay_message trigger to send service role key in Authorization header
--    so the now-locked-down notify-relay-message edge function will accept the call.
CREATE OR REPLACE FUNCTION public.handle_new_relay_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text := 'https://lrnifksjfxnvyfdnqaqm.supabase.co/functions/v1/notify-relay-message';
  _key text := current_setting('app.settings.service_role_key', true);
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(_key, ''),
      'apikey', COALESCE(_key, '')
    ),
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', NEW.id,
        'job_id', NEW.job_id,
        'sender_id', NEW.sender_id,
        'sender_name', NEW.sender_name,
        'sender_type', NEW.sender_type,
        'message', NEW.message,
        'created_at', NEW.created_at
      )
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- 2. Tighten sea_of_lost_items SELECT policy
DROP POLICY IF EXISTS "Authenticated can view lost items" ON public.sea_of_lost_items;

CREATE POLICY "View lost items scoped by role and assignment"
ON public.sea_of_lost_items
FOR SELECT
TO authenticated
USING (
  get_employee_role(auth.uid()) = ANY (ARRAY['admin','manager'])
  OR operator_id = (SELECT id FROM public.employees WHERE user_id = auth.uid() LIMIT 1)
  OR job_id IN (
    SELECT a.job_id FROM public.assignments a
    JOIN public.employees e ON e.id = a.operator_id
    WHERE e.user_id = auth.uid()
  )
);

-- 3. Add UPDATE and DELETE storage policies for the receipts bucket
DROP POLICY IF EXISTS "Operators update own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Operators delete own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Managers update receipts" ON storage.objects;
DROP POLICY IF EXISTS "Managers delete receipts" ON storage.objects;

CREATE POLICY "Operators update own receipts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM public.employees WHERE user_id = auth.uid() LIMIT 1
  )
)
WITH CHECK (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM public.employees WHERE user_id = auth.uid() LIMIT 1
  )
);

CREATE POLICY "Operators delete own receipts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM public.employees WHERE user_id = auth.uid() LIMIT 1
  )
);

CREATE POLICY "Managers update receipts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND public.get_employee_role(auth.uid()) = ANY (ARRAY['admin','manager'])
)
WITH CHECK (
  bucket_id = 'receipts'
  AND public.get_employee_role(auth.uid()) = ANY (ARRAY['admin','manager'])
);

CREATE POLICY "Managers delete receipts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND public.get_employee_role(auth.uid()) = ANY (ARRAY['admin','manager'])
);