import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CreditReportParser, type ParsingResult } from '@/services/CreditReportParser';
import { toast } from 'sonner';
import { 
  PlayCircle, 
  CheckCircle, 
  AlertCircle, 
  FileText,
  User,
  CreditCard,
  Building,
  AlertTriangle,
  Search,
  Clock
} from 'lucide-react';

interface CreditReportParsingProps {
  reportId: string;
  reportName: string;
  hasRawText: boolean;
  onParsingComplete?: () => void;
}

export const CreditReportParsing: React.FC<CreditReportParsingProps> = ({
  reportId,
  reportName,
  hasRawText,
  onParsingComplete
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsingResult, setParsingResult] = useState<ParsingResult | null>(null);
  const [progress, setProgress] = useState(0);

  const handleStartParsing = async () => {
    if (!hasRawText) {
      toast.error('No text data available to parse. Please extract text first.');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    
    try {
      toast.loading('Starting report parsing...', { id: 'parsing' });
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(90, prev + 15));
      }, 500);

      const result = await CreditReportParser.parseReport(reportId);
      
      clearInterval(progressInterval);
      setProgress(100);
      setParsingResult(result);
      
      toast.success('Report parsing completed successfully!', { id: 'parsing' });
      onParsingComplete?.();
      
    } catch (error) {
      console.error('Parsing error:', error);
      toast.error(`Parsing failed: ${error.message}`, { id: 'parsing' });
    } finally {
      setIsProcessing(false);
    }
  };

  const getBureauBadge = (bureau: string, confidence: string) => {
    const variant = confidence === 'high' ? 'default' : 
                   confidence === 'medium' ? 'secondary' : 'outline';
    
    return (
      <Badge variant={variant} className={confidence === 'high' ? 'bg-green-500' : ''}>
        {bureau} ({confidence} confidence)
      </Badge>
    );
  };

  const getSectionIcon = (found: boolean) => {
    return found ? 
      <CheckCircle className="w-4 h-4 text-green-500" /> : 
      <AlertCircle className="w-4 h-4 text-red-500" />;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Parse Credit Report
          </CardTitle>
          <CardDescription>
            Extract structured data from {reportName} including personal information, accounts, and negative items.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!parsingResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${hasRawText ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-sm">
                    {hasRawText ? 'Text data available' : 'No text data - extract text first'}
                  </span>
                </div>
                <Button
                  onClick={handleStartParsing}
                  disabled={!hasRawText || isProcessing}
                  className="flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-4 h-4" />
                      Start Parsing
                    </>
                  )}
                </Button>
              </div>

              {isProcessing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Parsing progress</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <p className="text-sm text-muted-foreground">
                    {progress < 30 ? 'Detecting bureau...' :
                     progress < 60 ? 'Parsing sections...' :
                     progress < 80 ? 'Extracting accounts...' : 'Finalizing...'}
                  </p>
                </div>
              )}
            </div>
          )}

          {parsingResult && (
            <div className="space-y-6">
              {/* Bureau Detection Results */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Bureau Detection
                </h3>
                <div className="flex items-center gap-3">
                  {getBureauBadge(parsingResult.bureau.bureau, parsingResult.bureau.confidence)}
                  <Badge variant="outline">
                    {parsingResult.parsingConfidence}% confidence
                  </Badge>
                </div>
                {parsingResult.bureau.indicators.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium">Detection indicators:</p>
                    <ul className="list-disc list-inside">
                      {parsingResult.bureau.indicators.slice(0, 3).map((indicator, index) => (
                        <li key={index}>{indicator}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Sections Found */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Sections Found
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    {getSectionIcon(!!parsingResult.sections.personal_info)}
                    <span className="text-sm">Personal Information</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getSectionIcon(!!parsingResult.sections.accounts)}
                    <span className="text-sm">Account Details</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getSectionIcon(!!parsingResult.sections.collections)}
                    <span className="text-sm">Collections</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getSectionIcon(!!parsingResult.sections.public_records)}
                    <span className="text-sm">Public Records</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getSectionIcon(!!parsingResult.sections.inquiries)}
                    <span className="text-sm">Credit Inquiries</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getSectionIcon(!!parsingResult.sections.account_summary)}
                    <span className="text-sm">Account Summary</span>
                  </div>
                </div>
              </div>

              {/* Parsing Summary */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Parsing Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <User className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                      <div className="text-2xl font-bold">
                        {parsingResult.personalInfo?.full_name ? '1' : '0'}
                      </div>
                      <div className="text-sm text-muted-foreground">Personal Info</div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4 text-center">
                      <CreditCard className="w-8 h-8 mx-auto mb-2 text-green-500" />
                      <div className="text-2xl font-bold">{parsingResult.accounts.length}</div>
                      <div className="text-sm text-muted-foreground">Accounts</div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Building className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                      <div className="text-2xl font-bold">{parsingResult.collectionsCount}</div>
                      <div className="text-sm text-muted-foreground">Collections</div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4 text-center">
                      <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-500" />
                      <div className="text-2xl font-bold">
                        {parsingResult.accounts.filter(acc => acc.is_negative).length}
                      </div>
                      <div className="text-sm text-muted-foreground">Negative Items</div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Personal Information */}
              {parsingResult.personalInfo && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Personal Information
                  </h3>
                  <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                    {parsingResult.personalInfo.full_name && (
                      <div className="flex justify-between">
                        <span className="font-medium">Name:</span>
                        <span>{parsingResult.personalInfo.full_name}</span>
                      </div>
                    )}
                    {parsingResult.personalInfo.ssn_partial && (
                      <div className="flex justify-between">
                        <span className="font-medium">SSN:</span>
                        <span>{parsingResult.personalInfo.ssn_partial}</span>
                      </div>
                    )}
                    {parsingResult.personalInfo.date_of_birth && (
                      <div className="flex justify-between">
                        <span className="font-medium">Date of Birth:</span>
                        <span>{parsingResult.personalInfo.date_of_birth}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Errors and Warnings */}
              {(parsingResult.errors.length > 0 || parsingResult.warnings.length > 0) && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Issues Detected</h3>
                  {parsingResult.errors.length > 0 && (
                    <div className="bg-red-50 p-4 rounded-lg">
                      <h4 className="font-medium text-red-800 mb-2">Errors:</h4>
                      <ul className="list-disc list-inside text-red-700 text-sm">
                        {parsingResult.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {parsingResult.warnings.length > 0 && (
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <h4 className="font-medium text-yellow-800 mb-2">Warnings:</h4>
                      <ul className="list-disc list-inside text-yellow-700 text-sm">
                        {parsingResult.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Re-parse button */}
              <div className="pt-4 border-t">
                <Button
                  onClick={() => {
                    setParsingResult(null);
                    setProgress(0);
                  }}
                  variant="outline"
                  className="w-full"
                >
                  Parse Again
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};