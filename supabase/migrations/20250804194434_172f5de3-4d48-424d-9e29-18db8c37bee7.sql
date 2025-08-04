-- Add cleanup function for stuck processing reports
CREATE OR REPLACE FUNCTION public.cleanup_stuck_processing_reports()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Reset reports stuck in processing for more than 10 minutes
  UPDATE public.credit_reports 
  SET 
    extraction_status = 'failed',
    processing_errors = 'Processing timeout - reset after 10 minutes',
    updated_at = now()
  WHERE 
    extraction_status = 'processing' 
    AND updated_at < (now() - interval '10 minutes');
    
  -- Log the cleanup action
  RAISE NOTICE 'Cleaned up stuck processing reports';
END;
$function$;