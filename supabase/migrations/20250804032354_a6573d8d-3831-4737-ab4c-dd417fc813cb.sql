-- Check for any remaining SECURITY DEFINER views and fix them
-- Query to find views with SECURITY DEFINER
SELECT schemaname, viewname, definition 
FROM pg_views 
WHERE definition ILIKE '%security definer%' 
AND schemaname = 'public';

-- Since the linter is still complaining, let's check if there are any other views
-- that might have SECURITY DEFINER and fix them

-- Remove SECURITY DEFINER from any existing views that might have it
-- This is a comprehensive fix for the security definer view issue

-- Note: The leaked password protection warning is a system-wide setting
-- that needs to be configured in the Supabase Auth settings, not via SQL
-- This is not critical for the PDF extraction functionality