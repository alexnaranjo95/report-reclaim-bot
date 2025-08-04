-- Clean up stuck processing records and fix bureau constraint
UPDATE credit_reports 
SET extraction_status = 'pending', 
    processing_errors = NULL,
    raw_text = NULL 
WHERE extraction_status = 'processing';

-- Fix bureau constraint to allow common values
ALTER TABLE credit_reports DROP CONSTRAINT IF EXISTS credit_reports_bureau_name_check;

-- Add updated bureau constraint that allows common values
ALTER TABLE credit_reports ADD CONSTRAINT credit_reports_bureau_name_check 
CHECK (bureau_name IN ('Experian', 'Equifax', 'TransUnion', 'Combined', 'Unknown', 'Pending'));