-- Purge ALL sample and corrupted data
TRUNCATE TABLE credit_accounts CASCADE;
TRUNCATE TABLE personal_information CASCADE;
TRUNCATE TABLE credit_inquiries CASCADE;
TRUNCATE TABLE negative_items CASCADE;
TRUNCATE TABLE ai_analysis_results CASCADE;

-- Reset all credit reports extraction status to force re-processing
UPDATE credit_reports 
SET extraction_status = 'pending', 
    processing_errors = NULL,
    updated_at = now()
WHERE LENGTH(raw_text) < 50000 OR raw_text ILIKE '%filter%' OR raw_text ILIKE '%flatedecode%';

-- Add strict validation to prevent sample data insertion
CREATE OR REPLACE FUNCTION public.prevent_sample_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Reject obvious sample data patterns
  IF NEW.creditor_name IS NOT NULL AND (
    NEW.creditor_name = 'OSX' OR 
    NEW.creditor_name ILIKE '%test%' OR 
    NEW.creditor_name ILIKE '%sample%' OR
    NEW.creditor_name ILIKE '%example%' OR
    NEW.current_balance = 3.00
  ) THEN
    RAISE EXCEPTION 'Sample data insertion blocked: %', NEW.creditor_name;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Add trigger to prevent sample data insertion
DROP TRIGGER IF EXISTS prevent_sample_data_trigger ON credit_accounts;
CREATE TRIGGER prevent_sample_data_trigger
  BEFORE INSERT OR UPDATE ON credit_accounts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_sample_data();

-- Add validation for personal information
CREATE OR REPLACE FUNCTION public.prevent_sample_personal_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Reject PDF metadata in personal information
  IF NEW.current_address IS NOT NULL AND (
    NEW.current_address::text ILIKE '%filter%' OR
    NEW.current_address::text ILIKE '%flatedecode%' OR
    NEW.current_address::text ILIKE '%length%' OR
    NEW.current_address::text ILIKE '%endstream%'
  ) THEN
    RAISE EXCEPTION 'PDF metadata blocked in personal information';
  END IF;
  
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_sample_personal_data_trigger ON personal_information;
CREATE TRIGGER prevent_sample_personal_data_trigger
  BEFORE INSERT OR UPDATE ON personal_information
  FOR EACH ROW
  EXECUTE FUNCTION prevent_sample_personal_data();