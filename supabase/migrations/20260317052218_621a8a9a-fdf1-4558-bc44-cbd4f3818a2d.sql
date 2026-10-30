-- Update default job status from 'scheduled' to 'needs_prep'
ALTER TABLE public.jobs ALTER COLUMN status SET DEFAULT 'needs_prep';

-- Update any existing 'scheduled' jobs to 'needs_prep'
UPDATE public.jobs SET status = 'needs_prep' WHERE status = 'scheduled';

-- Update any existing 'gear_check_in' jobs to 'pending_sign_off'
UPDATE public.jobs SET status = 'pending_sign_off' WHERE status = 'gear_check_in';