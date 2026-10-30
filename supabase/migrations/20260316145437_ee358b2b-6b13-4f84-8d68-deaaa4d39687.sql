
-- Add guaranteed_hours and lunch_check columns
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS guaranteed_hours text;

ALTER TABLE public.assignments 
  ADD COLUMN IF NOT EXISTS lunch_check_response text,
  ADD COLUMN IF NOT EXISTS lunch_check_time timestamptz;
