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
    
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Call the BrowseAI connection service
      const { data, error } = await supabase.functions.invoke('smart-credit-connect-and-start', {
        body: { email: email.trim(), password: password.trim() },
      });

      if (error) {
        throw new Error(error.message || 'Failed to connect to service');
      }

      if (!data?.ok) {
        // Handle specific error codes from the service
        const errorCode = data?.code || 'UNKNOWN_ERROR';
        const errorMessage = data?.message || 'Failed to start import';
        
        if (errorCode === 'AUTH_BAD_KEY') {
          throw new Error('Service configuration error. Please contact support.');
        } else if (errorCode === 'ROBOT_NOT_FOUND') {
          throw new Error('Import service not available. Please contact support.');
        } else if (errorCode === 'RUN_FAILED') {
          throw new Error(`Import failed: ${errorMessage}`);
        } else if (errorCode === 'E_INPUT') {
          throw new Error('Please enter valid email and password');
        } else {
          throw new Error(errorMessage);
        }
      }

      const runId = data.runId;
      if (!runId) {
        throw new Error('Invalid response from service - no run ID received');
      }

      console.log('Import connection successful, runId:', runId);
      
      // Call parent callback with runId (this will trigger navigation and monitoring)
      onImportStart?.(runId);
    } catch (err: any) {
      console.error('Import connection error:', err);
      setError(err.message || 'Failed to start credit report import');
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