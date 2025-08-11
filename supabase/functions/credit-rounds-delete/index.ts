import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { id, remove_raw } = await req.json();
    if (!id) return json(400, { ok: false, error: "Missing id" });

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_ROLE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Soft-delete round and purge normalized children
    const deletedAt = new Date().toISOString();

    const { error: updErr } = await supabase
      .from("credit_rounds")
      .update({ status: "deleted", deleted_at: deletedAt })
      .eq("id", id);
    if (updErr) {
      console.error("[round-delete] update error", updErr);
      return json(500, { ok: false, error: "Failed to mark round deleted" });
    }

    const childTables = [
      "round_tradeline_history", // will be removed via cascade if we delete tradelines, but keep explicit for safety
      "round_tradelines",
      "round_personal_identifiers",
      "round_addresses",
      "round_employers",
      "round_scores",
      "round_collections",
      "round_public_records",
      "round_inquiries",
    ];

    // Delete tradeline history by joining on tradelines of this round
    const { data: tls } = await supabase
      .from("round_tradelines")
      .select("id")
      .eq("credit_round_id", id);
    const tlIds = (tls ?? []).map((r: any) => r.id);
    if (tlIds.length) {
      await supabase.from("round_tradeline_history").delete().in("tradeline_id", tlIds);
    }

    for (const table of childTables.filter((t) => t !== "round_tradeline_history")) {
      const { error } = await supabase.from(table).delete().eq("credit_round_id", id);
      if (error) console.warn(`[round-delete] delete ${table} error`, error);
    }

    if (remove_raw) {
      await supabase.from("raw_payloads").delete().eq("credit_round_id", id);
    }

    console.log(`[round-delete] Soft-deleted round ${id}`);
    return json(200, { ok: true });
  } catch (e) {
    console.error("[round-delete] exception", e);
    return json(500, { ok: false, error: String(e) });
  }
});
