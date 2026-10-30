
-- Create storage bucket for asset photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('asset-photos', 'asset-photos', true);

-- Allow authenticated users to upload asset photos
CREATE POLICY "Authenticated users can upload asset photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'asset-photos');

-- Allow anyone to view asset photos (public bucket)
CREATE POLICY "Anyone can view asset photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'asset-photos');

-- Allow admins to delete asset photos
CREATE POLICY "Admins can delete asset photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'asset-photos' AND get_employee_role(auth.uid()) IN ('admin', 'manager'));
