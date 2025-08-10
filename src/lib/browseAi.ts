import { supabase } from "@/integrations/supabase/client";

export type BrowseAiStatus = "queued" | "in-progress" | "successful" | "failed";

export interface StartRunParams {
  robotId?: string; // optional if secret is set on the server
  username: string;
  password: string;
}

export interface StartRunResponse {
  runId: string;
  robotId: string;
}

export interface GetStatusParams {
  robotId?: string; // optional if secret is set on the server
  runId: string;
}

export interface GetStatusResponse {
  status: BrowseAiStatus;
  result?: any;
  errorMessage?: string;
}

export async function startRun({ robotId, username, password }: StartRunParams): Promise<StartRunResponse> {
  const payload: Record<string, any> = { username, password };
  if (robotId) payload.robotId = robotId;

  const { data, error } = await supabase.functions.invoke("smart-credit-connect-and-start", {
    body: payload,
  });

  if (error) {
    const message = ((data as any)?.error as string) || (error as any)?.message || "Failed to start run";
    throw new Error(message);
  }

  const runId = (data as any)?.runId;
  if (!runId) throw new Error("Could not retrieve task id from response.");
  const robot = (data as any)?.robotId;
  return { runId, robotId: robot };
}

export async function getRunStatus({ robotId, runId }: GetStatusParams): Promise<GetStatusResponse> {
  const payload: Record<string, any> = { runId };
  if (robotId) payload.robotId = robotId;

  const { data, error } = await supabase.functions.invoke("browseai-status", {
    body: payload,
  });

  if (error) {
    const message = ((data as any)?.error as string) || (error as any)?.message || "Failed to check status";
    return { status: "failed", errorMessage: message };
  }

  const status = ((data as any)?.status as BrowseAiStatus) || "in-progress";
  const raw = (data as any)?.result;
  const errorMessage: string | undefined = (data as any)?.errorMessage;
  return { status, result: raw, errorMessage };
}
