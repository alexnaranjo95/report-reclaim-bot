import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';

interface ValidationResult {
  step: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  details?: any;
}

interface DataPipelineValidatorProps {
  reportId?: string;
}

export function DataPipelineValidator({ reportId }: DataPipelineValidatorProps) {
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  const validateDataPipeline = async () => {
    if (!reportId) {
      console.error('No report ID provided for validation');
      return;
    }

    setIsValidating(true);
    setValidationResults([]);
    const results: ValidationResult[] = [];

    try {
      // Step 1: Validate Credit Report Record
      console.log('🔍 Step 1: Validating credit report record...');
      const { data: reportData, error: reportError } = await supabase
        .from('credit_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (reportError || !reportData) {
        results.push({
          step: 'Credit Report Record',
          status: 'error',
          message: 'Credit report record not found',
          details: reportError
        });
      } else {
        results.push({
          step: 'Credit Report Record',
          status: 'success',
          message: `Found report: ${reportData.file_name}`,
          details: {
            status: reportData.extraction_status,
            fileSize: reportData.raw_text?.length || 0,
            errors: reportData.processing_errors
          }
        });
      }

      // Step 2: Validate Text Extraction
      console.log('🔍 Step 2: Validating text extraction...');
      if (reportData?.raw_text) {
        if (reportData.raw_text.length > 500) {
          results.push({
            step: 'Text Extraction',
            status: 'success',
            message: `Extracted ${reportData.raw_text.length} characters`,
            details: {
              preview: reportData.raw_text.substring(0, 200) + '...',
              extractionStatus: reportData.extraction_status
            }
          });
        } else {
          results.push({
            step: 'Text Extraction',
            status: 'warning',
            message: `Low text content: ${reportData.raw_text.length} characters`,
            details: reportData.raw_text
          });
        }
      } else {
        results.push({
          step: 'Text Extraction',
          status: 'error',
          message: 'No text extracted from PDF',
          details: { extractionStatus: reportData?.extraction_status }
        });
      }

      // Step 3: Validate Personal Information
      console.log('🔍 Step 3: Validating personal information...');
      const { data: personalInfo, error: personalError } = await supabase
        .from('personal_information')
        .select('*')
        .eq('report_id', reportId);

      if (personalError) {
        results.push({
          step: 'Personal Information',
          status: 'error',
          message: 'Error fetching personal information',
          details: personalError
        });
      } else if (personalInfo && personalInfo.length > 0) {
        results.push({
          step: 'Personal Information',
          status: 'success',
          message: `Found ${personalInfo.length} personal info records`,
          details: personalInfo[0]
        });
      } else {
        results.push({
          step: 'Personal Information',
          status: 'warning',
          message: 'No personal information extracted',
          details: null
        });
      }

      // Step 4: Validate Credit Accounts
      console.log('🔍 Step 4: Validating credit accounts...');
      const { data: accounts, error: accountsError } = await supabase
        .from('credit_accounts')
        .select('*')
        .eq('report_id', reportId);

      if (accountsError) {
        results.push({
          step: 'Credit Accounts',
          status: 'error',
          message: 'Error fetching credit accounts',
          details: accountsError
        });
      } else if (accounts && accounts.length > 0) {
        results.push({
          step: 'Credit Accounts',
          status: 'success',
          message: `Found ${accounts.length} credit accounts`,
          details: accounts
        });
      } else {
        results.push({
          step: 'Credit Accounts',
          status: 'warning',
          message: 'No credit accounts extracted',
          details: null
        });
      }

      // Step 5: Validate Credit Inquiries
      console.log('🔍 Step 5: Validating credit inquiries...');
      const { data: inquiries, error: inquiriesError } = await supabase
        .from('credit_inquiries')
        .select('*')
        .eq('report_id', reportId);

      if (inquiriesError) {
        results.push({
          step: 'Credit Inquiries',
          status: 'error',
          message: 'Error fetching credit inquiries',
          details: inquiriesError
        });
      } else if (inquiries && inquiries.length > 0) {
        results.push({
          step: 'Credit Inquiries',
          status: 'success',
          message: `Found ${inquiries.length} credit inquiries`,
          details: inquiries
        });
      } else {
        results.push({
          step: 'Credit Inquiries',
          status: 'warning',
          message: 'No credit inquiries extracted',
          details: null
        });
      }

      // Step 6: Validate Negative Items
      console.log('🔍 Step 6: Validating negative items...');
      const { data: negativeItems, error: negativeError } = await supabase
        .from('negative_items')
        .select('*')
        .eq('report_id', reportId);

      if (negativeError) {
        results.push({
          step: 'Negative Items',
          status: 'error',
          message: 'Error fetching negative items',
          details: negativeError
        });
      } else if (negativeItems && negativeItems.length > 0) {
        results.push({
          step: 'Negative Items',
          status: 'success',
          message: `Found ${negativeItems.length} negative items`,
          details: negativeItems
        });
      } else {
        results.push({
          step: 'Negative Items',
          status: 'warning',
          message: 'No negative items extracted',
          details: null
        });
      }

    } catch (error) {
      console.error('Validation error:', error);
      results.push({
        step: 'Validation Process',
        status: 'error',
        message: 'Validation process failed',
        details: error
      });
    }

    setValidationResults(results);
    setIsValidating(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      success: 'bg-green-100 text-green-800 border-green-300',
      error: 'bg-red-100 text-red-800 border-red-300',
      warning: 'bg-yellow-100 text-yellow-800 border-yellow-300'
    };

    return (
      <Badge className={variants[status as keyof typeof variants] || ''}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Data Pipeline Validator
          {reportId && (
            <Badge variant="outline" className="text-xs">
              Report: {reportId.slice(0, 8)}...
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            onClick={validateDataPipeline}
            disabled={!reportId || isValidating}
            className="flex items-center gap-2"
          >
            {isValidating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Validate Pipeline'
            )}
          </Button>
          {!reportId && (
            <span className="text-sm text-muted-foreground">
              No report ID available
            </span>
          )}
        </div>

        {validationResults.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold">Validation Results:</h3>
            {validationResults.map((result, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 border rounded-lg"
              >
                {getStatusIcon(result.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{result.step}</span>
                    {getStatusBadge(result.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {result.message}
                  </p>
                  {result.details && (
                    <details className="mt-2">
                      <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
                        View Details
                      </summary>
                      <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-32">
                        {JSON.stringify(result.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}