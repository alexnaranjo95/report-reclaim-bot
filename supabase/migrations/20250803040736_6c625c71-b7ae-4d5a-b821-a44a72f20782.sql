-- Update the upsert_user_profile function to include all required personal information fields
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
  profile_postal_code text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
    postal_code
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
    profile_postal_code
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
    updated_at = now()
  RETURNING id INTO profile_id;
  
  RETURN profile_id;
END;
$function$

-- Also update the get_user_profile function to ensure it returns all fields
CREATE OR REPLACE FUNCTION public.get_user_profile(profile_user_id uuid)
RETURNS TABLE(
  id uuid, 
  user_id uuid, 
  email text, 
  phone_number text, 
  email_notifications boolean, 
  text_notifications boolean, 
  display_name text, 
  verification_documents jsonb, 
  created_at timestamp with time zone, 
  updated_at timestamp with time zone,
  full_name text,
  address_line1 text,
  city text,
  state text,
  postal_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.email,
    p.phone_number,
    p.email_notifications,
    p.text_notifications,
    p.display_name,
    p.verification_documents,
    p.created_at,
    p.updated_at,
    p.full_name,
    p.address_line1,
    p.city,
    p.state,
    p.postal_code
  FROM public.profiles p
  WHERE p.user_id = profile_user_id;
END;
$function$