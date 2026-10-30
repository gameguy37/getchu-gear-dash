
-- 1. Scope gearphotos SELECT for operators to only their assigned asset folders
DROP POLICY IF EXISTS "Operators view gearphotos" ON storage.objects;
CREATE POLICY "Operators view gearphotos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'gearphotos'
    AND get_employee_role(auth.uid()) = 'operator'
    AND (storage.foldername(name))[1] IN (
      SELECT a.id::text FROM assignments a
      JOIN employees e ON e.id = a.operator_id
      WHERE e.user_id = auth.uid()
    )
  );

-- 2. Restrict asset-photos uploads to admin/manager only
DROP POLICY IF EXISTS "Authenticated users can upload asset photos" ON storage.objects;
CREATE POLICY "Admins can upload asset photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'asset-photos'
    AND get_employee_role(auth.uid()) IN ('admin', 'manager')
  );
