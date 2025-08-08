-- Create table to securely store (encrypted) Browse.ai credentials per user
CREATE TABLE IF NOT EXISTS public.browseai_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_ciphertext TEXT NOT NULL,
  password_iv TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT browseai_credentials_user_unique UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.browseai_credentials ENABLE ROW LEVEL SECURITY;

-- Policies: user can manage only their own credentials
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'browseai_credentials' AND policyname = 'Users can insert their own browseai credentials'
  ) THEN
    CREATE POLICY "Users can insert their own browseai credentials"
    ON public.browseai_credentials
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'browseai_credentials' AND policyname = 'Users can view their own browseai credentials'
  ) THEN
    CREATE POLICY "Users can view their own browseai credentials"
    ON public.browseai_credentials
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'browseai_credentials' AND policyname = 'Users can update their own browseai credentials'
  ) THEN
    CREATE POLICY "Users can update their own browseai credentials"
    ON public.browseai_credentials
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'browseai_credentials' AND policyname = 'Users can delete their own browseai credentials'
  ) THEN
    CREATE POLICY "Users can delete their own browseai credentials"
    ON public.browseai_credentials
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.update_browseai_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

DROP TRIGGER IF EXISTS trg_update_browseai_credentials_updated_at ON public.browseai_credentials;
CREATE TRIGGER trg_update_browseai_credentials_updated_at
BEFORE UPDATE ON public.browseai_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_browseai_credentials_updated_at();