-- Clean up duplicate storage policies for credit-reports bucket
DROP POLICY IF EXISTS "Users can view their own credit reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own credit reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own credit reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own credit reports" ON storage.objects;

-- Keep only the properly named policies
-- Note: The other policies with "credit report files" naming should remain