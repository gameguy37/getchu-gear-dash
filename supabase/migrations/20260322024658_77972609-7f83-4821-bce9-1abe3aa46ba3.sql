-- Section 5: Split on-site contact into name and phone
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS on_site_contact_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS on_site_contact_phone text;

-- Section 6: Relay messaging table
CREATE TABLE IF NOT EXISTS public.relay_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  sender_type text NOT NULL CHECK (sender_type IN ('operator', 'manager', 'client')),
  sender_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  sender_name text NOT NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now(),
  read_by_client boolean DEFAULT false,
  read_by_operator boolean DEFAULT false
);

ALTER TABLE public.relay_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read relay" ON public.relay_messages 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth insert relay" ON public.relay_messages 
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth update relay" ON public.relay_messages 
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Public read relay" ON public.relay_messages 
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = relay_messages.job_id AND jobs.portal_token IS NOT NULL)
  );

CREATE POLICY "Public insert relay" ON public.relay_messages 
  FOR INSERT TO anon WITH CHECK (
    sender_type = 'client' AND 
    EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = relay_messages.job_id AND jobs.portal_token IS NOT NULL)
  );

ALTER PUBLICATION supabase_realtime ADD TABLE relay_messages;