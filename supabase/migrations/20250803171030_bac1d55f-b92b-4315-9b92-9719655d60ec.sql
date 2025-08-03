-- Make verification-documents bucket public and add proper policies

-- Update bucket to be public if not already
UPDATE storage.buckets 
SET public = true 
WHERE id = 'verification-documents';

-- Create storage policies for verification documents using correct syntax
CREATE POLICY "Public access to verification documents" ON storage.objects
FOR SELECT USING (bucket_id = 'verification-documents');

CREATE POLICY "Users can upload verification documents" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'verification-documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their verification documents" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'verification-documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their verification documents" ON storage.objects
FOR DELETE USING (
  bucket_id = 'verification-documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);