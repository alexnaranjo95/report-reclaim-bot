import React from 'react';
import { AlertTriangle, Shield } from 'lucide-react';

export interface CreditReportData {
  reportHeader: {
    referenceNumber: string;
    reportDate: string;
    alerts: Array<{
      type: 'fraud' | 'dispute' | 'security';
      message: string;
      severity: 'high' | 'medium' | 'low';
      bureau?: string;
    }>;
  };
  personalInfo: {
    name: string;
    aliases: string[];
    birthDate: string;
    addresses: Array<{
      address: string;
      type: 'current' | 'previous';
      dates?: string;
    }>;
    employers: Array<{
      name: string;
      dates?: string;
    }>;
  };
  creditScores: {
    transUnion?: { score: number; rank: string; factors: string[] };
    experian?: { score: number; rank: string; factors: string[] };
    equifax?: { score: number; rank: string; factors: string[] };
  };
  accountSummary: {
    totalAccounts: number;
    openAccounts: number;
    closedAccounts: number;
    delinquentAccounts: number;
    collectionsAccounts: number;
    totalBalances: number;
    monthlyPayments: number;
    inquiries2Years: number;
  };
  accounts: Array<{
    id: string;
    creditor: string;
    accountNumber: string;
    type: 'revolving' | 'installment' | 'mortgage';
    status: 'open' | 'closed' | 'derogatory' | 'collection';
    balance: number;
    limit?: number;
    paymentHistory: Array<{
      month: string;
      status: 'ok' | 'late30' | 'late60' | 'late90' | 'chargeoff';
    }>;
    dateOpened: string;
    lastReported: string;
    lastPayment?: string;
    paymentAmount?: number;
    bureaus: string[];
  }>;
  inquiries: Array<{
    id: string;
    creditor: string;
    date: string;
    type: 'hard' | 'soft';
    purpose?: string;
  }>;
  // Add rawData to store the original JSON structure
  rawData?: any;
}

interface CreditReportDashboardProps {
  data: CreditReportData;
}

