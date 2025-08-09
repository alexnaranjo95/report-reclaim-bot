
-- 1) Credentials: add separate IV columns for AES-GCM (username/password)
ALTER TABLE public.smart_credit_credentials
  ADD COLUMN IF NOT EXISTS iv_user text,
  ADD COLUMN IF NOT EXISTS iv_pass text;

COMMENT ON COLUMN public.smart_credit_credentials.iv_user IS 'Base64 IV used for username_enc';
COMMENT ON COLUMN public.smart_credit_credentials.iv_pass IS 'Base64 IV used for password_enc';

-- 2) Imports: add lifecycle timestamps and unified row counter
ALTER TABLE public.smart_credit_imports
  ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS rows integer NOT NULL DEFAULT 0;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_sci_run_id ON public.smart_credit_imports(run_id);
CREATE INDEX IF NOT EXISTS idx_sci_user_started_at ON public.smart_credit_imports(user_id, started_at DESC);

-- 3) Items: columns to support deterministic upsert on natural key
ALTER TABLE public.smart_credit_items
  ADD COLUMN IF NOT EXISTS posted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS amount numeric,
  ADD COLUMN IF NOT EXISTS merchant text,
  ADD COLUMN IF NOT EXISTS item_type text,
  ADD COLUMN IF NOT EXISTS source text;

-- Unique natural key for idempotency (note: NULLs break uniqueness by design; posted_at is NOT NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_sci_natural_key'
  ) THEN
    CREATE UNIQUE INDEX uq_sci_natural_key
      ON public.smart_credit_items (user_id, posted_at, amount, merchant, item_type, source);
  END IF;
END $$;

-- Read performance
CREATE INDEX IF NOT EXISTS idx_sci_items_user_posted_at ON public.smart_credit_items(user_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_sci_items_run_id ON public.smart_credit_items(run_id);

-- 4) Events: retarget RLS from browseai_runs to smart_credit_imports
-- Ensure table exists and RLS is enabled (from prior migrations)
ALTER TABLE public.smart_credit_import_events ENABLE ROW LEVEL SECURITY;

-- Drop older policies if they referenced browseai_runs
DROP POLICY IF EXISTS "Users can view their own import events" ON public.smart_credit_import_events;
DROP POLICY IF EXISTS "Users can insert their own import events" ON public.smart_credit_import_events;
DROP POLICY IF EXISTS "Superadmins can manage import events" ON public.smart_credit_import_events;

-- View: users can see events tied to their runs in smart_credit_imports, or if superadmin
CREATE POLICY "Users can view their own import events"
ON public.smart_credit_import_events
FOR SELECT
TO authenticated
USING (
  (SELECT s.user_id FROM public.smart_credit_imports s WHERE s.run_id = smart_credit_import_events.run_id) = auth.uid()
  OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- Insert: allow inserts when user owns the run (service role bypasses RLS anyway)
CREATE POLICY "Users can insert their own import events"
ON public.smart_credit_import_events
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT s.user_id FROM public.smart_credit_imports s WHERE s.run_id = smart_credit_import_events.run_id) = auth.uid()
  OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- Optional restrictive superadmin-all policy (not required because service role bypasses RLS)
CREATE POLICY "Superadmins can manage import events"
ON public.smart_credit_import_events
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));
