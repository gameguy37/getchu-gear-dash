ALTER TABLE public.meemaw_kit_members
  ADD COLUMN IF NOT EXISTS shared_with_employee_id uuid,
  ADD COLUMN IF NOT EXISTS shared_job_id uuid;

CREATE INDEX IF NOT EXISTS idx_meemaw_kit_members_shared_with
  ON public.meemaw_kit_members (shared_with_employee_id)
  WHERE shared_out = true;

-- Allow operators to see kit members currently shared out to them
DROP POLICY IF EXISTS "Operators view shared meemaw members" ON public.meemaw_kit_members;
CREATE POLICY "Operators view shared meemaw members"
ON public.meemaw_kit_members
FOR SELECT
TO authenticated
USING (
  shared_out = true
  AND shared_with_employee_id = (
    SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid() LIMIT 1
  )
);