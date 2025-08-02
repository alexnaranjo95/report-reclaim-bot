import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  DollarSign, 
  Mail, 
  Users, 
  TrendingUp, 
  Clock, 
  FileText 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

interface MetricsData {
  lettersSent: number;
  postageCost: number;
  platformFee: number;
  disputesDrafted: number;
  disputesResolved: number;
  activeUsers: number;
  totalRevenue: number;
  dailyRevenue: Array<{ date: string; revenue: number; letters: number }>;
  disputeStatus: Array<{ name: string; value: number; color: string }>;
}

const fetcher = async (url: string): Promise<MetricsData> => {
  // Get real data from database
  const { data: sessions } = await supabase.from('sessions').select('*');
  const { data: letters } = await supabase.from('letters').select('*');
  const { data: rounds } = await supabase.from('rounds').select('*');
  const { data: profiles } = await supabase.from('profiles').select('*');
  
  const lettersSent = letters?.filter(l => l.status === 'sent').length || 0;
  const activeUsers = profiles?.length || 0; // Use total registered users
  const disputesDrafted = letters?.filter(l => l.status === 'draft').length || 0;
  const disputesResolved = rounds?.filter(r => r.status === 'completed').length || 0;
  
  // Generate real daily data based on actual letter creation dates
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    
    const dailyLetters = letters?.filter(l => {
      const letterDate = new Date(l.created_at);
      return letterDate >= dayStart && letterDate <= dayEnd;
    }).length || 0;
    
    return {
      date: date.toISOString().split('T')[0],
      revenue: dailyLetters * 2.5, // $2.50 per letter
      letters: dailyLetters
    };
  });

  const disputeStatus = [
    { name: 'Resolved', value: disputesResolved, color: '#10b981' },
    { name: 'Pending', value: disputesDrafted, color: '#f59e0b' },
    { name: 'In Progress', value: lettersSent - disputesResolved, color: '#3b82f6' }
  ];

  return {
    lettersSent,
    postageCost: lettersSent * 0.75, // $0.75 per letter
    platformFee: lettersSent * 2.5, // $2.50 per letter
    disputesDrafted,
    disputesResolved,
    activeUsers,
    totalRevenue: lettersSent * 2.5,
    dailyRevenue: last30Days,
    disputeStatus
  };
};

export const AdminMetrics = () => {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        const data = await fetcher('/api/admin/metrics?range=30d');
        setMetrics(data);
      } catch (err) {
        setError(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadMetrics();
    const interval = setInterval(loadMetrics, 60000); // Refresh every minute

    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="bg-gradient-card shadow-card">
            <CardContent className="p-6">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="bg-gradient-card shadow-card mb-6">
        <CardContent className="p-6">
          <p className="text-destructive">Failed to load metrics</p>
        </CardContent>
      </Card>
    );
  }

  const kpiCards = [
    {
      title: "Total Revenue",
      value: `$${metrics?.totalRevenue?.toFixed(2) || '0.00'}`,
      change: metrics?.totalRevenue ? `$${metrics.totalRevenue.toFixed(2)} total` : "No data",
      icon: DollarSign,
      color: "text-green-600"
    },
    {
      title: "Letters Sent",
      value: metrics?.lettersSent?.toString() || '0',
      change: `${metrics?.disputesDrafted || 0} drafts`,
      icon: Mail,
      color: "text-blue-600"
    },
    {
      title: "Active Users", 
      value: metrics?.activeUsers?.toString() || '0',
      change: "Total registered",
      icon: Users,
      color: "text-purple-600"
    },
    {
      title: "Draft Rounds",
      value: metrics?.disputesDrafted?.toString() || '0',
      change: "Awaiting review",
      icon: FileText,
      color: "text-orange-600"
    },
    {
      title: "Resolved Cases",
      value: metrics?.disputesResolved?.toString() || '0',
      change: "Completed rounds",
      icon: Clock,
      color: "text-emerald-600"
    },
    {
      title: "Success Rate",
      value: metrics && metrics.lettersSent > 0 ? `${Math.round((metrics.disputesResolved / metrics.lettersSent) * 100)}%` : '0%',
      change: `${metrics?.disputesResolved || 0}/${metrics?.lettersSent || 0} resolved`,
      icon: TrendingUp,
      color: "text-rose-600"
    }
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        {kpiCards.map((kpi, index) => (
          <Card key={index} className="bg-gradient-card shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{kpi.title}</p>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground">
                    {kpi.change}
                  </p>
                </div>
                <kpi.icon className={`h-8 w-8 ${kpi.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Line Chart */}
        <Card className="bg-gradient-card shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Daily Revenue Trend</CardTitle>
            <CardDescription>Platform fees from letter sending over last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={metrics?.dailyRevenue || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  fontSize={12}
                  tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                />
                <YAxis fontSize={12} />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                  formatter={(value, name) => [`$${Number(value).toFixed(2)}`, 'Revenue']}
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Dispute Status Pie Chart */}
        <Card className="bg-gradient-card shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Dispute Resolution Status</CardTitle>
            <CardDescription>Current status of all dispute cases</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={metrics?.disputeStatus || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {metrics?.disputeStatus?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, 'Cases']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Letters vs Drafts Bar Chart */}
      <Card className="bg-gradient-card shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">Daily Letter Activity</CardTitle>
          <CardDescription>Comparison of drafted vs sent letters over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={metrics?.dailyRevenue || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                fontSize={12}
                tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              />
              <YAxis fontSize={12} />
              <Tooltip 
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
              />
              <Legend />
              <Bar dataKey="letters" fill="hsl(var(--primary))" name="Letters Sent" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};