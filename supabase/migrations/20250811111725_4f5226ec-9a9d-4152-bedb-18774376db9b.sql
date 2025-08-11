-- Fix policy creation loop using %I for names and special-case tradeline_history
DO $$
DECLARE t TEXT; BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'round_personal_identifiers','round_addresses','round_employers','round_scores',
    'round_tradelines','round_tradeline_history','round_collections','round_public_records','round_inquiries'
  ])
  LOOP
    -- View policy
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=concat('Users can view ', t, ' for their rounds')
    ) THEN
      IF t = 'round_tradeline_history' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
          EXISTS (
            SELECT 1 FROM public.round_tradelines rtl
            JOIN public.credit_rounds r ON r.id = rtl.credit_round_id
            JOIN public.customer_users cu ON cu.customer_id = r.customer_id
            WHERE rtl.id = %I.tradeline_id AND cu.user_id = auth.uid() AND r.deleted_at IS NULL
          )
        );', concat('Users can view ', t, ' for their rounds'), t, t);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
          EXISTS (
            SELECT 1 FROM public.credit_rounds r
            JOIN public.customer_users cu ON cu.customer_id = r.customer_id
            WHERE r.id = %I.credit_round_id AND cu.user_id = auth.uid() AND r.deleted_at IS NULL
          )
        );', concat('Users can view ', t, ' for their rounds'), t, t);
      END IF;
    END IF;

    -- Insert and update policies for non-history tables
    IF t <> 'round_tradeline_history' THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=concat('Users can insert ', t, ' for their rounds')
      ) THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.credit_rounds r
            JOIN public.customer_users cu ON cu.customer_id = r.customer_id
            WHERE r.id = %I.credit_round_id AND cu.user_id = auth.uid() AND r.deleted_at IS NULL
          )
        );', concat('Users can insert ', t, ' for their rounds'), t, t);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=concat('Users can update ', t, ' for their rounds')
      ) THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (
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
        );', concat('Users can update ', t, ' for their rounds'), t, t, t);
      END IF;
    END IF;
  END LOOP;
END $$;