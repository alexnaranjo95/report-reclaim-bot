import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getCorsHeaders(req: Request) {
  const defaults = [
    "https://app.disputelab.io",
    "https://localhost:5173",
    "https://b05e793f-f8ba-43e5-8d44-abd5fb386f93.lovableproject.com",
  ];
  const envList = (Deno.env.get("APP_ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowed = envList.length ? envList : defaults;
  const origin = req.headers.get("origin") || "*";
  const allowOrigin = allowed.includes(origin) ? origin : "*";
  
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-role-key, x-device-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

const corsHeaders = getCorsHeaders({} as Request);

type IngestBody = {
  runId?: string;
  userId?: string;
  deviceId?: string;
  collectedAt?: string;
  payload?: any;
  dryRun?: boolean | number | string;
};

function json(res: unknown, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripHtml(input: any): { text: string | null; html: string | null } {
  if (input == null) return { text: null, html: null };
  const html = String(input);
  const text = html.replace(/<[^>]*>/g, "").trim();
  return { text, html };
}

function toDateISO(v?: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeMoney(v: any): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[^0-9.-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ code: "E_CONFIG", message: "Missing Supabase config" }, 500);
    }

    // Parse body first to allow public dryRun mode
    const body = (await req.json().catch(() => ({}))) as IngestBody;
    const runId = body.runId?.trim();
    const userId = body.userId?.trim();
    const deviceId = body.deviceId?.trim();
    const dryRun = body.dryRun === true || body.dryRun === 1 || body.dryRun === "1";
    
    // Use userId or deviceId as identifier
    const userIdentifier = userId || deviceId;

    // Enforce service role header for real ingests only
    if (!dryRun) {
      const providedServiceKey = req.headers.get("x-service-role-key");
      if (!providedServiceKey || providedServiceKey !== serviceKey) {
        return json({ code: "E_RLS_DENIED", message: "Service role required" }, 403);
      }
    }

    if (!dryRun && (!runId || !userIdentifier || !body.payload)) {
      return json({ code: "E_SCHEMA_INVALID", message: "runId, userId/deviceId and payload are required" }, 400);
    }

    const supabaseService = createClient(supabaseUrl, serviceKey);
    const collectedAt = toDateISO(body.collectedAt) ?? new Date().toISOString();

    console.log(`[ingest] Processing ${dryRun ? 'dry run' : 'real data'} for runId: ${runId || 'generated'}`);

    // Sample data path for dry run
    if (dryRun) {
      const sampleRunId = runId ?? `dry_${Date.now()}`;
      const sampleUserId = userIdentifier ?? crypto.randomUUID();

      console.log(`[ingest] Dry run mode - creating sample data for runId: ${sampleRunId}`);

      const sampleReport = {
        runId: sampleRunId,
        collectedAt,
        version: "v1",
        scores: [
          { bureau: "TransUnion", score: 712, status: "ACTIVE", position: 1 },
          { bureau: "Equifax", score: 705, status: "ACTIVE", position: 2 },
          { bureau: "Experian", score: 698, status: "ACTIVE", position: 3 },
        ],
        consumerStatements: [
          { bureau: "TransUnion", statement: null },
          { bureau: "Experian", statement: null },
          { bureau: "Equifax", statement: null },
        ],
        accounts: {
          realEstate: [
            {
              bureau: "TransUnion",
              creditor: "ABC Mortgage",
              account_number_mask: "****1234",
              opened_on: collectedAt,
              reported_on: collectedAt,
              balance: 250000,
              high_balance: 300000,
              credit_limit: null,
              past_due: 0,
              status: "Open",
              account_status: "Current",
              payment_status: "Pays as agreed",
              remarks: [],
              two_year_history: {},
              days_late_7y: { "30": 0, "60": 0, "90": 0 },
              position: 1,
              category: "realEstate",
            },
          ],
          revolving: [
            {
              bureau: "Experian",
              creditor: "XYZ Bank",
              account_number_mask: "****5678",
              opened_on: collectedAt,
              reported_on: collectedAt,
              balance: 450,
              high_balance: 1200,
              credit_limit: 2000,
              past_due: 0,
              status: "Open",
              account_status: "Current",
              payment_status: "Pays as agreed",
              remarks: ["No late payments"],
              two_year_history: {},
              days_late_7y: { "30": 0, "60": 0, "90": 0 },
              position: 1,
              category: "revolving",
            },
          ],
          other: [],
        },
        personalInformation: [
          {
            position: 1,
            status: "ACTIVE",
            fields: {
              name: "Sample User",
              address: "123 Sample St, Sample City, SC 12345",
              phone: "(555) 123-4567"
            }
          }
        ],
        inquiries: [],
        collections: [],
        publicRecords: [],
        creditorsAddresses: [],
        rawSections: {},
      };

      // Upsert raw payload
      const { error: rawError } = await supabaseService.from("credit_reports_raw").upsert({
        run_id: sampleRunId,
        user_id: sampleUserId,
        collected_at: collectedAt,
        raw_json: sampleReport,
      }, { onConflict: "run_id" });

      if (rawError) {
        console.error("[ingest] Raw upsert error:", rawError);
        return json({ code: "E_DB_UPSERT", message: rawError.message }, 500);
      }

      // Upsert normalized report
      await supabaseService.from("normalized_credit_reports").delete()
        .eq("run_id", sampleRunId).eq("user_id", sampleUserId);
      
      const { error: insRepErr } = await supabaseService.from("normalized_credit_reports").insert({
        run_id: sampleRunId,
        user_id: sampleUserId,
        collected_at: collectedAt,
        version: "v1",
        report_json: sampleReport,
      });

      if (insRepErr) {
        console.error("[ingest] Normalized report insert error:", insRepErr);
        return json({ code: "E_DB_UPSERT", message: insRepErr.message }, 500);
      }

      // Upsert scores
      const scoresRows = sampleReport.scores.map((s: any, i: number) => ({
        user_id: sampleUserId,
        run_id: sampleRunId,
        bureau: s.bureau,
        score: s.score,
        status: s.status,
        position: s.position ?? i + 1,
        collected_at: collectedAt,
      }));

      const { error: scErr } = await supabaseService
        .from("normalized_credit_scores")
        .upsert(scoresRows, { onConflict: "user_id,bureau,run_id" });

      if (scErr) {
        console.error("[ingest] Scores upsert error:", scErr);
      }

      // Upsert accounts
      const allAccounts: any[] = [
        ...sampleReport.accounts.realEstate,
        ...sampleReport.accounts.revolving,
        ...sampleReport.accounts.other,
      ];

      if (allAccounts.length) {
        const accRows = allAccounts.map((a: any) => ({
          user_id: sampleUserId,
          run_id: sampleRunId,
          bureau: a.bureau ?? null,
          creditor: a.creditor ?? null,
          account_number_mask: a.account_number_mask ?? null,
          opened_on: a.opened_on ? a.opened_on.substring(0, 10) : null,
          reported_on: a.reported_on ? a.reported_on.substring(0, 10) : null,
          last_activity_on: a.last_activity_on ? a.last_activity_on.substring(0, 10) : null,
          balance: a.balance,
          high_balance: a.high_balance,
          credit_limit: a.credit_limit,
          closed_on: a.closed_on ? a.closed_on.substring(0, 10) : null,
          account_status: a.account_status,
          payment_status: a.payment_status,
          dispute_status: a.dispute_status,
          past_due: a.past_due,
          payment_amount: a.payment_amount,
          last_payment_on: a.last_payment_on ? a.last_payment_on.substring(0, 10) : null,
          term_length_months: a.term_length_months,
          account_type: a.account_type,
          payment_frequency: a.payment_frequency,
          account_rating: a.account_rating,
          description: a.description,
          remarks: a.remarks || [],
          two_year_history: a.two_year_history || {},
          days_late_7y: a.days_late_7y || { "30": 0, "60": 0, "90": 0 },
          status: a.status,
          position: a.position,
          collected_at: collectedAt,
          category: a.category ?? null,
          payload: a,
        }));

        const { error: accErr } = await supabaseService
          .from("normalized_credit_accounts")
          .upsert(accRows, { onConflict: "user_id,creditor,account_number_mask,bureau,opened_on,category" });

        if (accErr) {
          console.error("[ingest] Accounts upsert error:", accErr);
        }
      }

      console.log(`[ingest] Dry run completed successfully for runId: ${sampleRunId}`);
      return json({ ok: true, runId: sampleRunId, normalized: true });
    }

    // Normal processing path
    const rawPayload = body.payload;

    // Basic validation
    if (typeof rawPayload !== "object") {
      return json({ code: "E_SCHEMA_INVALID", message: "payload must be an object" }, 400);
    }

    console.log(`[ingest] Processing real data for runId: ${runId}, userId: ${userIdentifier}`);

    // Persist raw payload
    try {
      const { error } = await supabaseService.from("credit_reports_raw").upsert(
        { run_id: runId!, user_id: userIdentifier!, collected_at: collectedAt, raw_json: rawPayload },
        { onConflict: "run_id" },
      );
      
      if (error) {
        console.error("[ingest] Raw upsert error:", error);
        return json({ code: "E_DB_UPSERT", message: error.message }, 500);
      }
      
      console.log("[ingest] Raw payload saved successfully");
    } catch (rawError) {
      console.error("[ingest] Raw upsert exception:", rawError);
      return json({ code: "E_DB_UPSERT", message: "Failed to save raw payload" }, 500);
    }

    // Normalize and structure the data
    let normalizedOk = true;
    const report = { 
      rawSections: rawPayload, 
      scores: [] as any[], 
      consumerStatements: [] as any[], 
      accounts: { realEstate: [] as any[], revolving: [] as any[], other: [] as any[] }, 
      inquiries: [] as any[], 
      collections: [] as any[], 
      addresses: [] as any[], 
      personalInformation: [] as any[]
    };

    try {
      // Parse BrowseAI capturedLists structure with prefix-safe matching
      const captured = rawPayload?.capturedLists || rawPayload?.items || rawPayload || {};

      // Process each captured list with prefix-safe matching
      for (const key of Object.keys(captured)) {
        const lowerKey = key.toLowerCase();
        const items = Array.isArray(captured[key]) ? captured[key] : [captured[key]];

        // Credit Scores
        if (lowerKey.includes("credit score")) {
          for (const item of items) {
            const rawText = String(item?.text || item?.html || item?.value || "");
            const bureauMatch = rawText.match(/experian|equifax|transunion/i);
            const bureau = bureauMatch ? bureauMatch[0] : "";
            const scoreMatch = rawText.match(/\b(\d{3})\b/);
            const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
            
            if (bureau && score) {
              report.scores.push({
                bureau: bureau.charAt(0).toUpperCase() + bureau.slice(1).toLowerCase(),
                score,
                status: item?._STATUS || "ACTIVE",
                position: item?.Position || report.scores.length + 1,
              });
            }
          }
        }
        // Consumer Statements (prefix: "Consumer Stateme")
        else if (lowerKey.startsWith("consumer stateme")) {
          for (const item of items) {
            const { text, html } = stripHtml(item?.statement || item?.text || item?.value || "");
            report.consumerStatements.push({ 
              bureau: item?.bureau || item?.Bureau || "", 
              statement: text, 
              statement_html: html 
            });
          }
        }
        // Personal Information (prefix: "Personal Inform")
        else if (lowerKey.startsWith("personal inform")) {
          for (const item of items) {
            const fields: Record<string, any> = {};
            Object.keys(item || {}).forEach((fieldKey) => {
              if (!fieldKey.startsWith("_") && fieldKey !== "Position") {
                const val = item[fieldKey];
                const clean = typeof val === "string" ? stripHtml(val).text : val;
                fields[fieldKey] = clean;
              }
            });
            report.personalInformation.push({
              position: item?.Position || report.personalInformation.length + 1,
              status: item?._STATUS || "ACTIVE",
              fields
            });
          }
        }
        // Real Estate Accounts
        else if (lowerKey.includes("real estate account")) {
          for (const item of items) {
            const account = {
              bureau: item?.bureau || item?.Bureau || null,
              creditor: item?.creditor || item?.Creditor || null,
              account_number_mask: item?.account_number_mask || item?.mask || null,
              opened_on: toDateISO(item?.opened_on || item?.opened),
              reported_on: toDateISO(item?.reported_on || item?.reported),
              balance: normalizeMoney(item?.balance || item?.Balance),
              high_balance: normalizeMoney(item?.high_balance),
              credit_limit: normalizeMoney(item?.credit_limit || item?.limit),
              status: item?.status || "Open",
              account_status: item?.account_status || "Current",
              payment_status: item?.payment_status || "Current",
              position: item?.Position || report.accounts.realEstate.length + 1,
              category: "realEstate",
            };
            report.accounts.realEstate.push(account);
          }
        }
        // Revolving Accounts
        else if (lowerKey.includes("revolving account")) {
          for (const item of items) {
            const account = {
              bureau: item?.bureau || item?.Bureau || null,
              creditor: item?.creditor || item?.Creditor || null,
              account_number_mask: item?.account_number_mask || item?.mask || null,
              opened_on: toDateISO(item?.opened_on || item?.opened),
              reported_on: toDateISO(item?.reported_on || item?.reported),
              balance: normalizeMoney(item?.balance || item?.Balance),
              high_balance: normalizeMoney(item?.high_balance),
              credit_limit: normalizeMoney(item?.credit_limit || item?.limit),
              status: item?.status || "Open",
              account_status: item?.account_status || "Current",
              payment_status: item?.payment_status || "Current",
              position: item?.Position || report.accounts.revolving.length + 1,
              category: "revolving",
            };
            report.accounts.revolving.push(account);
          }
        }
        // Other Accounts
        else if (lowerKey.includes("other account")) {
          for (const item of items) {
            const account = {
              bureau: item?.bureau || item?.Bureau || null,
              creditor: item?.creditor || item?.Creditor || null,
              account_number_mask: item?.account_number_mask || item?.mask || null,
              opened_on: toDateISO(item?.opened_on || item?.opened),
              reported_on: toDateISO(item?.reported_on || item?.reported),
              balance: normalizeMoney(item?.balance || item?.Balance),
              status: item?.status || "Open",
              position: item?.Position || report.accounts.other.length + 1,
              category: "other",
            };
            report.accounts.other.push(account);
          }
        }
        // Inquiries (prefix: "Inquiries Credit")
        else if (lowerKey.includes("inquiries")) {
          for (const item of items) {
            report.inquiries.push({
              inquirer_name: item?.inquirer_name || item?.name || item?.Inquirer || null,
              inquiry_date: toDateISO(item?.inquiry_date || item?.date),
              bureau: item?.bureau || item?.Bureau || null,
              position: item?.Position || report.inquiries.length + 1,
            });
          }
        }
        // Creditor Addresses (prefix: "Creditors Addresses")
        else if (lowerKey.includes("address")) {
          for (const item of items) {
            const { text } = stripHtml(item?.address || item?.Address || item?.value || "");
            report.addresses.push({ 
              creditor: item?.creditor || item?.Creditor || null, 
              address: text,
              position: item?.Position || report.addresses.length + 1,
            });
          }
        }
        // Collections
        else if (lowerKey.includes("collection")) {
          for (const item of items) {
            report.collections.push({
              collection_agency: item?.agency || item?.creditor || null,
              original_creditor: item?.original_creditor || null,
              amount: normalizeMoney(item?.amount || item?.balance),
              status: item?.status || "Active",
              position: item?.Position || report.collections.length + 1,
            });
          }
        }
        // Public Records (prefix: "Public Informations")
        else if (lowerKey.includes("public")) {
          report.publicRecords.push(captured[key]);
        }
      }

      console.log(`[ingest] Parsed data - Scores: ${report.scores.length}, Accounts: ${report.accounts.realEstate.length + report.accounts.revolving.length + report.accounts.other.length}, Inquiries: ${report.inquiries.length}`);
    } catch (parseError) {
      console.error("[ingest] Parsing error:", parseError);
      normalizedOk = false;
    }

    // Upsert normalized report (delete then insert for idempotency)
    console.log(`[ingest] Upserting normalized_credit_reports for run ${runId}`);
    
    try {
      await supabaseService.from("normalized_credit_reports").delete()
        .eq("run_id", runId!).eq("user_id", userIdentifier!);
      
      const { error } = await supabaseService.from("normalized_credit_reports").insert({
        run_id: runId!,
        user_id: userIdentifier!,
        collected_at: collectedAt,
        version: "v1",
        report_json: report,
      });

      if (error) {
        console.error("[ingest] Normalized report insert error:", error);
        return json({ code: "E_DB_UPSERT", message: error.message }, 500);
      }
      
      console.log("[ingest] Normalized report saved successfully");
    } catch (reportError) {
      console.error("[ingest] Report upsert exception:", reportError);
      normalizedOk = false;
    }

    // Upsert scores
    if (Array.isArray(report.scores) && report.scores.length) {
      try {
        const rows = report.scores.map((s: any, i: number) => ({
          user_id: userIdentifier!,
          run_id: runId!,
          bureau: s.bureau,
          score: s.score ?? null,
          status: s.status ?? null,
          position: s.position ?? i + 1,
          collected_at: collectedAt,
        }));

        const { error } = await supabaseService
          .from("normalized_credit_scores")
          .upsert(rows, { onConflict: "user_id,bureau,run_id" });

        if (error) {
          console.error("[ingest] Scores upsert error:", error);
        } else {
          console.log(`[ingest] Scores upserted successfully: ${rows.length} records`);
        }
      } catch (scoresError) {
        console.error("[ingest] Scores upsert exception:", scoresError);
      }
    }

    // Upsert accounts
    const allAccounts: any[] = [
      ...(report.accounts?.realEstate || []),
      ...(report.accounts?.revolving || []),
      ...(report.accounts?.other || []),
    ];

    if (allAccounts.length) {
      try {
        const rows = allAccounts.map((a: any) => ({
          user_id: userIdentifier!,
          run_id: runId!,
          bureau: a.bureau ?? null,
          creditor: a.creditor ?? null,
          account_number_mask: a.account_number_mask ?? null,
          opened_on: a.opened_on ? a.opened_on.substring(0, 10) : null,
          reported_on: a.reported_on ? a.reported_on.substring(0, 10) : null,
          last_activity_on: a.last_activity_on ? a.last_activity_on.substring(0, 10) : null,
          balance: a.balance,
          high_balance: a.high_balance,
          credit_limit: a.credit_limit,
          closed_on: a.closed_on ? a.closed_on.substring(0, 10) : null,
          account_status: a.account_status,
          payment_status: a.payment_status,
          dispute_status: a.dispute_status,
          past_due: a.past_due,
          payment_amount: a.payment_amount,
          last_payment_on: a.last_payment_on ? a.last_payment_on.substring(0, 10) : null,
          term_length_months: a.term_length_months,
          account_type: a.account_type,
          payment_frequency: a.payment_frequency,
          account_rating: a.account_rating,
          description: a.description,
          remarks: a.remarks || [],
          two_year_history: a.two_year_history || {},
          days_late_7y: a.days_late_7y || { "30": 0, "60": 0, "90": 0 },
          status: a.status,
          position: a.position,
          collected_at: collectedAt,
          category: a.category ?? null,
          payload: a,
        }));

        const { error } = await supabaseService
          .from("normalized_credit_accounts")
          .upsert(rows, { onConflict: "user_id,creditor,account_number_mask,bureau,opened_on,category" });

        if (error) {
          console.error("[ingest] Accounts upsert error:", error);
        } else {
          console.log(`[ingest] Accounts upserted successfully: ${rows.length} records`);
        }
      } catch (accountsError) {
        console.error("[ingest] Accounts upsert exception:", accountsError);
      }
    }

    // Broadcast credit_report_ingested event
    try {
      // This could be extended to use Supabase Realtime or custom event system
      console.log(`[ingest] Broadcasting credit_report_ingested event for runId: ${runId}`);
    } catch (broadcastError) {
      console.warn("[ingest] Broadcast error:", broadcastError);
    }

    console.log(`[ingest] Processing completed - runId: ${runId}, normalized: ${normalizedOk}`);
    return json({ ok: true, runId, normalized: normalizedOk });

  } catch (err) {
    console.error("[ingest] Unexpected error:", err);
    return json({ code: "E_UNEXPECTED", message: (err as any)?.message || "Unexpected error" }, 500);
  }
});