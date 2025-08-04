-- NUCLEAR RESET: Clear all credit report data (keep table structures)
DELETE FROM ai_analysis_results;
DELETE FROM collections;
DELETE FROM credit_accounts;
DELETE FROM credit_inquiries;
DELETE FROM negative_items;
DELETE FROM personal_information;
DELETE FROM public_records;
DELETE FROM credit_reports;

-- Clear any stored PDFs from storage (this will remove all files from the credit-reports bucket)
-- Note: This affects the storage.objects table, not a custom table
DELETE FROM storage.objects WHERE bucket_id = 'credit-reports';