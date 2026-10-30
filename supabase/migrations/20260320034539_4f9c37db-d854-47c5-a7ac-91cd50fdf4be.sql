
-- Section 4: Add receipt/expense columns to assignments
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS receipt_urls text[] DEFAULT '{}';
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS expense_amount numeric DEFAULT 0;

-- Section 5: Create point_activities table
CREATE TABLE IF NOT EXISTS public.point_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  points integer NOT NULL,
  reason text NOT NULL,
  award_slug text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.point_activities ENABLE ROW LEVEL SECURITY;

-- RLS: Authenticated users can view all point activities
CREATE POLICY "Authenticated can view point activities"
ON public.point_activities FOR SELECT
TO authenticated
USING (true);

-- RLS: Operators can insert their own point activities
CREATE POLICY "Users can insert own point activities"
ON public.point_activities FOR INSERT
TO authenticated
WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

-- RLS: Managers can insert any point activities
CREATE POLICY "Managers can insert any point activities"
ON public.point_activities FOR INSERT
TO authenticated
WITH CHECK (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

-- RLS: Managers can delete point activities
CREATE POLICY "Managers can delete point activities"
ON public.point_activities FOR DELETE
TO authenticated
USING (get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));

-- Create receipts storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for receipts
CREATE POLICY "Users can upload receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Users can view own receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'receipts');

CREATE POLICY "Managers can view all receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'receipts' AND get_employee_role(auth.uid()) = ANY (ARRAY['admin'::text, 'manager'::text]));
