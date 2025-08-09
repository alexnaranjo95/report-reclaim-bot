import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", 
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseAllowedOrigins() {
  const v = Deno.env.get("APP_ALLOWED_ORIGINS") || "";
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

function setCors(req: Request, headers: Headers) {
  const allowed = parseAllowedOrigins();
  const origin = req.headers.get("Origin");
  if (!allowed.length) {
    headers.set("Access-Control-Allow-Origin", "*");
  } else if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
}

// Strict schema validation
function validateCredentials(body: any): { username?: string; password?: string; errors: string[] } {
  const errors: string[] = [];
  let username: string | undefined;
  let password: string | undefined;

  if (!body || typeof body !== "object") {
    errors.push("Invalid request body");
    return { errors };
  }

  // Username validation
  if (typeof body.username !== "string") {
    errors.push("Username must be a string");
  } else {
    username = body.username.trim();
    if (username.length < 3) errors.push("Username must be at least 3 characters");
    if (username.length > 128) errors.push("Username must not exceed 128 characters");
  }

  // Password validation
  if (typeof body.password !== "string") {
    errors.push("Password must be a string");
  } else {
    password = body.password;
    if (password.length < 8) errors.push("Password must be at least 8 characters");
    if (password.length > 256) errors.push("Password must not exceed 256 characters");
  }

  return { username, password, errors };
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
  if (raw.byteLength !== 32) throw new Error("SMART_CREDIT_KMS_KEY must be 32 bytes");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encryptPlaintext(plaintext: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc));
  return { ivB64: encodeB64(iv), ctB64: encodeB64(ct) };
}

serve(async (req: Request) => {
  const headers = new Headers(corsHeaders);
  setCors(req, headers);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, code: "E_METHOD_NOT_ALLOWED", message: "Only POST requests allowed" }),
      { status: 405, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  try {
    // Environment checks
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SMART_CREDIT_KMS_KEY = Deno.env.get("SMART_CREDIT_KMS_KEY");
    const APP_ALLOWED_ORIGINS = Deno.env.get("APP_ALLOWED_ORIGINS");

    if (!SMART_CREDIT_KMS_KEY || !APP_ALLOWED_ORIGINS) {
      console.error("CONFIG_MISSING: SMART_CREDIT_KMS_KEY or APP_ALLOWED_ORIGINS not set");
      return new Response(
        JSON.stringify({ ok: false, code: "E_CONFIG_MISSING", message: "Server configuration incomplete" }),
        { status: 503, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // CORS validation
    const allowed = parseAllowedOrigins();
    const origin = req.headers.get("Origin");
    if (allowed.length && (!origin || !allowed.includes(origin))) {
      return new Response(
        JSON.stringify({ ok: false, code: "E_CORS", message: "Origin not allowed" }),
        { status: 403, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Auth check
    const supabaseAuth = createSupabaseClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });

    const { data: auth, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !auth?.user) {
      return new Response(
        JSON.stringify({ ok: false, code: "E_AUTH_REQUIRED", message: "Authentication required" }),
        { status: 401, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate request body
    const body = await req.json().catch(() => null);
    const { username, password, errors } = validateCredentials(body);

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ ok: false, code: "E_SCHEMA_INVALID", message: errors.join(", ") }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // Encrypt credentials
    let key: CryptoKey;
    try {
      key = await importKeyFromSecret();
    } catch (e) {
      console.error("KMS key error:", e);
      return new Response(
        JSON.stringify({ ok: false, code: "E_KMS_KEY", message: "Encryption key error" }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    const userEnc = await encryptPlaintext(username!, key);
    const passEnc = await encryptPlaintext(password!, key);

    // Atomic upsert
    const supabaseAdmin = createSupabaseClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const { error: upsertError } = await supabaseAdmin
      .from("smart_credit_credentials")
      .upsert({
        user_id: auth.user.id,
        username_enc: userEnc.ctB64,
        password_enc: passEnc.ctB64,
        iv_user: userEnc.ivB64,
        iv_pass: passEnc.ivB64,
        key_version: 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("DB upsert error:", upsertError);
      return new Response(
        JSON.stringify({ ok: false, code: "E_DB_UPSERT", message: "Failed to save credentials" }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    const savedAt = new Date().toISOString();
    return new Response(
      JSON.stringify({ ok: true, savedAt }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
    );

  } catch (e: any) {
    console.error("Internal error:", e);
    return new Response(
      JSON.stringify({ ok: false, code: "E_INTERNAL", message: "Internal server error" }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
});