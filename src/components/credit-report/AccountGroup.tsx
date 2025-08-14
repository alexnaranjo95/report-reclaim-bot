import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { AccountDetails } from '../../schema';

interface AccountGroupProps {
  creditor: string;
  accounts: AccountDetails[];
}

export const AccountGroup: React.FC<AccountGroupProps> = ({ creditor, accounts }) => {
  const getStatusBadgeVariant = (status: string) => {
    if (!status) return 'secondary';
    const lowercaseStatus = status.toLowerCase();
    if (lowercaseStatus.includes('paid') || lowercaseStatus.includes('current')) {
      return 'default';
    }
    if (lowercaseStatus.includes('late') || lowercaseStatus.includes('past due')) {
      return 'destructive';
    }
    return 'secondary';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{creditor}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Bureau</TableHead>
              <TableHead>Last Reported</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">
                  {account.accountNumber ? `***${account.accountNumber.slice(-4)}` : 'N/A'}
                </TableCell>
                <TableCell>{account.accountType || 'N/A'}</TableCell>
                <TableCell>{account.balance || 'N/A'}</TableCell>
                <TableCell>
                  {account.status ? (
                    <Badge variant={getStatusBadgeVariant(account.status)}>
                      {account.status}
                    </Badge>
                  ) : (
                    'N/A'
                  )}
                </TableCell>
                <TableCell>
                  {account.bureau?.length ? account.bureau.join(', ') : 'N/A'}
                </TableCell>
                <TableCell>{account.lastReportedDate || 'N/A'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Payment History */}
        {accounts.some(account => account.paymentHistory?.length) && (
          <div className="mt-6">
            <h4 className="text-sm font-medium mb-3">Payment History</h4>
            {accounts.map((account, accountIndex) => 
              account.paymentHistory?.length ? (
                <div key={accountIndex} className="mb-4">
                  <p className="text-xs text-muted-foreground mb-2">
                    Account: {account.accountNumber ? `***${account.accountNumber.slice(-4)}` : 'N/A'}
                  </p>
                  <div className="grid grid-cols-12 gap-1">
                    {account.paymentHistory.map((payment, i) => (
                      <div
                        key={i}
                        className={`
                          h-6 w-full rounded text-xs flex items-center justify-center text-white font-medium
                          ${payment.status === 'OK' ? 'bg-green-500' : 
                            payment.status === '30' ? 'bg-yellow-500' :
                            payment.status === '60' ? 'bg-orange-500' :
                            payment.status === '90' ? 'bg-red-500' :
                            'bg-gray-400'}
                        `}
                        title={`${payment.month}: ${payment.status}`}
                      >
                        {payment.status}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};