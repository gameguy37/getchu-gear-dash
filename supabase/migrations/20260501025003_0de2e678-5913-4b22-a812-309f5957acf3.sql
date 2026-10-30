CREATE TABLE public.meemaw_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  emoji text DEFAULT '👵',
  cover_image_url text,
  status text NOT NULL DEFAULT 'available',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.meemaw_kit_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id uuid NOT NULL REFERENCES public.meemaw_kits(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  shared_out boolean NOT NULL DEFAULT false,
  shared_at timestamp with time zone,
  shared_notes text,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (asset_id)
);

CREATE INDEX idx_meemaw_kit_members_kit ON public.meemaw_kit_members(kit_id);

ALTER TABLE public.meemaw_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meemaw_kit_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage meemaw kits" ON public.meemaw_kits
  FOR ALL TO authenticated
  USING (lower(COALESCE(get_employee_role(auth.uid()), '')) = ANY (ARRAY['admin','manager']))
  WITH CHECK (lower(COALESCE(get_employee_role(auth.uid()), '')) = ANY (ARRAY['admin','manager']));

CREATE POLICY "Operators view meemaw kits" ON public.meemaw_kits
  FOR SELECT TO authenticated
  USING (lower(COALESCE(get_employee_role(auth.uid()), '')) = 'operator');

CREATE POLICY "Admins manage meemaw kit members" ON public.meemaw_kit_members
  FOR ALL TO authenticated
  USING (lower(COALESCE(get_employee_role(auth.uid()), '')) = ANY (ARRAY['admin','manager']))
  WITH CHECK (lower(COALESCE(get_employee_role(auth.uid()), '')) = ANY (ARRAY['admin','manager']));

CREATE POLICY "Operators view meemaw kit members" ON public.meemaw_kit_members
  FOR SELECT TO authenticated
  USING (lower(COALESCE(get_employee_role(auth.uid()), '')) = 'operator');

CREATE OR REPLACE FUNCTION public.touch_meemaw_kits_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meemaw_kits_updated_at
  BEFORE UPDATE ON public.meemaw_kits
  FOR EACH ROW EXECUTE FUNCTION public.touch_meemaw_kits_updated_at();