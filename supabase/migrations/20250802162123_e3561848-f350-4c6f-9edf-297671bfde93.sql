-- Fix the get_user_profile function with proper search_path
CREATE OR REPLACE FUNCTION public.get_user_profile(profile_user_id uuid)
 RETURNS TABLE(id uuid, user_id uuid, email text, phone_number text, email_notifications boolean, text_notifications boolean, display_name text, verification_documents jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
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
    p.updated_at
  FROM public.profiles p
  WHERE p.user_id = profile_user_id;
END;
$function$;

-- Fix the upsert_user_profile function with proper search_path and include verification_documents
CREATE OR REPLACE FUNCTION public.upsert_user_profile(
  profile_user_id uuid, 
  profile_email text, 
  profile_phone_number text, 
  profile_email_notifications boolean, 
  profile_text_notifications boolean, 
  profile_display_name text,
  profile_verification_documents jsonb DEFAULT '[]'::jsonb
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
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
    profile_verification_documents
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    email = EXCLUDED.email,
    phone_number = EXCLUDED.phone_number,
    email_notifications = EXCLUDED.email_notifications,
    text_notifications = EXCLUDED.text_notifications,
    display_name = EXCLUDED.display_name,
    verification_documents = EXCLUDED.verification_documents,
    updated_at = now()
  RETURNING id INTO profile_id;
  
  RETURN profile_id;
END;
$function$;

-- Fix the handle_new_user function with proper search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (
    NEW.id, 
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email)
  );
  RETURN NEW;
END;
$function$;