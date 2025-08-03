-- Update TinyMCE API key with a proper placeholder that indicates it needs to be configured
UPDATE public.admin_settings 
SET setting_value = '"no-key-configured"'::jsonb,
    description = 'TinyMCE API key for rich text editing functionality - Please update with your actual API key'
WHERE setting_key = 'tinymce_key';