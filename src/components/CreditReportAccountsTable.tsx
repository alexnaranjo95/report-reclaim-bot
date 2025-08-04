import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreditCard } from 'lucide-react';

interface CreditAccount {
  id: string;
  creditor_name: string;
  account_number?: string;
  account_type?: string;
  date_opened?: string;
  date_closed?: string;
  credit_limit?: number;
  current_balance?: number;
  account_status?: string;
  is_negative: boolean;
  payment_status?: string;
}

interface CreditReportAccountsTableProps {
  accounts: CreditAccount[];
}

export const CreditReportAccountsTable: React.FC<CreditReportAccountsTableProps> = ({ 
  accounts 
}) => {
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');

  const formatCurrency = (amount?: number) => {
    if (!amount) return '$0.00';
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (account: CreditAccount) => {
    if (account.is_negative) {
      return <Badge variant="destructive">Collection</Badge>;
    }
    
    const status = account.account_status?.toLowerCase();
    if (status?.includes('open') || status?.includes('current')) {
      return <Badge className="bg-green-500 hover:bg-green-600">Open</Badge>;
    } else if (status?.includes('closed')) {
      return <Badge variant="secondary">Closed</Badge>;
    }
    
    return <Badge variant="outline">{account.account_status || 'Unknown'}</Badge>;
  };

  const getBureau = (account: CreditAccount) => {
    // This would typically come from the data, but for demo purposes
    // we'll assign based on the account name or use a round-robin approach
    const bureaus = ['Equifax', 'Experian', 'TransUnion'];
    const hash = account.creditor_name.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return bureaus[hash % 3];
  };

  const filteredAccounts = accounts.filter(account => {
    if (filter === 'all') return true;
    if (filter === 'open') {
      const status = account.account_status?.toLowerCase();
      return status?.includes('open') || status?.includes('current') || !account.is_negative;
    }
    if (filter === 'closed') {
      const status = account.account_status?.toLowerCase();
      return status?.includes('closed');
    }
    return true;
  });

  const openAccounts = accounts.filter(acc => {
    const status = acc.account_status?.toLowerCase();
    return !acc.is_negative && (status?.includes('open') || status?.includes('current'));
  });

  const closedAccounts = accounts.filter(acc => {
    const status = acc.account_status?.toLowerCase();
    return status?.includes('closed');
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Accounts
        </CardTitle>
        <p className="text-sm text-muted-foreground">Overview of all credit accounts.</p>
      </CardHeader>
      <CardContent>
        {/* Filter Tabs */}
        <div className="flex items-center gap-2 mb-6">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All ({accounts.length})
          </Button>
          <Button
            variant={filter === 'open' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('open')}
          >
            Open ({openAccounts.length})
          </Button>
          <Button
            variant={filter === 'closed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('closed')}
          >
            Closed ({closedAccounts.length})
          </Button>
        </div>

        {filteredAccounts.length > 0 ? (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Bureau</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Date Opened</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">
                      {account.creditor_name}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        {getBureau(account)}
                      </span>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(account.current_balance)}
                    </TableCell>
                    <TableCell>
                      {formatDate(account.date_opened)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(account)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8">
            <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Accounts Found</h3>
            <p className="text-muted-foreground">
              {filter === 'all' 
                ? 'No credit accounts were found in this report.' 
                : `No ${filter} accounts found.`
              }
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};