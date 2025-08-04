-- Clean up corrupted credit report data
DELETE FROM credit_reports WHERE raw_text LIKE '%obj%' OR raw_text LIKE '%BT%' OR raw_text LIKE '%endobj%';
DELETE FROM personal_information WHERE full_name IS NULL AND date_of_birth IS NULL AND current_address IS NULL;
DELETE FROM credit_accounts WHERE creditor_name = '' OR creditor_name IS NULL;
DELETE FROM credit_inquiries WHERE inquirer_name = '' OR inquirer_name IS NULL;
DELETE FROM negative_items WHERE negative_type = '' OR negative_type IS NULL;