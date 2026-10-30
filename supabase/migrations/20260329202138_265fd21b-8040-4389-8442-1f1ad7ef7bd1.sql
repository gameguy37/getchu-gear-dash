ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS distance_miles numeric DEFAULT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS mileage_reimbursement numeric DEFAULT NULL;