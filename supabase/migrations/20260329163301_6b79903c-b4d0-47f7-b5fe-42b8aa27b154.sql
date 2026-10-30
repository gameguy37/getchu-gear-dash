
-- 1. Restrict rewards visibility: operators only see active rewards, admins see all (already covered by "Admins manage rewards" ALL policy)
DROP POLICY IF EXISTS "Authenticated can view active rewards" ON public.rewards;
CREATE POLICY "Authenticated can view active rewards" ON public.rewards
  FOR SELECT TO authenticated
  USING (
    active = true
    OR get_employee_role(auth.uid()) = ANY(ARRAY['admin','manager'])
  );

-- 2. Tighten anon relay read: use a security definer function to validate portal_token
-- The anon user must filter by job_id AND provide the portal_token via an RPC or direct query filter.
-- Since RLS can't easily validate a request parameter, we'll restrict anon read to only client messages
-- and require the caller to also filter on portal_token (matched against the jobs table).
DROP POLICY IF EXISTS "Public read relay" ON public.relay_messages;
CREATE POLICY "Public read relay" ON public.relay_messages
  FOR SELECT TO anon
  USING (
    sender_type IN ('client', 'manager')
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = relay_messages.job_id
        AND jobs.portal_token IS NOT NULL
        AND jobs.portal_token::text = current_setting('request.headers', true)::json->>'x-portal-token'
    )
  );
