import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IngestBody {
  customer_id: string;
  round_no: number;
  source?: string;
  idempotency_key: string;
  raw: any;
  normalized?: any;
}

function json(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_ROLE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const body = (await req.json()) as IngestBody;
    if (!body || !body.customer_id || !body.idempotency_key || typeof body.round_no !== "number") {
      return json(400, { ok: false, error: "Missing required fields" });
    }
    if (body.round_no < 1 || body.round_no > 12) {
      return json(400, { ok: false, error: "round_no must be between 1 and 12" });
    }

    // 1) Upsert credit_rounds with idempotency
    const roundInsert = {
      customer_id: body.customer_id,
      round_no: body.round_no,
      status: "ingesting",
      source: body.source ?? "browse_ai",
      idempotency_key: body.idempotency_key,
      parser_version: "v1",
      error_info: null,
    };

    const { data: roundUpsert, error: roundErr } = await supabase
      .from("credit_rounds")
      .upsert(roundInsert, { onConflict: "idempotency_key" })
      .select("id, status, customer_id, round_no, idempotency_key")
      .single();

    if (roundErr || !roundUpsert) {
      console.error("[ingest-round] round upsert error", roundErr);
      return json(500, { ok: false, error: "Failed to upsert credit_round" });
    }

    const roundId = roundUpsert.id as string;

    // 2) Insert raw payload
    const { error: rawErr } = await supabase
      .from("raw_payloads")
      .insert({ credit_round_id: roundId, bureau: null, payload: body.raw });
    if (rawErr) {
      console.error("[ingest-round] raw insert error", rawErr);
    }

    // 3) Replace normalized children in a clean-slate way
    const normalized = body.normalized ?? {};

    // Delete children (tradeline history cascades when tradelines are deleted)
    const deleteTables = [
      "round_personal_identifiers",
      "round_addresses",
      "round_employers",
      "round_scores",
      "round_collections",
      "round_public_records",
      "round_inquiries",
      "round_tradelines", // history will cascade
    ];

    for (const table of deleteTables) {
      const { error } = await supabase.from(table).delete().eq("credit_round_id", roundId);
      if (error) console.warn(`[ingest-round] delete ${table} error`, error);
    }

    // Helpers
    const toDate = (v: any): string | null => {
      if (!v) return null;
      try {
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
      } catch {
        return null;
      }
    };

    // personal_identifiers (single or array)
    if (normalized.personal_identifiers) {
      const p = Array.isArray(normalized.personal_identifiers)
        ? normalized.personal_identifiers
        : [normalized.personal_identifiers];
      const rows = p.map((x: any) => ({
        credit_round_id: roundId,
        bureau: x.bureau ?? null,
        full_name: x.full_name ?? x.name ?? null,
        ssn_mask: x.ssn_mask ?? x.ssn ?? null,
        date_of_birth: toDate(x.date_of_birth ?? x.dob),
      }));
      if (rows.length) await supabase.from("round_personal_identifiers").insert(rows);
    }

    // addresses
    if (Array.isArray(normalized.addresses)) {
      const rows = normalized.addresses.map((x: any) => ({
        credit_round_id: roundId,
        bureau: x.bureau ?? null,
        street: x.street ?? x.address_line1 ?? x.address ?? null,
        city: x.city ?? null,
        state: x.state ?? null,
        postal_code: x.postal_code ?? x.zip ?? null,
        date_reported: toDate(x.date_reported),
      }));
      if (rows.length) await supabase.from("round_addresses").insert(rows);
    }

    // employers
    if (Array.isArray(normalized.employers)) {
      const rows = normalized.employers.map((x: any) => ({
        credit_round_id: roundId,
        bureau: x.bureau ?? null,
        employer_name: x.employer_name ?? x.name ?? null,
        occupation: x.occupation ?? null,
        date_reported: toDate(x.date_reported),
      }));
      if (rows.length) await supabase.from("round_employers").insert(rows);
    }

    // scores
    if (Array.isArray(normalized.scores)) {
      const rows = normalized.scores.map((x: any) => ({
        credit_round_id: roundId,
        bureau: x.bureau ?? null,
        model: x.model ?? null,
        score: typeof x.score === "number" ? x.score : null,
        date: toDate(x.date),
      }));
      if (rows.length) await supabase.from("round_scores").insert(rows);
    }

    // tradelines + history
    let bureausSeen = new Set<string>();
    if (Array.isArray(normalized.tradelines)) {
      const tlRows = normalized.tradelines.map((x: any) => {
        if (x.bureau) bureausSeen.add(String(x.bureau).toLowerCase());
        return {
          credit_round_id: roundId,
          bureau: x.bureau ?? null,
          account_uid: x.account_uid, // required per spec
          creditor: x.creditor ?? x.issuer ?? null,
          account_type: x.account_type ?? null,
          open_date: toDate(x.open_date),
          credit_limit: x.limit ?? x.credit_limit ?? null,
          balance: x.balance ?? null,
          status: x.status ?? null,
          payment_status: x.payment_status ?? null,
          remarks: Array.isArray(x.remarks) ? x.remarks : null,
          past_due: x.past_due ?? null,
          date_reported: toDate(x.date_reported),
        };
      });

      if (tlRows.length) {
        const { error: tlErr } = await supabase.from("round_tradelines").insert(tlRows);
        if (tlErr) console.error("[ingest-round] tradelines insert error", tlErr);

        // Fetch IDs to map history
        const accountUids = tlRows.map((r) => r.account_uid).filter(Boolean);
        const { data: existingTL, error: tlSelErr } = await supabase
          .from("round_tradelines")
          .select("id, account_uid, bureau")
          .eq("credit_round_id", roundId)
          .in("account_uid", accountUids);
        if (tlSelErr) console.error("[ingest-round] tradelines select error", tlSelErr);

        const tlIdByKey = new Map<string, string>();
        (existingTL ?? []).forEach((r: any) => tlIdByKey.set(`${r.bureau ?? ''}|${r.account_uid}`, r.id));

        const hist: any[] = [];
        for (const src of normalized.tradelines) {
          const key = `${src.bureau ?? ''}|${src.account_uid}`;
          const tlId = tlIdByKey.get(key);
          if (!tlId) continue;
          const items = Array.isArray(src.history) ? src.history : [];
          for (const h of items) {
            hist.push({
              tradeline_id: tlId,
              month: toDate(h.month),
              status_code: h.status_code ?? h.status ?? null,
              balance: h.balance ?? null,
              credit_limit: h.limit ?? h.credit_limit ?? null,
              payment: h.payment ?? null,
            });
          }
        }
        if (hist.length) {
          const { error: hErr } = await supabase.from("round_tradeline_history").insert(hist);
          if (hErr) console.error("[ingest-round] history insert error", hErr);
        }
      }
    }

    // collections
    if (Array.isArray(normalized.collections)) {
      const rows = normalized.collections.map((x: any) => ({
        credit_round_id: roundId,
        bureau: x.bureau ?? null,
        collection_agency: x.collection_agency ?? x.agency ?? null,
        original_creditor: x.original_creditor ?? null,
        amount: x.amount ?? null,
        date_assigned: toDate(x.date_assigned),
        status: x.status ?? null,
        account_number: x.account_number ?? null,
      }));
      if (rows.length) await supabase.from("round_collections").insert(rows);
    }

    // public records
    if (Array.isArray(normalized.public_records)) {
      const rows = normalized.public_records.map((x: any) => ({
        credit_round_id: roundId,
        bureau: x.bureau ?? null,
        record_type: x.type ?? null,
        amount: x.amount ?? null,
        filing_date: toDate(x.filing_date),
        status: x.status ?? null,
        reference_number: x.reference_number ?? null,
      }));
      if (rows.length) await supabase.from("round_public_records").insert(rows);
    }

    // inquiries
    if (Array.isArray(normalized.inquiries)) {
      const rows = normalized.inquiries.map((x: any) => ({
        credit_round_id: roundId,
        bureau: x.bureau ?? null,
        inquiry_date: toDate(x.date ?? x.inquiry_date),
        subscriber: x.subscriber ?? x.requestor ?? null,
        purpose: x.purpose ?? null,
        business_type: x.business_type ?? null,
      }));
      if (rows.length) await supabase.from("round_inquiries").insert(rows);
    }

    // Determine status
    if (Array.isArray(normalized.scores)) {
      for (const s of normalized.scores) if (s?.bureau) bureausSeen.add(String(s.bureau).toLowerCase());
    }
    const all = new Set(["equifax", "experian", "transunion"]);
    const missing = [...all].filter((b) => !bureausSeen.has(b));
    const status = missing.length === 0 ? "ready" : (bureausSeen.size > 0 ? "partial" : "ready");

    await supabase
      .from("credit_rounds")
      .update({ status, ingested_at: new Date().toISOString(), error_info: missing.length ? { missing_bureaus: missing } : null })
      .eq("id", roundId);

    console.log(`[ingest-round] Completed round ${roundUpsert.round_no} for customer ${roundUpsert.customer_id}, status=${status}`);
    return json(200, { ok: true, round_id: roundId, status });
  } catch (e) {
    console.error("[ingest-round] exception", e);
    return json(500, { ok: false, error: String(e) });
  }
});
