import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, FileText, ShieldAlert } from 'lucide-react';
import html2pdf from 'html2pdf.js';

interface TriBureauReportViewerProps {
  docsumo?: any; // Raw Docsumo JSON for a 3-bureau IdentityIQ report
}

const BUREAUS = ['TransUnion', 'Experian', 'Equifax'] as const;

type BureauKey = typeof BUREAUS[number];

const formatCurrency = (val?: string | number) => {
  if (val === undefined || val === null) return '—';
  const n = typeof val === 'string' ? Number(String(val).replace(/[^0-9.-]/g, '')) : val;
  if (Number.isNaN(n)) return String(val);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
};

const present = (s?: string) => (s && String(s).trim() !== '' ? s : '—');

const scoreRank = (score?: number) => {
  if (!score || score <= 0) return { label: 'No Score', tone: 'secondary' as const };
  if (score >= 800) return { label: 'Excellent', tone: 'default' as const };
  if (score >= 740) return { label: 'Very Good', tone: 'default' as const };
  if (score >= 670) return { label: 'Good', tone: 'secondary' as const };
  if (score >= 580) return { label: 'Fair', tone: 'secondary' as const };
  return { label: 'Poor', tone: 'destructive' as const };
};

const parseSummary = (s?: string) => {
  // Example: "Total Accounts : 7 Open Accounts : 5 Closed Accounts : 2 Delinquent : 0 Derogatory : 0 Collection : 0 Balances : $18,031.00 Payments : $216.00 Public Records : 0 Inquiries(2 years) : 9"
  const result: Record<string, string> = {};
  if (!s) return result;
  const parts = s.split(/\s{2,}|\s(?=[A-Z])/g); // rough split preserving labels
  // Safer parse by known labels
  const labels = [
    'Total Accounts', 'Open Accounts', 'Closed Accounts', 'Delinquent', 'Derogatory', 'Collection', 'Balances', 'Payments', 'Public Records', 'Inquiries(2 years)'
  ];
  labels.forEach(label => {
    const re = new RegExp(`${label}\s*:\s*([^$]+|\$?[\d,]+(?:\.\d{2})?)`);
    const m = s.match(re);
    if (m) result[label] = m[1].trim();
  });
  return result;
};

