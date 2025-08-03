-- Manually trigger extraction for the pending report
UPDATE credit_reports 
SET extraction_status = 'processing'
WHERE id = 'c5a4e682-8175-45f4-9247-94dda211a07e';