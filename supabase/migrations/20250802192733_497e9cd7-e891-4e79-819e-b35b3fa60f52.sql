-- Create creditor_addresses table for PostGrid integration
CREATE TABLE public.creditor_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creditor TEXT NOT NULL,
  bureau TEXT NOT NULL,
  street TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(creditor, bureau)
);

-- Create indexes for efficient querying
CREATE INDEX idx_creditor_addresses_bureau ON public.creditor_addresses(bureau);
CREATE INDEX idx_creditor_addresses_creditor ON public.creditor_addresses(creditor);
CREATE INDEX idx_creditor_addresses_bureau_creditor ON public.creditor_addresses(bureau, creditor);

-- Enable RLS
ALTER TABLE public.creditor_addresses ENABLE ROW LEVEL SECURITY;

-- RLS policies for creditor_addresses
CREATE POLICY "Superadmins can manage creditor addresses"
ON public.creditor_addresses
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

-- Create dispute_templates table for AI training
CREATE TABLE public.dispute_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('docx', 'markdown', 'txt')),
  embedding VECTOR(1536), -- OpenAI embedding size
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  preference_weight NUMERIC DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create indexes for dispute_templates
CREATE INDEX idx_dispute_templates_active ON public.dispute_templates(is_active);
CREATE INDEX idx_dispute_templates_tags ON public.dispute_templates USING GIN(tags);

-- Enable RLS
ALTER TABLE public.dispute_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for dispute_templates
CREATE POLICY "Superadmins can manage dispute templates"
ON public.dispute_templates
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

-- Create ai_prompt_versions table for version management
CREATE TABLE public.ai_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name TEXT NOT NULL,
  base_prompt TEXT NOT NULL,
  additional_rules TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_prompt_versions
CREATE POLICY "Superadmins can manage AI prompt versions"
ON public.ai_prompt_versions
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

-- Create admin_settings table for global configurations
CREATE TABLE public.admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  is_encrypted BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for admin_settings
CREATE POLICY "Superadmins can manage admin settings"
ON public.admin_settings
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

-- Create updated_at trigger for all tables
CREATE TRIGGER update_creditor_addresses_updated_at
  BEFORE UPDATE ON public.creditor_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dispute_templates_updated_at
  BEFORE UPDATE ON public.dispute_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_admin_settings_updated_at
  BEFORE UPDATE ON public.admin_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default global preferences
INSERT INTO public.admin_settings (setting_key, setting_value, description) VALUES
('use_newest_ai_prompt', '{"enabled": true}', 'Use the newest AI prompt version for dispute generation'),
('auto_regenerate_disputes', '{"enabled": false}', 'Automatically regenerate disputes when new documents are uploaded'),
('ai_training_schedule', '{"frequency": "nightly", "enabled": true}', 'AI model training schedule configuration');