import { Progress } from "@/components/ui/progress";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProgressStep {
  step: number;
  label: string;
  status: string;
  description?: string;
}

export const uploadProgressSteps: ProgressStep[] = [
  { step: 1, label: "Uploading PDF file", status: "uploading", description: "Transferring file to secure storage" },
  { step: 2, label: "Validating document format", status: "validating", description: "Checking PDF structure and format" },
  { step: 3, label: "Connecting to Google Document AI", status: "connecting", description: "Establishing secure API connection" },
  { step: 4, label: "Extracting text from credit report", status: "extracting", description: "Using AI to read document content" },
  { step: 5, label: "Parsing credit report data", status: "parsing", description: "Identifying personal info and accounts" },
  { step: 6, label: "Storing personal information", status: "storing_personal", description: "Saving name, address, and contact details" },
  { step: 7, label: "Storing credit accounts", status: "storing_accounts", description: "Saving account balances and payment history" },
  { step: 8, label: "Storing credit inquiries", status: "storing_inquiries", description: "Saving credit check history" },
  { step: 9, label: "Finalizing credit report analysis", status: "finalizing", description: "Completing data validation and cleanup" },
  { step: 10, label: "Analysis complete!", status: "completed", description: "Credit report ready for review" }
];

interface EnhancedProgressBarProps {
  currentStep: number;
  totalSteps: number;
  currentStatus: string;
  errorMessage?: string;
  isProcessing: boolean;
  hasError: boolean;
  extractedDataPreview?: {
    personalInfoCount: number;
    accountsCount: number;
    inquiriesCount: number;
    negativeItemsCount: number;
  };
}

export const EnhancedProgressBar = ({
  currentStep,
  totalSteps,
  currentStatus,
  errorMessage,
  isProcessing,
  hasError,
  extractedDataPreview
}: EnhancedProgressBarProps) => {
  const progressPercentage = (currentStep / totalSteps) * 100;
  const currentStepData = uploadProgressSteps.find(step => step.status === currentStatus);

  if (hasError) {
    return (
      <div className="space-y-4 p-6 bg-destructive/5 border border-destructive/20 rounded-lg">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <h4 className="font-semibold text-destructive">Processing Failed</h4>
            <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button 
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
            onClick={() => window.location.reload()}
          >
            Try Again
          </button>
          <button 
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm hover:bg-secondary/90 transition-colors"
            onClick={() => window.open('mailto:support@creditrepair.com', '_blank')}
          >
            Contact Support
          </button>
        </div>
      </div>
    );
  }

  if (!isProcessing && !hasError) {
    return (
      <div className="space-y-4 p-6 bg-success/5 border border-success/20 rounded-lg">
        <div className="flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-success" />
          <div>
            <h4 className="font-semibold text-success">Analysis Complete!</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Credit report has been successfully processed and analyzed
            </p>
          </div>
        </div>

        {extractedDataPreview && (
          <div className="bg-background/50 rounded-md p-4 border">
            <h5 className="font-medium mb-2 text-sm">Extracted Data Summary:</h5>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Personal Information:</span>
                <span className="font-medium">{extractedDataPreview.personalInfoCount} fields</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Credit Accounts:</span>
                <span className="font-medium">{extractedDataPreview.accountsCount} accounts</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Credit Inquiries:</span>
                <span className="font-medium">{extractedDataPreview.inquiriesCount} inquiries</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Negative Items:</span>
                <span className="font-medium">{extractedDataPreview.negativeItemsCount} items</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6 bg-primary/5 border border-primary/20 rounded-lg">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Processing Credit Report</span>
          <span className="text-sm text-muted-foreground">
            {Math.round(progressPercentage)}% Complete
          </span>
        </div>
        <Progress value={progressPercentage} className="h-2" />
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Step {currentStep} of {totalSteps}</span>
        <span>~{Math.max(1, Math.ceil((totalSteps - currentStep) * 0.5))} minutes remaining</span>
      </div>

      {/* Current Status */}
      {currentStepData && (
        <div className="flex items-center gap-3 p-3 bg-background/50 rounded-md border">
          <div className="relative">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{currentStepData.label}</p>
            {currentStepData.description && (
              <p className="text-xs text-muted-foreground mt-1">
                {currentStepData.description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step List */}
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {uploadProgressSteps.map((step) => {
          const isCompleted = step.step < currentStep;
          const isCurrent = step.step === currentStep;
          const isPending = step.step > currentStep;

          return (
            <div
              key={step.step}
              className={cn(
                "flex items-center gap-2 p-2 rounded text-xs transition-colors",
                isCompleted && "text-success",
                isCurrent && "text-primary bg-primary/10",
                isPending && "text-muted-foreground"
              )}
            >
              <div className="flex-shrink-0">
                {isCompleted ? (
                  <CheckCircle className="h-3 w-3" />
                ) : isCurrent ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <div className="h-3 w-3 rounded-full border border-current opacity-50" />
                )}
              </div>
              <span className="flex-1">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};