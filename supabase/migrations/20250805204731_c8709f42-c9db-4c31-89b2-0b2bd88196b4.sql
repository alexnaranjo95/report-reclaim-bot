-- Fix the sample data prevention trigger to be less aggressive
DROP TRIGGER IF EXISTS prevent_sample_data_trigger ON credit_accounts;
DROP FUNCTION IF EXISTS prevent_sample_data();

-- Create a more targeted sample data prevention function
CREATE OR REPLACE FUNCTION public.prevent_sample_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only reject very obvious test/sample patterns, not real data
  IF NEW.creditor_name IS NOT NULL AND (
    NEW.creditor_name ILIKE '%test%' OR 
    NEW.creditor_name ILIKE '%sample%' OR
    NEW.creditor_name ILIKE '%example%' OR
    NEW.creditor_name ILIKE '%dummy%' OR
    NEW.creditor_name ILIKE '%fake%' OR
    (NEW.creditor_name = 'TEST' AND NEW.current_balance = 0)
  ) THEN
    RAISE EXCEPTION 'Sample data insertion blocked: %', NEW.creditor_name;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Re-create the trigger with the updated function
CREATE TRIGGER prevent_sample_data_trigger
  BEFORE INSERT ON credit_accounts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_sample_data();