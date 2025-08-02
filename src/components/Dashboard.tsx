import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { UploadZone } from './UploadZone';
import { RoundTracker } from './RoundTracker';
import { DisputeLetterDrafts } from './DisputeLetterDrafts';
import { CreditAnalysis } from './CreditAnalysis';
import { FileText, TrendingUp, Shield, Clock, Trash2, Bug } from 'lucide-react';
import { CreditAnalysisService } from '../services/CreditAnalysisService';
import { CreditAnalysisResult } from '../types/CreditTypes';
import { useToast } from '@/hooks/use-toast';

export const Dashboard = () => {
  const [currentRound, setCurrentRound] = useState(1);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<CreditAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (file: File) => {
    setUploadedFile(file);
    setIsAnalyzing(true);
    setAnalysisComplete(false);

    try {
      const results = await CreditAnalysisService.analyzePDF({
        file,
        round: currentRound
      });
      
      setAnalysisResults(results);
      setAnalysisComplete(true);
      
      toast({
        title: "Analysis Complete",
        description: `Found ${results.summary.totalNegativeItems} negative items, ${results.summary.totalPositiveAccounts} positive accounts out of ${results.summary.totalAccounts} total accounts.`,
      });
    } catch (error) {
      console.error('Analysis failed:', error);
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze credit report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeleteFile = () => {
    setUploadedFile(null);
    setAnalysisComplete(false);
    setAnalysisResults(null);
    setIsAnalyzing(false);
    toast({
      title: "File Removed",
      description: "Upload a new credit report to begin analysis.",
    });
  };

  const handleTroubleshoot = () => {
    toast({
      title: "Troubleshooting",
      description: "Check edge function logs for detailed error information.",
    });
    // Open edge function logs in new tab
    window.open('https://supabase.com/dashboard/project/rcrpqdhfawtpjicttgvx/functions/openai-analysis/logs', '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-dashboard">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                CreditFix Pro
              </h1>
              <p className="text-muted-foreground">DIY Credit Repair Platform</p>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="px-3 py-1">
                <Shield className="h-3 w-3 mr-1" />
                Secure
              </Badge>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = '/settings'}
              >
                Settings
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Progress & Stats */}
          <div className="lg:col-span-1 space-y-6">
            <RoundTracker currentRound={currentRound} totalRounds={12} />
            
            {/* Quick Stats */}
            <Card className="bg-gradient-card shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm">Letters Sent</span>
                  </div>
                  <span className="font-semibold">
                    {analysisResults?.historicalData.lettersSent || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-success" />
                    <span className="text-sm">Items Removed</span>
                  </div>
                  <span className="font-semibold text-success">
                    {analysisResults?.historicalData.itemsRemoved || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-warning" />
                    <span className="text-sm">Pending</span>
                  </div>
                  <span className="font-semibold">
                    {analysisResults?.historicalData.itemsPending || 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Upload Section */}
            {!uploadedFile && (
              <Card className="bg-gradient-card shadow-card animate-fade-in">
                <CardHeader>
                  <CardTitle>Upload Your Credit Report</CardTitle>
                  <CardDescription>
                    Upload your monthly credit report PDF to begin Round {currentRound} analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <UploadZone onFileUpload={handleFileUpload} />
                </CardContent>
              </Card>
            )}

            {/* Analysis Section */}
            {uploadedFile && (
              <div className="space-y-6 animate-fade-in">
                <Card className="bg-gradient-card shadow-card">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-primary" />
                          Round {currentRound} Analysis
                        </CardTitle>
                        <CardDescription>
                          AI analysis of {uploadedFile.name}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleTroubleshoot}
                          className="flex items-center gap-1"
                        >
                          <Bug className="h-4 w-4" />
                          Debug
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDeleteFile}
                          className="flex items-center gap-1 text-danger hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isAnalyzing ? (
                      <div className="space-y-4">
                        <div className="text-sm text-muted-foreground">
                          Analyzing credit report...
                        </div>
                        <Progress value={75} className="h-2" />
                      </div>
                    ) : analysisComplete && analysisResults ? (
                      <CreditAnalysis analysisResults={analysisResults} />
                    ) : null}
                  </CardContent>
                </Card>

                {/* Dispute Letters Section */}
                {analysisComplete && analysisResults && (
                  <DisputeLetterDrafts creditItems={analysisResults.items} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
