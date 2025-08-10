-- Purge Smart Credit and OCR vendor tables & helper functions (idempotent)
-- Drop helper functions that reference smart_credit_* tables
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cleanup_expired_import_events'
  ) THEN
    EXECUTE 'DROP FUNCTION public.cleanup_expired_import_events()';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cleanup_expired_import_rows'
  ) THEN
    EXECUTE 'DROP FUNCTION public.cleanup_expired_import_rows()';
  END IF;
END $$;

-- Drop Smart Credit and BrowseAI tables if they exist (cascades remove RLS, indexes, FKs)
DROP TABLE IF EXISTS public.smart_credit_import_events CASCADE;
DROP TABLE IF EXISTS public.smart_credit_import_rows CASCADE;
DROP TABLE IF EXISTS public.smart_credit_items CASCADE;
DROP TABLE IF EXISTS public.smart_credit_imports CASCADE;
DROP TABLE IF EXISTS public.smart_credit_credentials CASCADE;
DROP TABLE IF EXISTS public.browseai_runs CASCADE;
DROP TABLE IF EXISTS public.browseai_credentials CASCADE;