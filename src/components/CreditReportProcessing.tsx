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
  Upload,
  Brain,
  Eye,
  HelpCircle
} from 'lucide-react';

interface ProcessingStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  icon: React.ComponentType<any>;
}

interface CreditReportProcessingProps {
  reportName: string;
  currentStep?: string;
  progress?: number;
  error?: string;
  extractionMethod?: string;
  onRetry?: () => void;
  onReupload?: () => void;
  onViewDetails?: () => void;
  steps?: ProcessingStep[];
}

const defaultSteps: ProcessingStep[] = [
  {
    id: 'upload',
    title: 'Upload & Validation',
    description: 'PDF uploaded and file format validated',
    status: 'completed',
    icon: Upload
  },
  {
    id: 'extraction',
    title: 'Text Extraction',
    description: 'Extracting text using multiple advanced methods',
    status: 'processing',
    icon: FileText
  },
  {
    id: 'analysis',
    title: 'AI Analysis',
    description: 'Analyzing credit data with OpenAI',
    status: 'pending',
    icon: Brain
  },
  {
    id: 'storage',
    title: 'Data Storage',
    description: 'Storing structured credit information',
    status: 'pending',
    icon: Download
  }
];

export const CreditReportProcessing: React.FC<CreditReportProcessingProps> = ({
  reportName,
  currentStep = 'extraction',
  progress = 20,
  error,
  extractionMethod,
  onRetry,
  onReupload,
  onViewDetails,
  steps = defaultSteps
}) => {
  const getStepIcon = (step: ProcessingStep) => {
    const IconComponent = step.icon;
    
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'processing':
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'failed':
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
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const currentStepIndex = steps.findIndex(step => step.id === currentStep);
  const completedSteps = steps.filter(step => step.status === 'completed').length;
  const totalSteps = steps.length;
  const progressPercentage = progress || Math.round((completedSteps / totalSteps) * 100);

  const isExtractionError = error && (
    error.includes('PDF text extraction failed') ||
    error.includes('image-based') ||
    error.includes('encrypted') ||
    error.includes('No readable text') ||
    error.includes('extraction methods failed')
  );

  const isAuthError = error && (
    error.includes('Authentication') ||
    error.includes('sign in') ||
    error.includes('JWT')
  );

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
                    Enhanced Credit Report Analysis
                  </CardTitle>
                  <p className="text-muted-foreground mt-1">
                    AI-powered analysis of {reportName}
                  </p>
                  {extractionMethod && (
                    <Badge variant="outline" className="w-fit mt-2">
                      Extraction Method: {extractionMethod}
                    </Badge>
                  )}
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
                  {onViewDetails && (
                    <Button onClick={onViewDetails} variant="ghost">
                      <Eye className="w-4 h-4 mr-2" />
                      Details
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
                    {progressPercentage}% complete
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
            <Alert variant={isAuthError ? "default" : "destructive"}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="ml-2">
                <div className="space-y-3">
                  <div className="font-medium">
                    {isAuthError ? 'Authentication Required' : 
                     isExtractionError ? 'PDF Extraction Failed' : 
                     'Processing Error'}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{error}</div>
                  
                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {isAuthError ? (
                      <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Refresh Page
                      </Button>
                    ) : isExtractionError ? (
                      <>
                        <Button variant="outline" size="sm" onClick={onReupload}>
                          <Upload className="h-4 w-4 mr-1" />
                          Try Different PDF
                        </Button>
                        <Button variant="outline" size="sm" onClick={onRetry}>
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Retry Processing
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" onClick={onRetry}>
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Retry
                      </Button>
                    )}
                    
                    {onViewDetails && (
                      <Button variant="ghost" size="sm" onClick={onViewDetails}>
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                    )}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Processing Steps */}
          <Card>
            <CardHeader>
              <CardTitle>Enhanced Processing Pipeline</CardTitle>
              <p className="text-muted-foreground">
                Multi-method extraction and AI-powered analysis
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
                        : step.status === 'failed'
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

          {/* Success Message */}
          {progress === 100 && !error && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <div className="font-medium">Analysis Complete!</div>
                <div className="text-sm mt-1">
                  Your credit report has been successfully processed and analyzed.
                  {extractionMethod && ` Extraction method: ${extractionMethod}`}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Enhanced Troubleshooting Tips */}
          {error && isExtractionError && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-blue-500" />
                  Enhanced Troubleshooting Guide
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm">
                  <div className="font-medium text-blue-600 dark:text-blue-400">
                    PDF Requirements:
                  </div>
                  <div className="space-y-2 ml-4">
                    <div className="flex items-start gap-2">
                      <span className="font-medium text-blue-500">•</span>
                      <span>Must be text-based, not a scanned image or screenshot</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-medium text-blue-500">•</span>
                      <span>From official sources: Experian, Equifax, or TransUnion</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-medium text-blue-500">•</span>
                      <span>Not password-protected or encrypted</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-medium text-blue-500">•</span>
                      <span>File size under 10MB for optimal processing</span>
                    </div>
                  </div>
                  
                  <div className="font-medium text-blue-600 dark:text-blue-400 mt-4">
                    Recommended Actions:
                  </div>
                  <div className="space-y-2 ml-4">
                    <div className="flex items-start gap-2">
                      <span className="font-medium text-green-500">1.</span>
                      <span>Download a fresh copy directly from your credit bureau's website</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-medium text-green-500">2.</span>
                      <span>Ensure you select "PDF" format (not HTML or other formats)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-medium text-green-500">3.</span>
                      <span>Verify the PDF opens correctly in a standard PDF viewer</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-medium text-green-500">4.</span>
                      <span>Try the retry button - our system uses multiple extraction methods</span>
                    </div>
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