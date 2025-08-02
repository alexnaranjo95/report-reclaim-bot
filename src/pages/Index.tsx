import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dashboard } from '@/components/Dashboard';
import { useRole } from '@/hooks/useRole';

const Index = () => {
  const navigate = useNavigate();
  const { isSuperAdmin, loading } = useRole();

  useEffect(() => {
    if (!loading && isSuperAdmin) {
      navigate('/admin');
    }
  }, [isSuperAdmin, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-dashboard flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isSuperAdmin) {
    return null; // Will redirect to admin
  }

  return (
    <div className="min-h-screen w-full">
      <Dashboard />
    </div>
  );
};

export default Index;
