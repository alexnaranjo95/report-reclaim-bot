-- Create events table for Smart Credit Import Monitor
CREATE TABLE IF NOT EXISTS public.smart_credit_import_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.browseai_runs(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('init','step','data:snapshot','metric','warn','error','done','heartbeat')),
  step TEXT,
  message TEXT,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  progress INTEGER CHECK (progress >= 0 AND progress <= 100),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample JSONB,
  payload JSONB,
  level TEXT NOT NULL DEFAULT 'info',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_smart_import_events_run_ts ON public.smart_credit_import_events (run_id, ts);
CREATE INDEX IF NOT EXISTS idx_smart_import_events_expires ON public.smart_credit_import_events (expires_at);

-- Enable RLS
ALTER TABLE public.smart_credit_import_events ENABLE ROW LEVEL SECURITY;

-- Policies: users can view/insert their own run events (or superadmin)
DROP POLICY IF EXISTS "Users can view their own import events" ON public.smart_credit_import_events;
CREATE POLICY "Users can view their own import events"
ON public.smart_credit_import_events
FOR SELECT
USING (
  auth.uid() = (
    SELECT user_id FROM public.browseai_runs r WHERE r.id = smart_credit_import_events.run_id
  ) OR has_role(auth.uid(), 'superadmin'::app_role)
);

DROP POLICY IF EXISTS "Users can insert their own import events" ON public.smart_credit_import_events;
CREATE POLICY "Users can insert their own import events"
ON public.smart_credit_import_events
FOR INSERT
WITH CHECK (
  auth.uid() = (
    SELECT user_id FROM public.browseai_runs r WHERE r.id = smart_credit_import_events.run_id
  ) OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- Cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_expired_import_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.smart_credit_import_events WHERE expires_at < now();
END;
$$;