-- Smart Credit Import: landing zone for full rows from Browse.ai (24h TTL)

-- 1) Create table
CREATE TABLE IF NOT EXISTS public.smart_credit_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  list_key TEXT NOT NULL,
  item_index INTEGER,
  item JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 day')
);

-- 2) Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scir_run_id ON public.smart_credit_import_rows (run_id);
CREATE INDEX IF NOT EXISTS idx_scir_expires_at ON public.smart_credit_import_rows (expires_at);
CREATE INDEX IF NOT EXISTS idx_scir_list_key ON public.smart_credit_import_rows (list_key);
CREATE INDEX IF NOT EXISTS idx_scir_created_at ON public.smart_credit_import_rows (created_at);

-- 3) Enable RLS and Policies
ALTER TABLE public.smart_credit_import_rows ENABLE ROW LEVEL SECURITY;

-- SELECT policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'smart_credit_import_rows' 
      AND policyname = 'Users can view their own import rows'
  ) THEN
    CREATE POLICY "Users can view their own import rows"
      ON public.smart_credit_import_rows
      FOR SELECT
      USING (
        auth.uid() = (
          SELECT user_id FROM public.browseai_runs WHERE id = run_id
        )
      );
  END IF;
END$$;

-- INSERT policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'smart_credit_import_rows' 
      AND policyname = 'Users can insert their own import rows'
  ) THEN
    CREATE POLICY "Users can insert their own import rows"
      ON public.smart_credit_import_rows
      FOR INSERT
      WITH CHECK (
        auth.uid() = (
          SELECT user_id FROM public.browseai_runs WHERE id = run_id
        )
      );
  END IF;
END$$;

-- UPDATE policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'smart_credit_import_rows' 
      AND policyname = 'Users can update their own import rows'
  ) THEN
    CREATE POLICY "Users can update their own import rows"
      ON public.smart_credit_import_rows
      FOR UPDATE
      USING (
        auth.uid() = (
          SELECT user_id FROM public.browseai_runs WHERE id = run_id
        )
      );
  END IF;
END$$;

-- DELETE policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'smart_credit_import_rows' 
      AND policyname = 'Users can delete their own import rows'
  ) THEN
    CREATE POLICY "Users can delete their own import rows"
      ON public.smart_credit_import_rows
      FOR DELETE
      USING (
        auth.uid() = (
          SELECT user_id FROM public.browseai_runs WHERE id = run_id
        )
      );
  END IF;
END$$;

-- 4) Cleanup function (like smart_credit_import_events)
CREATE OR REPLACE FUNCTION public.cleanup_expired_import_rows()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.smart_credit_import_rows WHERE expires_at < now();
END;
$$;