export const TriBureauReportViewer: React.FC<TriBureauReportViewerProps> = ({ docsumo }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedFactors, setExpandedFactors] = useState<Record<BureauKey, boolean>>({
    TransUnion: false,
    Experian: false,
    Equifax: false,
  });

  // SEO
  useEffect(() => {
    const title = docsumo?.data?.['Basic Information']?.['Report Title']?.value || 'Three Bureau Credit Report';
    document.title = `${title} | Tri-Bureau Viewer`;
    const ensureMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.name = name;
        document.head.appendChild(el);
      }
      el.content = content;
    };
    ensureMeta('description', 'Tri-bureau credit report viewer comparing TransUnion, Experian, and Equifax side-by-side.');
    // Canonical
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = window.location.href.split('?')[0];
  }, [docsumo]);

  const header = docsumo?.data?.['Basic Information'] || {};
  const personal = docsumo?.data?.['Personal Information'] || {};
  const scoresRaw = docsumo?.data?.['Credit Score'] || {};
  const riskFactors = docsumo?.data?.['Risk Factors'] || {};
  const summaryRaw = docsumo?.data?.['Summary'] || {};
  const publicRecords = docsumo?.data?.['Public Records'] || {};
  const customerStatement = docsumo?.data?.['Customer Statement'] || {};
  const paymentHistory = docsumo?.data?.['Account History']?.['Two year payment history'] || [];

  const summaries: Record<BureauKey, Record<string, string>> = {
    TransUnion: parseSummary(summaryRaw?.['TransUnion']?.value),
    Experian: parseSummary(summaryRaw?.['Experian']?.value),
    Equifax: parseSummary(summaryRaw?.['Equifax']?.value),
  };

  const scoreMap: Record<BureauKey, number | undefined> = {
    TransUnion: scoresRaw?.['TransUnion']?.value ? Number(scoresRaw['TransUnion'].value) : undefined,
    Experian: scoresRaw?.['Experian']?.value ? Number(scoresRaw['Experian'].value) : undefined,
    Equifax: scoresRaw?.['Equifax']?.value ? Number(scoresRaw['Equifax'].value) : undefined,
  };

  const downloadPDF = () => {
    if (!containerRef.current) return;
    const opt = {
      margin: 10,
      filename: `${header?.['Report Title']?.value || 'Tri-Bureau-Credit-Report'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    } as any;
    html2pdf().from(containerRef.current).set(opt).save();
  };

  const renderTriRow = (label: string, tu?: string, ex?: string, eq?: string) => (
    <TableRow>
      <TableHead className="font-medium align-top">{label}</TableHead>
      <TableCell className="align-top">{present(tu)}</TableCell>
      <TableCell className="align-top">{present(ex)}</TableCell>
      <TableCell className="align-top">{present(eq)}</TableCell>
    </TableRow>
  );

  const currentAddresses = (personal?.['Current Addresses'] as any[]) || [];
  const previousAddresses = (personal?.['Previous Addresses'] as any[]) || [];

  return (
    <div className="space-y-6" ref={containerRef}>
      {/* Header */}
      <Card className="shadow-card sticky top-0 z-10">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>
              {header?.['Report Title']?.value || 'Three Bureau Credit Report'}
            </span>
            <Button size="sm" variant="outline" onClick={downloadPDF} className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm">
            <div className="font-medium">Report Date</div>
            <div className="text-muted-foreground">{present(header?.['Report Date']?.value)}</div>
          </div>
          <div className="text-sm">
            <div className="font-medium">Reference #</div>
            <div className="text-muted-foreground">{present(header?.['Reference Number']?.value)}</div>
          </div>
        </CardContent>
      </Card>

      <Accordion type="multiple" className="space-y-4">
        {/* Personal Information */}
        <AccordionItem value="personal-info">
          <AccordionTrigger>Personal Information</AccordionTrigger>
          <AccordionContent>
            <div className="overflow-x-auto">
              <Table>
                <TableCaption className="sr-only">Personal information as reported by each bureau</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead scope="col">TransUnion</TableHead>
                    <TableHead scope="col">Experian</TableHead>
                    <TableHead scope="col">Equifax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renderTriRow('Name', personal?.['Name']?.value, personal?.['Name']?.value, personal?.['Name']?.value)}
                  {renderTriRow('Also Known As', personal?.['Also Known As']?.value, personal?.['Also Known As']?.value, personal?.['Also Known As']?.value)}
                  {renderTriRow('Former Names', personal?.['Former Names']?.value, personal?.['Former Names']?.value, personal?.['Former Names']?.value)}
                  {renderTriRow('Date of Birth', personal?.['Date of Birth']?.value, personal?.['Date of Birth']?.value, personal?.['Date of Birth']?.value)}
                  {/* Employers */}
                  {renderTriRow('Employers', personal?.['Employers']?.value, personal?.['Employers']?.value, personal?.['Employers']?.value)}
                  {/* Current Addresses */}
                  <TableRow>
                    <TableHead className="font-medium align-top">Current Addresses</TableHead>
                    {(['TransUnion','Experian','Equifax'] as BureauKey[]).map((b, i) => (
                      <TableCell key={b} className="align-top whitespace-pre-line">
                        {currentAddresses.length > 0 ? (
                          currentAddresses.map((addr: any, idx: number) => (
                            <div key={idx} className="mb-2 last:mb-0">
                              {present([
                                addr?.['Street Line 1']?.value,
                                addr?.['Street Line 2']?.value,
                                addr?.['City']?.value,
                                addr?.['State']?.value,
                                addr?.['Zip Code']?.value,
                              ].filter(Boolean).join(', '))}
                              {addr?.['Date Reported']?.value ? (
                                <div className="text-xs text-muted-foreground">Reported {addr['Date Reported'].value}</div>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <em className="text-muted-foreground">—</em>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* Previous Addresses */}
                  <TableRow>
                    <TableHead className="font-medium align-top">Previous Addresses</TableHead>
                    {(['TransUnion','Experian','Equifax'] as BureauKey[]).map((b) => (
                      <TableCell key={b} className="align-top whitespace-pre-line">
                        {previousAddresses.length > 0 ? (
                          previousAddresses.map((addr: any, idx: number) => (
                            <div key={idx} className="mb-2 last:mb-0">
                              {present([
                                addr?.['Street Line 1']?.value,
                                addr?.['Street Line 2']?.value,
                                addr?.['City']?.value,
                                addr?.['State']?.value,
                                addr?.['Zip Code']?.value,
                              ].filter(Boolean).join(', '))}
                              {addr?.['Date Reported']?.value ? (
                                <div className="text-xs text-muted-foreground">Reported {addr['Date Reported'].value}</div>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <em className="text-muted-foreground">—</em>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Credit Scores */}
        <AccordionItem value="scores">
          <AccordionTrigger>Credit Scores</AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {BUREAUS.map((b: BureauKey) => {
                const score = scoreMap[b];
                const rank = scoreRank(score);
                return (
                  <Card key={b} className="shadow-card">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        {b}
                        <Badge variant={rank.tone}>{rank.label}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-4xl font-bold mb-1">
                        {score !== undefined ? score : '—'}
                      </div>
                      <div className="text-sm text-muted-foreground">Scale: 300–850</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Risk Factors */}
            <div className="mt-6 space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" /> Score Risk Factors
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {BUREAUS.map((b: BureauKey) => {
                  const raw = riskFactors?.[b]?.value as string | undefined;
                  if (!raw) {
                    return (
                      <Card key={b}>
                        <CardHeader>
                          <CardTitle className="text-base">{b}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <em className="text-muted-foreground">—</em>
                        </CardContent>
                      </Card>
                    );
                  }
                  const short = raw.slice(0, 160);
                  const expanded = expandedFactors[b];
                  return (
                    <Card key={b}>
                      <CardHeader>
                        <CardTitle className="text-base">{b}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          {expanded ? raw : `${short}${raw.length > 160 ? '…' : ''}`}
                        </p>
                        {raw.length > 160 && (
                          <Button variant="link" className="px-0 mt-2" onClick={() => setExpandedFactors(p => ({...p, [b]: !p[b]}))}>
                            {expanded ? 'Show less' : 'Show more'}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Credit Summary */}
        <AccordionItem value="summary">
          <AccordionTrigger>Credit Summary</AccordionTrigger>
          <AccordionContent>
            <div className="overflow-x-auto">
              <Table>
                <TableCaption className="sr-only">Credit summary by bureau</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead scope="col">TransUnion</TableHead>
                    <TableHead scope="col">Experian</TableHead>
                    <TableHead scope="col">Equifax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renderTriRow('Total Accounts', summaries.TransUnion['Total Accounts'], summaries.Experian['Total Accounts'], summaries.Equifax['Total Accounts'])}
                  {renderTriRow('Open Accounts', summaries.TransUnion['Open Accounts'], summaries.Experian['Open Accounts'], summaries.Equifax['Open Accounts'])}
                  {renderTriRow('Closed Accounts', summaries.TransUnion['Closed Accounts'], summaries.Experian['Closed Accounts'], summaries.Equifax['Closed Accounts'])}
                  {renderTriRow('Delinquent', summaries.TransUnion['Delinquent'], summaries.Experian['Delinquent'], summaries.Equifax['Delinquent'])}
                  {renderTriRow('Derogatory', summaries.TransUnion['Derogatory'], summaries.Experian['Derogatory'], summaries.Equifax['Derogatory'])}
                  {renderTriRow('Collection', summaries.TransUnion['Collection'], summaries.Experian['Collection'], summaries.Equifax['Collection'])}
                  {renderTriRow('Balances', summaries.TransUnion['Balances'], summaries.Experian['Balances'], summaries.Equifax['Balances'])}
                  {renderTriRow('Payments', summaries.TransUnion['Payments'], summaries.Experian['Payments'], summaries.Equifax['Payments'])}
                  {renderTriRow('Public Records', summaries.TransUnion['Public Records'], summaries.Experian['Public Records'], summaries.Equifax['Public Records'])}
                  {renderTriRow('Inquiries (24 months)', summaries.TransUnion['Inquiries(2 years)'], summaries.Experian['Inquiries(2 years)'], summaries.Equifax['Inquiries(2 years)'])}
                </TableBody>
              </Table>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Public Records */}
        <AccordionItem value="public-records">
          <AccordionTrigger>Public Records</AccordionTrigger>
          <AccordionContent>
            <Card>
              <CardContent className="p-4">
                {publicRecords?.['If None']?.value ? (
                  <div className="text-sm"><em className="text-muted-foreground">{publicRecords['If None'].value}</em></div>
                ) : (
                  <div className="text-sm">—</div>
                )}
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        {/* Customer Statements & Alerts */}
        <AccordionItem value="alerts">
          <AccordionTrigger>Customer Statement & Alerts</AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {BUREAUS.map((b: BureauKey) => {
                const key = `${b} Alerts`;
                const alerts = customerStatement?.[key] as any[] | undefined;
                return (
                  <Card key={b}>
                    <CardHeader>
                      <CardTitle className="text-base">{b}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {!alerts || alerts.length === 0 ? (
                        <em className="text-muted-foreground">—</em>
                      ) : (
                        alerts.map((al, idx) => (
                          <div key={idx} className="text-sm">
                            <div className="font-medium">{present(al?.['Alert Type']?.value)}</div>
                            {al?.['Alert Start Date']?.value && (
                              <div className="text-xs text-muted-foreground">Start: {al['Alert Start Date'].value}</div>
                            )}
                            {al?.['Alert Duration']?.value && (
                              <div className="text-xs text-muted-foreground">Duration: {al['Alert Duration'].value}</div>
                            )}
                            {al?.['Contact Phone']?.value && (
                              <div className="text-xs text-muted-foreground">Phone: {al['Contact Phone'].value}</div>
                            )}
                            {al?.['Alert Full Text']?.value && (
                              <blockquote className="mt-1 text-muted-foreground italic">{al['Alert Full Text'].value}</blockquote>
                            )}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Payment History (condensed) */}
        <AccordionItem value="payment-history">
          <AccordionTrigger>Two-Year Payment History</AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 gap-3">
              {Array.isArray(paymentHistory) && paymentHistory.length > 0 ? (
                paymentHistory.map((row: any, idx: number) => (
                  <Card key={idx}>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="h-4 w-4" /> Row {idx + 1}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm">
                      <div className="text-muted-foreground mb-2">
                        Months: {present(row?.['Month']?.value)} | Years: {present(row?.['Year']?.value)}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <div className="font-medium">TransUnion</div>
                          <div className="text-muted-foreground">{present(row?.['Transunion']?.value)}</div>
                        </div>
                        <div>
                          <div className="font-medium">Experian</div>
                          <div className="text-muted-foreground">{present(row?.['Experian']?.value)}</div>
                        </div>
                        <div>
                          <div className="font-medium">Equifax</div>
                          <div className="text-muted-foreground">{present(row?.['Equifax']?.value)}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <em className="text-muted-foreground">—</em>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default TriBureauReportViewer;
