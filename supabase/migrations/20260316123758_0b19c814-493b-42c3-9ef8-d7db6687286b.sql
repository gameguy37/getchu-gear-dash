
-- Add time tracking columns to assignments
ALTER TABLE public.assignments 
  ADD COLUMN IF NOT EXISTS actual_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS actual_end_time timestamptz;

-- Create admin_notifications table for tardy alerts
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  notification_type text NOT NULL DEFAULT 'tardy',
  message text,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on admin_notifications"
  ON public.admin_notifications FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
