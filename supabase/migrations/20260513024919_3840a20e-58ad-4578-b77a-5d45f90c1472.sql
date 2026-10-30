ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS checkout_location_url text,
  ADD COLUMN IF NOT EXISTS checkin_location_url text;