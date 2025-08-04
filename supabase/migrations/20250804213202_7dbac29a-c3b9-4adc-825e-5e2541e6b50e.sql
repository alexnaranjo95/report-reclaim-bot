-- Drop and recreate the validate_extracted_text function with updated permissive logic
DROP FUNCTION IF EXISTS public.validate_extracted_text(uuid);

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
  alphabetic_ratio numeric;
  credit_keywords_count integer;
  is_identityiq boolean := false;
  has_mozilla boolean := false;
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
  
  -- Check for IdentityIQ report
  is_identityiq := text_content ILIKE '%identityiq%';
  
  -- Check for Mozilla/browser markers
  has_mozilla := text_content ILIKE '%mozilla%';
  
  -- Check for PDF metadata indicators (signs of failed extraction)
  IF text_content ILIKE '%endstream%' 
     AND text_content ILIKE '%endobj%' 
     AND text_content ILIKE '%stream%'
     AND text_length < 50000 THEN
    RETURN false;
  END IF;
  
  -- Enhanced credit report keyword detection
  SELECT 
    (CASE WHEN text_content ILIKE '%credit report%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%experian%' OR text_content ILIKE '%equifax%' OR text_content ILIKE '%transunion%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%account number%' OR text_content ILIKE '%acct%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%balance%' AND text_content ILIKE '%payment%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%creditor%' OR text_content ILIKE '%lender%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%inquiry%' OR text_content ILIKE '%inquiries%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%date opened%' OR text_content ILIKE '%date of birth%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%social security%' OR text_content ILIKE '%ssn%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%identityiq%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%credit score%' OR text_content ILIKE '%fico%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%personal information%' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ILIKE '%credit limit%' OR text_content ILIKE '%current balance%' THEN 1 ELSE 0 END)
  INTO credit_keywords_count;
  
  -- Calculate ratio of alphabetic characters
  SELECT 
    (LENGTH(REGEXP_REPLACE(text_content, '[^a-zA-Z ]', '', 'g'))::numeric / text_length::numeric)
  INTO alphabetic_ratio;
  
  -- Calculate ratio of alphanumeric characters (meaningful content vs garbage)
  SELECT 
    (LENGTH(REGEXP_REPLACE(text_content, '[^a-zA-Z0-9 ]', '', 'g'))::numeric / text_length::numeric)
  INTO meaningful_content_ratio;
  
  -- Special validation for IdentityIQ reports
  IF is_identityiq THEN
    is_valid := (
      credit_keywords_count >= 1 
      AND text_length > 10000
      AND meaningful_content_ratio > 0.25
    );
    RETURN is_valid;
  END IF;
  
  -- More permissive validation for browser-generated PDFs with Mozilla markers
  IF has_mozilla AND text_length > 50000 THEN
    is_valid := (
      credit_keywords_count >= 1 
      AND alphabetic_ratio > 0.2
      AND meaningful_content_ratio > 0.3
    );
    RETURN is_valid;
  END IF;
  
  -- Standard validation for other credit reports
  is_valid := (
    credit_keywords_count >= 1 
    AND alphabetic_ratio > 0.3
    AND meaningful_content_ratio > 0.35
    AND NOT (has_mozilla AND meaningful_content_ratio < 0.4)
  );
  
  RETURN is_valid;
END;
$function$;