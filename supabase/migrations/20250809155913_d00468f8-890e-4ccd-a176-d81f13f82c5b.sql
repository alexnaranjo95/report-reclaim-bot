-- Create indexes and unique constraint for smart_credit_items and imports, only if tables exist
DO $$ BEGIN
  IF to_regclass('public.smart_credit_items') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sci_user_posted_at_desc ON public.smart_credit_items (user_id, posted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sci_run_id ON public.smart_credit_items (run_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_sci_dedupe ON public.smart_credit_items (user_id, posted_at, amount, merchant, item_type, source);
  END IF;
  IF to_regclass('public.smart_credit_imports') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_smart_credit_imports_run_id ON public.smart_credit_imports (run_id);
  END IF;
END $$;