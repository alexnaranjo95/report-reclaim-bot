import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "*",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, role = "user", displayName, adminUserId } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const allowedRoles = ["user", "admin", "superadmin"] as const;
    if (!allowedRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with end-user JWT to identify requester
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    // Admin client for privileged operations
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Identify requester
    const { data: authData } = await supabaseUser.auth.getUser();
    const requesterId = authData?.user?.id;

    // Optional check to ensure provided adminUserId matches token (defense in depth)
    if (adminUserId && requesterId && adminUserId !== requesterId) {
      return new Response(JSON.stringify({ error: "Requester mismatch" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const checkId = requesterId ?? adminUserId;
    if (!checkId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // Verify superadmin role
    const { data: roleRows, error: roleErr } = await supabaseAdmin.rpc("get_user_roles", { _user_id: checkId });
    if (roleErr) throw roleErr;
    const roles: string[] = (roleRows || []).map((r: any) => r.role);
    if (!roles.includes("superadmin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    // Idempotent: check if user already exists
    const { data: existingUser, error: getUserErr } = await supabaseAdmin.auth.admin.getUserByEmail(email);
    if (getUserErr && getUserErr.message && !getUserErr.message.includes("User not found")) {
      console.warn("getUserByEmail warning", getUserErr);
    }

    let userId: string | null = existingUser?.user?.id ?? null;
    let created = false;

    if (!userId) {
      // Create the user without sending invite to avoid SMTP dependency
      const tempPassword = crypto.randomUUID() + "!Aa1"; // temporary strong password
      const { data: createRes, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: false,
        user_metadata: { display_name: displayName ?? null },
      });
      if (createErr) {
        // If create failed but user exists now, proceed (rare race)
        console.error("createUser error", createErr);
        return new Response(JSON.stringify({ error: createErr.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }
      userId = createRes.user.id;
      created = true;
    }

    // Upsert profile
    const { error: profileErr } = await supabaseAdmin.rpc("upsert_user_profile", {
      profile_user_id: userId,
      profile_email: email,
      profile_phone_number: null,
      profile_email_notifications: true,
      profile_text_notifications: false,
      profile_display_name: displayName ?? email,
      profile_verification_documents: null,
      profile_full_name: null,
      profile_address_line1: null,
      profile_city: null,
      profile_state: null,
      profile_postal_code: null,
      profile_organization_id: null,
      profile_organization_name: null,
    });
    if (profileErr) throw profileErr;

    // Assign role (idempotent)
    const { error: roleUpsertErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
    if (roleUpsertErr) throw roleUpsertErr;

    return new Response(
      JSON.stringify({ success: true, userId, created, role }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (e: any) {
    console.error("admin-create-user error", e);
    // Always return 200 with error info unless truly unrecoverable? For admin create, return 400/500
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
