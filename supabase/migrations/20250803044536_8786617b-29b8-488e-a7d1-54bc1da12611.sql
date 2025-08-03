-- Create table for template layouts
CREATE TABLE public.template_layouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  placeholders TEXT[] DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create table for round-specific templates
CREATE TABLE public.round_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_number INTEGER NOT NULL,
  layout_id UUID REFERENCES public.template_layouts(id) ON DELETE CASCADE,
  content_template TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(round_number, is_active) DEFERRABLE INITIALLY DEFERRED
);

-- Enable RLS
ALTER TABLE public.template_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_templates ENABLE ROW LEVEL SECURITY;

-- Create policies for template_layouts
CREATE POLICY "Superadmins can manage template layouts" 
ON public.template_layouts 
FOR ALL 
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

-- Create policies for round_templates
CREATE POLICY "Superadmins can manage round templates" 
ON public.round_templates 
FOR ALL 
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_template_layouts_updated_at
BEFORE UPDATE ON public.template_layouts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_round_templates_updated_at
BEFORE UPDATE ON public.round_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default layout template
INSERT INTO public.template_layouts (name, content, placeholders, is_default) VALUES (
  'Standard Letter Layout',
  '<div class="header">
    <div class="date">{{date}}</div>
    <div class="round-info">Round {{round}}</div>
  </div>
  <div class="body">{{body}}</div>
  <div class="footer">
    <p>Sincerely,</p>
    <br />
    <p>{{client_name}}</p>
  </div>',
  ARRAY['date', 'round', 'body', 'client_name'],
  true
);

-- Insert default round templates
INSERT INTO public.round_templates (round_number, layout_id, content_template) VALUES 
(1, (SELECT id FROM public.template_layouts WHERE is_default = true LIMIT 1), 
 'Dear {{creditor_name}},

I am writing to formally dispute the following items on my credit report:

Account: {{account_number}}
Creditor: {{creditor_name}}
Bureau(s): {{bureaus}}

I believe this information is inaccurate and request verification under the Fair Credit Reporting Act (FCRA). Please provide documentation proving the validity of this debt.

If you cannot verify this information, I request immediate removal from my credit report.'),

(2, (SELECT id FROM public.template_layouts WHERE is_default = true LIMIT 1),
 'Dear {{creditor_name}},

This is a follow-up to my previous dispute letter dated {{previous_date}} regarding:

Account: {{account_number}}
Reference: {{reference_number}}

As I have not received adequate verification of this debt, I am requesting again that you provide complete documentation or remove this item from my credit report immediately.

The continued reporting of unverified information violates the FCRA.'),

(3, (SELECT id FROM public.template_layouts WHERE is_default = true LIMIT 1),
 'Dear {{creditor_name}},

This is my final request regarding the disputed account {{account_number}}.

Despite multiple requests for verification, you have failed to provide adequate documentation. Under the FCRA, you are required to verify the accuracy of reported information.

I demand immediate removal of this item and a corrected credit report. Failure to comply may result in legal action.');

-- Add constraint to ensure only one active template per round
CREATE UNIQUE INDEX idx_one_active_template_per_round 
ON public.round_templates (round_number) 
WHERE is_active = true;