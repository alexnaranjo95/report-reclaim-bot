import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  FileText, 
  Download, 
  Search, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  RefreshCw,
  Upload
} from 'lucide-react';

interface ProcessingStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  icon: React.ComponentType<any>;
}

interface CreditReportProcessingProps {
  reportName: string;
  currentStep?: string;
  progress?: number;
  error?: string;
  onRetry?: () => void;
  onReupload?: () => void;
  steps?: ProcessingStep[];
}

const defaultSteps: ProcessingStep[] = [
  {
    id: 'upload',
    title: 'File Upload',
    description: 'Credit report PDF uploaded to secure storage',
    status: 'completed',
    icon: Upload
  },
  {
    id: 'extraction',
    title: 'Text Extraction',
    description: 'Extracting readable text from PDF document',
    status: 'processing',
    icon: FileText
  },
  {
    id: 'validation',
    title: 'Content Validation',
    description: 'Verifying extracted content is a valid credit report',
    status: 'pending',
    icon: CheckCircle
  },
  {
    id: 'analysis',
    title: 'AI Analysis',
    description: 'Analyzing credit data and identifying negative items',
    status: 'pending',
    icon: Search
  },
  {
    id: 'parsing',
    title: 'Data Parsing',
    description: 'Organizing personal info, accounts, and inquiries',
    status: 'pending',
    icon: Download
  }
];

export const CreditReportProcessing: React.FC<CreditReportProcessingProps> = ({
  reportName,
  currentStep = 'extraction',
  progress = 20,
  error,
  onRetry,
  onReupload,
  steps = defaultSteps
}) => {
  const getStepIcon = (step: ProcessingStep) => {
    const IconComponent = step.icon;
    
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'processing':
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <IconComponent className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStepBadge = (step: ProcessingStep) => {
    switch (step.status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500">Complete</Badge>;
      case 'processing':
        return <Badge variant="secondary">Processing...</Badge>;
      case 'error':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const currentStepIndex = steps.findIndex(step => step.id === currentStep);
  const completedSteps = steps.filter(step => step.status === 'completed').length;
  const totalSteps = steps.length;
  const progressPercentage = Math.round((completedSteps / totalSteps) * 100);

  return (
    <div className="min-h-screen bg-gradient-dashboard">
      <div className="container mx-auto px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-6 h-6" />
                    Round 1 Analysis
                  </CardTitle>
                  <p className="text-muted-foreground mt-1">
                    AI analysis of {reportName}
                  </p>
                </div>
                <div className="flex gap-2">
                  {error && onReupload && (
                    <Button onClick={onReupload} variant="outline">
                      <Upload className="w-4 h-4 mr-2" />
                      Re-upload
                    </Button>
                  )}
                  {error && onRetry && (
                    <Button onClick={onRetry} variant="outline">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Progress Overview */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Processing Progress
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {completedSteps} of {totalSteps} steps completed
                  </span>
                </div>
                <Progress value={progressPercentage} className="w-full" />
                
                {!error && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>
                      {currentStepIndex >= 0 ? 
                        `Currently ${steps[currentStepIndex]?.title.toLowerCase()}...` :
                        'Analyzing credit report...'
                      }
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="ml-2">
                <div className="space-y-2">
                  <p className="font-medium">Processing Failed</p>
                  <p>{error}</p>
                  <div className="flex gap-2 mt-3">
                    <Button 
                      onClick={onRetry} 
                      variant="destructive" 
                      size="sm"
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Try Again
                    </Button>
                    <Button 
                      onClick={onReupload} 
                      variant="outline" 
                      size="sm"
                    >
                      Upload Different File
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Processing Steps */}
          <Card>
            <CardHeader>
              <CardTitle>Processing Steps</CardTitle>
              <p className="text-muted-foreground">
                Detailed breakdown of credit report analysis process
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div
                    key={step.id}
                    className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
                      step.status === 'processing' 
                        ? 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800' 
                        : step.status === 'completed'
                        ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                        : step.status === 'error'
                        ? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
                        : 'bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex-shrink-0 mt-1">
                      {getStepIcon(step)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium text-sm">
                          {index + 1}. {step.title}
                        </h4>
                        {getStepBadge(step)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {step.description}
                      </p>
                      
                      {step.status === 'processing' && (
                        <div className="mt-2">
                          <Progress value={progress} className="h-1" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Troubleshooting Tips */}
          {error && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  Troubleshooting Tips
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="font-medium text-yellow-600 dark:text-yellow-400">•</span>
                    <span>Make sure the uploaded file is a valid credit report PDF from Experian, Equifax, or TransUnion</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-medium text-yellow-600 dark:text-yellow-400">•</span>
                    <span>Ensure the PDF is not password-protected or image-only (scanned documents may not work)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-medium text-yellow-600 dark:text-yellow-400">•</span>
                    <span>Try downloading a fresh copy of your credit report and uploading again</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-medium text-yellow-600 dark:text-yellow-400">•</span>
                    <span>Contact support if the issue persists with multiple valid credit report files</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};