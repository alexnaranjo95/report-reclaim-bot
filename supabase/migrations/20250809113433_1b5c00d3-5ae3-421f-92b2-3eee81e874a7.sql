
-- 1) Encrypted, server-only credentials storage (no client read access)
CREATE TABLE IF NOT EXISTS public.smart_credit_credentials (
  user_id uuid PRIMARY KEY,
  username_enc bytea NOT NULL,
  password_enc bytea NOT NULL,
  iv bytea NOT NULL,
  key_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_scc_profiles_user FOREIGN KEY (user_id)
    REFERENCES public.profiles(user_id) ON DELETE CASCADE
);

ALTER TABLE public.smart_credit_credentials ENABLE ROW LEVEL SECURITY;
-- Intentionally no RLS policies so that only service-role (edge functions) can access.

DROP TRIGGER IF EXISTS trg_update_scc_updated_at ON public.smart_credit_credentials;
CREATE TRIGGER trg_update_scc_updated_at
BEFORE UPDATE ON public.smart_credit_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.smart_credit_credentials IS
'Encrypted, server-only storage for Smart Credit credentials (AES-GCM). Access is restricted to edge functions with service role.';

-- 2) Track Smart Credit runs (summary/status level)
CREATE TABLE IF NOT EXISTS public.smart_credit_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  run_id uuid NOT NULL UNIQUE,
  task_id text,
  status text NOT NULL DEFAULT 'queued',
  runtime_sec integer,
  total_rows integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_sci_profiles_user FOREIGN KEY (user_id)
    REFERENCES public.profiles(user_id) ON DELETE CASCADE
);

ALTER TABLE public.smart_credit_imports ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own runs
DROP POLICY IF EXISTS "Users can view their smart credit imports" ON public.smart_credit_imports;
CREATE POLICY "Users can view their smart credit imports"
  ON public.smart_credit_imports
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Maintain updated_at
DROP TRIGGER IF EXISTS trg_update_sci_updated_at ON public.smart_credit_imports;
CREATE TRIGGER trg_update_sci_updated_at
BEFORE UPDATE ON public.smart_credit_imports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_sci_user_created_at
  ON public.smart_credit_imports (user_id, created_at DESC);

-- 3) Normalized items captured from Smart Credit (idempotent by composite key)
CREATE TABLE IF NOT EXISTS public.smart_credit_items (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  run_id uuid NOT NULL,
  list_key text,
  item_index integer NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_sci_items_profiles_user FOREIGN KEY (user_id)
    REFERENCES public.profiles(user_id) ON DELETE CASCADE
);

-- Optional FK to tie items to run_id stored in smart_credit_imports
-- (kept simple without ON DELETE for flexibility; delete via cascade at application level)
-- You can enable this if you want strict referential integrity:
-- ALTER TABLE public.smart_credit_items
--   ADD CONSTRAINT fk_sci_items_run
--   FOREIGN KEY (run_id) REFERENCES public.smart_credit_imports(run_id) ON DELETE CASCADE;

ALTER TABLE public.smart_credit_items ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own items
DROP POLICY IF EXISTS "Users can view their smart credit items" ON public.smart_credit_items;
CREATE POLICY "Users can view their smart credit items"
  ON public.smart_credit_items
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Idempotency: one logical row per (run_id, list_key, item_index)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_sci_run_list_index'
  ) THEN
    CREATE UNIQUE INDEX uq_sci_run_list_index
      ON public.smart_credit_items (run_id, COALESCE(list_key, ''), item_index);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sci_items_user_created_at
  ON public.smart_credit_items (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sci_items_run
  ON public.smart_credit_items (run_id, item_index);
