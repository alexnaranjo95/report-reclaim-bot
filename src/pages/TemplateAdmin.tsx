import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import TemplateManager from '@/components/TemplateManager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const TemplateAdmin: React.FC = () => {
  const { user } = useAuth();
  const { isSuperAdmin, loading } = useRole();

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!user || !isSuperAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You need super admin privileges to access template management.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Please contact your administrator for access.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <TemplateManager />
    </div>
  );
};

export default TemplateAdmin;