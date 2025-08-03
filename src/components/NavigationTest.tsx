import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const NavigationTest = () => {
  const testDirectNavigation = () => {
    console.log('🧪 TESTING: Direct navigation to /credit-reports');
    console.log('🧪 Current URL before:', window.location.href);
    window.location.href = '/credit-reports';
  };

  const testReactRouterNavigation = () => {
    console.log('🧪 TESTING: React Router navigation');
    console.log('🧪 Current URL before:', window.location.href);
    // This will test if React Router is working
    window.history.pushState({}, '', '/credit-reports');
    console.log('🧪 URL after pushState:', window.location.href);
  };

  return (
    <Card className="mb-4 border-2 border-red-500 bg-red-50">
      <CardHeader>
        <CardTitle className="text-red-700">🚨 NAVIGATION DEBUG PANEL</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-sm text-red-600">Current URL: {window.location.pathname}</p>
          <div className="flex gap-2">
            <Button onClick={testDirectNavigation} variant="outline" size="sm">
              Test Direct Navigation
            </Button>
            <Button onClick={testReactRouterNavigation} variant="outline" size="sm">
              Test React Router
            </Button>
            <Button onClick={() => console.log('Current location:', window.location)} variant="outline" size="sm">
              Log Location
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};