-- Create storage bucket for admin example documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('admin-examples', 'admin-examples', false);

-- Create admin example documents table
CREATE TABLE IF NOT EXISTS public.admin_example_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT CHECK (category IN ('gov_id', 'proof_of_address', 'ssn')) NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category)
);

-- Enable RLS on admin example documents
ALTER TABLE public.admin_example_documents ENABLE ROW LEVEL SECURITY;

-- Create policies for admin example documents
CREATE POLICY "Superadmins can manage admin example documents" 
ON public.admin_example_documents 
FOR ALL 
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

-- Add append settings to rounds table
ALTER TABLE public.rounds 
ADD COLUMN IF NOT EXISTS append_settings JSONB DEFAULT '{
  "includeGovId": false,
  "includeProofOfAddress": false, 
  "includeSSN": false
}'::jsonb;

-- Create storage policies for admin examples bucket
CREATE POLICY "Superadmins can upload admin examples"
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'admin-examples' AND has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Superadmins can view admin examples"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'admin-examples' AND has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Superadmins can update admin examples"
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'admin-examples' AND has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Superadmins can delete admin examples"
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'admin-examples' AND has_role(auth.uid(), 'superadmin'::app_role));