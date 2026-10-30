
-- Seed employees
INSERT INTO public.employees (id, name, role, points, email, phone, status) VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Dana Reeves', 'manager', 0, 'dana@getchugear.com', '(212) 555-0101', 'active'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Marcus Cole', 'operator', 320, 'marcus@getchugear.com', '(212) 555-0102', 'active'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'Priya Sharma', 'operator', 510, 'priya@getchugear.com', '(212) 555-0103', 'active'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', 'Tomás Herrera', 'operator', 190, 'tomas@getchugear.com', '(212) 555-0104', 'active'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', 'Lena Park', 'operator', 445, 'lena@getchugear.com', '(212) 555-0105', 'active'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16', 'James Wu', 'operator', 75, 'james@getchugear.com', '(212) 555-0106', 'inactive')
ON CONFLICT (id) DO NOTHING;

-- Seed assets
INSERT INTO public.assets (id, asset_name, category, status, color_code, serial_number, parent_asset_id) VALUES
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'ProPrompter 19" HD', 'Prompter', 'checked_out', '#3b82f6', 'PP-1921', NULL),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', 'Autocue Explorer', 'Prompter', 'available', '#3b82f6', 'AE-4410', NULL),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', 'Prompter People Flex+', 'Prompter', 'missing', '#ef4444', 'PPF-882', NULL),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04', 'Ikan 15" Teleprompter', 'Prompter', 'available', '#3b82f6', 'IK-1530', NULL),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05', 'Beam Splitter Glass 70/30', 'Glass', 'checked_out', '#f59e0b', 'BSG-700', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06', 'Beam Splitter Glass 60/40', 'Glass', 'available', '#f59e0b', 'BSG-601', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a07', 'iPad Pro 12.9 (Scroll)', 'Tablet', 'checked_out', '#8b5cf6', 'IPD-129A', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a08', 'iPad Air (Backup)', 'Tablet', 'available', '#8b5cf6', 'IPD-AIR2', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a09', 'Manfrotto Tripod 504X', 'Support', 'available', '#10b981', 'MT-504X', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10', 'Sachtler Flowtech 75', 'Support', 'missing', '#ef4444', 'SF-75A', NULL),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'HDMI 50ft Cable', 'Cable', 'available', '#64748b', 'HDM-50A', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'SDI 100ft Cable', 'Cable', 'checked_out', '#64748b', 'SDI-100B', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'MacBook Pro 16" (A)', 'Computer', 'available', '#0ea5e9', 'MBP-16A', NULL),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', 'MacBook Pro 16" (B)', 'Computer', 'checked_out', '#0ea5e9', 'MBP-16B', NULL),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', 'Presidential Prompter', 'Presidential', 'available', '#d946ef', 'PRES-001', NULL),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16', 'ATL Prompter 22', 'ATL', 'available', '#d946ef', 'ATL-022', NULL)
ON CONFLICT (id) DO NOTHING;

-- Seed jobs
INSERT INTO public.jobs (id, job_number, client_name, job_date, status, location_type, notes, call_time) VALUES
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'PC-2026-0047', 'Fox News', '2026-03-13', 'launched', 'Studio', 'Live morning segment', NULL),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', 'PC-2026-0048', 'CNN Town Hall', '2026-03-13', 'ready_for_takeoff', 'Remote', NULL, NULL),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', 'PC-2026-0049', 'NBC Nightly', '2026-03-14', 'scheduled', 'Studio', NULL, NULL),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04', 'PC-2026-0050', 'MSNBC Special', '2026-03-14', 'scheduled', 'Field', NULL, NULL),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05', 'PC-2026-0044', 'ABC Debate', '2026-03-11', 'completed', 'Studio', NULL, NULL),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06', 'PC-2026-0046', 'CBS Morning', '2026-03-12', 'completed', 'Studio', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Seed assignments
INSERT INTO public.assignments (id, job_id, operator_id, asset_ids) VALUES
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', ARRAY['b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01','b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05','b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a07','b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12']::uuid[]),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', ARRAY['b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02','b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06','b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a09','b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11']::uuid[]),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', ARRAY['b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04','b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a08']::uuid[]),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', ARRAY['b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02','b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a09']::uuid[])
ON CONFLICT (id) DO NOTHING;

-- Add anon read policies for client portal
CREATE POLICY "Anon read access on jobs" ON public.jobs FOR SELECT TO anon USING (true);
