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
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const formRef = useRef<HTMLDivElement | null>(null);

  const canSubmit = email.trim() !== "" && password.trim() !== "" && !isSubmitting;

  const onSubmit = async () => {
    // Inline validation
    const nextErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextErrors.email = "Username is required";
    if (!password.trim()) nextErrors.password = "Password is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("browseai-credentials", {
        body: { email, password },
      });

      if (error) {
        // Do not log secrets; surface a safe inline error
        setErrors({ password: "Failed to save credentials. Please verify and try again." });
        return;
      }

      if ((data as any)?.success) {
        setEmail("");
        setPassword("");
        setErrors({});
        toast({ title: "Credentials saved" });
        window.dispatchEvent(new CustomEvent("smart_credit_credentials_saved"));
      } else {
        setErrors({ password: "Unexpected response. Please try again." });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card ref={formRef} className="bg-card" id="smart-credit-form" data-testid="smart-credit-form" aria-labelledby="smart-credit-form-title" aria-describedby="smart-credit-form-desc">
      <CardHeader>
        <CardTitle id="smart-credit-form-title" className="flex items-center gap-2">
          <Play className="h-5 w-5 text-primary" />
          Smart Credit
        </CardTitle>
        <CardDescription id="smart-credit-form-desc">Connect your SmartCredit account to enable automatic imports.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="sc-username">Username</Label>
            <Input
              id="sc-username"
              type="text"
              autoComplete="username"
              aria-label="SmartCredit username"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'sc-username-error' : undefined}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {errors.email && (
              <p id="sc-username-error" className="text-destructive text-xs mt-1">{errors.email}</p>
            )}
          </div>
          <div>
            <Label htmlFor="sc-password">Password</Label>
            <div className="relative">
              <Input
                id="sc-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                aria-label="SmartCredit password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'sc-password-error' : undefined}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </Button>
            </div>
            {errors.password && (
              <p id="sc-password-error" className="text-destructive text-xs mt-1">{errors.password}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={onSubmit} disabled={!canSubmit || isSubmitting} aria-label="Connect SmartCredit account">
            {isSubmitting ? 'Connecting…' : 'Connect'}
          </Button>
          <p className="text-xs text-muted-foreground">
            We never log your credentials. Transmission is secured over HTTPS.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default SmartCreditLoginForm;
