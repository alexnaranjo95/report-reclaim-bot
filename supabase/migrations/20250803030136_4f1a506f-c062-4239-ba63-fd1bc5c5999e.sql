-- Insert TinyMCE API key setting if it doesn't exist with proper JSON format
INSERT INTO public.admin_settings (setting_key, setting_value, description, is_encrypted) 
VALUES (
  'tinymce_key', 
  '"your-tinymce-api-key-here"'::jsonb,
  'TinyMCE API key for rich text editing functionality',
  false
) 
ON CONFLICT (setting_key) DO NOTHING;