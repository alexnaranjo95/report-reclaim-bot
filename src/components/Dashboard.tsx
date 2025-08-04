import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, BarChart3, Settings, LogOut, Upload, TrendingUp } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CreditReportUpload } from './CreditReportUpload';
import { CreditReportDashboard } from './CreditReportDashboard';

export const Dashboard = () => {
  const { user, signOut } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [reportsCount, setReportsCount] = useState(0);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    if (!user) return;
    
    try {
      // Load sessions
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .order('updated_at', { ascending: false });

      if (sessionsError) throw sessionsError;
      setSessions(sessionsData || []);

      // Load credit reports count
      const { count, error: reportsError } = await supabase
        .from('credit_reports')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (reportsError) throw reportsError;
      setReportsCount(count || 0);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    }
  };

  const handleUploadComplete = (reportId: string) => {
    // Refresh dashboard data and switch to analysis tab
    loadDashboardData();
    setActiveTab("analysis");
    toast.success('Credit report uploaded successfully!');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-foreground">Credit Repair Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-muted-foreground">Welcome, {user?.email}</span>
              <Button variant="outline" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-card border-primary/20 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
              <FileText className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{sessions.length}</div>
              <p className="text-xs text-muted-foreground">Active sessions</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-success/20 shadow-success">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reports Processed</CardTitle>
              <TrendingUp className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{reportsCount}</div>
              <p className="text-xs text-muted-foreground">Credit reports analyzed</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-warning/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Status</CardTitle>
              <Settings className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">Ready</div>
              <p className="text-xs text-muted-foreground">All systems operational</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-accent/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">AI Analysis</CardTitle>
              <BarChart3 className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-accent">Active</div>
              <p className="text-xs text-muted-foreground">Smart parsing enabled</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Dashboard Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-card">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Report
            </TabsTrigger>
            <TabsTrigger value="analysis" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Analysis
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <Card className="bg-gradient-card">
              <CardHeader>
                <CardTitle className="text-primary">Welcome to Credit Repair Dashboard</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-semibold mb-4 text-foreground">Get Started</h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">1</div>
                        <div>
                          <p className="font-medium">Upload Credit Report</p>
                          <p className="text-sm text-muted-foreground">Upload your PDF credit report for analysis</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
                        <div className="w-8 h-8 bg-secondary text-secondary-foreground rounded-full flex items-center justify-center text-sm font-bold">2</div>
                        <div>
                          <p className="font-medium">AI Analysis</p>
                          <p className="text-sm text-muted-foreground">Automatic extraction and parsing of credit data</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
                        <div className="w-8 h-8 bg-secondary text-secondary-foreground rounded-full flex items-center justify-center text-sm font-bold">3</div>
                        <div>
                          <p className="font-medium">Review Results</p>
                          <p className="text-sm text-muted-foreground">Examine accounts, inquiries, and negative items</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold mb-4 text-foreground">Quick Actions</h3>
                    <div className="grid gap-3">
                      <Button 
                        onClick={() => setActiveTab("upload")} 
                        className="justify-start h-auto p-4 bg-gradient-primary hover:bg-primary/90"
                      >
                        <Upload className="h-5 w-5 mr-3" />
                        <div className="text-left">
                          <div className="font-medium">Upload New Report</div>
                          <div className="text-xs opacity-90">Start fresh credit analysis</div>
                        </div>
                      </Button>
                      {reportsCount > 0 && (
                        <Button 
                          onClick={() => setActiveTab("analysis")} 
                          variant="outline" 
                          className="justify-start h-auto p-4 border-primary/20 hover:bg-primary/5"
                        >
                          <TrendingUp className="h-5 w-5 mr-3" />
                          <div className="text-left">
                            <div className="font-medium">View Analysis</div>
                            <div className="text-xs text-muted-foreground">Review your credit reports</div>
                          </div>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Sessions */}
            {sessions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Recent Sessions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    {sessions.slice(0, 5).map((session) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-card-elevated transition-colors"
                      >
                        <div>
                          <h4 className="font-medium">{session.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            Created: {new Date(session.created_at).toLocaleDateString()}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Status: {session.status}
                          </p>
                        </div>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="upload" className="mt-6">
            <CreditReportUpload onUploadComplete={handleUploadComplete} />
          </TabsContent>

          <TabsContent value="analysis" className="mt-6">
            <CreditReportDashboard />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};