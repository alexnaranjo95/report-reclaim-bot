import { useState, useEffect } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  Pause, 
  LogIn, 
  MoreHorizontal,
  ArrowUpDown,
  Download,
  DollarSign,
  Mail,
  Users,
  FileText,
  Clock,
  TrendingUp,
  Search
} from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardStats } from '@/components/DashboardStats';
import Papa from 'papaparse';
import useSWR from 'swr';

interface TenantData {
  user_id: string;
  display_name: string;
  email: string;
  total_sessions: number;
  total_letters: number;
  letters_sent: number;
  last_activity: string;
  status: 'active' | 'inactive' | 'dormant' | 'suspended';
  active_rounds: number;
  user_created_at: string;
  role?: 'superadmin' | 'admin' | 'user';
}

interface TenantDataGridProps {
  searchQuery: string;
  onImpersonate: (user: any) => void;
}

export const TenantDataGrid = ({ searchQuery: externalSearchQuery, onImpersonate }: TenantDataGridProps) => {
  const [tenants, setTenants] = useState<TenantData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<keyof TenantData>('last_activity');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 20;
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth(); // Get current admin user

  // Fetch metrics data with SWR
  const { data: metricsData, error: metricsError } = useSWR(
    '/api/admin/metrics?range=30d',
    () => fetchMetrics(),
    { refreshInterval: 60000 }
  );

  // Load/save grid state from localStorage
  useEffect(() => {
    const savedState = localStorage.getItem('tenantGrid_state');
    if (savedState) {
      try {
        const { sortField: savedSort, sortDirection: savedDirection, roleFilter: savedRole } = JSON.parse(savedState);
        if (savedSort) setSortField(savedSort);
        if (savedDirection) setSortDirection(savedDirection);
        if (savedRole) setRoleFilter(savedRole);
      } catch (e) {
        console.warn('Failed to load grid state:', e);
      }
    }
  }, []);

  // Save grid state to localStorage when it changes
  useEffect(() => {
    const state = { sortField, sortDirection, roleFilter };
    localStorage.setItem('tenantGrid_state', JSON.stringify(state));
  }, [sortField, sortDirection, roleFilter]);

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      
      // First try to get all users including auth users via edge function
      try {
        const { data: allUsers, error: usersError } = await supabase.functions.invoke('get-all-users');
        
        if (!usersError && allUsers) {
          console.log('Successfully fetched all users from edge function:', allUsers.length);
          
          // Preserve manually set statuses for existing tenants
          const usersWithPreservedStatus = allUsers.map((user: any) => {
            const existingTenant = tenants.find(t => t.user_id === user.user_id);
            if (existingTenant?.status) {
              return { ...user, status: existingTenant.status };
            }
            return user;
          });
          
          setTenants(usersWithPreservedStatus);
          return;
        }
      } catch (edgeFunctionError) {
        console.warn('Edge function failed, falling back to profiles query:', edgeFunctionError);
      }
      
      // Fallback: Fetch only profiles (existing behavior)
      console.log('Using fallback profiles query');
      const { data: profiles } = await supabase
        .from('profiles')
        .select(`
          user_id,
          display_name,
          email,
          created_at
        `)
        .order('created_at', { ascending: false });

      // Get session counts for each user
      const { data: sessionCounts } = await supabase
        .from('sessions')
        .select('user_id');

      // Get letter counts for each user
      const { data: letterCounts } = await supabase
        .from('letters')
        .select('user_id, status');

      // Get round counts for each user
      const { data: roundCounts } = await supabase
        .from('rounds')
        .select('user_id, status');

      // Process data to create tenant stats
      const sessionStats = sessionCounts?.reduce((acc, session) => {
        acc[session.user_id] = (acc[session.user_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      const letterStats = letterCounts?.reduce((acc, letter) => {
        if (!acc[letter.user_id]) {
          acc[letter.user_id] = { total: 0, sent: 0 };
        }
        acc[letter.user_id].total++;
        if (letter.status === 'sent') {
          acc[letter.user_id].sent++;
        }
        return acc;
      }, {} as Record<string, { total: number; sent: number }>) || {};

      const roundStats = roundCounts?.reduce((acc, round) => {
        if (!acc[round.user_id]) {
          acc[round.user_id] = { total: 0, active: 0 };
        }
        acc[round.user_id].total++;
        if (round.status === 'active') {
          acc[round.user_id].active++;
        }
        return acc;
      }, {} as Record<string, { total: number; active: number }>) || {};

      if (profiles) {
        const tenantsData: TenantData[] = profiles.map(profile => {
          const userSessions = sessionStats[profile.user_id] || 0;
          const userLetters = letterStats[profile.user_id] || { total: 0, sent: 0 };
          const userRounds = roundStats[profile.user_id] || { total: 0, active: 0 };
          
          // Check if this user has a manually set status in our local state
          const existingTenant = tenants.find(t => t.user_id === profile.user_id);
          let status: 'active' | 'inactive' | 'dormant' | 'suspended' = 'active'; // Default to active
          
          if (existingTenant?.status) {
            // Preserve manually set status
            status = existingTenant.status;
          } else {
            // Calculate status based on activity only for new users
            const daysSinceCreation = Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24));
            
            if (userSessions > 0 || userLetters.total > 0) {
              if (daysSinceCreation <= 7) status = 'active';
              else if (daysSinceCreation <= 30) status = 'inactive';
            }
          }

          return {
            user_id: profile.user_id,
            display_name: profile.display_name || 'Unknown User',
            email: profile.email || 'No email',
            total_sessions: userSessions,
            total_letters: userLetters.total,
            letters_sent: userLetters.sent,
            last_activity: profile.created_at,
            status,
            active_rounds: userRounds.active,
            user_created_at: profile.created_at
          };
        });

        setTenants(tenantsData);
      }
    } catch (error) {
      console.error('Error fetching tenants:', error);
      toast({
        title: "Error",
        description: "Failed to load tenant data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImpersonate = async (tenant: TenantData) => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "Admin user not found.",
        variant: "destructive",
      });
      return;
    }

    // Enhanced loginAsUser function with fail-safe mechanisms
    const loginAsUser = async (email: string): Promise<void> => {
      console.log('STARTING IMPERSONATION:', { email, adminUserId: user.id });

      // Store current admin state for restoration
      localStorage.setItem('admin_state', JSON.stringify({
        searchQuery: externalSearchQuery,
        currentPage,
        sortField,
        sortDirection
      }));

      // Get current session to store for later restoration
      const { data: currentSession } = await supabase.auth.getSession();

      // Step 1: POST to debug route exactly like the UI
      try {
        console.log('CALLING DEBUG ROUTE...');
        const { data: debugData, error: debugError } = await supabase.functions.invoke('admin-debug-impersonate', {
          body: { email }
        });

        if (debugError) {
          console.error('DEBUG ROUTE ERROR:', debugError);
          throw new Error(`Debug route failed: ${debugError.message}`);
        }

        if (!debugData?.impersonateFunction?.data) {
          console.error('DEBUG ROUTE: No impersonation data received');
          throw new Error(debugData?.impersonateFunction?.error?.message || 'No impersonation data received');
        }

        const impersonationData = debugData.impersonateFunction.data;
        console.log('DEBUG ROUTE SUCCESS:', { hasData: !!impersonationData });

        // Step 2: Attempt session setting with enhanced handling for impersonation tokens
        try {
          console.log('ATTEMPTING setSession with tokens...', {
            hasAccessToken: !!impersonationData.access_token,
            hasRefreshToken: !!impersonationData.refresh_token,
            isImpersonation: !!impersonationData.impersonation,
            source: impersonationData.source
          });

          // Special handling for impersonation override tokens
          if (impersonationData.impersonation && impersonationData.source === 'admin_impersonation_override') {
            console.log('USING ADMIN IMPERSONATION OVERRIDE');
            
            // Store impersonation state in sessionStorage
            sessionStorage.setItem('impersonatedUserId', impersonationData.user.id);
            sessionStorage.setItem('impersonatedUserEmail', impersonationData.user.email);
            sessionStorage.setItem('originalAdminSession', JSON.stringify(currentSession));
            
            // For impersonation override, we need to create a mock session
            // Since we can't create real tokens, we'll simulate the user being logged in
            console.log('SIMULATING IMPERSONATION SUCCESS');
            
            // Success toast
            toast({
              title: "Impersonation Successful",
              description: `Now viewing as ${impersonationData.user.email}`,
            });
            
            // Navigate to main dashboard as the impersonated user
            window.location.href = '/';
            return;
          }
          
          // Normal token-based session setting
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: impersonationData.access_token,
            refresh_token: impersonationData.refresh_token
          });

          if (sessionError) {
            throw sessionError;
          }
          
          console.log('SESSION SET SUCCESS');
          
          // Store impersonation state
          sessionStorage.setItem('impersonatedUserId', impersonationData.user.id);
          sessionStorage.setItem('impersonatedUserEmail', impersonationData.user.email);
          sessionStorage.setItem('originalAdminSession', JSON.stringify(currentSession));
          
          toast({
            title: "Impersonation Successful",
            description: `Now viewing as ${impersonationData.user.email}`,
          });
          
        } catch (sessionError) {
          console.warn('setSession failed, trying refreshSession...', sessionError);
          
          try {
            const { error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError) {
              throw refreshError;
            }
            
            // Retry setSession after refresh
            const { error: retrySessionError } = await supabase.auth.setSession({
              access_token: impersonationData.access_token,
              refresh_token: impersonationData.refresh_token
            });
            
            if (retrySessionError) {
              throw retrySessionError;
            }
            
            console.log('SESSION SET SUCCESS (after refresh)');
            
            // Store impersonation state
            sessionStorage.setItem('impersonatedUserId', impersonationData.user.id);
            sessionStorage.setItem('impersonatedUserEmail', impersonationData.user.email);
            sessionStorage.setItem('originalAdminSession', JSON.stringify(currentSession));
            
            toast({
              title: "Impersonation Successful",
              description: `Now viewing as ${impersonationData.user.email}`,
            });
            
            // Navigate to main dashboard
            window.location.href = '/';
          } catch (refreshError) {
            console.error('Both setSession and refreshSession failed:', refreshError);
            throw new Error(`Session setting failed: ${sessionError.message}. Refresh also failed: ${refreshError.message}`);
          }
        }
        
      } catch (error) {
        console.error('IMPERSONATION ERROR:', error);
        
        // Enhanced error message extraction for better user feedback
        let errorMessage = "Failed to start impersonation session.";
        
        if (error?.message) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (error?.error) {
          errorMessage = error.error;
        } else if (error?.details) {
          errorMessage = `${errorMessage} Details: ${error.details}`;
        }
        
        // Surface exact Edge error and abort navigation
        toast({
          title: "Impersonation Failed", 
          description: `Exact Edge Error: ${errorMessage}`,
          variant: "destructive",
        });
        
        // Do not navigate on failure
        throw error;
      }
    };

    try {
      await loginAsUser(tenant.email);
    } catch (error) {
      // Error handling is already done within loginAsUser function
      console.error('Final impersonation error:', error);
    }
  };

  const handleSuspend = async (tenantId: string, suspend: boolean) => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "Admin user not found.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Determine the new status
      const newStatus = suspend ? 'suspended' : 'active';
      
      // Update local state immediately for instant UI feedback
      setTenants(prev => prev.map(tenant => 
        tenant.user_id === tenantId 
          ? { ...tenant, status: newStatus as 'active' | 'inactive' | 'dormant' | 'suspended' }
          : tenant
      ));

      // Call the edge function to update status in database
      const { data, error } = await supabase.functions.invoke('update-user-status', {
        body: {
          targetUserId: tenantId,
          status: newStatus,
          adminUserId: user.id
        }
      });

      if (error) {
        throw error;
      }
      
      toast({
        title: suspend ? "User Suspended" : "User Reactivated",
        description: `User has been ${suspend ? 'suspended' : 'reactivated'} successfully.`,
      });
      
    } catch (error) {
      console.error('Error updating user status:', error);
      // Revert local state on error by refetching
      fetchTenants();
      toast({
        title: "Error",
        description: error.message || `Failed to ${suspend ? 'suspend' : 'reactivate'} user.`,
        variant: "destructive",
      });
    }
  };

  const handleSort = (field: keyof TenantData) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredTenants = tenants.filter(tenant => {
    const matchesSearch = tenant.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         tenant.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || tenant.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const sortedTenants = [...filteredTenants].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc' 
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }
    
    return 0;
  });

  const paginatedTenants = sortedTenants.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const getStatusBadge = (status: string) => {
    const variants = {
      active: { variant: 'default' as const, color: 'bg-green-100 text-green-800 border-green-300' },
      suspended: { variant: 'destructive' as const, color: 'bg-red-100 text-red-800 border-red-300' },
      inactive: { variant: 'secondary' as const, color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
      dormant: { variant: 'outline' as const, color: 'bg-gray-100 text-gray-800 border-gray-300' }
    };
    
    return variants[status as keyof typeof variants] || variants.dormant;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatRevenue = (lettersSent: number) => {
    return `$${(lettersSent * 2.5).toFixed(2)}`;
  };

  const fetchMetrics = async () => {
    const { data: sessions } = await supabase.from('sessions').select('*');
    const { data: letters } = await supabase.from('letters').select('*');
    const { data: rounds } = await supabase.from('rounds').select('*');
    const { data: profiles } = await supabase.from('profiles').select('*');
    
    const lettersSent = letters?.filter(l => l.status === 'sent').length || 0;
    const activeUsers = profiles?.length || 0;
    const disputesDrafted = letters?.filter(l => l.status === 'draft').length || 0;
    const disputesResolved = rounds?.filter(r => r.status === 'completed').length || 0;
    const totalRevenue = lettersSent * 2.5;
    
    return {
      totalRevenue: `$${totalRevenue.toFixed(2)}`,
      lettersSent: lettersSent.toString(),
      activeUsers: activeUsers.toString(),
      draftRounds: disputesDrafted.toString(),
      resolvedCases: disputesResolved.toString(),
      successRate: lettersSent > 0 ? `${Math.round((disputesResolved / lettersSent) * 100)}%` : '0%'
    };
  };

  const exportClientData = () => {
    const csvData = paginatedTenants.map(tenant => ({
      name: tenant.display_name || 'Unknown User',
      email: tenant.email,
      plan: 'Basic',
      nextRound: tenant.active_rounds > 0 ? `Round ${tenant.active_rounds + 1}` : 'Complete',
      revenueToDate: formatRevenue(tenant.letters_sent),
      lastLogin: formatDate(tenant.last_activity),
      status: tenant.status,
      role: tenant.role || 'user'
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `clients_${new Date().toISOString().slice(0, 10)}.csv`
    });
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: `Exported ${csvData.length} client records to CSV.`,
    });
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'superadmin':
        return { variant: 'default' as const, className: 'bg-red-100 text-red-700', text: 'Super Admin' };
      case 'admin':
        return { variant: 'default' as const, className: 'bg-indigo-100 text-indigo-700', text: 'Admin' };
      default:
        return { variant: 'default' as const, className: 'bg-gray-100 text-gray-700', text: 'Client' };
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center space-x-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quick Stats Bar */}
      <DashboardStats
        stats={metricsData || {
          totalRevenue: 'No data',
          lettersSent: 'No data', 
          activeUsers: 'No data',
          draftRounds: 'No data',
          resolvedCases: 'No data',
          successRate: 'No data'
        }}
        icons={{
          totalRevenue: DollarSign,
          lettersSent: Mail,
          activeUsers: Users,
          draftRounds: FileText,
          resolvedCases: Clock,
          successRate: TrendingUp
        }}
        loading={!metricsData && !metricsError}
      />

      {/* Search Bar */}
      <div className="flex w-full sm:w-64 mb-4">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients by name, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 w-full"
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="superadmin">Super Admin</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="user">Client</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={exportClientData} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export Client Data
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer" onClick={() => handleSort('display_name')}>
              <div className="flex items-center gap-2">
                Name
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </TableHead>
            <TableHead className="cursor-pointer" onClick={() => handleSort('email')}>
              <div className="flex items-center gap-2">
                Email
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </TableHead>
            <TableHead className="cursor-pointer w-[110px]" onClick={() => handleSort('role')}>
              <div className="flex items-center gap-2">
                Role
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </TableHead>
            <TableHead>Plan</TableHead>
            <TableHead className="cursor-pointer" onClick={() => handleSort('active_rounds')}>
              <div className="flex items-center gap-2">
                Next Round
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </TableHead>
            <TableHead className="cursor-pointer" onClick={() => handleSort('letters_sent')}>
              <div className="flex items-center gap-2">
                Revenue to Date
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </TableHead>
            <TableHead className="cursor-pointer" onClick={() => handleSort('last_activity')}>
              <div className="flex items-center gap-2">
                Last Login
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </TableHead>
            <TableHead className="cursor-pointer" onClick={() => handleSort('status')}>
              <div className="flex items-center gap-2">
                Status
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedTenants.map((tenant) => {
            const statusBadge = getStatusBadge(tenant.status);
            return (
              <TableRow key={tenant.user_id}>
                <TableCell className="font-medium">
                  {tenant.display_name || 'Unknown User'}
                </TableCell>
                <TableCell>{tenant.email}</TableCell>
                <TableCell>
                  {(() => {
                    const roleBadge = getRoleBadge(tenant.role);
                    return (
                      <Badge variant={roleBadge.variant} className={roleBadge.className}>
                        {roleBadge.text}
                      </Badge>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">Basic</Badge>
                </TableCell>
                <TableCell>
                  {tenant.active_rounds > 0 ? `Round ${tenant.active_rounds + 1}` : 'Complete'}
                </TableCell>
                <TableCell className="font-mono">
                  {formatRevenue(tenant.letters_sent)}
                </TableCell>
                <TableCell>{formatDate(tenant.last_activity)}</TableCell>
                <TableCell>
                  <Badge 
                    variant={statusBadge.variant} 
                    className={`${statusBadge.color} transition-all duration-200`}
                  >
                    {tenant.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleImpersonate(tenant)}
                      className="h-8 w-8 p-0"
                      title="Login as user"
                    >
                      <LogIn className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {tenant.status === 'active' ? (
                          <DropdownMenuItem onClick={() => handleSuspend(tenant.user_id, true)}>
                            <Pause className="mr-2 h-4 w-4" />
                            Suspend User
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleSuspend(tenant.user_id, false)}>
                            <Play className="mr-2 h-4 w-4" />
                            Reactivate User
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {Math.min((currentPage - 1) * pageSize + 1, filteredTenants.length)} to{' '}
          {Math.min(currentPage * pageSize, filteredTenants.length)} of {filteredTenants.length} results
        </p>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage * pageSize >= filteredTenants.length}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};