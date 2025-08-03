-- Update TinyMCE API key with the provided value
UPDATE public.admin_settings 
SET setting_value = '"t8p7p5hvr1yuv0m60w9mwdzhu8shmwdpprxqteooesge4asl"'::jsonb,
    description = 'TinyMCE API key for rich text editing functionality',
    updated_at = now()
WHERE setting_key = 'tinymce_key';