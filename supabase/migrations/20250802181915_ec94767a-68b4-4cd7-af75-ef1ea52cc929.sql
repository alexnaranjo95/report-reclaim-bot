-- CRITICAL SECURITY FIX: Fix Row Level Security Policies
-- This migration fixes all critical RLS vulnerabilities identified in security review

-- First, add user_id columns to tables that need them for proper access control
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.letters ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.response_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Update existing records to set user_id (this will need to be done manually for existing data)
-- For now, we'll leave existing records as they are and new records will have proper user_id

-- Drop the vulnerable "allow all" RLS policies
DROP POLICY IF EXISTS "Allow all operations on sessions" ON public.sessions;
DROP POLICY IF EXISTS "Allow all operations on rounds" ON public.rounds;
DROP POLICY IF EXISTS "Allow all operations on letters" ON public.letters;
DROP POLICY IF EXISTS "Allow all operations on response_logs" ON public.response_logs;

-- Create secure RLS policies for sessions table
CREATE POLICY "Users can view their own sessions" 
ON public.sessions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sessions" 
ON public.sessions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions" 
ON public.sessions 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions" 
ON public.sessions 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create secure RLS policies for rounds table
CREATE POLICY "Users can view their own rounds" 
ON public.rounds 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own rounds" 
ON public.rounds 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own rounds" 
ON public.rounds 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own rounds" 
ON public.rounds 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create secure RLS policies for letters table
CREATE POLICY "Users can view their own letters" 
ON public.letters 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own letters" 
ON public.letters 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own letters" 
ON public.letters 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own letters" 
ON public.letters 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create secure RLS policies for response_logs table
CREATE POLICY "Users can view their own response logs" 
ON public.response_logs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own response logs" 
ON public.response_logs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own response logs" 
ON public.response_logs 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own response logs" 
ON public.response_logs 
FOR DELETE 
USING (auth.uid() = user_id);

-- Fix database function security vulnerabilities by adding proper search path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
SET search_path = ''
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
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

-- Make verification-documents bucket private for security
UPDATE storage.buckets 
SET public = false 
WHERE id = 'verification-documents';

-- Create secure storage policies for verification documents
CREATE POLICY "Users can view their own verification documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'verification-documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload their own verification documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'verification-documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own verification documents" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'verification-documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own verification documents" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'verification-documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Add audit trigger for security monitoring
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Log important security events (could be extended to log to audit table)
  RAISE LOG 'Security audit: % on table % by user %', TG_OP, TG_TABLE_NAME, auth.uid();
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;

-- Add audit triggers to sensitive tables
CREATE TRIGGER audit_sessions_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER audit_letters_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.letters
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();