-- Fix TinyMCE API key issue and add required profile fields
-- First, let's check if admin_settings has the TinyMCE key
DO $$
BEGIN
    -- Insert TinyMCE API key if it doesn't exist
    INSERT INTO public.admin_settings (setting_key, setting_value, description, is_encrypted)
    VALUES (
        'tinymce_api_key',
        '"your-tinymce-api-key-here"'::jsonb,
        'TinyMCE API key for rich text editor',
        false
    )
    ON CONFLICT (setting_key) DO NOTHING;
END $$;

-- Add required profile fields for address information
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS full_name text,
ADD COLUMN IF NOT EXISTS address_line1 text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS postal_code text;