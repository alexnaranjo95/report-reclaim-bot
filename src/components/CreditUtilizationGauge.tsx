import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';

interface Account {
  id: string;
  creditor: string;
  type: 'revolving' | 'installment' | 'mortgage';
  status: 'open' | 'closed' | 'derogatory' | 'collection';
  balance: number;
  limit?: number;
}

interface CreditUtilizationGaugeProps {
  accounts: Account[];
  overallUtilization: number;
}

export const CreditUtilizationGauge: React.FC<CreditUtilizationGaugeProps> = ({ 
  accounts, 
  overallUtilization 
}) => {
  // Filter to only revolving accounts that are open
  const revolvingAccounts = accounts.filter(
    account => account.type === 'revolving' && 
               account.status === 'open' && 
               account.limit && 
               account.limit > 0
  );

  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 70) return 'text-danger';
    if (utilization >= 30) return 'text-warning';
    return 'text-success';
  };

  const getUtilizationStatus = (utilization: number) => {
    if (utilization >= 70) return { status: 'High Risk', color: 'destructive' as const, icon: AlertTriangle };
    if (utilization >= 30) return { status: 'Moderate', color: 'secondary' as const, icon: TrendingUp };
    return { status: 'Good', color: 'default' as const, icon: CheckCircle };
  };

  const overallStatus = getUtilizationStatus(overallUtilization);

  // Calculate individual account utilizations
  const accountUtilizations = revolvingAccounts.map(account => ({
    ...account,
    utilization: account.limit ? (account.balance / account.limit) * 100 : 0,
    availableCredit: account.limit ? account.limit - account.balance : 0
  })).sort((a, b) => b.utilization - a.utilization);

  const totalCreditLimit = revolvingAccounts.reduce((sum, account) => sum + (account.limit || 0), 0);
  const totalBalance = revolvingAccounts.reduce((sum, account) => sum + account.balance, 0);
  const totalAvailableCredit = totalCreditLimit - totalBalance;

  const CircularGauge: React.FC<{ value: number; size?: number }> = ({ value, size = 120 }) => {
    const radius = (size - 20) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference - (Math.min(value, 100) / 100) * circumference;

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="hsl(var(--border))"
            strokeWidth="8"
            fill="transparent"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`transition-all duration-1000 ease-out ${getUtilizationColor(value)}`}
          />
        </svg>
        
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={`text-2xl font-bold ${getUtilizationColor(value)}`}>
            {value.toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground">Utilization</div>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Overall Utilization */}
      <Card className="shadow-card lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Overall Credit Utilization
            <overallStatus.icon className={`h-4 w-4 ${
              overallStatus.color === 'destructive' ? 'text-danger' :
              overallStatus.color === 'secondary' ? 'text-warning' :
              'text-success'
            }`} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            <CircularGauge value={overallUtilization} />
          </div>
          
          <div className="text-center space-y-2">
            <Badge variant={overallStatus.color}>
              {overallStatus.status}
            </Badge>
            <div className="text-sm text-muted-foreground">
              {overallUtilization <= 10 ? 'Excellent credit utilization' :
               overallUtilization <= 30 ? 'Good credit utilization' :
               overallUtilization <= 50 ? 'Fair credit utilization' :
               'High credit utilization - consider paying down balances'}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total Balance:</span>
              <span className="font-medium">${totalBalance.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total Limit:</span>
              <span className="font-medium">${totalCreditLimit.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Available Credit:</span>
              <span className="font-medium text-success">${totalAvailableCredit.toLocaleString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual Account Utilizations */}
      <Card className="shadow-card lg:col-span-2">
        <CardHeader>
          <CardTitle>Individual Account Utilization</CardTitle>
          <p className="text-sm text-muted-foreground">
            Per-card utilization breakdown for revolving accounts
          </p>
        </CardHeader>
        <CardContent>
          {accountUtilizations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No revolving credit accounts found
            </div>
          ) : (
            <div className="space-y-4">
              {accountUtilizations.map(account => {
                const utilizationStatus = getUtilizationStatus(account.utilization);
                
                return (
                  <div key={account.id} className="space-y-3 p-4 border border-border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{account.creditor}</h4>
                        <p className="text-sm text-muted-foreground">
                          ****{account.id.slice(-4)}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${getUtilizationColor(account.utilization)}`}>
                          {account.utilization.toFixed(1)}%
                        </div>
                        <Badge 
                          variant={utilizationStatus.color}
                          className="text-xs"
                        >
                          {utilizationStatus.status}
                        </Badge>
                      </div>
                    </div>
                    
                    <Progress 
                      value={Math.min(account.utilization, 100)} 
                      className="h-2"
                    />
                    
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Balance</p>
                        <p className="font-medium">${account.balance.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Limit</p>
                        <p className="font-medium">${(account.limit || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Available</p>
                        <p className="font-medium text-success">
                          ${account.availableCredit.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};