import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface AccountHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
}

const AccountHeader: React.FC<AccountHeaderProps> = ({ title, subtitle, backTo = "/" }) => {
  return (
    <header className="border-b bg-card/80 backdrop-blur-sm">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" asChild aria-label="Back to previous page">
              <Link to={backTo}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
            <div>
              <p className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                {title}
              </p>
              {subtitle && (
                <p className="text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AccountHeader;
