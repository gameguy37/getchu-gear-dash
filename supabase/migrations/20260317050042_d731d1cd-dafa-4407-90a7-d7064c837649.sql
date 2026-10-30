
-- Add condition column to sea_of_lost_items
ALTER TABLE public.sea_of_lost_items ADD COLUMN condition text NOT NULL DEFAULT 'missing';
