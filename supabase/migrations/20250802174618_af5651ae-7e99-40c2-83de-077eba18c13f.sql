-- Update the upsert_user_profile function to include verification_documents
CREATE OR REPLACE FUNCTION public.upsert_user_profile(
  profile_user_id uuid, 
  profile_email text, 
  profile_phone_number text, 
  profile_email_notifications boolean, 
  profile_text_notifications boolean, 
  profile_display_name text,
  profile_verification_documents jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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
    verification_documents
  )
  VALUES (
    profile_user_id,
    profile_email,
    profile_phone_number,
    profile_email_notifications,
    profile_text_notifications,
    profile_display_name,
    COALESCE(profile_verification_documents, '[]'::jsonb)
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
    updated_at = now()
  RETURNING id INTO profile_id;
  
  RETURN profile_id;
END;
$function$;