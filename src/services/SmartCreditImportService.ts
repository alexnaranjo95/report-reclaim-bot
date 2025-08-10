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
  const { data, error } = await supabase.functions.invoke<StartImportResponse>("smart-credit-connect-and-start", {
    body: payload,
  });
  if (error) throw new Error((data as any)?.message || (error as any)?.message || "Failed to start import");
  if (!data?.ok || !data?.runId) throw new Error(data?.message || "No runId returned");
  return data;
}

export function openSmartImportStream(runId: string, robotId?: string) {
  const url = new URL(SSE_URL);
  url.searchParams.set("runId", runId);
  if (robotId) url.searchParams.set("robotId", robotId);
  const es = new EventSource(url.toString());
  return es;
}
