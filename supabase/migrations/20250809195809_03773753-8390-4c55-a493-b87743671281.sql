-- Smart Credit rebuild schema
-- Create tables if not exist and add RLS + indexes

-- 1) smart_credit_imports
CREATE TABLE IF NOT EXISTS public.smart_credit_imports (
  run_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'starting',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NULL,
  rows INTEGER NOT NULL DEFAULT 0,
  task_id TEXT NULL,
  job_id TEXT NULL
);

-- Enable RLS
ALTER TABLE public.smart_credit_imports ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='smart_credit_imports' AND policyname='Users can view their own imports'
  ) THEN
    CREATE POLICY "Users can view their own imports" ON public.smart_credit_imports
    FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='smart_credit_imports' AND policyname='Users can insert their own imports'
  ) THEN
    CREATE POLICY "Users can insert their own imports" ON public.smart_credit_imports
    FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='smart_credit_imports' AND policyname='Users can update their own imports'
  ) THEN
    CREATE POLICY "Users can update their own imports" ON public.smart_credit_imports
    FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='smart_credit_imports' AND policyname='Users can delete their own imports'
  ) THEN
    CREATE POLICY "Users can delete their own imports" ON public.smart_credit_imports
    FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_sci_user_started_at ON public.smart_credit_imports (user_id, started_at DESC);

-- 2) smart_credit_items
CREATE TABLE IF NOT EXISTS public.smart_credit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  run_id UUID NOT NULL,
  source TEXT NOT NULL,
  item_type TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  merchant TEXT NOT NULL,
  memo TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.smart_credit_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='smart_credit_items' AND indexname='idx_sci_user_posted_at'
  ) THEN
    CREATE INDEX idx_sci_user_posted_at ON public.smart_credit_items (user_id, posted_at DESC);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='smart_credit_items' AND indexname='idx_sci_run_id'
  ) THEN
    CREATE INDEX idx_sci_run_id ON public.smart_credit_items (run_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='uq_sci_dedupe'
  ) THEN
    ALTER TABLE public.smart_credit_items
    ADD CONSTRAINT uq_sci_dedupe UNIQUE (user_id, source, item_type, posted_at, amount, merchant);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='smart_credit_items' AND policyname='Users can view their own items'
  ) THEN
    CREATE POLICY "Users can view their own items" ON public.smart_credit_items
    FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='smart_credit_items' AND policyname='Users can insert their own items'
  ) THEN
    CREATE POLICY "Users can insert their own items" ON public.smart_credit_items
    FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='smart_credit_items' AND policyname='Users can update their own items'
  ) THEN
    CREATE POLICY "Users can update their own items" ON public.smart_credit_items
    FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='smart_credit_items' AND policyname='Users can delete their own items'
  ) THEN
    CREATE POLICY "Users can delete their own items" ON public.smart_credit_items
    FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3) smart_credit_import_events (for SSE)
CREATE TABLE IF NOT EXISTS public.smart_credit_import_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL,
  step TEXT NULL,
  message TEXT NULL,
  progress INTEGER NULL,
  metrics JSONB NULL,
  sample JSONB NULL,
  payload JSONB NULL,
  expires_at TIMESTAMPTZ NULL
);

ALTER TABLE public.smart_credit_import_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='smart_credit_import_events' AND indexname='idx_scie_run_ts'
  ) THEN
    CREATE INDEX idx_scie_run_ts ON public.smart_credit_import_events (run_id, ts);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='smart_credit_import_events' AND policyname='Users can view their run events'
  ) THEN
    CREATE POLICY "Users can view their run events" ON public.smart_credit_import_events
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.smart_credit_imports i
        WHERE i.run_id = smart_credit_import_events.run_id AND i.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- 4) smart_credit_credentials for encrypted storage
CREATE TABLE IF NOT EXISTS public.smart_credit_credentials (
  user_id UUID PRIMARY KEY,
  username_enc BYTEA NOT NULL,
  password_enc BYTEA NOT NULL,
  iv BYTEA NOT NULL,
  iv_user TEXT NOT NULL,
  iv_pass TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.smart_credit_credentials ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='smart_credit_credentials' AND policyname='Users can view their own smart credit credentials'
  ) THEN
    CREATE POLICY "Users can view their own smart credit credentials" ON public.smart_credit_credentials
    FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='smart_credit_credentials' AND policyname='Users can upsert their own smart credit credentials'
  ) THEN
    CREATE POLICY "Users can upsert their own smart credit credentials" ON public.smart_credit_credentials
    FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='smart_credit_credentials' AND policyname='Users can update their own smart credit credentials'
  ) THEN
    CREATE POLICY "Users can update their own smart credit credentials" ON public.smart_credit_credentials
    FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
