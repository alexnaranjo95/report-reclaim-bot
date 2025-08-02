-- Update storage bucket to allow CORS for verification documents
UPDATE storage.buckets 
SET public = true 
WHERE id = 'verification-documents';

-- Add CORS policy for storage objects
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('verification-documents', 'verification-documents', true, ARRAY['image/*', 'application/pdf'])
ON CONFLICT (id) 
DO UPDATE SET 
  public = true,
  allowed_mime_types = ARRAY['image/*', 'application/pdf'];