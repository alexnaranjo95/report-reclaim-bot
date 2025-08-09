import React, { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Play, AlertCircle, CheckCircle2 } from "lucide-react";

interface SmartCreditResponse {
  ok: boolean;
  code?: string;
  message?: string;
  savedAt?: string;
  runId?: string;
  simulatedRows?: number;
}

const ERROR_MESSAGES: Record<string, string> = {
  E_AUTH_REQUIRED: "Please log in to continue",
  E_SCHEMA_INVALID: "Please check your username and password format",
  E_KMS_KEY: "Server encryption error - please try again",
  E_DB_UPSERT: "Failed to save credentials - please retry",
  E_CORS: "Access denied from this domain",
  E_CONFIG_MISSING: "Server configuration incomplete - contact support",
  E_NO_CREDENTIALS: "Please save your credentials first",
  E_NO_ROBOT_ID: "Import service not configured - contact support",
  E_AUTH_BAD_KEY: "Invalid API configuration - contact support",
  E_ROBOT_NOT_FOUND: "Import robot not found - contact support",
  E_UPSTREAM_UNAVAILABLE: "Import service temporarily unavailable",
};

export const SmartCreditLoginForm: React.FC = () => {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // Clear previous state on new attempts
  const clearState = useCallback(() => {
    setError(null);
    setSuccessMessage(null);
  }, []);

  // Validation
  const canSubmit = username.trim().length >= 3 && password.length >= 8 && !isConnecting && !isImporting;

  const handleConnectAndImport = async () => {
    clearState();

    // Validate inputs
    if (username.trim().length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsConnecting(true);

    try {
      // Single call: save creds + start task
      const { data, error } = await supabase.functions.invoke(
        "smart-credit-connect-and-start",
        { body: { username: username.trim(), password } }
      ) as { data: any; error: any };

      if (error || !data?.ok) {
        const errorCode = data?.code || "UNKNOWN_ERROR";
        const errorMsg = ERROR_MESSAGES[errorCode] || data?.detail || "Failed to connect/start";
        setError(`Start failed: ${errorMsg}`);
        return;
      }

      // Success -> show banner + open SSE
      const runId = data.runId as string;
      const taskId = data.browseai?.taskId as string | undefined;
      const jobId = data.browseai?.jobId as string | undefined;

      setSuccessMessage(`Connected to BrowseAI (task ${taskId || "n/a"}${jobId ? ", job " + jobId : ""})`);

      // Clear sensitive fields immediately
      setUsername("");
      setPassword("");

      toast({
        title: "Import Started",
        description: `Smart Credit import is now running (${runId})`,
      });

      // Live stream
      try {
        const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
        const streamUrl = new URL(`${"https://rcrpqdhfawtpjicttgvx.supabase.co"}/functions/v1/smart-credit-import-stream`);
        streamUrl.searchParams.set("runId", runId);
        if (accessToken) streamUrl.searchParams.set("access_token", accessToken);
        const es = new EventSource(streamUrl.toString());
        setIsStreaming(true);
        es.onmessage = (ev) => {
          try {
            const evt = JSON.parse(ev.data);
            if (evt?.type === "error") {
              console.warn("Import error event:", evt);
            }
          } catch {}
        };
        es.onerror = () => {
          es.close();
        };
      } catch {}

      // Notify other components
      window.dispatchEvent(new CustomEvent("smart_credit_import_started", { detail: { runId, taskId, jobId } }));
    } catch (e: any) {
      console.error("connect-and-start error:", e);
      setError(`Connection error: ${e?.message || "Unknown error"}`);
    } finally {
      setIsConnecting(false);
      setIsImporting(false);
    }
  };

  const handleRetry = async () => {
    clearState();
    setIsImporting(true);

    try {
      console.log("Retrying import with stored credentials...");
      
      const { data: importData, error: importError } = await supabase.functions.invoke(
        "smart-credit-import-start",
        { body: {} }
      ) as { data: SmartCreditResponse; error: any };

      if (importError || !importData?.ok) {
        const errorCode = importData?.code || "UNKNOWN_ERROR";
        const errorMsg = ERROR_MESSAGES[errorCode] || importData?.message || "Failed to start import";
        setError(`Retry failed: ${errorMsg}`);
        return;
      }

      setSuccessMessage(`Import restarted successfully! Run ID: ${importData.runId}`);
      
      toast({
        title: "Import Restarted",
        description: `Smart Credit import is now running (${importData.runId})`,
      });

      window.dispatchEvent(new CustomEvent("smart_credit_import_started", {
        detail: { runId: importData.runId }
      }));

    } catch (e: any) {
      console.error("Retry error:", e);
      setError(`Retry error: ${e.message || "Unknown error"}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card className="bg-card" data-testid="smart-credit-form">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5 text-primary" />
          Smart Credit Import
        </CardTitle>
        <CardDescription>
          Connect your SmartCredit account to enable automatic financial data imports.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="sc-username">Username / Email</Label>
            <Input
              id="sc-username"
              type="text"
              autoComplete="username"
              placeholder="your@email.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isConnecting || isImporting}
              required
            />
          </div>
          <div>
            <Label htmlFor="sc-password">Password</Label>
            <div className="relative">
              <Input
                id="sc-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isConnecting || isImporting}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isConnecting || isImporting}
              >
                {showPassword ? 'Hide' : 'Show'}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            onClick={handleConnectAndImport}
            disabled={!canSubmit}
            data-testid="connect-and-import-btn"
            className="min-w-[140px]"
          >
            {isConnecting ? 'Saving...' : isImporting ? 'Starting...' : 'Connect & Import'}
          </Button>
          
          <Button 
            variant="outline"
            onClick={handleRetry}
            disabled={isImporting || isConnecting}
            className="min-w-[80px]"
          >
            {isImporting ? 'Starting...' : 'Retry'}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Credentials are encrypted and never logged</p>
          <p>• Import automatically starts after successful connection</p>
          <p>• Use "Retry" to start import with previously saved credentials</p>
          {isStreaming && <span data-testid="import-stream" style={{ display: 'none' }} />}
        </div>
      </CardContent>
    </Card>
  );
};

export default SmartCreditLoginForm;