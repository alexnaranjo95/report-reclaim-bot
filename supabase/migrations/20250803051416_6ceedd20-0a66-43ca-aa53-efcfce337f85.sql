-- Add fields to template_layouts for WYSIWYG editing
ALTER TABLE public.template_layouts 
ADD COLUMN IF NOT EXISTS body_html text,
ADD COLUMN IF NOT EXISTS preview_pdf_url text,
ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;

-- Create template versions table for version control
CREATE TABLE IF NOT EXISTS public.template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.template_layouts(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  body_html text NOT NULL,
  content text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(template_id, version_number)
);

-- Enable RLS on template_versions
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;

-- Create policy for template versions
CREATE POLICY "Superadmins can manage template versions"
ON public.template_versions
FOR ALL
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));