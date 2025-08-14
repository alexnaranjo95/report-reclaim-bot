import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, Area, AreaChart } from 'recharts';
import { CreditReportData } from '../types/CreditTypes';

interface CreditChartsOverviewProps {
  data: CreditReportData;
}

export const CreditChartsOverview: React.FC<CreditChartsOverviewProps> = ({ data }) => {
  // Prepare data for account mix chart
  const accountMixData = [
    { name: 'Revolving', value: data.accounts.filter(acc => acc.type === 'revolving').length, color: 'hsl(var(--primary))' },
    { name: 'Installment', value: data.accounts.filter(acc => acc.type === 'installment').length, color: 'hsl(var(--success))' },
    { name: 'Mortgage', value: data.accounts.filter(acc => acc.type === 'mortgage').length, color: 'hsl(var(--warning))' },
  ].filter(item => item.value > 0);

  // Prepare data for account status chart
  const statusData = [
    { name: 'Open', value: data.accounts.filter(acc => acc.status === 'open').length, color: 'hsl(var(--success))' },
    { name: 'Closed', value: data.accounts.filter(acc => acc.status === 'closed').length, color: 'hsl(var(--muted))' },
    { name: 'Derogatory', value: data.accounts.filter(acc => acc.status === 'derogatory').length, color: 'hsl(var(--danger))' },
    { name: 'Collection', value: data.accounts.filter(acc => acc.status === 'collection').length, color: 'hsl(var(--destructive))' },
  ].filter(item => item.value > 0);

  // Prepare utilization data
  const utilizationData = data.accounts
    .filter(acc => acc.type === 'revolving' && acc.status === 'open' && acc.limit)
    .map(acc => ({
      name: acc.creditor.substring(0, 10) + (acc.creditor.length > 10 ? '...' : ''),
      utilization: acc.limit ? (acc.balance / acc.limit) * 100 : 0,
      balance: acc.balance,
      limit: acc.limit
    }))
    .sort((a, b) => b.utilization - a.utilization);

  // Prepare credit age timeline data
  const generateCreditAgeData = () => {
    const monthlyData: { [key: string]: number } = {};
    
    data.accounts.forEach(account => {
      const openDate = new Date(account.dateOpened);
      const monthKey = `${openDate.getFullYear()}-${(openDate.getMonth() + 1).toString().padStart(2, '0')}`;
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
    });

    return Object.entries(monthlyData)
      .map(([month, count]) => ({ month, newAccounts: count, totalAccounts: 0 }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((item, index, array) => ({
        ...item,
        totalAccounts: array.slice(0, index + 1).reduce((sum, curr) => sum + curr.newAccounts, 0)
      }))
      .slice(-24); // Last 24 months
  };

  const creditAgeData = generateCreditAgeData();

  // Calculate credit score trend (simulated data)
  const generateScoreTrend = () => {
    const scores = Object.values(data.creditScores).filter(score => score?.score);
    if (scores.length === 0) return [];

    const averageScore = scores.reduce((sum, score) => sum + score!.score, 0) / scores.length;
    
    // Generate simulated historical trend
    return Array.from({ length: 12 }, (_, i) => {
      const variation = (Math.random() - 0.5) * 20;
      return {
        month: new Date(Date.now() - (11 - i) * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        score: Math.max(300, Math.min(850, Math.round(averageScore + variation)))
      };
    });
  };

  const scoreTrendData = generateScoreTrend();

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{label}</p>
          {payload.map((pld: any, index: number) => (
            <p key={index} style={{ color: pld.color }}>
              {`${pld.dataKey}: ${pld.value}${pld.dataKey === 'utilization' ? '%' : ''}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Account Mix Chart */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Account Mix</CardTitle>
          <p className="text-sm text-muted-foreground">
            Distribution of credit account types
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={accountMixData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {accountMixData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Account Status Chart */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Account Status</CardTitle>
          <p className="text-sm text-muted-foreground">
            Current status of all accounts
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Credit Utilization by Account */}
      {utilizationData.length > 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Credit Utilization by Account</CardTitle>
            <p className="text-sm text-muted-foreground">
              Individual account utilization rates
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={utilizationData.slice(0, 8)} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="name" type="category" width={80} />
                <Tooltip 
                  content={<CustomTooltip />}
                  formatter={(value: number, name: string) => [
                    name === 'utilization' ? `${value.toFixed(1)}%` : value,
                    name === 'utilization' ? 'Utilization' : name
                  ]}
                />
                <Bar 
                  dataKey="utilization" 
                  fill="hsl(var(--warning))" 
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Credit Score Trend */}
      {scoreTrendData.length > 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Credit Score Trend</CardTitle>
            <p className="text-sm text-muted-foreground">
              Score changes over the last 12 months
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={scoreTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis domain={[300, 850]} />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="score" 
                  stroke="hsl(var(--primary))" 
                  fill="hsl(var(--primary) / 0.1)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Credit Age Timeline */}
      {creditAgeData.length > 0 && (
        <Card className="shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle>Credit History Timeline</CardTitle>
            <p className="text-sm text-muted-foreground">
              Account opening timeline over the last 24 months
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={creditAgeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="totalAccounts"
                  stackId="1"
                  stroke="hsl(var(--success))"
                  fill="hsl(var(--success) / 0.2)"
                  name="Total Accounts"
                />
                <Bar 
                  dataKey="newAccounts" 
                  fill="hsl(var(--primary))" 
                  name="New Accounts"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};