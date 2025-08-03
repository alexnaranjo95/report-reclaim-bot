import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Search, Download, Play, Pause, Users, Mail, DollarSign, TrendingUp, Clock, FileText, Brain } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '@/hooks/useRole';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AdminMetrics } from '@/components/AdminMetrics';
import { TenantDataGrid } from '@/components/TenantDataGrid';
import { DataAIConfiguration } from '@/components/DataAIConfiguration';
import TemplateManager from '@/components/TemplateManager';
import { AdminSettings } from '@/components/AdminSettings';
import { LogOut, Settings } from 'lucide-react';
const Admin = () => {
  const navigate = useNavigate();
  const {
    isSuperAdmin,
    isAdmin,
    loading: roleLoading
  } = useRole();
  const {
    toast
  } = useToast();
  const [activeView, setActiveView] = useState('dashboard');
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

  // Redirect if not admin or superadmin (with better timing logic)
  useEffect(() => {
    // Only check access after role loading is complete and no impersonation
    if (!roleLoading && !isSuperAdmin && !isAdmin && !isImpersonating) {
      // Add a delay to prevent rapid toast notifications
      const timer = setTimeout(() => {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access the admin portal.",
          variant: "destructive"
        });
        navigate('/');
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isSuperAdmin, isAdmin, roleLoading, navigate, toast, isImpersonating]);
  const handleRevertImpersonation = async () => {
    try {
      const impersonationData = sessionStorage.getItem('impersonation_data');
      if (!impersonationData) return;
      const data = JSON.parse(impersonationData);

      // Restore original admin session
      const {
        error
      } = await supabase.auth.setSession({
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
        description: "You've been returned to your admin account."
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
        variant: "destructive"
      });
    }
  };
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      sessionStorage.clear();
      navigate('/auth');
    } catch (error) {
      console.error('Error logging out:', error);
      toast({
        title: "Error",
        description: "Failed to log out. Please try again.",
        variant: "destructive"
      });
    }
  };
  if (roleLoading) {
    return <div className="min-h-screen bg-gradient-dashboard flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>;
  }
  if (!isSuperAdmin && !isAdmin && !isImpersonating) {
    return null; // Will redirect via useEffect
  }
  return <div className="min-h-screen bg-gradient-dashboard">

      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                {isSuperAdmin ? 'Super Admin Portal' : 'Admin Portal'}
              </h1>
              <p className="text-muted-foreground">
                {isSuperAdmin ? 'Monitor and control all customer instances' : 'Manage your organization customers'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={isSuperAdmin ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"}>
                {isSuperAdmin ? 'Super Admin Access' : 'Admin Access'}
              </Badge>
              <Button variant="outline" onClick={handleLogout} className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                Log Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-4 border-b">
          <Button variant={activeView === 'dashboard' ? 'default' : 'ghost'} onClick={() => setActiveView('dashboard')} className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Dashboard
          </Button>
          <Button variant={activeView === 'clients' ? 'default' : 'ghost'} onClick={() => setActiveView('clients')} className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Client Management
          </Button>
          {isSuperAdmin && (
            <Button variant={activeView === 'templates' ? 'default' : 'ghost'} onClick={() => setActiveView('templates')} className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </Button>
          )}
          <Button variant={activeView === 'ai' ? 'default' : 'ghost'} onClick={() => setActiveView('ai')} className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Training
          </Button>
          <Button variant={activeView === 'settings' ? 'default' : 'ghost'} onClick={() => setActiveView('settings')} className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </div>

        {/* Dashboard Tab */}
        {activeView === 'dashboard' && <AdminMetrics />}

        {/* Client Management Tab */}
        {activeView === 'clients' && <>
            {/* Client Management Portal */}
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
              </div>
            </CardHeader>
            <CardContent>
              <TenantDataGrid searchQuery={searchQuery} onImpersonate={user => {
              setIsImpersonating(true);
              setImpersonatedUser(user);
            }} />
            </CardContent>
            </Card>
          </>}

        {/* Templates Tab - Only for Super Admins */}
        {activeView === 'templates' && isSuperAdmin && (
          <Card className="bg-gradient-card shadow-card">
            <CardContent>
              <TemplateManager />
            </CardContent>
          </Card>
        )}

        {/* AI Training Tab */}
        {activeView === 'ai' && <DataAIConfiguration />}

        {/* Settings Tab */}
        {activeView === 'settings' && <AdminSettings />}
      </div>
    </div>;
};
export default Admin;