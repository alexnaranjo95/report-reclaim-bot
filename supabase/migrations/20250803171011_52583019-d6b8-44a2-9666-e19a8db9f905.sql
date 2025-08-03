-- Make verification-documents bucket public and add proper policies

-- Update bucket to be public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'verification-documents';

-- Add storage policies for verification documents
INSERT INTO storage.objects_policies (id, name, action, object_name, check_expression)
VALUES 
  ('verification-documents-select', 'Allow public access to verification documents', 'SELECT', 'verification-documents/*', 'true'),
  ('verification-documents-insert', 'Allow users to upload verification documents', 'INSERT', 'verification-documents/*', 'auth.uid()::text = (storage.foldername(name))[1]'),
  ('verification-documents-update', 'Allow users to update their verification documents', 'UPDATE', 'verification-documents/*', 'auth.uid()::text = (storage.foldername(name))[1]'),
  ('verification-documents-delete', 'Allow users to delete their verification documents', 'DELETE', 'verification-documents/*', 'auth.uid()::text = (storage.foldername(name))[1]')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  action = EXCLUDED.action,
  object_name = EXCLUDED.object_name,
  check_expression = EXCLUDED.check_expression;