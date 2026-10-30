
-- Drop existing foreign keys on assignments first
ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_asset_id_fkey;
ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_employee_id_fkey;
ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_job_id_fkey;

-- Drop existing RLS policies
DROP POLICY IF EXISTS "Employees can only see their own assigned gear and jobs" ON public.assignments;

-- =====================
-- EMPLOYEES table
-- =====================
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- =====================
-- ASSETS table
-- =====================
ALTER TABLE public.assets RENAME COLUMN item_name TO asset_name;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS color_code text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS parent_asset_id uuid REFERENCES public.assets(id);

-- =====================
-- JOBS table
-- =====================
ALTER TABLE public.jobs RENAME COLUMN job_name TO client_name;
ALTER TABLE public.jobs RENAME COLUMN location TO location_type;
ALTER TABLE public.jobs RENAME COLUMN shoot_date TO job_date;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS job_number text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS call_time text;

-- =====================
-- ASSIGNMENTS table - add asset_ids array approach
-- =====================
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS asset_ids uuid[] DEFAULT '{}';
ALTER TABLE public.assignments RENAME COLUMN employee_id TO operator_id;
-- Drop old single asset_id column
ALTER TABLE public.assignments DROP COLUMN IF EXISTS asset_id;

-- Re-add foreign keys
ALTER TABLE public.assignments ADD CONSTRAINT assignments_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.employees(id);
ALTER TABLE public.assignments ADD CONSTRAINT assignments_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);

-- =====================
-- RLS: allow all authenticated read/write for testing
-- =====================

-- Employees
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on employees" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Assets
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on assets" ON public.assets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Jobs
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on jobs" ON public.jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Assignments
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on assignments" ON public.assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
