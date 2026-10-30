
-- Add quantity column to assets (for commodity child items)
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;

-- Create sea_of_lost_items table
CREATE TABLE public.sea_of_lost_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_name text NOT NULL,
  missing_quantity integer NOT NULL DEFAULT 1,
  parent_rig_name text,
  parent_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  operator_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  reported_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text
);

ALTER TABLE public.sea_of_lost_items ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all lost items
CREATE POLICY "Authenticated can view lost items"
  ON public.sea_of_lost_items FOR SELECT
  TO authenticated USING (true);

-- Authenticated users can insert lost items (operators log shrinkage during checkout)
CREATE POLICY "Authenticated can insert lost items"
  ON public.sea_of_lost_items FOR INSERT
  TO authenticated WITH CHECK (true);

-- Only admins/managers can delete lost item records
CREATE POLICY "Admins can delete lost items"
  ON public.sea_of_lost_items FOR DELETE
  TO authenticated USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

-- Only admins/managers can update lost item records
CREATE POLICY "Admins can update lost items"
  ON public.sea_of_lost_items FOR UPDATE
  TO authenticated
  USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]))
  WITH CHECK (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));
