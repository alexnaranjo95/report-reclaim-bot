-- Make the admin-examples storage bucket public so uploaded images can be accessed
UPDATE storage.buckets 
SET public = true 
WHERE id = 'admin-examples';

-- Create RLS policies for the admin-examples bucket to allow public read access
-- but only allow superadmins to upload/modify
CREATE POLICY "Admin examples are publicly viewable" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'admin-examples');

CREATE POLICY "Superadmins can upload admin examples" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'admin-examples' 
  AND has_role(auth.uid(), 'superadmin'::app_role)
);

CREATE POLICY "Superadmins can update admin examples" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'admin-examples' 
  AND has_role(auth.uid(), 'superadmin'::app_role)
);

CREATE POLICY "Superadmins can delete admin examples" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'admin-examples' 
  AND has_role(auth.uid(), 'superadmin'::app_role)
);