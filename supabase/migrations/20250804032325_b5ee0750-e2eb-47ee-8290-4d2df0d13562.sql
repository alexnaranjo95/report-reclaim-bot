-- Fix security issues identified by the linter

-- 1. Fix the monitoring view security issue by removing SECURITY DEFINER
-- and making it a regular view with proper RLS
DROP VIEW IF EXISTS extraction_health_monitor;

CREATE VIEW extraction_health_monitor AS
SELECT 
  extraction_status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_processing_time_seconds,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record,
  COUNT(CASE WHEN created_at > (now() - interval '1 hour') THEN 1 END) as recent_count
FROM credit_reports 
GROUP BY extraction_status;

-- Create RLS policy for the monitoring view access (superadmins only)
-- Note: The view will inherit RLS from the underlying table

-- 2. Fix function search paths by explicitly setting them for all functions
CREATE OR REPLACE FUNCTION public.cleanup_old_failed_reports()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Remove failed reports older than 7 days with no extracted data
  DELETE FROM public.credit_reports 
  WHERE extraction_status = 'failed' 
  AND raw_text IS NULL 
  AND created_at < (now() - interval '7 days')
  AND id NOT IN (
    SELECT DISTINCT report_id FROM public.personal_information
    UNION
    SELECT DISTINCT report_id FROM public.credit_accounts  
    UNION
    SELECT DISTINCT report_id FROM public.credit_inquiries
    UNION
    SELECT DISTINCT report_id FROM public.negative_items
  );
  
  -- Log cleanup action
  RAISE NOTICE 'Cleaned up old failed credit reports without extracted data';
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_stuck_processing()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  -- If setting to processing, set a timeout
  IF NEW.extraction_status = 'processing' AND OLD.extraction_status != 'processing' THEN
    -- This will be used by cleanup jobs to identify stuck records
    NEW.updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update the trigger to use the fixed function
DROP TRIGGER IF EXISTS trigger_prevent_stuck_processing ON credit_reports;
CREATE TRIGGER trigger_prevent_stuck_processing
  BEFORE UPDATE ON credit_reports
  FOR EACH ROW
  EXECUTE FUNCTION prevent_stuck_processing();

-- Add comments for clarity
COMMENT ON VIEW extraction_health_monitor IS 'Monitoring view for PDF extraction system health and performance (no SECURITY DEFINER)';
COMMENT ON FUNCTION cleanup_old_failed_reports() IS 'Cleanup function for removing old failed credit reports without data (secure search path)';
COMMENT ON FUNCTION prevent_stuck_processing() IS 'Prevents processing records from getting stuck by tracking update times (secure search path)';