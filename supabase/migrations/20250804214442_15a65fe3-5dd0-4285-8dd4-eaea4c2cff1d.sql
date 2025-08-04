-- Enhanced validation function for heavily corrupted but legitimate credit reports
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
  is_large_document boolean := false;
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
  is_large_document := text_length > 100000;
  
  -- Check for IdentityIQ report (very permissive)
  is_identityiq := text_content ILIKE '%identityiq%' OR 
                   text_content ILIKE '%identity iq%' OR
                   text_content ILIKE '%experian consumer report%';
  
  -- Check for Mozilla/browser markers
  has_mozilla := text_content ILIKE '%mozilla%';
  
  -- Check for PDF metadata indicators (signs of failed extraction)
  IF text_content ILIKE '%endstream%' 
     AND text_content ILIKE '%endobj%' 
     AND text_content ILIKE '%stream%'
     AND text_length < 50000 THEN
    RETURN false;
  END IF;
  
  -- Enhanced fuzzy credit report keyword detection for corrupted text
  SELECT 
    (CASE WHEN text_content ~* 'credit\s*report|identityiq|identity\s*iq|consumer\s*report' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~* 'experian|equifax|transunion|tri[\s-]*merge|3[\s-]*bureau' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~* 'account[\s#]*number|acct[\s#]*|account[\s#]*\d+' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~* 'balance|payment[\s]*history|current[\s]*balance' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~* 'creditor|lender|credit[\s]*card|loan' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~* 'inquiry|inquiries|hard[\s]*pull|soft[\s]*pull' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~* 'date[\s]*opened|date[\s]*of[\s]*birth|open[\s]*date' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~* 'social[\s]*security|ssn|social' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~* 'fico|credit[\s]*score|score[\s]*\d+' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~* 'tradeline|trade[\s]*line|credit[\s]*line' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~* 'address|phone|employment|personal[\s]*info' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~* 'dispute|collections|charge[\s-]*off|late[\s]*payment' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~* 'credit[\s]*monitoring|monitoring[\s]*service' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~* 'account[\s]*history|payment[\s]*status' THEN 1 ELSE 0 END) +
    -- Additional fuzzy patterns for corrupted text
    (CASE WHEN text_content ~* '\w*credit\w*|\w*report\w*|\w*account\w*|\w*balance\w*' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~ '\d{3,4}[\s-]*\d{2,4}[\s-]*\d{4}' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~ '\$?\d{1,6}[\.,]?\d{0,2}' THEN 1 ELSE 0 END) +
    (CASE WHEN text_content ~ '\b[A-Z]{2,}[\s]*[A-Z]*\b' THEN 1 ELSE 0 END)
  INTO credit_keywords_count;
  
  -- Calculate ratio of alphabetic characters
  SELECT 
    (LENGTH(REGEXP_REPLACE(text_content, '[^a-zA-Z ]', '', 'g'))::numeric / text_length::numeric)
  INTO alphabetic_ratio;
  
  -- Calculate ratio of alphanumeric characters (meaningful content vs garbage)
  SELECT 
    (LENGTH(REGEXP_REPLACE(text_content, '[^a-zA-Z0-9 ]', '', 'g'))::numeric / text_length::numeric)
  INTO meaningful_content_ratio;
  
  -- VERY PERMISSIVE validation for IdentityIQ reports
  IF is_identityiq AND text_length > 10000 THEN
    is_valid := (
      credit_keywords_count >= 1 
      OR alphabetic_ratio > 0.4 
      OR meaningful_content_ratio > 0.25
      OR text_length > 50000
    );
    IF is_valid THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Permissive validation for browser-generated PDFs with Mozilla markers
  IF has_mozilla AND text_length > 30000 THEN
    is_valid := (
      credit_keywords_count >= 1 
      OR alphabetic_ratio > 0.2 
      OR meaningful_content_ratio > 0.2
      OR text_length > 100000
    );
    IF is_valid THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Standard validation (more permissive than before)
  is_valid := (
    credit_keywords_count >= 1 
    AND meaningful_content_ratio > 0.2
  );
  
  -- Additional fallback for large documents with reasonable content
  IF NOT is_valid AND text_length > 30000 THEN
    is_valid := (
      alphabetic_ratio > 0.3 
      OR meaningful_content_ratio > 0.25
    );
  END IF;
  
  -- Emergency fallback for very large documents
  IF NOT is_valid AND text_length > 100000 THEN
    is_valid := meaningful_content_ratio > 0.15;
  END IF;
  
  RETURN is_valid;
END;
$function$;