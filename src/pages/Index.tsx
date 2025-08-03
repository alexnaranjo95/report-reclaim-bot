import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dashboard } from '@/components/Dashboard';
import { useRole } from '@/hooks/useRole';
import { useAccessControl } from '@/hooks/useAccessControl';

const Index = () => {
  const navigate = useNavigate();
  const { isAdmin, loading } = useRole();
  const { isAccessAllowed, loading: accessLoading } = useAccessControl();

  useEffect(() => {
    // Only redirect if we're certain the user is an admin and not loading
    if (!loading && isAdmin) {
      // Add a small delay to prevent rapid redirects
      const timer = setTimeout(() => {
        navigate('/admin');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isAdmin, loading, navigate]);

  if (loading || accessLoading) {
    return (
      <div className="min-h-screen bg-gradient-dashboard flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Block access for suspended users
  if (isAccessAllowed === false) {
    return (
      <div className="min-h-screen bg-gradient-dashboard flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">Account Suspended</h1>
          <p className="text-muted-foreground mt-2">Your account has been suspended. Please contact support.</p>
        </div>
      </div>
    );
  }

  if (isAdmin) {
    return null; // Will redirect to admin
  }

  
  return (
    <div className="min-h-screen w-full">
      <Dashboard />
    </div>
  );
};

export default Index;
