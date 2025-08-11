-- 1) Roles enum for customer-specific access
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_role') THEN
    CREATE TYPE public.customer_role AS ENUM ('owner','admin','member');
  END IF;
END $$;

-- 2) Customers and mapping table
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.customer_role NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, user_id)
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_users ENABLE ROW LEVEL SECURITY;

-- Policies: customers visible to mapped users only
CREATE POLICY IF NOT EXISTS "Users can view their customers"
ON public.customers FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.customer_users cu
  WHERE cu.customer_id = customers.id AND cu.user_id = auth.uid()
));

-- Disallow inserts/updates/deletes by default for customers (managed via service/admin flows)

-- customer_users policies: users can see their own mappings
CREATE POLICY IF NOT EXISTS "Users can view their own customer mappings"
ON public.customer_users FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 3) Credit rounds core tables
CREATE TABLE IF NOT EXISTS public.credit_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  round_no INT NOT NULL CHECK (round_no BETWEEN 1 AND 12),
  status TEXT NOT NULL DEFAULT 'queued',
  source TEXT,
  ingested_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL UNIQUE,
  parser_version TEXT,
  error_info JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one active round per customer per round_no
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_round_per_customer
ON public.credit_rounds (customer_id, round_no)
WHERE deleted_at IS NULL;

-- trigger for updated_at
DROP TRIGGER IF EXISTS trg_update_credit_rounds_updated_at ON public.credit_rounds;
CREATE TRIGGER trg_update_credit_rounds_updated_at
BEFORE UPDATE ON public.credit_rounds
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.credit_rounds ENABLE ROW LEVEL SECURITY;

-- RLS: Access to rounds only if user mapped to the customer
CREATE POLICY IF NOT EXISTS "Users can view their credit rounds"
ON public.credit_rounds FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.customer_users cu
  WHERE cu.customer_id = credit_rounds.customer_id AND cu.user_id = auth.uid()
));

CREATE POLICY IF NOT EXISTS "Users can update their credit rounds"
ON public.credit_rounds FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.customer_users cu
  WHERE cu.customer_id = credit_rounds.customer_id AND cu.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.customer_users cu
  WHERE cu.customer_id = credit_rounds.customer_id AND cu.user_id = auth.uid()
));

CREATE POLICY IF NOT EXISTS "Users can insert rounds for their customers"
ON public.credit_rounds FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.customer_users cu
  WHERE cu.customer_id = credit_rounds.customer_id AND cu.user_id = auth.uid()
));

-- 4) Raw payloads
CREATE TABLE IF NOT EXISTS public.raw_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_round_id UUID NOT NULL REFERENCES public.credit_rounds(id) ON DELETE CASCADE,
  bureau TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.raw_payloads ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_raw_payloads_round ON public.raw_payloads(credit_round_id);

CREATE POLICY IF NOT EXISTS "Users can view raw payloads for their rounds"
ON public.raw_payloads FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.credit_rounds r
  JOIN public.customer_users cu ON cu.customer_id = r.customer_id
  WHERE r.id = raw_payloads.credit_round_id AND cu.user_id = auth.uid()
));

CREATE POLICY IF NOT EXISTS "Users can insert raw payloads for their rounds"
ON public.raw_payloads FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.credit_rounds r
  JOIN public.customer_users cu ON cu.customer_id = r.customer_id
  WHERE r.id = raw_payloads.credit_round_id AND cu.user_id = auth.uid()
));

-- 5) Normalized tables (prefixed with round_ to avoid name collisions)
CREATE TABLE IF NOT EXISTS public.round_personal_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_round_id UUID NOT NULL REFERENCES public.credit_rounds(id) ON DELETE CASCADE,
  bureau TEXT,
  full_name TEXT,
  ssn_mask TEXT,
  date_of_birth DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rpi_round ON public.round_personal_identifiers(credit_round_id);
ALTER TABLE public.round_personal_identifiers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.round_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_round_id UUID NOT NULL REFERENCES public.credit_rounds(id) ON DELETE CASCADE,
  bureau TEXT,
  street TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  date_reported DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_raddr_round ON public.round_addresses(credit_round_id);
ALTER TABLE public.round_addresses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.round_employers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_round_id UUID NOT NULL REFERENCES public.credit_rounds(id) ON DELETE CASCADE,
  bureau TEXT,
  employer_name TEXT,
  occupation TEXT,
  date_reported DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_remp_round ON public.round_employers(credit_round_id);
ALTER TABLE public.round_employers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.round_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_round_id UUID NOT NULL REFERENCES public.credit_rounds(id) ON DELETE CASCADE,
  bureau TEXT NOT NULL,
  model TEXT,
  score INT,
  date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rscore_round ON public.round_scores(credit_round_id);
