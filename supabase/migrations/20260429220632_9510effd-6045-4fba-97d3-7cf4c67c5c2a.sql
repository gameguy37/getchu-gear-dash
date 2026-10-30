DROP POLICY IF EXISTS "Operators update own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Operators delete own receipts" ON storage.objects;

CREATE POLICY "Operators update own receipts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN (
    SELECT a.id::text FROM assignments a
    WHERE a.operator_id IN (
      SELECT e.id FROM employees e WHERE e.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN (
    SELECT a.id::text FROM assignments a
    WHERE a.operator_id IN (
      SELECT e.id FROM employees e WHERE e.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Operators delete own receipts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN (
    SELECT a.id::text FROM assignments a
    WHERE a.operator_id IN (
      SELECT e.id FROM employees e WHERE e.user_id = auth.uid()
    )
  )
);