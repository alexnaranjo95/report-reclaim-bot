-- Fix search path for security definer function
CREATE OR REPLACE FUNCTION public.ensure_round_templates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  i integer;
  default_layout_id uuid;
BEGIN
  -- Get the default layout ID
  SELECT id INTO default_layout_id
  FROM public.template_layouts 
  WHERE is_default = true 
  LIMIT 1;
  
  -- If no default layout exists, create one
  IF default_layout_id IS NULL THEN
    INSERT INTO public.template_layouts (name, content, is_default, placeholders)
    VALUES (
      'Default Letter Layout',
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
      true,
      ARRAY['date', 'round', 'body', 'client_name']
    )
    RETURNING id INTO default_layout_id;
  END IF;
  
  -- Create templates for rounds 1-12 if they don't exist
  FOR i IN 1..12 LOOP
    INSERT INTO public.round_templates (
      round_number, 
      layout_id, 
      content_template, 
      is_active,
      tone_settings,
      append_documents
    )
    SELECT 
      i,
      default_layout_id,
      CASE 
        WHEN i = 1 THEN 'Dear {{creditor_name}},

I am writing to dispute the following item(s) on my credit report. This item is inaccurate and I am requesting immediate removal.

Account Number: {{account_number}}
Bureau(s): {{bureaus}}

Please investigate this matter and remove this inaccurate information from my credit report within 30 days as required by the Fair Credit Reporting Act.

Thank you for your prompt attention to this matter.'
        WHEN i <= 3 THEN 'Dear {{creditor_name}},

I am following up on my previous correspondence regarding the disputed item on my credit report. This item remains inaccurate and unverified.

Account Number: {{account_number}}
Bureau(s): {{bureaus}}
Reference Number: {{reference_number}}

I am requesting immediate removal of this item as it continues to damage my credit profile. Please provide proper documentation or remove this item immediately.'
        WHEN i <= 6 THEN 'Dear {{creditor_name}},

This is my {{round}} letter regarding the unresolved dispute on my credit report. Your failure to properly verify this account is unacceptable.

Account Number: {{account_number}}
Bureau(s): {{bureaus}}
Previous Date: {{previous_date}}

I demand immediate action on this matter. Continued reporting of unverified information may result in legal action under the FCRA.'
        ELSE 'NOTICE OF INTENT TO SUE

Dear {{creditor_name}},

This serves as formal notice of your continued violations of the Fair Credit Reporting Act. Despite multiple requests, you have failed to remove the inaccurate information from my credit report.

Account Number: {{account_number}}
Bureau(s): {{bureaus}}

If this matter is not resolved within 15 days, I will pursue all available legal remedies, including statutory damages up to $1,000 plus attorney fees.

This is not a threat, but a statement of my legal rights under 15 USC §1681.'
      END,
      true,
      jsonb_build_object(
        'aggression_level', 
        CASE 
          WHEN i <= 2 THEN 'polite'
          WHEN i <= 4 THEN 'standard' 
          WHEN i <= 8 THEN 'firm'
          ELSE 'aggressive'
        END,
        'tone',
        CASE 
          WHEN i <= 3 THEN 'professional'
          WHEN i <= 6 THEN 'assertive'
          ELSE 'legal'
        END
      ),
      jsonb_build_object(
        'proof_of_address', CASE WHEN i >= 4 THEN true ELSE false END,
        'identity', CASE WHEN i >= 6 THEN true ELSE false END,
        'social_security', CASE WHEN i >= 8 THEN true ELSE false END
      )
    WHERE NOT EXISTS (
      SELECT 1 FROM public.round_templates WHERE round_number = i
    );
  END LOOP;
END;
$$;