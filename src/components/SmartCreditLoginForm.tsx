import React, { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Play } from "lucide-react";

export const SmartCreditLoginForm: React.FC = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

  const canStart = email.trim() !== "" && password.trim() !== "" && !isSubmitting;

  const onStart = async () => {
    if (!canStart) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("browseai-trigger", {
        body: {
          // robotId is optional; edge function will use default from admin_settings
          inputParameters: {
            originUrl: "https://www.smartcredit.com",
            email,
            password,
            credit_scores_limit: 1,
            credit_report_details_limit: 1,
            credit_report_details_transunion_limit: 1,
            credit_report_details_experian_limit: 1,
            credit_report_details_equifax_limit: 1,
            credit_bureaus_comments_limit: 1,
          },
          tags: ["smartcredit", "import"],
        },
      });

      if (error) {
        console.error("Trigger error:", error);
        toast({
          title: "Failed to start SmartCredit import",
          description: String(error?.message || "Unknown error"),
          variant: "destructive",
        });
        return;
      }

      const taskId = (data as any)?.taskId || null;
      toast({
        title: "SmartCredit import started",
        description: taskId
          ? `Task ${taskId} queued. You can refresh reports in a bit.`
          : "Import queued. You can refresh reports in a bit.",
      });

      // Optional: clear password after start
      setPassword("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card ref={formRef} className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5 text-primary" />
          Smart Credit
        </CardTitle>
        <CardDescription>Sign in to SmartCredit to import your latest report automatically.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="sc-email">Username (Email)</Label>
            <Input
              id="sc-email"
              type="email"
              placeholder="name@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="sc-password">Password</Label>
            <Input
              id="sc-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={onStart} disabled={!canStart}>
            <Play className="h-4 w-4 mr-2" />
            Start Import
          </Button>
          <p className="text-xs text-muted-foreground">
            Your SmartCredit credentials are used only to authenticate the session and are not stored.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default SmartCreditLoginForm;
