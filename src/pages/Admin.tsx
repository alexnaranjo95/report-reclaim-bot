import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  ArrowLeft, 
  Search, 
  Download, 
  Play, 
  Pause, 
  Users, 
  Mail, 
  DollarSign, 
  TrendingUp,
  Clock,
  FileText
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '@/hooks/useRole';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AdminMetrics } from '@/components/AdminMetrics';
import { TenantDataGrid } from '@/components/TenantDataGrid';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { DataAIConfiguration } from '@/components/DataAIConfiguration';

const Admin = () => {
  const navigate = useNavigate();
  const { isSuperAdmin, loading: roleLoading } = useRole();
  const { toast } = useToast();
  const [activeView, setActiveView] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedUser, setImpersonatedUser] = useState<any>(null);

  // Check for impersonation state on mount
  useEffect(() => {
    const impersonationData = sessionStorage.getItem('impersonation_data');
    if (impersonationData) {
      const data = JSON.parse(impersonationData);
      setIsImpersonating(true);
      setImpersonatedUser(data.user);
    }
  }, []);

  // Redirect if not superadmin (with better timing logic)
  useEffect(() => {
    // Only check access after role loading is complete and no impersonation
    if (!roleLoading && !isSuperAdmin && !isImpersonating) {
      // Add a delay to prevent rapid toast notifications
      const timer = setTimeout(() => {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access the admin portal.",
          variant: "destructive",
        });
        navigate('/');
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isSuperAdmin, roleLoading, navigate, toast, isImpersonating]);

  const handleRevertImpersonation = async () => {
    try {
      const impersonationData = sessionStorage.getItem('impersonation_data');
      if (!impersonationData) return;

      const data = JSON.parse(impersonationData);
      
      // Restore original token
      const { error } = await supabase.auth.setSession({
        access_token: data.originalToken,
        refresh_token: data.originalRefreshToken
      });

      if (error) throw error;

      // Clear impersonation data
      sessionStorage.removeItem('impersonation_data');
      setIsImpersonating(false);
      setImpersonatedUser(null);

      toast({
        title: "Impersonation Ended",
        description: "You've been returned to your admin account.",
      });

      // Restore admin state if available
      const adminState = localStorage.getItem('admin_state');
      if (adminState) {
        const state = JSON.parse(adminState);
        setSearchQuery(state.searchQuery || '');
      }
    } catch (error) {
      console.error('Error reverting impersonation:', error);
      toast({
        title: "Error",
        description: "Failed to revert impersonation. Please refresh the page.",
        variant: "destructive",
      });
    }
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-gradient-dashboard flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isSuperAdmin && !isImpersonating) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="min-h-screen bg-gradient-dashboard">
      {/* Impersonation Banner */}
      {isImpersonating && (
        <ImpersonationBanner 
          userName={impersonatedUser?.display_name || impersonatedUser?.email || 'Unknown User'}
          onRevert={handleRevertImpersonation}
        />
      )}

      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/')}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
              <div className="h-6 w-px bg-border" />
              <div>
                <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  Super Admin Portal
                </h1>
                <p className="text-muted-foreground">Monitor and control all customer instances</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              Super Admin Access
            </Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-4 border-b">
          <Button
            variant={activeView === 'overview' ? 'default' : 'ghost'}
            onClick={() => setActiveView('overview')}
            className="flex items-center gap-2"
          >
            <TrendingUp className="h-4 w-4" />
            Overview
          </Button>
          <Button
            variant={activeView === 'clients' ? 'default' : 'ghost'}
            onClick={() => setActiveView('clients')}
            className="flex items-center gap-2"
          >
            <Users className="h-4 w-4" />
            Client Management
          </Button>
          <Button
            variant={activeView === 'data-ai' ? 'default' : 'ghost'}
            onClick={() => setActiveView('data-ai')}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            Data & AI
          </Button>
        </div>

        {/* Overview Tab */}
        {activeView === 'overview' && (
          <>
            {/* System Metrics Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="bg-gradient-card shadow-card">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-full">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Clients</p>
                      <p className="text-2xl font-bold">247</p>
                      <p className="text-xs text-green-600">+12 this month</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-card shadow-card">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-full">
                      <FileText className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Letters Sent</p>
                      <p className="text-2xl font-bold">1,847</p>
                      <p className="text-xs text-green-600">+156 this week</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-card shadow-card">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-green-500/10 rounded-full">
                      <DollarSign className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Revenue (MTD)</p>
                      <p className="text-2xl font-bold">$12,450</p>
                      <p className="text-xs text-green-600">+8.2% from last month</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-card shadow-card">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-orange-500/10 rounded-full">
                      <TrendingUp className="h-6 w-6 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                      <p className="text-2xl font-bold">73%</p>
                      <p className="text-xs text-green-600">+5% this quarter</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Client Management Tab */}
        {activeView === 'clients' && (
          <Card className="bg-gradient-card shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Client Management Portal
                  </CardTitle>
                  <CardDescription>
                    Access client accounts, view contact information, and manage their credit repair journey
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search clients by name, email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 w-64"
                    />
                  </div>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Export Client Data
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <TenantDataGrid 
                searchQuery={searchQuery}
                onImpersonate={(user) => {
                  setIsImpersonating(true);
                  setImpersonatedUser(user);
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Data & AI Configuration Tab */}
        {activeView === 'data-ai' && (
          <DataAIConfiguration />
        )}
      </div>
    </div>
  );
};

export default Admin;