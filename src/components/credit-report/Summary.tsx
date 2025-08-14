import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AccountSummary } from '../../schema';

interface SummaryProps {
  data: AccountSummary;
}

export const Summary: React.FC<SummaryProps> = ({ data }) => {
  return (
    <section aria-labelledby="account-summary-header">
      <Card>
        <CardHeader>
          <CardTitle id="account-summary-header">Account Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Total Accounts</TableCell>
                <TableCell>{data.totalAccounts ?? 'N/A'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Open Accounts</TableCell>
                <TableCell>{data.openAccounts ?? 'N/A'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Closed Accounts</TableCell>
                <TableCell>{data.closedAccounts ?? 'N/A'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Delinquent Accounts</TableCell>
                <TableCell className={data.delinquentAccounts && data.delinquentAccounts > 0 ? 'text-destructive' : ''}>
                  {data.delinquentAccounts ?? 'N/A'}
                </TableCell>
              </TableRow>
              {data.totalBalance && (
                <TableRow>
                  <TableCell className="font-medium">Total Balance</TableCell>
                  <TableCell>{data.totalBalance}</TableCell>
                </TableRow>
              )}
              {data.totalCreditLimit && (
                <TableRow>
                  <TableCell className="font-medium">Total Credit Limit</TableCell>
                  <TableCell>{data.totalCreditLimit}</TableCell>
                </TableRow>
              )}
              {data.creditUtilization && (
                <TableRow>
                  <TableCell className="font-medium">Credit Utilization</TableCell>
                  <TableCell>{data.creditUtilization}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
};