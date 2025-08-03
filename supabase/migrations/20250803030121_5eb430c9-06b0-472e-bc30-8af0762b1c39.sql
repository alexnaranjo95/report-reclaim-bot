-- Insert TinyMCE API key setting if it doesn't exist
INSERT INTO public.admin_settings (setting_key, setting_value, description, is_encrypted) 
VALUES (
  'tinymce_key', 
  'your-tinymce-api-key-here',
  'TinyMCE API key for rich text editing functionality',
  false
) 
ON CONFLICT (setting_key) DO NOTHING;