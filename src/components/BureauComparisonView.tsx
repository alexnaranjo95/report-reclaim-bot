import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, CheckCircle, Minus, Eye, EyeOff } from 'lucide-react';
import { CreditReportData } from '../types/CreditTypes';

interface BureauComparisonViewProps {
  data: CreditReportData;
}

export const BureauComparisonView: React.FC<BureauComparisonViewProps> = ({ data }) => {
  const [viewMode, setViewMode] = useState<'unified' | 'side-by-side'>('side-by-side');
  const [selectedBureaus, setSelectedBureaus] = useState<Set<string>>(new Set(['TransUnion', 'Experian', 'Equifax']));

  const bureaus = ['TransUnion', 'Experian', 'Equifax'];

  const toggleBureau = (bureau: string) => {
    const newSelected = new Set(selectedBureaus);
    if (newSelected.has(bureau)) {
      if (newSelected.size > 1) { // Don't allow deselecting all bureaus
        newSelected.delete(bureau);
      }
    } else {
      newSelected.add(bureau);
    }
    setSelectedBureaus(newSelected);
  };

  const getAccountsByBureau = (bureau: string) => {
    return data.accounts.filter(account => account.bureaus.includes(bureau));
  };

  const findDiscrepancies = () => {
    const discrepancies: Array<{
      type: 'account' | 'personal' | 'score';
      description: string;
      details: string;
      severity: 'high' | 'medium' | 'low';
    }> = [];

    // Check for score discrepancies
    const scores = Object.values(data.creditScores).filter(score => score?.score);
    if (scores.length > 1) {
      const minScore = Math.min(...scores.map(s => s!.score));
      const maxScore = Math.max(...scores.map(s => s!.score));
      if (maxScore - minScore > 50) {
        discrepancies.push({
          type: 'score',
          description: 'Large score variance between bureaus',
          details: `Score difference of ${maxScore - minScore} points`,
          severity: 'high'
        });
      }
    }

    // Check for account reporting differences
    bureaus.forEach(bureau => {
      const accountsOnBureau = getAccountsByBureau(bureau);
      const totalAccounts = data.accounts.length;
      
      if (accountsOnBureau.length < totalAccounts * 0.8) {
        discrepancies.push({
          type: 'account',
          description: `Missing accounts on ${bureau}`,
          details: `Only ${accountsOnBureau.length} of ${totalAccounts} accounts reported`,
          severity: 'medium'
        });
      }
    });

    return discrepancies;
  };

  const discrepancies = findDiscrepancies();

  const ComparisonTable: React.FC = () => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left p-3 font-medium">Metric</th>
            {Array.from(selectedBureaus).map(bureau => (
              <th key={bureau} className="text-center p-3 font-medium min-w-32">
                {bureau}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Credit Scores */}
          <tr className="border-b hover:bg-muted/50">
            <td className="p-3 font-medium">Credit Score</td>
            {Array.from(selectedBureaus).map(bureau => {
              const bureauKey = bureau.toLowerCase() as keyof typeof data.creditScores;
              const score = data.creditScores[bureauKey];
              return (
                <td key={bureau} className="text-center p-3">
                  {score ? (
                    <div>
                      <div className={`text-lg font-bold ${
                        score.score >= 700 ? 'text-success' :
                        score.score >= 600 ? 'text-warning' :
                        'text-danger'
                      }`}>
                        {score.score}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {score.rank}
                      </Badge>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <Minus className="h-4 w-4 mx-auto" />
                      <div className="text-xs">N/A</div>
                    </div>
                  )}
                </td>
              );
            })}
          </tr>

          {/* Account Counts */}
          <tr className="border-b hover:bg-muted/50">
            <td className="p-3 font-medium">Total Accounts</td>
            {Array.from(selectedBureaus).map(bureau => {
              const accountCount = getAccountsByBureau(bureau).length;
              return (
                <td key={bureau} className="text-center p-3">
                  <div className="text-lg font-semibold">{accountCount}</div>
                </td>
              );
            })}
          </tr>

          {/* Open Accounts */}
          <tr className="border-b hover:bg-muted/50">
            <td className="p-3 font-medium">Open Accounts</td>
            {Array.from(selectedBureaus).map(bureau => {
              const openCount = getAccountsByBureau(bureau).filter(acc => acc.status === 'open').length;
              return (
                <td key={bureau} className="text-center p-3">
                  <div className="text-lg font-semibold text-success">{openCount}</div>
                </td>
              );
            })}
          </tr>

          {/* Derogatory Accounts */}
          <tr className="border-b hover:bg-muted/50">
            <td className="p-3 font-medium">Derogatory Accounts</td>
            {Array.from(selectedBureaus).map(bureau => {
              const derogatoryCount = getAccountsByBureau(bureau).filter(
                acc => acc.status === 'derogatory' || acc.status === 'collection'
              ).length;
              return (
                <td key={bureau} className="text-center p-3">
                  <div className={`text-lg font-semibold ${
                    derogatoryCount > 0 ? 'text-danger' : 'text-success'
                  }`}>
                    {derogatoryCount}
                  </div>
                </td>
              );
            })}
          </tr>

          {/* Inquiries */}
          <tr className="border-b hover:bg-muted/50">
            <td className="p-3 font-medium">Recent Inquiries (24 months)</td>
            {Array.from(selectedBureaus).map(bureau => {
              // Note: In a real implementation, inquiries would be bureau-specific
              const inquiryCount = data.inquiries.filter(inq => inq.type === 'hard').length;
              return (
                <td key={bureau} className="text-center p-3">
                  <div className={`text-lg font-semibold ${
                    inquiryCount > 6 ? 'text-warning' : 'text-success'
                  }`}>
                    {inquiryCount}
                  </div>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'side-by-side' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('side-by-side')}
          >
            Side by Side
          </Button>
          <Button
            variant={viewMode === 'unified' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('unified')}
          >
            Unified View
          </Button>
        </div>

        <div className="flex gap-2">
          {bureaus.map(bureau => (
            <Button
              key={bureau}
              variant={selectedBureaus.has(bureau) ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleBureau(bureau)}
              className="flex items-center gap-2"
            >
              {selectedBureaus.has(bureau) ? (
                <Eye className="h-3 w-3" />
              ) : (
                <EyeOff className="h-3 w-3" />
              )}
              {bureau}
            </Button>
          ))}
        </div>
      </div>

      {/* Discrepancies Alert */}
      {discrepancies.length > 0 && (
        <Card className="border-l-4 border-l-warning bg-warning/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Bureau Discrepancies Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {discrepancies.map((discrepancy, index) => (
                <div key={index} className="flex items-start gap-3">
                  <Badge variant={
                    discrepancy.severity === 'high' ? 'destructive' :
                    discrepancy.severity === 'medium' ? 'secondary' :
                    'outline'
                  }>
                    {discrepancy.severity.toUpperCase()}
                  </Badge>
                  <div>
                    <p className="font-medium">{discrepancy.description}</p>
                    <p className="text-sm text-muted-foreground">{discrepancy.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Comparison View */}
      {viewMode === 'side-by-side' ? (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Bureau-by-Bureau Comparison</CardTitle>
            <p className="text-sm text-muted-foreground">
              Compare key metrics across selected credit bureaus
            </p>
          </CardHeader>
          <CardContent>
            <ComparisonTable />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from(selectedBureaus).map(bureau => {
            const bureauKey = bureau.toLowerCase() as keyof typeof data.creditScores;
            const score = data.creditScores[bureauKey];
            const accounts = getAccountsByBureau(bureau);
            
            return (
              <Card key={bureau} className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {bureau}
                    {score && (
                      <Badge variant={
                        score.score >= 700 ? 'default' :
                        score.score >= 600 ? 'secondary' :
                        'destructive'
                      }>
                        {score.score}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Score Section */}
                  {score ? (
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className={`text-2xl font-bold mb-1 ${
                        score.score >= 700 ? 'text-success' :
                        score.score >= 600 ? 'text-warning' :
                        'text-danger'
                      }`}>
                        {score.score}
                      </div>
                      <div className="text-sm text-muted-foreground">{score.rank}</div>
                    </div>
                  ) : (
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-muted-foreground">No Score Available</div>
                    </div>
                  )}

                  {/* Account Stats */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Accounts</p>
                      <p className="font-semibold">{accounts.length}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Open</p>
                      <p className="font-semibold text-success">
                        {accounts.filter(acc => acc.status === 'open').length}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Derogatory</p>
                      <p className="font-semibold text-danger">
                        {accounts.filter(acc => acc.status === 'derogatory' || acc.status === 'collection').length}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Inquiries</p>
                      <p className="font-semibold">
                        {data.inquiries.filter(inq => inq.type === 'hard').length}
                      </p>
                    </div>
                  </div>

                  {/* Top Risk Factors */}
                  {score?.factors.length && (
                    <div>
                      <p className="text-sm font-medium mb-2">Top Risk Factors</p>
                      <ul className="space-y-1">
                        {score.factors.slice(0, 3).map((factor, index) => (
                          <li key={index} className="text-xs text-muted-foreground flex items-start gap-1">
                            <span className="text-warning">•</span>
                            <span>{factor}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};