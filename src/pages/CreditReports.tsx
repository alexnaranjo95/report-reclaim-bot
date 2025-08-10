import React from "react";
import AccountHeader from "@/components/AccountHeader";
import CreditReportRawDashboard from "@/components/CreditReportRawDashboard";

const CreditReportsPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-dashboard">
      <AccountHeader title="Credit Report (Raw Import)" breadcrumbs={[{ label: "Home", to: "/" }, { label: "Credit Report" }]} />

      {/* Preserve container spacing/gaps */}
      <div className="container mx-auto px-6 py-8 space-y-6">
        <CreditReportRawDashboard />
      </div>
    </div>
  );
};

export default CreditReportsPage;