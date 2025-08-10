import { supabase } from "@/integrations/supabase/client";

export interface StartImportResponse {
  ok: boolean;
  runId?: string;
  browseai?: { taskId?: string; jobId?: string };
  code?: string;
  message?: string;
}

const PROJECT_REF = "rcrpqdhfawtpjicttgvx";
const SSE_URL = `https://${PROJECT_REF}.functions.supabase.co/functions/v1/smart-credit-import-stream`;

export async function startSmartImport(payload: { username?: string; password?: string; robotId?: string }) {
  // Primary path: modern connector
  const { data, error } = await supabase.functions.invoke<StartImportResponse>("smart-credit-connect-and-start", {
    body: payload,
  });

  // Success
  if (!error && data?.ok && data?.runId) return data;

  // Detect "GONE"/410 or legacy path requirement and fallback
  const code = (data as any)?.code || (error as any)?.name || "UNKNOWN_ERROR";
  const status410 = (error as any)?.context?.response?.status === 410 || (error as any)?.message?.includes?.("410");
  const shouldFallback = code === "GONE" || status410;

  if (shouldFallback) {
    const { data: legacy, error: legacyErr } = await supabase.functions.invoke("browseai-start", {
      body: { username: payload.username, password: payload.password, robotId: payload.robotId },
    });
    if (legacyErr) throw new Error((legacy as any)?.message || (legacyErr as any)?.message || "Failed to start import (fallback)");
    const runId = (legacy as any)?.runId;
    const robotId = (legacy as any)?.robotId;
    if (!runId) throw new Error("No runId returned by scraper (fallback)");
    const resp: StartImportResponse = { ok: true, runId, browseai: { taskId: runId, jobId: robotId } };
    return resp;
  }

  // Otherwise propagate error
  throw new Error((data as any)?.message || (error as any)?.message || "Failed to start import");
}

export function openSmartImportStream(runId: string, robotId?: string) {
  const url = new URL(SSE_URL);
  url.searchParams.set("runId", runId);
  if (robotId) url.searchParams.set("robotId", robotId);
  const es = new EventSource(url.toString());
  return es;
}
