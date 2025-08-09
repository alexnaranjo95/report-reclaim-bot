-- Create secure storage table for Smart Credit credentials
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

-- Enable Row Level Security (no SELECT policy to block client reads)
ALTER TABLE public.smart_credit_credentials ENABLE ROW LEVEL SECURITY;

-- Optional granular policies can be added later; default denies all.
-- We intentionally do not add SELECT/INSERT/UPDATE/DELETE policies so only service-role can access.

-- Trigger to maintain updated_at
DROP TRIGGER IF EXISTS trg_update_scc_updated_at ON public.smart_credit_credentials;
CREATE TRIGGER trg_update_scc_updated_at
BEFORE UPDATE ON public.smart_credit_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.smart_credit_credentials IS 'Encrypted, server-only storage for Smart Credit credentials (AES-GCM). Access restricted to edge functions with service role.';