-- Add unique constraint to normalized_credit_accounts to support upserts
ALTER TABLE normalized_credit_accounts 
ADD CONSTRAINT normalized_credit_accounts_unique 
UNIQUE (user_id, run_id, account_number_mask, creditor, bureau);

-- Add index for better performance on lookups
CREATE INDEX IF NOT EXISTS idx_normalized_credit_accounts_user_run 
ON normalized_credit_accounts (user_id, run_id);

-- Add index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_normalized_credit_accounts_category 
ON normalized_credit_accounts (user_id, category, account_status);