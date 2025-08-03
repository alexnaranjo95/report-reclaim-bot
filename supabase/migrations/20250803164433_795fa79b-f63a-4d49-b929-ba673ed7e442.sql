-- Clean up duplicate INSERT policies for credit_reports table
DROP POLICY IF EXISTS "Users can create their own credit reports" ON public.credit_reports;

-- Keep only the "Users can insert their own credit reports" policy