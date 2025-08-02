import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const ImpersonationBanner = () => {
  const [impersonatedUser, setImpersonatedUser] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check for impersonation data
    const impersonatedUserId = sessionStorage.getItem('impersonatedUserId');
    const impersonatedUserName = sessionStorage.getItem('impersonatedUserName');
    
    if (impersonatedUserId && impersonatedUserName) {
      setImpersonatedUser(impersonatedUserName);
    } else {
      setImpersonatedUser(null);
    }
  }, []);

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

      // Clear impersonation data
      sessionStorage.removeItem('impersonatedUserId');
      sessionStorage.removeItem('impersonatedUserName');
      sessionStorage.removeItem('originalSession');
      
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

  if (!impersonatedUser) {
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