ALTER TABLE public.round_scores ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.round_tradelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_round_id UUID NOT NULL REFERENCES public.credit_rounds(id) ON DELETE CASCADE,
  bureau TEXT,
  account_uid TEXT NOT NULL,
  creditor TEXT,
  account_type TEXT,
  open_date DATE,
  credit_limit NUMERIC,
  balance NUMERIC,
  status TEXT,
  payment_status TEXT,
  remarks TEXT[],
  past_due NUMERIC,
  date_reported DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (credit_round_id, bureau, account_uid)
);
CREATE INDEX IF NOT EXISTS idx_rtl_round ON public.round_tradelines(credit_round_id);
CREATE INDEX IF NOT EXISTS idx_rtl_round_bureau_uid ON public.round_tradelines(credit_round_id, bureau, account_uid);
ALTER TABLE public.round_tradelines ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.round_tradeline_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tradeline_id UUID NOT NULL REFERENCES public.round_tradelines(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  status_code TEXT,
  balance NUMERIC,
  credit_limit NUMERIC,
  payment NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tradeline_id, month)
);
CREATE INDEX IF NOT EXISTS idx_rtlh_tl ON public.round_tradeline_history(tradeline_id);
ALTER TABLE public.round_tradeline_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.round_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_round_id UUID NOT NULL REFERENCES public.credit_rounds(id) ON DELETE CASCADE,
  bureau TEXT,
  collection_agency TEXT,
  original_creditor TEXT,
  amount NUMERIC,
  date_assigned DATE,
  status TEXT,
  account_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rcoll_round ON public.round_collections(credit_round_id);
ALTER TABLE public.round_collections ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.round_public_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_round_id UUID NOT NULL REFERENCES public.credit_rounds(id) ON DELETE CASCADE,
  bureau TEXT,
  record_type TEXT,
  amount NUMERIC,
  filing_date DATE,
  status TEXT,
  reference_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rpr_round ON public.round_public_records(credit_round_id);
ALTER TABLE public.round_public_records ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.round_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_round_id UUID NOT NULL REFERENCES public.credit_rounds(id) ON DELETE CASCADE,
  bureau TEXT,
  inquiry_date DATE,
  subscriber TEXT,
  purpose TEXT,
  business_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rinq_round ON public.round_inquiries(credit_round_id);
ALTER TABLE public.round_inquiries ENABLE ROW LEVEL SECURITY;

-- Shared RLS policies for normalized tables: access if mapped to the round's customer
DO $$
DECLARE t TEXT; BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'round_personal_identifiers','round_addresses','round_employers','round_scores',
    'round_tradelines','round_tradeline_history','round_collections','round_public_records','round_inquiries'
  ])
  LOOP
    EXECUTE format('CREATE POLICY IF NOT EXISTS "Users can view %s for their rounds" ON public.%I FOR SELECT TO authenticated USING (
      CASE WHEN %I = ''round_tradeline_history'' THEN
        EXISTS (
          SELECT 1 FROM public.round_tradelines rtl
          JOIN public.credit_rounds r ON r.id = rtl.credit_round_id
          JOIN public.customer_users cu ON cu.customer_id = r.customer_id
          WHERE rtl.id = %I.tradeline_id AND cu.user_id = auth.uid() AND r.deleted_at IS NULL
        )
      ELSE
        EXISTS (
          SELECT 1 FROM public.credit_rounds r
          JOIN public.customer_users cu ON cu.customer_id = r.customer_id
          WHERE r.id = %I.credit_round_id AND cu.user_id = auth.uid() AND r.deleted_at IS NULL
        )
      END
    );', t, t, t, t, t);

    IF t <> 'round_tradeline_history' THEN
      EXECUTE format('CREATE POLICY IF NOT EXISTS "Users can insert %s for their rounds" ON public.%I FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.credit_rounds r
          JOIN public.customer_users cu ON cu.customer_id = r.customer_id
          WHERE r.id = %I.credit_round_id AND cu.user_id = auth.uid() AND r.deleted_at IS NULL
        )
      );', t, t, t);

      EXECUTE format('CREATE POLICY IF NOT EXISTS "Users can update %s for their rounds" ON public.%I FOR UPDATE TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.credit_rounds r
          JOIN public.customer_users cu ON cu.customer_id = r.customer_id
          WHERE r.id = %I.credit_round_id AND cu.user_id = auth.uid() AND r.deleted_at IS NULL
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.credit_rounds r
          JOIN public.customer_users cu ON cu.customer_id = r.customer_id
          WHERE r.id = %I.credit_round_id AND cu.user_id = auth.uid() AND r.deleted_at IS NULL
        )
      );', t, t, t, t);
    END IF;
  END LOOP;
END $$;

-- 6) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_rounds_customer_round_no ON public.credit_rounds(customer_id, round_no);

-- Note: Inserts/updates by Edge Functions will use the service role and bypass RLS as needed.
