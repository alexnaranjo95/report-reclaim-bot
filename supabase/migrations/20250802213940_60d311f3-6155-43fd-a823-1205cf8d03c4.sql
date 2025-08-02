-- Create admin_prompts table for global AI prompt persistence
CREATE TABLE public.admin_prompts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  is_active boolean NOT NULL DEFAULT true,
  version_name text,
  description text
);

-- Enable RLS
ALTER TABLE public.admin_prompts ENABLE ROW LEVEL SECURITY;

-- Create policies for superadmin access
CREATE POLICY "Superadmins can manage admin prompts" 
ON public.admin_prompts 
FOR ALL 
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_admin_prompts_updated_at
BEFORE UPDATE ON public.admin_prompts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default prompt
INSERT INTO public.admin_prompts (
  prompt_text,
  version_name,
  description,
  is_active
) VALUES (
  'You are a legal AI assistant specializing in credit repair and FCRA compliance. Generate professional, accurate dispute letters that comply with federal regulations.',
  'Default System Prompt',
  'Initial system prompt for AI dispute generation',
  true
);