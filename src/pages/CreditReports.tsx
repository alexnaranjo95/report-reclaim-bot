import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import CreditReportRawDashboard from "@/components/CreditReportRawDashboard";
import CreditReportDataPanel from "@/components/CreditReportDataPanel";
import { Separator } from "@/components/ui/separator";
import AccountHeader from "@/components/AccountHeader";
import { fetchLatestNormalized } from "@/services/NormalizedReportService";
const CreditReportsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const runId = searchParams.get("runId");
  const [refreshKey, setRefreshKey] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!runId) return;

    // Try SSE first; fall back to polling if unavailable
    try {
      const es = new EventSource(`/api/smart-credit/import/stream?runId=${encodeURIComponent(runId)}`);
      esRef.current = es;
      es.onmessage = () => {
        setRefreshKey((k) => k + 1);
      };
      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Start polling fallback
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = window.setInterval(async () => {
          try {
            const data = await fetchLatestNormalized(runId);
            const counts = (data as any)?.counts || {};
            const total = (counts.realEstate || 0) + (counts.revolving || 0) + (counts.other || 0);
            if (data?.report || total > 0) {
              setRefreshKey((k) => k + 1);
              if (pollRef.current) window.clearInterval(pollRef.current);
            }
          } catch {
            // keep polling silently
          }
        }, 2000);
      };
    } catch {
      // Immediate fallback to polling
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        try {
          const data = await fetchLatestNormalized(runId);
          const counts = (data as any)?.counts || {};
          const total = (counts.realEstate || 0) + (counts.revolving || 0) + (counts.other || 0);
          if (data?.report || total > 0) {
            setRefreshKey((k) => k + 1);
            if (pollRef.current) window.clearInterval(pollRef.current);
          }
        } catch {}
      }, 2000);
    }

    return () => {
      if (esRef.current) esRef.current.close();
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [runId]);

  return (
    <div className="min-h-screen bg-gradient-dashboard">
      <AccountHeader title="Credit Report" subtitle="Lossless view of your latest scraper payload" backTo="/" />
      <div className="container mx-auto px-6 py-8 space-y-8">
        <CreditReportDataPanel key={refreshKey} />
        <Separator />
        <CreditReportRawDashboard />
      </div>
    </div>
  );
};

export default CreditReportsPage;