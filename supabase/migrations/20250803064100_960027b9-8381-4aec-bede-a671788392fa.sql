-- Make the admin-examples storage bucket public so uploaded images can be accessed
UPDATE storage.buckets 
SET public = true 
WHERE id = 'admin-examples';