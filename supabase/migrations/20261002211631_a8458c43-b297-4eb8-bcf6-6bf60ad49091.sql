CREATE TABLE public.asset_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  action text NOT NULL,
  details text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX asset_logs_asset_idx ON public.asset_logs(asset_id, created_at DESC);
GRANT SELECT, INSERT ON public.asset_logs TO authenticated;
GRANT ALL ON public.asset_logs TO service_role;
ALTER TABLE public.asset_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read asset logs" ON public.asset_logs FOR SELECT TO authenticated
  USING (lower(COALESCE(public.get_employee_role(auth.uid()), '')) = ANY (ARRAY['admin','manager']));
CREATE POLICY "Managers insert asset logs" ON public.asset_logs FOR INSERT TO authenticated
  WITH CHECK (lower(COALESCE(public.get_employee_role(auth.uid()), '')) = ANY (ARRAY['admin','manager']) AND created_by = auth.uid());