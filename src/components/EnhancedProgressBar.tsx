import { Progress } from "@/components/ui/progress";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProgressStep {
  step: number;
  label: string;
  status: string;
  description?: string;
}

export const importProgressSteps: ProgressStep[] = [
  { step: 1, label: "Connecting to Smart Credit", status: "connecting", description: "Establishing secure connection" },
  { step: 2, label: "Scraping credit data", status: "scraping", description: "Extracting account and score information" },
  { step: 3, label: "Saving & rendering data", status: "saving", description: "Processing and displaying your credit report" }
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
  const currentStepData = importProgressSteps.find(step => step.status === currentStatus) || importProgressSteps[currentStep - 1];

  if (hasError) {
    return (
      <div className="space-y-4 p-6 bg-destructive/5 border border-destructive/20 rounded-lg">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <h4 className="font-semibold text-destructive">Import Failed</h4>
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
            <h4 className="font-semibold text-success">Import Complete!</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Credit report has been successfully imported and processed
            </p>
          </div>
        </div>

        {extractedDataPreview && (
          <div className="bg-background/50 rounded-md p-4 border">
            <h5 className="font-medium mb-2 text-sm">Imported Data Summary:</h5>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Personal Information:</span>
                <span className="font-medium">{extractedDataPreview.personalInfoCount} records</span>
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
    <div className="space-y-6">
      {/* Main Progress Header */}
      <div className="text-center">
        <div className="text-4xl mb-2">🔄</div>
        <h3 className="text-xl font-bold mb-1">Importing Credit Report</h3>
        <p className="text-sm text-muted-foreground">
          Step {currentStep} of {totalSteps} • {Math.round(progressPercentage)}% Complete
        </p>
      </div>

      {/* Enhanced Progress Bar */}
      <div className="space-y-3">
        <Progress value={progressPercentage} className="h-4 bg-secondary/30" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>~{Math.max(1, Math.ceil((totalSteps - currentStep) * 0.5))} min remaining</span>
          <span>{progressPercentage.toFixed(0)}% Complete</span>
        </div>
      </div>

      {/* Current Processing Step */}
      {currentStepData && (
        <div className="bg-primary/10 border-2 border-primary/30 rounded-lg p-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-primary text-lg">{currentStepData.label}</h4>
              {currentStepData.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {currentStepData.description}
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">{currentStep}</div>
              <div className="text-xs text-muted-foreground">of {totalSteps}</div>
            </div>
          </div>
        </div>
      )}

      {/* Visual Step Indicators */}
      <div className="bg-background/50 rounded-lg p-4 border">
        <h4 className="font-semibold mb-4 text-center">Import Progress</h4>
        <div className="grid grid-cols-1 gap-2">
          {importProgressSteps.map((step) => {
            const isCompleted = step.step < currentStep;
            const isCurrent = step.step === currentStep;
            const isPending = step.step > currentStep;

            return (
              <div
                key={step.step}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg transition-all",
                  isCompleted && "bg-success/10 text-success border border-success/20",
                  isCurrent && "bg-primary/10 text-primary border-2 border-primary/30 shadow-md",
                  isPending && "text-muted-foreground border border-transparent"
                )}
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center">
                  {isCompleted ? (
                    <div className="w-6 h-6 bg-success rounded-full flex items-center justify-center">
                      <CheckCircle className="h-4 w-4 text-white" />
                    </div>
                  ) : isCurrent ? (
                    <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-current opacity-50 flex items-center justify-center">
                      <span className="text-xs font-bold">{step.step}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm">{step.label}</div>
                  {step.description && (
                    <div className="text-xs opacity-70 mt-1">{step.description}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};