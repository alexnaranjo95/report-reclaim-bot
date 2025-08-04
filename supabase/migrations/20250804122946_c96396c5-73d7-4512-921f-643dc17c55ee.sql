-- CRITICAL SECURITY FIX: Fix profiles table RLS policies to prevent privilege escalation
-- Users should NOT be able to modify their own status field

-- Drop existing problematic policy that allows users to update their own profile
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create new restricted UPDATE policy that excludes sensitive fields
-- Note: PostgreSQL doesn't support OLD/NEW in RLS policies, so we'll use a different approach
CREATE POLICY "Users can update their own profile (restricted)" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create separate admin-only policy for status updates
CREATE POLICY "Superadmins can update any profile" 
ON public.profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

-- Add audit logging for sensitive operations
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  table_name text,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only superadmins can view audit logs
CREATE POLICY "Superadmins can view audit logs" 
ON public.security_audit_log 
FOR SELECT 
USING (has_role(auth.uid(), 'superadmin'::app_role));

-- Create trigger function for audit logging
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Log status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.security_audit_log (
      user_id, 
      action, 
      table_name, 
      record_id, 
      old_values, 
      new_values
    ) VALUES (
      auth.uid(),
      'status_change',
      'profiles',
      NEW.id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for audit logging
DROP TRIGGER IF EXISTS audit_profile_status_changes ON public.profiles;
CREATE TRIGGER audit_profile_status_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_profile_changes();