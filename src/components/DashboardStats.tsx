import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string;
  change?: string;
  icon: LucideIcon;
  color: string;
}

export const StatsCard = ({ title, value, change, icon: Icon, color }: StatsCardProps) => {
  return (
    <Card className="bg-gradient-card shadow-card">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {change && (
              <p className="text-xs text-muted-foreground">
                {change}
              </p>
            )}
          </div>
          <Icon className={`h-8 w-8 ${color}`} />
        </div>
      </CardContent>
    </Card>
  );
};

interface DashboardStatsProps {
  stats: {
    totalRevenue: string;
    lettersSent: string;
    activeUsers: string;
    draftRounds: string;
    resolvedCases: string;
    successRate: string;
  };
  changes?: {
    totalRevenue?: string;
    lettersSent?: string;
    activeUsers?: string;
    draftRounds?: string;
    resolvedCases?: string;
    successRate?: string;
  };
  icons: {
    totalRevenue: LucideIcon;
    lettersSent: LucideIcon;
    activeUsers: LucideIcon;
    draftRounds: LucideIcon;
    resolvedCases: LucideIcon;
    successRate: LucideIcon;
  };
  loading?: boolean;
}

export const DashboardStats = ({ stats, changes = {}, icons, loading = false }: DashboardStatsProps) => {
  const statsConfig = [
    {
      title: "Total Revenue",
      value: stats.totalRevenue,
      change: changes.totalRevenue,
      icon: icons.totalRevenue,
      color: "text-green-600"
    },
    {
      title: "Letters Sent",
      value: stats.lettersSent,
      change: changes.lettersSent,
      icon: icons.lettersSent,
      color: "text-blue-600"
    },
    {
      title: "Active Users",
      value: stats.activeUsers,
      change: changes.activeUsers,
      icon: icons.activeUsers,
      color: "text-purple-600"
    },
    {
      title: "Draft Rounds",
      value: stats.draftRounds,
      change: changes.draftRounds,
      icon: icons.draftRounds,
      color: "text-orange-600"
    },
    {
      title: "Resolved Cases",
      value: stats.resolvedCases,
      change: changes.resolvedCases,
      icon: icons.resolvedCases,
      color: "text-emerald-600"
    },
    {
      title: "Success Rate",
      value: stats.successRate,
      change: changes.successRate,
      icon: icons.successRate,
      color: "text-rose-600"
    }
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {statsConfig.map((_, index) => (
          <Card key={index} className="bg-gradient-card shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="h-4 w-20 bg-muted animate-pulse rounded mb-2" />
                  <div className="h-8 w-16 bg-muted animate-pulse rounded mb-1" />
                  <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                </div>
                <div className="h-8 w-8 bg-muted animate-pulse rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      {statsConfig.map((stat, index) => (
        <StatsCard key={index} {...stat} />
      ))}
    </div>
  );
};