
-- Fix 1: Tighten the WITH CHECK on "Operators can update assets on checkout"
-- to mirror the USING condition (asset must remain in operator's assignments)
DROP POLICY IF EXISTS "Operators can update assets on checkout" ON public.assets;
CREATE POLICY "Operators can update assets on checkout"
ON public.assets FOR UPDATE TO authenticated
USING (
  (lower(COALESCE(get_employee_role(auth.uid()), '')) = 'operator')
  AND (id IN (
    SELECT unnest(a.asset_ids)
    FROM assignments a JOIN employees e ON e.id = a.operator_id
    WHERE e.user_id = auth.uid()
  ))
)
WITH CHECK (
  (lower(COALESCE(get_employee_role(auth.uid()), '')) = 'operator')
  AND (id IN (
    SELECT unnest(a.asset_ids)
    FROM assignments a JOIN employees e ON e.id = a.operator_id
    WHERE e.user_id = auth.uid()
  ))
);

-- Fix 2: Tighten "Public read relay" to only allow anon to read client messages
-- scoped to the portal token's job
DROP POLICY IF EXISTS "Public read relay" ON public.relay_messages;
CREATE POLICY "Public read relay"
ON public.relay_messages FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = relay_messages.job_id
      AND jobs.portal_token IS NOT NULL
      AND (jobs.portal_token)::text = (
        (current_setting('request.headers', true))::json ->> 'x-portal-token'
      )
  )
);
