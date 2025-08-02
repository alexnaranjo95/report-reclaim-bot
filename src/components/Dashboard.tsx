import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { UploadZone } from './UploadZone';
import { DocumentNotificationBanner } from './DocumentNotificationBanner';
import { DisputeLetterDrafts } from './DisputeLetterDrafts';
import { CreditAnalysis } from './CreditAnalysis';
import { FileText, TrendingUp, Shield, Clock, Trash2, Bug, RefreshCw, Save, LogOut } from 'lucide-react';
import { CreditAnalysisService } from '../services/CreditAnalysisService';
import { CreditAnalysisResult } from '../types/CreditTypes';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface RoundData {
  draft: any;
  letterRound: number;
  letterStatus: 'draft' | 'saved' | 'sent';
  savedAt: number;
  sentAt?: number;
}

export const Dashboard = () => {
  const [currentRound, setCurrentRound] = useState(1);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<CreditAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [draftsByRound, setDraftsByRound] = useState<Record<number, RoundData>>({});
  const { toast } = useToast();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
      toast({
        title: "Logged out successfully",
        description: "You have been logged out of your account.",
      });
    } catch (error) {
      toast({
        title: "Logout failed",
        description: "There was an error logging out. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Load drafts data on component mount
  useEffect(() => {
    const loadDraftsData = () => {
      try {
        const storedData = localStorage.getItem('draftsByRound');
        if (storedData) {
          const parsedData = JSON.parse(storedData);
          setDraftsByRound(parsedData);
        }
      } catch (error) {
        console.error('Error loading drafts data:', error);
      }
    };
    loadDraftsData();
  }, []);

  // Load drafts for current round when round changes
  useEffect(() => {
    if (draftsByRound[currentRound]) {
      setAnalysisComplete(true);
    }
  }, [currentRound, draftsByRound]);

  // Save drafts data to localStorage when it changes
  useEffect(() => {
    if (Object.keys(draftsByRound).length > 0) {
      try {
        localStorage.setItem('draftsByRound', JSON.stringify(draftsByRound));
      } catch (error) {
        console.error('Error saving drafts data:', error);
      }
    }
  }, [draftsByRound]);

  // Check if a round is unlocked
  const isRoundUnlocked = (roundNumber: number): boolean => {
    if (roundNumber === 1) return true; // First round is always unlocked
    
    const previousRound = draftsByRound[roundNumber - 1];
    if (!previousRound || previousRound.letterStatus !== 'sent') return false;
    
    const sentAt = previousRound.sentAt || 0;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    return Date.now() - sentAt >= thirtyDaysMs;
  };

  const handleFileUpload = async (file: File) => {
    setUploadedFile(file);
    setIsAnalyzing(true);
    setAnalysisComplete(false);

    try {
      console.log('Starting analysis for file:', file.name);
      
      const results = await CreditAnalysisService.analyzePDF({
        file,
        round: currentRound
      });
      
      console.log('Analysis results received:', results);
      
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

  const handleRoundClick = (roundNumber: number) => {
    if (!isRoundUnlocked(roundNumber)) {
      toast({
        title: "Round Locked",
        description: "This round unlocks 30 days after the previous round is sent.",
        variant: "destructive",
      });
      return;
    }

    setCurrentRound(roundNumber);
    
    if (draftsByRound[roundNumber]) {
      setAnalysisComplete(true);
      toast({
        title: `Round ${roundNumber} Selected`,
        description: `Viewing ${draftsByRound[roundNumber].letterStatus} data for Round ${roundNumber}`,
      });
    }
  };

  const updateRoundStatus = (roundNumber: number, status: 'draft' | 'saved' | 'sent', data?: any) => {
    setDraftsByRound(prev => ({
      ...prev,
      [roundNumber]: {
        draft: data || prev[roundNumber]?.draft,
        letterRound: roundNumber,
        letterStatus: status,
        savedAt: Date.now(),
        sentAt: status === 'sent' ? Date.now() : prev[roundNumber]?.sentAt
      }
    }));
  };

  const getRoundIcon = (roundNumber: number) => {
    const roundData = draftsByRound[roundNumber];
    const status = roundData?.letterStatus;
    
    if (status === 'sent') {
      return <div className="w-4 h-4 rounded-full bg-success flex items-center justify-center">
        <span className="text-xs text-white">✓</span>
      </div>;
    } else if (status === 'saved') {
      return <div className="w-4 h-4 rounded-full bg-warning flex items-center justify-center">
        <span className="text-xs text-white">S</span>
      </div>;
    } else if (status === 'draft') {
      return <div className="w-4 h-4 rounded-full bg-secondary flex items-center justify-center">
        <span className="text-xs text-muted-foreground">D</span>
      </div>;
    }
    return null;
  };

  const getRoundStatus = (roundNumber: number) => {
    const roundData = draftsByRound[roundNumber];
    return roundData?.letterStatus || 'draft';
  };

  const saveRoundDraft = (roundNumber: number) => {
    if (analysisResults) {
      updateRoundStatus(roundNumber, 'saved', analysisResults);
      toast({
        title: "Round Saved",
        description: `Round ${roundNumber} draft has been saved successfully.`,
      });
    }
  };

  const regenerateRound = async (roundNumber: number) => {
    if (!confirm("Regenerate this round? This will overwrite the current draft.")) {
      return;
    }
    
    if (uploadedFile) {
      setIsAnalyzing(true);
      try {
        const results = await CreditAnalysisService.analyzePDF({
          file: uploadedFile,
          round: roundNumber
        });
        
        setAnalysisResults(results);
        updateRoundStatus(roundNumber, 'draft', results);
        
        toast({
          title: "Round Regenerated",
          description: `Round ${roundNumber} has been regenerated with new analysis.`,
        });
      } catch (error) {
        console.error('Regeneration failed:', error);
        toast({
          title: "Regeneration Failed",
          description: "Failed to regenerate round. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsAnalyzing(false);
      }
    }
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
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleLogout}
                className="flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Document Notification Banner */}
        <DocumentNotificationBanner />
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Progress & Stats */}
          <div className="lg:col-span-1 space-y-4">
            
            
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

            {/* Dispute Rounds */}
            <Card className="bg-gradient-card shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Dispute Rounds</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(round => {
                  const isUnlocked = isRoundUnlocked(round);
                  const isActive = currentRound === round;
                  const status = getRoundStatus(round);
                  
                  return (
                    <div 
                      key={round} 
                      className={`flex items-center justify-between py-2 px-2 rounded transition-colors ${
                        !isUnlocked 
                          ? 'opacity-50 pointer-events-none cursor-not-allowed' 
                          : isActive 
                            ? 'bg-primary/10 border border-primary/20 cursor-pointer' 
                            : 'hover:bg-muted/50 cursor-pointer'
                      }`}
                      onClick={() => handleRoundClick(round)}
                      title={!isUnlocked ? "Unlocks 30 days after last round & when letters are sent." : undefined}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${isActive ? 'font-medium text-primary' : ''}`}>
                          Round {round}
                        </span>
                        {isActive && (
                          <Badge variant="secondary" className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded">
                            {status === 'draft' ? 'Draft' : status === 'saved' ? 'Saved' : 'Sent'}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {getRoundIcon(round)}
                      </div>
                    </div>
                  );
                })}
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
                      <div className="flex gap-3 ml-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDeleteFile}
                          className="flex items-center gap-1 text-danger hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveRoundDraft(currentRound)}
                          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <Save className="h-4 w-4" />
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => regenerateRound(currentRound)}
                          className="flex items-center gap-1 border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Regenerate
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
                <DisputeLetterDrafts 
                  creditItems={analysisResults.items} 
                  currentRound={currentRound}
                  onRoundStatusChange={updateRoundStatus}
                />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
