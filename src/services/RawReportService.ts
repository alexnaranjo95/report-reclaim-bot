import { supabase } from "@/integrations/supabase/client";

export interface LatestRawResponse {
  ok: boolean;
  code?: string;
  message?: string;
  runId?: string;
  userId?: string;
  collectedAt?: string;
  raw?: any;
}

export const RawReportService = {
  async fetchLatestByUser(userId: string): Promise<LatestRawResponse> {
    const { data, error } = await supabase.functions.invoke("credit-report-latest-raw", {
      body: { userId },
    });
    if (error) throw error;
    return data as LatestRawResponse;
  },
  async fetchLatestByRunId(runId: string): Promise<LatestRawResponse> {
    const { data, error } = await supabase.functions.invoke("credit-report-latest-raw", {
      body: { runId },
    });
    if (error) throw error;
    return data as LatestRawResponse;
  },
};