export const CreditReportDashboard: React.FC<CreditReportDashboardProps> = ({ data }) => {
  // Transform credit scores to array format for the template
  const creditScores = [
    data.creditScores.transUnion && { bureau: 'TransUnion', score: data.creditScores.transUnion.score, date: data.reportHeader.reportDate },
    data.creditScores.experian && { bureau: 'Experian', score: data.creditScores.experian.score, date: data.reportHeader.reportDate },
    data.creditScores.equifax && { bureau: 'Equifax', score: data.creditScores.equifax.score, date: data.reportHeader.reportDate }
  ].filter(Boolean);

  // Transform addresses format
  const addresses = data.personalInfo.addresses?.map(addr => ({
    street: addr.address,
    city: '',
    state: '',
    postalCode: '',
    type: addr.type,
    dates: addr.dates
  })) || [];

  // Transform account details
  const accountDetails = data.accounts.map(account => ({
    creditorName: account.creditor,
    accountType: account.type,
    balance: `$${account.balance.toLocaleString()}`,
    status: account.status,
    lastPaymentDate: account.lastPayment || account.lastReported,
    paymentHistory: account.paymentHistory
  }));

  return (
    <main className="min-h-screen bg-gradient-dashboard p-6" id="credit-report-root" data-testid="credit-report-root">
      <article className="max-w-6xl mx-auto space-y-8">
        <header className="bg-card rounded-lg shadow-card p-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Credit Report Analysis</h1>
          <p className="text-muted-foreground">Report Date: {data.reportHeader.reportDate}</p>
          <p className="text-sm text-muted-foreground">Reference: {data.reportHeader.referenceNumber}</p>
        </header>

        {/* Alerts Section */}
        {data.reportHeader.alerts.length > 0 && (
          <section aria-labelledby="alerts-header" className="space-y-4">
            <h2 id="alerts-header" className="text-2xl font-semibold text-foreground">Credit Alerts</h2>
            <div className="space-y-3">
              {data.reportHeader.alerts.map((alert, index) => (
                <div 
                  key={index} 
                  className={`p-4 border-l-4 rounded-lg ${
                    alert.severity === 'high' ? 'border-l-danger bg-danger/5' :
                    alert.severity === 'medium' ? 'border-l-warning bg-warning/5' :
                    'border-l-primary bg-primary/5'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {alert.type === 'fraud' ? (
                      <Shield className="h-5 w-5 text-danger mt-1" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-warning mt-1" />
                    )}
                    <div>
                      <p className="font-medium text-foreground">{alert.message}</p>
                      {alert.bureau && (
                        <p className="text-sm text-muted-foreground">Bureau: {alert.bureau}</p>
                      )}
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mt-1">
                        {alert.severity} Priority
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Personal Information Section */}
        {data.personalInfo && (
          <section aria-labelledby="personal-info-header" className="bg-card rounded-lg shadow-card p-6">
            <h2 id="personal-info-header" className="text-2xl font-semibold text-foreground mb-4">Personal Information</h2>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Full Name</dt>
                <dd className="text-base text-foreground">{data.personalInfo.name ?? "N/A"}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Birth Date</dt>
                <dd className="text-base text-foreground">{data.personalInfo.birthDate ?? "N/A"}</dd>
              </div>
              {data.personalInfo.aliases?.length > 0 && (
                <div className="md:col-span-2">
                  <dt className="text-sm font-medium text-muted-foreground">Also Known As</dt>
                  <dd className="text-base text-foreground">{data.personalInfo.aliases.join(', ')}</dd>
                </div>
              )}
            </dl>
            
            {addresses.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-medium text-foreground mb-3">Addresses</h3>
                <div className="space-y-3">
                  {addresses.map((addr, i) => (
                    <div key={i} className="p-3 bg-muted/30 rounded-md">
                      <address className="not-italic">
                        {addr.type && <strong className="text-primary">{addr.type}: </strong>}
                        <span className="text-foreground">
                          {[addr.street, addr.city, addr.state, addr.postalCode]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                        {addr.dates && <span className="text-sm text-muted-foreground ml-2">({addr.dates})</span>}
                      </address>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.personalInfo.employers?.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-medium text-foreground mb-3">Employers</h3>
                <ul className="space-y-2">
                  {data.personalInfo.employers.map((emp, i) => (
                    <li key={i} className="p-2 bg-muted/30 rounded-md">
                      <span className="text-foreground">{emp.name}</span>
                      {emp.dates && <span className="text-sm text-muted-foreground ml-2">({emp.dates})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Credit Scores Section */}
        {creditScores.length > 0 && (
          <section aria-labelledby="credit-scores-header" className="bg-card rounded-lg shadow-card p-6">
            <h2 id="credit-scores-header" className="text-2xl font-semibold text-foreground mb-4">Credit Scores</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {creditScores.map((score, i) => (
                <div key={i} className="text-center p-4 bg-gradient-primary rounded-lg text-primary-foreground">
                  <h3 className="font-medium text-sm opacity-90">{score.bureau}</h3>
                  <p className="text-4xl font-bold mt-2">{score.score}</p>
                  {score.date && <p className="text-xs opacity-75 mt-1">({score.date})</p>}
                </div>
              ))}
            </div>
            
            {/* Risk Factors */}
            <div className="mt-6 space-y-3">
              <h3 className="text-lg font-medium text-foreground">Risk Factors</h3>
              {data.creditScores.transUnion?.factors && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">TransUnion</h4>
                  <p className="text-sm text-foreground">{data.creditScores.transUnion.factors.join('; ')}</p>
                </div>
              )}
              {data.creditScores.experian?.factors && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Experian</h4>
                  <p className="text-sm text-foreground">{data.creditScores.experian.factors.join('; ')}</p>
                </div>
              )}
              {data.creditScores.equifax?.factors && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Equifax</h4>
                  <p className="text-sm text-foreground">{data.creditScores.equifax.factors.join('; ')}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Account Summary */}
        {data.accountSummary && (
          <section aria-labelledby="account-summary-header" className="bg-card rounded-lg shadow-card p-6">
            <h2 id="account-summary-header" className="text-2xl font-semibold text-foreground mb-4">Account Summary</h2>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted/30 rounded-lg">
                <dt className="text-sm font-medium text-muted-foreground">Total Accounts</dt>
                <dd className="text-2xl font-bold text-foreground mt-1">{data.accountSummary.totalAccounts ?? "N/A"}</dd>
              </div>
              <div className="text-center p-4 bg-muted/30 rounded-lg">
                <dt className="text-sm font-medium text-muted-foreground">Open Accounts</dt>
                <dd className="text-2xl font-bold text-success mt-1">{data.accountSummary.openAccounts ?? "N/A"}</dd>
              </div>
              <div className="text-center p-4 bg-muted/30 rounded-lg">
                <dt className="text-sm font-medium text-muted-foreground">Closed Accounts</dt>
                <dd className="text-2xl font-bold text-muted-foreground mt-1">{data.accountSummary.closedAccounts ?? "N/A"}</dd>
              </div>
              <div className="text-center p-4 bg-muted/30 rounded-lg">
                <dt className="text-sm font-medium text-muted-foreground">Delinquent Accounts</dt>
                <dd className="text-2xl font-bold text-danger mt-1">{data.accountSummary.delinquentAccounts ?? "N/A"}</dd>
              </div>
            </dl>
            
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="text-center p-4 bg-gradient-success rounded-lg text-success-foreground">
                <dt className="text-sm font-medium opacity-90">Total Balances</dt>
                <dd className="text-xl font-bold mt-1">${data.accountSummary.totalBalances?.toLocaleString() ?? "N/A"}</dd>
              </div>
              <div className="text-center p-4 bg-gradient-primary rounded-lg text-primary-foreground">
                <dt className="text-sm font-medium opacity-90">Monthly Payments</dt>
                <dd className="text-xl font-bold mt-1">${data.accountSummary.monthlyPayments?.toLocaleString() ?? "N/A"}</dd>
              </div>
            </div>
          </section>
        )}

        {/* Account Details */}
        {accountDetails.length > 0 && (
          <section aria-labelledby="account-details-header" className="bg-card rounded-lg shadow-card p-6">
            <h2 id="account-details-header" className="text-2xl font-semibold text-foreground mb-4">Account Details</h2>
            <div className="space-y-6">
              {accountDetails.map((account, i) => (
                <article key={i} className="border border-border rounded-lg p-4 hover:shadow-elevated transition-shadow">
                  <h3 className="text-lg font-medium text-foreground mb-3">{account.creditorName || "Unknown Creditor"}</h3>
                  <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Account Type</dt>
                      <dd className="text-base text-foreground capitalize">{account.accountType ?? "N/A"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Balance</dt>
                      <dd className="text-base text-foreground font-medium">{account.balance ?? "N/A"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Status</dt>
                      <dd className={`text-base font-medium ${
                        account.status === 'open' ? 'text-success' :
                        account.status === 'derogatory' || account.status === 'collection' ? 'text-danger' :
                        'text-foreground'
                      }`}>
                        {account.status ?? "N/A"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Last Payment Date</dt>
                      <dd className="text-base text-foreground">{account.lastPaymentDate ?? "N/A"}</dd>
                    </div>
                  </dl>
                  
                  {/* Payment History */}
                  {account.paymentHistory?.length > 0 && (
                    <section aria-labelledby={`payment-history-${i}`} className="mt-4">
                      <h4 id={`payment-history-${i}`} className="text-sm font-medium text-muted-foreground mb-2">Payment History</h4>
                      <div className="flex flex-wrap gap-1">
                        {account.paymentHistory.slice(0, 24).map((pay, pi) => (
                          <div 
                            key={pi} 
                            className={`w-4 h-4 rounded-sm text-xs flex items-center justify-center ${
                              pay.status === 'ok' ? 'bg-success text-success-foreground' :
                              pay.status === 'late30' ? 'bg-warning text-warning-foreground' :
                              pay.status === 'late60' || pay.status === 'late90' ? 'bg-danger text-danger-foreground' :
                              pay.status === 'chargeoff' ? 'bg-destructive text-destructive-foreground' :
                              'bg-muted text-muted-foreground'
                            }`}
                            title={`${pay.month}: ${pay.status}`}
                          >
                            {pay.status === 'ok' ? '✓' : 
                             pay.status === 'late30' ? '1' :
                             pay.status === 'late60' ? '2' :
                             pay.status === 'late90' ? '3' :
                             pay.status === 'chargeoff' ? 'X' : '?'}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Last 24 months • ✓ = On Time, 1-3 = Days Late, X = Charge Off
                      </p>
                    </section>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Inquiries */}
        {data.inquiries?.length > 0 && (
          <section aria-labelledby="inquiries-header" className="bg-card rounded-lg shadow-card p-6">
            <h2 id="inquiries-header" className="text-2xl font-semibold text-foreground mb-4">Recent Credit Inquiries</h2>
            <div className="space-y-3">
              {data.inquiries.map((inq, i) => (
                <div key={i} className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="font-medium text-foreground">{inq.creditor ?? "Unknown Creditor"}</p>
                    {inq.purpose && <p className="text-sm text-muted-foreground">{inq.purpose}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-foreground">{inq.date ?? "N/A"}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      inq.type === 'hard' ? 'bg-danger/20 text-danger' : 'bg-muted text-muted-foreground'
                    }`}>
                      {inq.type ?? "Unknown"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Public Records */}
        <section aria-labelledby="public-records-header" className="bg-card rounded-lg shadow-card p-6">
          <h2 id="public-records-header" className="text-2xl font-semibold text-foreground mb-4">Public Records</h2>
          <div className="text-center py-8">
            <p className="text-muted-foreground">No public records reported</p>
          </div>
        </section>
      </article>
    </main>
  );
};