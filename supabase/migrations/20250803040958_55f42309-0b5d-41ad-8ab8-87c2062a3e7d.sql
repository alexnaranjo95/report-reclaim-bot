-- Drop the existing get_user_profile function and recreate it with the new signature
DROP FUNCTION IF EXISTS public.get_user_profile(uuid);

-- Create the updated get_user_profile function with all address fields
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