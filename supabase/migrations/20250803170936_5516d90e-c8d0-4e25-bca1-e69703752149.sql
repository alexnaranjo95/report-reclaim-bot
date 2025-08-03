-- Drop the conflicting overloaded functions and create a single comprehensive version
DROP FUNCTION IF EXISTS public.upsert_user_profile(uuid, text, text, boolean, boolean, text);
DROP FUNCTION IF EXISTS public.upsert_user_profile(uuid, text, text, boolean, boolean, text, jsonb);
DROP FUNCTION IF EXISTS public.upsert_user_profile(uuid, text, text, boolean, boolean, text, jsonb, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.upsert_user_profile(uuid, text, text, boolean, boolean, text, jsonb, text, text, text, text, text, uuid, text);

-- Create a single comprehensive upsert_user_profile function
CREATE OR REPLACE FUNCTION public.upsert_user_profile(
  profile_user_id uuid,
  profile_email text,
  profile_phone_number text,
  profile_email_notifications boolean,
  profile_text_notifications boolean,
  profile_display_name text,
  profile_verification_documents jsonb DEFAULT NULL::jsonb,
  profile_full_name text DEFAULT NULL::text,
  profile_address_line1 text DEFAULT NULL::text,
  profile_city text DEFAULT NULL::text,
  profile_state text DEFAULT NULL::text,
  profile_postal_code text DEFAULT NULL::text,
  profile_organization_id uuid DEFAULT NULL::uuid,
  profile_organization_name text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  profile_id UUID;
BEGIN
  INSERT INTO public.profiles (
    user_id,
    email,
    phone_number,
    email_notifications,
    text_notifications,
    display_name,
    verification_documents,
    full_name,
    address_line1,
    city,
    state,
    postal_code,
    organization_id,
    organization_name
  )
  VALUES (
    profile_user_id,
    profile_email,
    profile_phone_number,
    profile_email_notifications,
    profile_text_notifications,
    profile_display_name,
    COALESCE(profile_verification_documents, '[]'::jsonb),
    profile_full_name,
    profile_address_line1,
    profile_city,
    profile_state,
    profile_postal_code,
    profile_organization_id,
    profile_organization_name
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    email = EXCLUDED.email,
    phone_number = EXCLUDED.phone_number,
    email_notifications = EXCLUDED.email_notifications,
    text_notifications = EXCLUDED.text_notifications,
    display_name = EXCLUDED.display_name,
    verification_documents = CASE 
      WHEN profile_verification_documents IS NOT NULL 
      THEN profile_verification_documents 
      ELSE profiles.verification_documents 
    END,
    full_name = COALESCE(profile_full_name, profiles.full_name),
    address_line1 = COALESCE(profile_address_line1, profiles.address_line1),
    city = COALESCE(profile_city, profiles.city),
    state = COALESCE(profile_state, profiles.state),
    postal_code = COALESCE(profile_postal_code, profiles.postal_code),
    organization_id = COALESCE(profile_organization_id, profiles.organization_id),
    organization_name = COALESCE(profile_organization_name, profiles.organization_name),
    updated_at = now()
  RETURNING id INTO profile_id;
  
  RETURN profile_id;
END;
$$;