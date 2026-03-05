-- Create storage buckets for file uploads
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('resumes', 'resumes', false),
  ('compliance-documents', 'compliance-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for resumes bucket
CREATE POLICY "Authenticated users can upload resumes"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'resumes');

CREATE POLICY "Authenticated users can view resumes"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'resumes');

CREATE POLICY "Admins can delete resumes"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'resumes' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- RLS Policies for compliance-documents bucket
CREATE POLICY "Authenticated users can upload compliance docs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'compliance-documents');

CREATE POLICY "Authenticated users can view compliance docs"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'compliance-documents');

CREATE POLICY "Admins can delete compliance docs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'compliance-documents' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

