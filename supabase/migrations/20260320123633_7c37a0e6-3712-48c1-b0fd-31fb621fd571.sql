
-- Section 5: Client Portal - add portal_token and cancelled_by_client_at to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS portal_token uuid DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS jobs_portal_token_idx ON jobs(portal_token);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancelled_by_client_at timestamptz;

-- RLS: Allow anon to read jobs via portal token
CREATE POLICY "Public portal token access" ON jobs
  FOR SELECT TO anon
  USING (portal_token IS NOT NULL);

-- RLS: Allow anon to update jobs via portal token (for cancellation)
CREATE POLICY "Client cancel via token" ON jobs
  FOR UPDATE TO anon
  USING (portal_token IS NOT NULL)
  WITH CHECK (portal_token IS NOT NULL);
