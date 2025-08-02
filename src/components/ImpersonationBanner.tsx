import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const ImpersonationBanner = () => {
  const [impersonatedUser, setImpersonatedUser] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Conditional render check - exit early if not impersonating
  if (!sessionStorage.getItem('impersonatedUserId')) {
    return null;
  }

  useEffect(() => {
    // Check for impersonation data
    const impersonatedUserId = sessionStorage.getItem('impersonatedUserId');
    const impersonatedUserName = sessionStorage.getItem('impersonatedUserName');
    
    if (impersonatedUserId && impersonatedUserName) {
      setImpersonatedUser(impersonatedUserName);
      setShow(true);
    } else {
      setImpersonatedUser(null);
      setShow(false);
    }
  }, []);

  // Route change listener (safety net) - hide banner if impersonation ended
  useEffect(() => {
    const checkImpersonationState = () => {
      if (!sessionStorage.getItem('impersonatedUserId')) {
        setShow(false);
        setImpersonatedUser(null);
      }
    };

    // Check on route changes
    checkImpersonationState();
  }, [location.pathname]);

  const restoreAdminSession = async () => {
    try {
      const originalSessionStr = sessionStorage.getItem('originalSession');
      if (!originalSessionStr) {
        toast({
          title: "Error",
          description: "No original session found",
          variant: "destructive"
        });
        return;
      }

      // Clear impersonation state BEFORE restoring session
      sessionStorage.removeItem('impersonatedUserId');
      sessionStorage.removeItem('impersonatedUserName');
      sessionStorage.removeItem('originalSession');
      
      // Hide banner immediately
      setShow(false);
      setImpersonatedUser(null);

      const originalSession = JSON.parse(originalSessionStr);
      
      // Restore the original admin session
      const { error } = await supabase.auth.setSession(originalSession);
      
      if (error) {
        toast({
          title: "Error",
          description: "Failed to restore admin session: " + error.message,
          variant: "destructive"
        });
        return;
      }

      // Navigate back to admin
      navigate('/admin');
      
      toast({
        title: "Success",
        description: "Returned to Super Admin view"
      });
    } catch (error) {
      console.error('Error restoring admin session:', error);
      toast({
        title: "Error", 
        description: "Failed to restore admin session",
        variant: "destructive"
      });
    }
  };

  if (!impersonatedUser || !show) {
    return null;
  }

  return (
    <div className="impersonation-banner fixed top-0 left-0 w-full z-50 bg-warning/90 backdrop-blur-sm border-b border-warning-foreground/20">
      <div className="px-4 py-2 flex items-center justify-between text-warning-foreground">
        <span className="font-medium text-sm">
          Impersonating {impersonatedUser} — viewing as this user
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={restoreAdminSession}
          className="h-7 px-3 text-xs border-warning-foreground/30 hover:bg-warning-foreground/10 flex items-center gap-1.5"
        >
          <ArrowLeft className="h-3 w-3" />
          Return to Super Admin
        </Button>
      </div>
    </div>
  );
};