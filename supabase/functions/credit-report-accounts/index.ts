import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(res: unknown, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnon) return json({ error: "Missing Supabase config" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnon, { global: { headers: { Authorization: authHeader } } });

    // Support POST via invoke or GET via query
    const url = new URL(req.url);
    const isGet = req.method === "GET";
    const body = isGet ? {} : await req.json().catch(() => ({}));

    const category = (isGet ? url.searchParams.get("category") : body?.category) ?? null;
    const limit = Number((isGet ? url.searchParams.get("limit") : body?.limit) ?? 50);
    const cursor = (isGet ? url.searchParams.get("cursor") : body?.cursor) ?? null;

    if (!category) return json({ error: "category is required" }, 400);

    let query = supabase
      .from("normalized_credit_accounts")
      .select("*")
      .eq("category", category)
      .order("collected_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200));

    if (cursor) {
      query = query.lt("collected_at", cursor);
    }

    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);

    const nextCursor = data && data.length > 0 ? data[data.length - 1].collected_at : null;

    return json({ items: data ?? [], nextCursor });
  } catch (err) {
    console.error("credit-report-accounts error", err);
    return json({ error: (err as any)?.message || "Unexpected error" }, 500);
  }
});
