import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import OptimizedBrowseAiImporter from '@/components/OptimizedBrowseAiImporter';

/**
 * Optimized Credit Reports Page
 * - Uses optimized components
 * - Better performance with large datasets
 * - Cleaner UI with tabs
 */
const OptimizedCreditReports: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" asChild>
                <Link to="/">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  Credit Report Center
                </h1>
                <p className="text-sm text-muted-foreground">
                  Import and analyze your credit report
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <OptimizedBrowseAiImporter />
        </div>
      </div>
    </div>
  );
};

export default OptimizedCreditReports;