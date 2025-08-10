import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import { startRun } from "@/lib/browseAi";
import { supabase } from "@/integrations/supabase/client";

interface CreditReportImporterProps {
  onImportStart?: (runId: string) => void;
}

export const CreditReportImporter: React.FC<CreditReportImporterProps> = ({ onImportStart }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Generate unique run ID
      const runId = crypto.randomUUID();
      
      // Start the import process by calling the SSE endpoint
      const session = await supabase.auth.getSession();
      const response = await fetch(`https://rcrpqdhfawtpjicttgvx.supabase.co/functions/v1/smart-credit-import-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.data.session?.access_token}`,
          "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjcnBxZGhmYXd0cGppY3R0Z3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODgwODcsImV4cCI6MjA2OTY2NDA4N30.VRL8ce0_R1Qmkp5BlgYm5oL-1DaTFMMFlttSCrF7CxU",
        },
        body: JSON.stringify({
          runId,
          email,
          password
        })
      });

      if (response.ok) {
        // Navigate to credit report page with runId
        onImportStart?.(runId);
        navigate(`/credit-report?runId=${runId}`);
      } else {
        const errorText = await response.text();
        throw new Error(`Import failed: ${errorText}`);
      }
    } catch (error: any) {
      console.error("Import error:", error);
      
      // Map error messages for user-friendly display
      let errorMessage = error?.message || "Failed to start credit report import";
      
      if (errorMessage.includes("AUTH_BAD_CREDENTIALS")) {
        errorMessage = "Invalid email or password for your credit report account";
      } else if (errorMessage.includes("E_AUTH")) {
        errorMessage = "Authentication required. Please log in to continue.";
      } else if (errorMessage.includes("E_CONFIG")) {
        errorMessage = "Service configuration error. Please contact support.";
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Import Credit Report</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="email">Credit Report Account Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={loading}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              disabled={loading}
              required
            />
          </div>
          
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting Import...
              </>
            ) : (
              "Import Credit Report"
            )}
          </Button>
        </form>
        
        <div className="mt-4 text-sm text-muted-foreground">
          <p>This will securely import your credit report data using automated scraping technology.</p>
        </div>
      </CardContent>
    </Card>
  );
};