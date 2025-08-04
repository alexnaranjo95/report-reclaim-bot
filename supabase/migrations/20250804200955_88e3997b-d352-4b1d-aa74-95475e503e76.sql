-- Improve validation function to better detect valid credit report data
CREATE OR REPLACE FUNCTION public.validate_extracted_text(report_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  text_content text;
  is_valid boolean := false;
  text_length integer;
  meaningful_content_ratio numeric;
  credit_keywords_count integer;
BEGIN
  -- Get the raw text
  SELECT raw_text INTO text_content 
  FROM credit_reports 
  WHERE id = report_id;
  
  -- Basic checks
  IF text_content IS NULL OR LENGTH(text_content) < 500 THEN
    RETURN false;
  END IF;
  
  text_length := LENGTH(text_content);
  
  -- Check for PDF metadata indicators (signs of failed extraction)
  IF text_content ILIKE '%endstream%' 
     AND text_content ILIKE '%endobj%' 
     AND text_content ILIKE '%stream%'
     AND text_length < 100000 THEN
    RETURN false;
  END IF;
  
  -- Count meaningful credit report keywords
  SELECT 
    (CASE WHEN text_content ILIKE '%credit report%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%experian%' OR text_content ILIKE '%equifax%' OR text_content ILIKE '%transunion%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%account number%' OR text_content ILIKE '%acct%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%balance%' AND text_content ILIKE '%payment%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%creditor%' OR text_content ILIKE '%lender%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%inquiry%' OR text_content ILIKE '%inquiries%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%date opened%' OR text_content ILIKE '%date of birth%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%social security%' OR text_content ILIKE '%ssn%' THEN 1 ELSE 0 END)
  INTO credit_keywords_count;
  
  -- Calculate ratio of alphabetic characters (meaningful content vs garbage)
  SELECT 
    (LENGTH(REGEXP_REPLACE(text_content, '[^a-zA-Z ]', '', 'g'))::numeric / text_length::numeric)
  INTO meaningful_content_ratio;
  
  -- Valid if we have enough credit keywords AND reasonable text content
  is_valid := (
    credit_keywords_count >= 3 
    AND meaningful_content_ratio > 0.3
    AND NOT (text_content ILIKE '%mozilla%' AND meaningful_content_ratio < 0.5)
  );
  
  RETURN is_valid;
END;
$function$;

-- Clean up the failed report so it can be retried
UPDATE credit_reports 
SET 
  extraction_status = 'pending',
  processing_errors = NULL,
  raw_text = NULL,
  updated_at = now()
WHERE id = 'af673759-e3e5-4e1c-9096-263227e90645';