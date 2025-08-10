import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import CreditReportRawDashboard from "@/components/CreditReportRawDashboard";
import CreditReportDataPanel from "@/components/CreditReportDataPanel";
import { Separator } from "@/components/ui/separator";
const CreditReportsPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-dashboard">
      <header className="border-b bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" asChild>
                <Link to="/">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Link>
              </Button>
              <div>
                <p className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  Credit Report (Raw Import)
                </p>
                <p className="text-muted-foreground">
                  Lossless view of your latest scraper payload
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div className="container mx-auto px-6 py-8 space-y-8">
        <CreditReportDataPanel />
        <Separator />
        <CreditReportRawDashboard />
      </div>
    </div>
  );
};

export default CreditReportsPage;