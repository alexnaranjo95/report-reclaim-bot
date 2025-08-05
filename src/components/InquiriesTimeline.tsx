import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, AlertTriangle, Search, CreditCard, Building, Car, Home, Zap } from 'lucide-react';

interface Inquiry {
  id: string;
  creditor: string;
  date: string;
  type: 'hard' | 'soft';
  purpose?: string;
}

interface InquiriesTimelineProps {
  inquiries: Inquiry[];
}

export const InquiriesTimeline: React.FC<InquiriesTimelineProps> = ({ inquiries }) => {
  const [selectedType, setSelectedType] = useState<'all' | 'hard' | 'soft'>('all');
  const [timeRange, setTimeRange] = useState<'12' | '24' | 'all'>('24');

  const getInquiryIcon = (purpose?: string) => {
    if (!purpose) return <Search className="h-4 w-4" />;
    
    const lowerPurpose = purpose.toLowerCase();
    if (lowerPurpose.includes('credit card') || lowerPurpose.includes('card')) {
      return <CreditCard className="h-4 w-4" />;
    }
    if (lowerPurpose.includes('auto') || lowerPurpose.includes('car') || lowerPurpose.includes('vehicle')) {
      return <Car className="h-4 w-4" />;
    }
    if (lowerPurpose.includes('mortgage') || lowerPurpose.includes('home')) {
      return <Home className="h-4 w-4" />;
    }
    if (lowerPurpose.includes('personal') || lowerPurpose.includes('loan')) {
      return <Building className="h-4 w-4" />;
    }
    return <Search className="h-4 w-4" />;
  };

  const getInquiryColor = (type: string) => {
    return type === 'hard' ? 'text-danger' : 'text-muted-foreground';
  };

  const filterInquiries = () => {
    let filtered = inquiries;
    
    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter(inquiry => inquiry.type === selectedType);
    }
    
    // Filter by time range
    if (timeRange !== 'all') {
      const monthsAgo = parseInt(timeRange);
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - monthsAgo);
      
      filtered = filtered.filter(inquiry => new Date(inquiry.date) >= cutoffDate);
    }
    
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const filteredInquiries = filterInquiries();

  // Group inquiries by month for timeline visualization
  const groupInquiriesByMonth = () => {
    const grouped: { [key: string]: Inquiry[] } = {};
    
    filteredInquiries.forEach(inquiry => {
      const date = new Date(inquiry.date);
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(inquiry);
    });
    
    return Object.entries(grouped)
      .map(([month, inquiries]) => ({
        month,
        monthLabel: new Date(month + '-01').toLocaleDateString('en-US', { 
          month: 'long', 
          year: 'numeric' 
        }),
        inquiries: inquiries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      }))
      .sort((a, b) => b.month.localeCompare(a.month));
  };

  const timelineData = groupInquiriesByMonth();

  // Calculate statistics
  const hardInquiries = inquiries.filter(inq => inq.type === 'hard');
  const softInquiries = inquiries.filter(inq => inq.type === 'soft');
  const recentHardInquiries = hardInquiries.filter(inq => {
    const inquiryDate = new Date(inq.date);
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    return inquiryDate >= twoYearsAgo;
  });

  const getInquiryImpact = (hardCount: number) => {
    if (hardCount === 0) return { level: 'excellent', color: 'text-success', message: 'No recent hard inquiries' };
    if (hardCount <= 2) return { level: 'good', color: 'text-success', message: 'Low inquiry impact' };
    if (hardCount <= 6) return { level: 'fair', color: 'text-warning', message: 'Moderate inquiry impact' };
    return { level: 'poor', color: 'text-danger', message: 'High inquiry impact' };
  };

  const impact = getInquiryImpact(recentHardInquiries.length);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-danger" />
              <span className="text-sm font-medium">Hard Inquiries (24 months)</span>
            </div>
            <div className="text-2xl font-bold text-danger">{recentHardInquiries.length}</div>
            <div className="text-xs text-muted-foreground">
              May affect credit score
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Soft Inquiries</span>
            </div>
            <div className="text-2xl font-bold">{softInquiries.length}</div>
            <div className="text-xs text-muted-foreground">
              No score impact
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Score Impact</span>
            </div>
            <div className={`text-2xl font-bold ${impact.color}`}>
              {impact.level.charAt(0).toUpperCase() + impact.level.slice(1)}
            </div>
            <div className="text-xs text-muted-foreground">
              {impact.message}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium">Est. Score Impact</span>
            </div>
            <div className="text-2xl font-bold text-warning">
              -{Math.min(recentHardInquiries.length * 5, 25)}
            </div>
            <div className="text-xs text-muted-foreground">
              Points (temporary)
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={selectedType === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedType('all')}
          >
            All Inquiries ({inquiries.length})
          </Button>
          <Button
            variant={selectedType === 'hard' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedType('hard')}
          >
            Hard ({hardInquiries.length})
          </Button>
          <Button
            variant={selectedType === 'soft' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedType('soft')}
          >
            Soft ({softInquiries.length})
          </Button>
        </div>

        <div className="flex gap-2">
          <Button
            variant={timeRange === '12' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeRange('12')}
          >
            12 Months
          </Button>
          <Button
            variant={timeRange === '24' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeRange('24')}
          >
            24 Months
          </Button>
          <Button
            variant={timeRange === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeRange('all')}
          >
            All Time
          </Button>
        </div>
      </div>

      {/* Inquiries Timeline */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Inquiries Timeline</CardTitle>
          <p className="text-sm text-muted-foreground">
            Chronological view of credit inquiries. Hard inquiries may temporarily lower your score.
          </p>
        </CardHeader>
        <CardContent>
          {filteredInquiries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4" />
              <p>No inquiries found for the selected filters.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {timelineData.map(({ month, monthLabel, inquiries }) => (
                <div key={month} className="relative">
                  {/* Month Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
                      {monthLabel}
                    </div>
                    <div className="h-px bg-border flex-1" />
                    <Badge variant="outline">
                      {inquiries.length} inquir{inquiries.length !== 1 ? 'ies' : 'y'}
                    </Badge>
                  </div>

                  {/* Inquiries for this month */}
                  <div className="space-y-3 ml-6">
                    {inquiries.map(inquiry => (
                      <div
                        key={inquiry.id}
                        className="flex items-center gap-4 p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className={`p-2 rounded-lg ${
                          inquiry.type === 'hard' ? 'bg-danger/10 text-danger' : 'bg-muted'
                        }`}>
                          {getInquiryIcon(inquiry.purpose)}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium">{inquiry.creditor}</h4>
                            <Badge variant={inquiry.type === 'hard' ? 'destructive' : 'secondary'}>
                              {inquiry.type.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{new Date(inquiry.date).toLocaleDateString()}</span>
                            {inquiry.purpose && (
                              <>
                                <span>•</span>
                                <span>{inquiry.purpose}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {inquiry.type === 'hard' && (
                          <div className="text-right">
                            <div className="text-sm font-medium text-danger">
                              -2 to -5 pts
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Temporary impact
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tips and Information */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="text-primary">Understanding Credit Inquiries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-danger" />
                Hard Inquiries
              </h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• May lower your score by 2-5 points</li>
                <li>• Stay on report for 2 years</li>
                <li>• Only affect score for 1 year</li>
                <li>• Multiple auto/mortgage inquiries in 14-45 days count as one</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                Soft Inquiries
              </h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• No impact on credit score</li>
                <li>• Include pre-approval offers</li>
                <li>• Account monitoring by current lenders</li>
                <li>• Your own credit report checks</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};