import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { DataConsolidationService } from '@/services/DataConsolidationService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Users, CheckCircle, AlertTriangle } from 'lucide-react';

export const ParallelExtractionDashboard: React.FC = () => {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month'>('day');

  useEffect(() => {
    loadSummaryData();
  }, [timeRange]);

  const loadSummaryData = async () => {
    try {
      setLoading(true);
      const summaryData = await DataConsolidationService.getExtractionSummary(timeRange);
      setSummary(summaryData);
    } catch (error) {
      console.error('Failed to load summary data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'google-document-ai':
        return '#3b82f6';
      case 'google-vision':
        return '#10b981';
      case 'textract':
        return '#f97316';
      case 'fallback':
        return '#6b7280';
      default:
        return '#8b5cf6';
    }
  };

  const formatTimeRange = (range: string) => {
    switch (range) {
      case 'day':
        return 'Last 24 Hours';
      case 'week':
        return 'Last 7 Days';
      case 'month':
        return 'Last 30 Days';
      default:
        return range;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-8 bg-muted rounded"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!summary) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <TrendingUp className="h-8 w-8 mx-auto mb-2" />
            <p>No extraction data available.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const pieData = summary.methodBreakdown.map((item: any) => ({
    name: item.method,
    value: item.count,
    color: getMethodColor(item.method)
  }));

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium">Time Range:</span>
        {(['day', 'week', 'month'] as const).map((range) => (
          <Badge
            key={range}
            variant={timeRange === range ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setTimeRange(range)}
          >
            {formatTimeRange(range)}
          </Badge>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Extractions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalExtractions}</div>
            <p className="text-xs text-muted-foreground">
              {formatTimeRange(timeRange)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consolidations</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.consolidationStats.totalConsolidations}</div>
            <p className="text-xs text-muted-foreground">
              Avg confidence: {Math.round(summary.consolidationStats.avgConfidence * 100)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.consolidationStats.totalConsolidations > 0
                ? Math.round(((summary.consolidationStats.totalConsolidations - summary.consolidationStats.requiresReview) / summary.consolidationStats.totalConsolidations) * 100)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Automated processing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Review</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.consolidationStats.requiresReview}</div>
            <p className="text-xs text-muted-foreground">
              Manual review required
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Method Performance Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Extraction Method Performance</CardTitle>
          <CardDescription>
            Success rate and confidence levels by extraction method
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={summary.methodBreakdown}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="method" 
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis />
              <Tooltip />
              <Bar 
                dataKey="count" 
                fill="#8884d8" 
                name="Extractions"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Method Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Method Distribution</CardTitle>
            <CardDescription>
              Distribution of extraction methods used
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Method Details</CardTitle>
            <CardDescription>
              Detailed breakdown of each extraction method
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.methodBreakdown.map((method: any) => (
              <div key={method.method} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{method.method}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">
                      {method.count} extractions
                    </span>
                    <Badge variant="outline">
                      {Math.round(method.avgConfidence * 100)}% avg
                    </Badge>
                  </div>
                </div>
                <Progress 
                  value={method.avgConfidence * 100} 
                  className="h-2"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Consolidation Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Consolidation Statistics</CardTitle>
          <CardDescription>
            Overview of data consolidation performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {summary.consolidationStats.totalConsolidations - summary.consolidationStats.requiresReview}
              </div>
              <p className="text-sm text-muted-foreground">Automated Success</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {summary.consolidationStats.requiresReview}
              </div>
              <p className="text-sm text-muted-foreground">Manual Review</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {Math.round(summary.consolidationStats.avgConfidence * 100)}%
              </div>
              <p className="text-sm text-muted-foreground">Average Confidence</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};