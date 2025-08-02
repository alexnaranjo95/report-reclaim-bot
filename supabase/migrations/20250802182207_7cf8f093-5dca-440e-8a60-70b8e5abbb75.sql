-- CRITICAL SECURITY FIX: Fix Row Level Security Policies (Part 1)
-- This migration fixes all critical RLS vulnerabilities identified in security review

-- First, add user_id columns to tables that need them for proper access control
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.letters ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.response_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

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