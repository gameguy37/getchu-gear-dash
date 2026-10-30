
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS time_manually_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS end_of_day_notes text;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS damage_notes text;
