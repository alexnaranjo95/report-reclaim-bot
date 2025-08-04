-- Clean up corrupted test data and improve extraction monitoring
DELETE FROM credit_accounts WHERE creditor_name = 'OSX' OR current_balance = 3.00;

DELETE FROM personal_information 
WHERE current_address->>'full_address' ILIKE '%filter%'
   OR current_address->>'full_address' ILIKE '%flatedecode%'
   OR current_address->>'full_address' ILIKE '%length%';

-- Add function to clean up PDF metadata extraction issues
CREATE OR REPLACE FUNCTION public.validate_extracted_text(report_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  text_content text;
  is_valid boolean := false;
BEGIN
  -- Get the raw text
  SELECT raw_text INTO text_content 
  FROM credit_reports 
  WHERE id = report_id;
  
  -- Check if text contains actual credit report content vs PDF metadata
  IF text_content IS NOT NULL AND LENGTH(text_content) > 100 THEN
    -- Valid if it contains credit report keywords and not just PDF metadata
    is_valid := (
      (text_content ILIKE '%credit%' OR text_content ILIKE '%account%' OR text_content ILIKE '%balance%')
      AND NOT (text_content ILIKE '%mozilla%' AND text_content ILIKE '%endstream%' AND LENGTH(text_content) < 100000)
    );
  END IF;
  
  RETURN is_valid;
END;
$function$;

-- Add extraction monitoring function
CREATE OR REPLACE FUNCTION public.get_extraction_summary()
RETURNS TABLE(
  status text,
  count bigint,
  avg_text_length numeric,
  common_errors text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    extraction_status as status,
    COUNT(*) as count,
    AVG(LENGTH(raw_text)) as avg_text_length,
    ARRAY_AGG(DISTINCT processing_errors) FILTER (WHERE processing_errors IS NOT NULL) as common_errors
  FROM credit_reports 
  WHERE created_at > (now() - interval '24 hours')
  GROUP BY extraction_status
  ORDER BY count DESC;
$function$;