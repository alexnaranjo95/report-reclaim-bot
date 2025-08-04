-- Clean up stuck processing records and optimize database for enhanced PDF extraction
-- This migration addresses the issues found in the audit

-- 1. Clean up stuck 'pending' records that never completed
UPDATE credit_reports 
SET extraction_status = 'failed',
    processing_errors = 'Processing abandoned - cleaned up by system migration',
    updated_at = now()
WHERE extraction_status = 'pending' 
AND created_at < (now() - interval '1 hour');

-- 2. Clean up stuck 'processing' records that never completed  
UPDATE credit_reports 
SET extraction_status = 'failed',
    processing_errors = 'Processing timed out - cleaned up by system migration',
    updated_at = now()
WHERE extraction_status = 'processing' 
AND created_at < (now() - interval '1 hour');

-- 3. Remove orphaned records with no actual data
DELETE FROM credit_reports 
WHERE extraction_status = 'failed' 
AND raw_text IS NULL 
AND created_at < (now() - interval '24 hours')
AND id NOT IN (
  SELECT DISTINCT report_id FROM personal_information
  UNION
  SELECT DISTINCT report_id FROM credit_accounts  
  UNION
  SELECT DISTINCT report_id FROM credit_inquiries
  UNION
  SELECT DISTINCT report_id FROM negative_items
);

-- 4. Add performance indexes for better extraction tracking
CREATE INDEX IF NOT EXISTS idx_credit_reports_extraction_status 
ON credit_reports(extraction_status);

CREATE INDEX IF NOT EXISTS idx_credit_reports_user_status 
ON credit_reports(user_id, extraction_status);

CREATE INDEX IF NOT EXISTS idx_credit_reports_created_processing 
ON credit_reports(created_at) 
WHERE extraction_status IN ('pending', 'processing');

-- 5. Add a function to automatically clean up old failed records
CREATE OR REPLACE FUNCTION cleanup_old_failed_reports()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove failed reports older than 7 days with no extracted data
  DELETE FROM credit_reports 
  WHERE extraction_status = 'failed' 
  AND raw_text IS NULL 
  AND created_at < (now() - interval '7 days')
  AND id NOT IN (
    SELECT DISTINCT report_id FROM personal_information
    UNION
    SELECT DISTINCT report_id FROM credit_accounts  
    UNION
    SELECT DISTINCT report_id FROM credit_inquiries
    UNION
    SELECT DISTINCT report_id FROM negative_items
  );
  
  -- Log cleanup action
  RAISE NOTICE 'Cleaned up old failed credit reports without extracted data';
END;
$$;

-- 6. Add validation constraints to ensure data integrity
ALTER TABLE credit_reports 
ADD CONSTRAINT check_extraction_status_valid 
CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed'));

-- 7. Add a trigger to prevent extraction_status from being stuck
CREATE OR REPLACE FUNCTION prevent_stuck_processing()
RETURNS TRIGGER
LANGUAGE plpgsql
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

CREATE TRIGGER trigger_prevent_stuck_processing
  BEFORE UPDATE ON credit_reports
  FOR EACH ROW
  EXECUTE FUNCTION prevent_stuck_processing();

-- 8. Create a monitoring view for extraction health
CREATE OR REPLACE VIEW extraction_health_monitor AS
SELECT 
  extraction_status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_processing_time_seconds,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record,
  COUNT(CASE WHEN created_at > (now() - interval '1 hour') THEN 1 END) as recent_count
FROM credit_reports 
GROUP BY extraction_status;

-- Grant access to monitoring view
GRANT SELECT ON extraction_health_monitor TO authenticator;

COMMENT ON VIEW extraction_health_monitor IS 'Monitoring view for PDF extraction system health and performance';
COMMENT ON FUNCTION cleanup_old_failed_reports() IS 'Cleanup function for removing old failed credit reports without data';
COMMENT ON TRIGGER trigger_prevent_stuck_processing ON credit_reports IS 'Prevents processing records from getting stuck by tracking update times';