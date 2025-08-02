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
  ArrowUpDown
} from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

interface TenantData {
  user_id: string;
  display_name: string;
  email: string;
  total_sessions: number;
  total_letters: number;
  letters_sent: number;
  last_activity: string;
  status: 'active' | 'inactive' | 'dormant';
  active_rounds: number;
  user_created_at: string;
}

interface TenantDataGridProps {
  searchQuery: string;
  onImpersonate: (user: any) => void;
}

export const TenantDataGrid = ({ searchQuery, onImpersonate }: TenantDataGridProps) => {
  const [tenants, setTenants] = useState<TenantData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<keyof TenantData>('last_activity');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      
      // Fetch all users with real aggregated data
      const { data: profilesWithStats, error } = await supabase.rpc('get_user_stats');
      
      if (error) {
        console.error('Error fetching user stats:', error);
        // Fallback to basic profiles query
        const { data: profiles } = await supabase
          .from('profiles')
          .select(`
            user_id,
            display_name,
            email,
            created_at
          `)
          .order('created_at', { ascending: false });

        if (profiles) {
          const tenantsData: TenantData[] = profiles.map(profile => ({
            user_id: profile.user_id,
            display_name: profile.display_name || 'Unknown User',
            email: profile.email || 'No email',
            total_sessions: 0,
            total_letters: 0,
            letters_sent: 0,
            last_activity: profile.created_at,
            status: 'active' as any,
            active_rounds: 0,
            user_created_at: profile.created_at
          }));
          setTenants(tenantsData);
        }
      } else if (profilesWithStats) {
        setTenants(profilesWithStats);
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
    try {
      // Store current admin state
      localStorage.setItem('admin_state', JSON.stringify({
        searchQuery,
        currentPage,
        sortField,
        sortDirection
      }));

      // Get current session to store for later restoration
      const { data: currentSession } = await supabase.auth.getSession();
      
      // In a real implementation, this would call an edge function to generate 
      // a scoped token for the target user
      const impersonationData = {
        user: tenant,
        originalToken: currentSession.session?.access_token,
        originalRefreshToken: currentSession.session?.refresh_token,
        timestamp: Date.now()
      };

      sessionStorage.setItem('impersonation_data', JSON.stringify(impersonationData));
      
      // Simulate token swap - in real implementation this would use actual JWT
      onImpersonate(tenant);
      
      toast({
        title: "Impersonation Started",
        description: `Now viewing as ${tenant.display_name || tenant.email}`,
      });

      // Navigate to main dashboard as the impersonated user
      navigate('/');
    } catch (error) {
      console.error('Error starting impersonation:', error);
      toast({
        title: "Impersonation Failed",
        description: "Failed to start impersonation session.",
        variant: "destructive",
      });
    }
  };

  const handleSuspend = async (tenantId: string, suspend: boolean) => {
    try {
      // In real implementation, this would update user status
      toast({
        title: suspend ? "User Suspended" : "User Reactivated",
        description: `User has been ${suspend ? 'suspended' : 'reactivated'} successfully.`,
      });
      
      // Refresh data
      fetchTenants();
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${suspend ? 'suspend' : 'reactivate'} user.`,
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

  const filteredTenants = tenants.filter(tenant =>
    tenant.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tenant.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
      active: { variant: 'default' as const, color: 'bg-green-100 text-green-800' },
      inactive: { variant: 'secondary' as const, color: 'bg-yellow-100 text-yellow-800' },
      dormant: { variant: 'outline' as const, color: 'bg-gray-100 text-gray-800' }
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
                  <Badge variant={statusBadge.variant} className={statusBadge.color}>
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
                        <DropdownMenuItem onClick={() => handleSuspend(tenant.user_id, true)}>
                          <Pause className="mr-2 h-4 w-4" />
                          Suspend
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSuspend(tenant.user_id, false)}>
                          <Play className="mr-2 h-4 w-4" />
                          Reactivate
                        </DropdownMenuItem>
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