import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type CredentialsBody = {
  username: string;
  password: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // narrowed at runtime based on APP_ALLOWED_ORIGINS
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-csrf-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseAllowedOrigins() {
  const v = Deno.env.get("APP_ALLOWED_ORIGINS") || "";
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

function checkOrigin(req: Request, headers: Headers): boolean {
  const allowed = parseAllowedOrigins();
  const origin = req.headers.get("Origin");
  if (!allowed.length) {
    // No allowlist configured: allow any origin (defaults to *)
    headers.set("Access-Control-Allow-Origin", "*");
    return true;
  }
  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    return true;
  }
  return false;
}

function requireHttps(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto") || (new URL(req.url)).protocol.replace(":", "");
  return proto === "https";
}

function requireCsrf(req: Request) {
  const token = req.headers.get("x-csrf-token");
  return !!(token && token.length >= 8);
}

function decodeB64(b64: string): Uint8Array {
  const binStr = atob(b64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  return bytes;
}
function encodeB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function importKeyFromSecret(): Promise<CryptoKey> {
  const b64 = Deno.env.get("SMART_CREDIT_KMS_KEY");
  if (!b64) throw new Error("Missing SMART_CREDIT_KMS_KEY");
  const raw = decodeB64(b64);
  if (raw.byteLength !== 32) throw new Error("SMART_CREDIT_KMS_KEY must be 32 bytes (base64-encoded)");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encryptPlaintext(plaintext: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc));
  return { ivB64: encodeB64(iv), ctB64: encodeB64(ct) };
}

async function decryptCipher(ivB64: string, ctB64: string, key: CryptoKey) {
  const iv = decodeB64(ivB64);
  const ct = decodeB64(ctB64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// naive per-instance RL memory (best-effort)
const rlMap = new Map<string, { count: number; windowStart: number }>();
function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const slot = rlMap.get(key);
  if (!slot || now - slot.windowStart > windowMs) {
    rlMap.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (slot.count < limit) {
    slot.count += 1;
    return true;
  }
  return false;
}

serve(async (req: Request) => {
  const headers = new Headers(corsHeaders);
  if (req.method === "OPTIONS") {
    checkOrigin(req, headers);
    return new Response(null, { headers });
  }

  // Enforce HTTPS, CORS, and CSRF
  if (!requireHttps(req)) {
    return new Response(JSON.stringify({ error: "HTTPS required" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
  }
  if (!checkOrigin(req, headers)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: { ...headers, "Content-Type": "application/json" } });
  }
  if (!requireCsrf(req)) {
    return new Response(JSON.stringify({ error: "Missing CSRF header" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
  }

  const url = new URL(req.url);
  const pathname = url.pathname; // .../functions/v1/integrations-smart-credit(/credentials|/credentials/verify)
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabaseAuth = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: auth } = await supabaseAuth.auth.getUser();
  if (!auth?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  const userId = auth.user.id;
  const ip = req.headers.get("x-forwarded-for") || "unknown";

  // Basic rate limits (per instance): 10 ops / 30s per user+ip
  if (!rateLimit(`creds:${userId}:${ip}`, 10, 30_000)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...headers, "Content-Type": "application/json" } });
  }

  try {
    if (req.method === "POST" && pathname.endsWith("/credentials")) {
      const body = (await req.json().catch(() => ({}))) as Partial<CredentialsBody>;
      const username = String(body.username || "").trim();
      const password = String(body.password || "").trim();

      if (!username || !password) {
        return new Response(JSON.stringify({ error: "username and password are required" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
      }

      const key = await importKeyFromSecret();
      const userEnc = await encryptPlaintext(username, key);
      const passEnc = await encryptPlaintext(password, key);

      // throttle frequent updates based on last updated_at (min 3s)
      const { data: existing } = await supabaseAdmin
        .from("smart_credit_credentials")
        .select("updated_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (existing?.updated_at) {
        const last = new Date(existing.updated_at).getTime();
        if (Date.now() - last < 3000) {
          return new Response(JSON.stringify({ error: "Please wait a few seconds before updating again" }), { status: 429, headers: { ...headers, "Content-Type": "application/json" } });
        }
      }

      const { error } = await supabaseAdmin
        .from("smart_credit_credentials")
        .upsert({
          user_id: userId,
          username_enc: userEnc.ctB64, // bytea expects base64 string via PostgREST
          password_enc: passEnc.ctB64,
          iv: userEnc.ivB64, // store IV for username; AES-GCM IV reuse is avoided because we use separate IVs; we also embed IV separately for password by reusing password_enc IV in payload below
          key_version: 1,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (error) {
        console.error("smart-credit save creds error:", error);
        return new Response(JSON.stringify({ error: "Failed to save credentials" }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
      }

      // Store password IV separately by updating iv column to include both IVs as JSON? Our schema has single iv column.
      // To keep schema simple, we will derive password plaintext by re-encrypting using the single IV strategy per field not possible.
      // Approach: encode both IVs concatenated. First 12 bytes username IV + next 12 bytes password IV, base64-joined with ":".
      const combinedIV = `${userEnc.ivB64}:${passEnc.ivB64}`;
      const { error: ivUpdateErr } = await supabaseAdmin
        .from("smart_credit_credentials")
        .update({ iv: combinedIV })
        .eq("user_id", userId);

      if (ivUpdateErr) {
        console.warn("Failed to update combined IV, but credentials saved. err:", ivUpdateErr);
      }

      const savedAt = new Date().toISOString();
      return new Response(JSON.stringify({ ok: true, savedAt, redacted: { username: "******" } }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
    }

    if (req.method === "POST" && pathname.endsWith("/credentials/verify")) {
      // decrypt-only verification
      const key = await importKeyFromSecret();

      const { data: row, error: getErr } = await supabaseAdmin
        .from("smart_credit_credentials")
        .select("username_enc, password_enc, iv, updated_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (getErr) {
        console.error("smart-credit get creds error:", getErr);
        return new Response(JSON.stringify({ error: "Failed to load credentials" }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
      }
      if (!row) {
        return new Response(JSON.stringify({ ok: false, missing: true }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
      }

      const [ivUserB64, ivPassB64] = String(row.iv || "").split(":");
      if (!ivUserB64 || !ivPassB64) {
        return new Response(JSON.stringify({ error: "Corrupt credential record" }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
      }

      try {
        const userPlain = await decryptCipher(ivUserB64, row.username_enc as string, key);
        const passPlain = await decryptCipher(ivPassB64, row.password_enc as string, key);
        if (!userPlain || !passPlain) throw new Error("empty after decrypt");
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "decrypt_failed" }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ ok: true, savedAt: row.updated_at, redacted: { username: "******" } }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...headers, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("integrations-smart-credit error:", e?.message || e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
  }
});
