-- Add version control columns to admin_example_documents table
ALTER TABLE public.admin_example_documents 
ADD COLUMN IF NOT EXISTS original_file_url text,
ADD COLUMN IF NOT EXISTS original_file_name text,
ADD COLUMN IF NOT EXISTS original_width integer,
ADD COLUMN IF NOT EXISTS original_height integer,
ADD COLUMN IF NOT EXISTS edited_width integer,
ADD COLUMN IF NOT EXISTS edited_height integer,
ADD COLUMN IF NOT EXISTS last_edited_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS has_edits boolean DEFAULT false;

-- Update existing records to set original values from current values
UPDATE public.admin_example_documents 
SET 
  original_file_url = file_url,
  original_file_name = file_name,
  has_edits = false
WHERE original_file_url IS NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_admin_example_documents_has_edits ON public.admin_example_documents(has_edits);
CREATE INDEX IF NOT EXISTS idx_admin_example_documents_category ON public.admin_example_documents(category);