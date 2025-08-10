import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertCircle, Eye, EyeOff, Play } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import SmartCreditImportMonitor from "./SmartCreditImportMonitor";
import { supabase } from "@/integrations/supabase/client";
import type { StartImportResponse } from "@/services/SmartCreditImportService";

// Dedicated Smart Credit login + launcher
// Always visible until a run starts. Credentials are NOT persisted.
// Includes test ids for QA.

const errorMessageForCode: Record<string, string> = {
  AUTH_BAD_KEY: "The scraper API key is invalid. Please contact support.",
  ROBOT_NOT_FOUND: "Scraper robot not found. Please verify configuration.",
  INPUT_INVALID: "Invalid credentials. Please check your username and password.",
  UPSTREAM_UNAVAILABLE: "Upstream service unavailable. Please try again shortly.",
  CONFIG_MISSING: "Scraper configuration missing. Please contact an administrator.",
};

const SmartCreditLoginForm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const dryRun = useMemo(() => searchParams.get("dryRun") === "1", [searchParams]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);

  const [run, setRun] = useState<StartImportResponse | null>(null);
  const [simulate, setSimulate] = useState(false);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError({ message: "Username and password are required." });
      return;
    }

    // Disable CTA and launch
    setSubmitting(true);

    try {
      if (dryRun) {
        // Simulated flow for visual QA without backend
        const fake: StartImportResponse = {
          ok: true,
          runId: `dryrun-${Date.now()}`,
          browseai: { taskId: "dryrun-task", jobId: "dryrun-robot" },
        };
        setRun(fake);
        setSignedInAs(username);
        setSimulate(true);
        setPassword(""); // clear immediately
        return;
      }

      // Primary path
      const { data, error } = await supabase.functions.invoke("smart-credit-connect-and-start", {
        body: { username, password },
      });

      let resp: StartImportResponse | null = null;

      if (!error && (data as any)?.ok) {
        resp = data as StartImportResponse;
      } else {
        const code = (data as any)?.code || (error as any)?.name || "UNKNOWN_ERROR";
        const gone = code === "GONE" || (error as any)?.message?.includes("410");
        if (!gone) {
          const message = errorMessageForCode[code] || (data as any)?.message || (error as any)?.message || "Failed to start import";
          setError({ code, message });
          return;
        }
        // Fallback to legacy path
        const { data: data2, error: err2 } = await supabase.functions.invoke("browseai-start", {
          body: { username, password },
        });
        if (err2) {
          setError({ message: (err2 as any)?.message || "Failed to start import (fallback)" });
          return;
        }
        const runId = (data2 as any)?.runId;
        const robotId = (data2 as any)?.robotId;
        if (!runId) {
          setError({ message: "No run id returned by scraper (fallback)." });
          return;
        }
        resp = { ok: true, runId, browseai: { taskId: runId, jobId: robotId } };
      }

      // Minimal guard
      if (!resp?.runId) {
        setError({ message: "No run id returned by scraper." });
        return;
      }

      setRun(resp);
      setSignedInAs(username);
      setPassword(""); // clear immediately
    } catch (err: any) {
      const message = err?.message || "Failed to start import";
      setError({ message });
    } finally {
      setSubmitting(false);
    }
  };

  // Collapsed summary shown once a run has started
  if (run) {
    return (
      <section className="space-y-4" aria-label="Smart Credit Import Launcher">
        <Card className="bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Smart Credit Connection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground">
                {signedInAs ? (
                  <span>Signed in as <span className="text-foreground font-medium">{signedInAs}</span></span>
                ) : (
                  <span>Signed in</span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => { setRun(null); setSignedInAs(null); setSimulate(false); }}>
                Change account
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Loading / progress UI */}
        <SmartCreditImportMonitor initialRun={run} simulate={simulate} />
      </section>
    );
  }

  return (
    <section aria-label="Smart Credit Login" id="smart-credit-form" className="smart-credit-form">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connect Smart Credit</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" data-testid="smart-credit-form">
            {error && (
              <div className="rounded-md border bg-destructive/10 text-destructive p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <div className="text-sm">
                  <div className="font-medium">{error.code || "Login error"}</div>
                  <div className="text-muted-foreground">{error.message}</div>
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="smart-username">Username</Label>
              <Input
                id="smart-username"
                data-testid="username-input"
                value={username}
                onChange={(e) => setUsername(e.currentTarget.value)}
                placeholder="Enter your Smart Credit username"
                autoComplete="username"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="smart-password">Password</Label>
              <div className="relative">
                <Input
                  id="smart-password"
                  data-testid="password-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={submitting}
                data-testid="connect-and-import-btn"
              >
                <Play className="h-4 w-4 mr-2" />
                {submitting ? "Connecting…" : "Connect & Import"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
};

export default SmartCreditLoginForm;
