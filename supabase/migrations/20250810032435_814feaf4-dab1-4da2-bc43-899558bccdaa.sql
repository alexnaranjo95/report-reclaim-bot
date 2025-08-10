-- Create tables for raw and normalized credit reports and derived normalized tables
-- 1) Raw BrowseAI payload storage
CREATE TABLE IF NOT EXISTS public.credit_reports_raw (
  run_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  raw_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_reports_raw ENABLE ROW LEVEL SECURITY;

-- RLS: users can manage their own raw records
CREATE POLICY IF NOT EXISTS "Users can view their own raw reports"
ON public.credit_reports_raw
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert their own raw reports"
ON public.credit_reports_raw
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update their own raw reports"
ON public.credit_reports_raw
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete their own raw reports"
ON public.credit_reports_raw
FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_credit_reports_raw_user_run ON public.credit_reports_raw (user_id, run_id);

-- 2) Normalized report storage
CREATE TABLE IF NOT EXISTS public.normalized_credit_reports (
  run_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  collected_at timestamptz,
  version text NOT NULL DEFAULT 'v1',
  report_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.normalized_credit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own normalized reports"
ON public.normalized_credit_reports
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert their own normalized reports"
ON public.normalized_credit_reports
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update their own normalized reports"
ON public.normalized_credit_reports
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete their own normalized reports"
ON public.normalized_credit_reports
FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_normalized_credit_reports_user_run ON public.normalized_credit_reports (user_id, run_id);

CREATE TRIGGER set_normalized_credit_reports_updated_at
BEFORE UPDATE ON public.normalized_credit_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Derived: normalized credit scores
CREATE TABLE IF NOT EXISTS public.normalized_credit_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  run_id text NOT NULL,
  bureau text NOT NULL,
  score integer,
  status text,
  position integer,
  collected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, run_id, bureau, position)
);

ALTER TABLE public.normalized_credit_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own normalized scores"
ON public.normalized_credit_scores
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert their own normalized scores"
ON public.normalized_credit_scores
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update their own normalized scores"
ON public.normalized_credit_scores
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete their own normalized scores"
ON public.normalized_credit_scores
FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_normalized_credit_scores_user_run ON public.normalized_credit_scores (user_id, run_id);

CREATE TRIGGER set_normalized_credit_scores_updated_at
BEFORE UPDATE ON public.normalized_credit_scores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Derived: normalized credit accounts
CREATE TABLE IF NOT EXISTS public.normalized_credit_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  run_id text NOT NULL,
  bureau text,
  creditor text,
  account_number_mask text,
  opened_on date,
  reported_on date,
  last_activity_on date,
  balance numeric,
  high_balance numeric,
  credit_limit numeric,
  closed_on date,
  account_status text,
  payment_status text,
  dispute_status text,
  past_due numeric,
  payment_amount numeric,
  last_payment_on date,
  term_length_months integer,
  account_type text,
  payment_frequency text,
  account_rating text,
  description text,
  remarks jsonb DEFAULT '[]'::jsonb,
  two_year_history jsonb DEFAULT '{}'::jsonb,
  days_late_7y jsonb DEFAULT '{}'::jsonb,
  status text,
  position integer,
  collected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, bureau, creditor, account_number_mask, opened_on)
);

ALTER TABLE public.normalized_credit_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own normalized accounts"
ON public.normalized_credit_accounts
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert their own normalized accounts"
ON public.normalized_credit_accounts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update their own normalized accounts"
ON public.normalized_credit_accounts
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete their own normalized accounts"
ON public.normalized_credit_accounts
FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_normalized_credit_accounts_user_run ON public.normalized_credit_accounts (user_id, run_id);
CREATE INDEX IF NOT EXISTS idx_normalized_credit_accounts_composite ON public.normalized_credit_accounts (user_id, bureau, creditor, account_number_mask, opened_on);

CREATE TRIGGER set_normalized_credit_accounts_updated_at
BEFORE UPDATE ON public.normalized_credit_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();