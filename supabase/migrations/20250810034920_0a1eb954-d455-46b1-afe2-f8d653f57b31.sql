-- Pipeline support migration: categories, payload, indexes, uniques
-- 1) Ensure collected_at on raw table
ALTER TABLE public.credit_reports_raw
ADD COLUMN IF NOT EXISTS collected_at timestamptz;

-- 2) Add missing columns on normalized accounts
ALTER TABLE public.normalized_credit_accounts
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS payload jsonb;

-- 3) Indexes for fast access
CREATE INDEX IF NOT EXISTS idx_ncr_user_collected ON public.normalized_credit_reports (user_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_ncs_user_bureau ON public.normalized_credit_scores (user_id, bureau);
CREATE INDEX IF NOT EXISTS idx_ncs_user_collected ON public.normalized_credit_scores (user_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_nca_user_bureau ON public.normalized_credit_accounts (user_id, bureau);
CREATE INDEX IF NOT EXISTS idx_nca_user_category ON public.normalized_credit_accounts (user_id, category);
CREATE INDEX IF NOT EXISTS idx_nca_user_collected ON public.normalized_credit_accounts (user_id, collected_at DESC);

-- 4) Uniqueness for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uniq_nca_user_creditor_mask_bureau_opened_category
ON public.normalized_credit_accounts(user_id, creditor, account_number_mask, bureau, opened_on, category);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ncs_user_bureau_run
ON public.normalized_credit_scores(user_id, bureau, run_id);
