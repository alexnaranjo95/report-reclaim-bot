import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { UploadZone } from './UploadZone';
import { DocumentNotificationBanner } from './DocumentNotificationBanner';
import { DisputeLetterDrafts } from './DisputeLetterDrafts';
import { CreditAnalysis } from './CreditAnalysis';
import { FileText, TrendingUp, Shield, Clock, Trash2, RefreshCw, Save, LogOut } from 'lucide-react';
import { CreditAnalysisService } from '../services/CreditAnalysisService';
import { CreditAnalysisResult } from '../types/CreditTypes';
import { SessionService, Session, Round } from '../services/SessionService';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';

export const Dashboard = () => {
  const [currentRound, setCurrentRound] = useState(1);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<CreditAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const { signOut } = useAuth();
  const roleData = useRole();
  const { isSuperAdmin = false } = roleData || {};

  // Load session and rounds on component mount
  useEffect(() => {
    loadSessionAndRounds();
  }, []);

  const loadSessionAndRounds = async () => {
    try {
      const sessions = await SessionService.getSessions();
      let session = sessions.find(s => s.status === 'active');
      
      if (!session && sessions.length > 0) {
        session = sessions[0];
      }
      
      if (session) {
        setCurrentSession(session);
        const sessionRounds = await SessionService.getRounds(session.id);
        setRounds(sessionRounds);
        
        // If there are rounds, set the current round to the last one
        if (sessionRounds.length > 0) {
          const lastRound = sessionRounds[sessionRounds.length - 1];
          setCurrentRound(lastRound.round_number);
          
          // Load the round's snapshot data if it exists
          if (lastRound.snapshot_data && Object.keys(lastRound.snapshot_data).length > 0) {
            setAnalysisResults(lastRound.snapshot_data as CreditAnalysisResult);
            setAnalysisComplete(true);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load session and rounds:', error);
      toast({
        title: "Failed to load data",
        description: "There was an error loading your session data.",
        variant: "destructive",
      });
    }
  };

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

  const handleSaveRound = async () => {
    if (!analysisResults || !currentSession) {
      toast({
        title: "Nothing to save",
        description: "Please complete an analysis first.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const snapshotData = {
        ...analysisResults,
        uploadedFileName: uploadedFile?.name,
        savedAt: new Date().toISOString()
      };

      const round = await SessionService.createOrUpdateRound(
        currentSession.id,
        currentRound,
        snapshotData
      );

      // Update local rounds state
      setRounds(prev => {
        const existing = prev.find(r => r.round_number === currentRound);
        if (existing) {
          return prev.map(r => r.round_number === currentRound ? round : r);
        } else {
          return [...prev, round].sort((a, b) => a.round_number - b.round_number);
        }
      });

      toast({
        title: "Round Saved ✅",
        description: `Round ${currentRound} saved successfully to database.`,
      });
    } catch (error) {
      console.error('Failed to save round:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save round data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRoundSelect = async (roundNumber: number, round: Round) => {
    setCurrentRound(roundNumber);
    
    if (round.snapshot_data && Object.keys(round.snapshot_data).length > 0) {
      setAnalysisResults(round.snapshot_data as CreditAnalysisResult);
      setAnalysisComplete(true);
      
      // If there's a saved file name, we could potentially restore that too
      const snapshotData = round.snapshot_data as any;
      if (snapshotData.uploadedFileName) {
        // Note: We can't restore the actual file, but we can show the filename
        toast({
          title: `Round ${roundNumber} Loaded`,
          description: `Loaded saved data from ${snapshotData.uploadedFileName}`,
        });
      }
    } else {
      setAnalysisResults(null);
      setAnalysisComplete(false);
      setUploadedFile(null);
    }
  };

  const handleCreateNewRound = async () => {
    if (!currentSession) {
      // Create a new session if none exists
      try {
        const newSession = await SessionService.createSession(
          `Session ${new Date().toLocaleDateString()}`,
          analysisResults || {} as CreditAnalysisResult
        );
        setCurrentSession(newSession);
        const newRound = await SessionService.createOrUpdateRound(newSession.id, 1);
        setRounds([newRound]);
        setCurrentRound(1);
        
        toast({
          title: "New Session Created",
          description: "Started Round 1 of your new session.",
        });
      } catch (error) {
        toast({
          title: "Failed to create session",
          description: "Please try again.",
          variant: "destructive",
        });
      }
      return;
    }

    const nextRoundNumber = Math.max(...rounds.map(r => r.round_number), 0) + 1;
    
    try {
      const newRound = await SessionService.createOrUpdateRound(
        currentSession.id,
        nextRoundNumber
      );
      
      setRounds(prev => [...prev, newRound].sort((a, b) => a.round_number - b.round_number));
      setCurrentRound(nextRoundNumber);
      setAnalysisResults(null);
      setAnalysisComplete(false);
      setUploadedFile(null);
      
      toast({
        title: "New Round Created",
        description: `Started Round ${nextRoundNumber}. Upload a credit report to begin.`,
      });
    } catch (error) {
      console.error('Failed to create new round:', error);
      toast({
        title: "Failed to create round",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleMarkRoundAsSent = async (roundNumber: number) => {
    const round = rounds.find(r => r.round_number === roundNumber);
    if (!round) return;

    try {
      await SessionService.updateRoundStatus(round.id, 'sent');
      
      setRounds(prev => 
        prev.map(r => 
          r.round_number === roundNumber 
            ? { ...r, status: 'sent' as Round['status'] }
            : r
        )
      );

      toast({
        title: "Round Marked as Sent",
        description: `Round ${roundNumber} has been marked as sent.`,
      });
    } catch (error) {
      console.error('Failed to update round status:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update round status.",
        variant: "destructive",
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
    } else {
      toast({
        title: "No File to Regenerate",
        description: "Please upload a credit report first.",
        variant: "destructive",
      });
    }
  };

  const handleRoundClick = async (roundNumber: number) => {
    // Check if we need to create a session first
    if (!currentSession) {
      try {
        const newSession = await SessionService.createSession(
          `Session ${new Date().toLocaleDateString()}`,
          {} as CreditAnalysisResult
        );
        setCurrentSession(newSession);
      } catch (error) {
        toast({
          title: "Failed to create session",
          description: "Please try again.",
          variant: "destructive",
        });
        return;
      }
    }

    const round = rounds.find(r => r.round_number === roundNumber);
    
    if (round && round.snapshot_data && Object.keys(round.snapshot_data).length > 0) {
      // Load existing round data
      setCurrentRound(roundNumber);
      setAnalysisResults(round.snapshot_data as CreditAnalysisResult);
      setAnalysisComplete(true);
      setUploadedFile(null); // Clear file since we're loading saved data
      
      const snapshotData = round.snapshot_data as any;
      toast({
        title: `Round ${roundNumber} Loaded`,
        description: snapshotData.uploadedFileName 
          ? `Loaded saved data from ${snapshotData.uploadedFileName}`
          : `Loaded saved round data`,
      });
    } else {
      // Create a new round or switch to empty round
      setCurrentRound(roundNumber);
      setAnalysisResults(null);
      setAnalysisComplete(false);
      setUploadedFile(null);
      
      if (currentSession) {
        try {
          const newRound = await SessionService.createOrUpdateRound(
            currentSession.id,
            roundNumber
          );
          
          setRounds(prev => {
            const existing = prev.find(r => r.round_number === roundNumber);
            if (existing) {
              return prev;
            } else {
              return [...prev, newRound].sort((a, b) => a.round_number - b.round_number);
            }
          });
        } catch (error) {
          console.error('Failed to create round:', error);
        }
      }
      
      toast({
        title: `Round ${roundNumber} Selected`,
        description: "Upload a credit report to begin analysis.",
      });
    }
  };

  const getRoundIcon = (roundNumber: number, status: string) => {
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

  return (
    <div className="min-h-screen bg-gradient-dashboard">
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
              {isSuperAdmin && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.location.href = '/admin'}
                >
                  Admin
                </Button>
              )}
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
                {Array.from({ length: 12 }, (_, i) => i + 1).map(roundNumber => {
                  const round = rounds.find(r => r.round_number === roundNumber);
                  const isActive = currentRound === roundNumber;
                  const status = round?.status || 'draft';
                  
                  return (
                    <div 
                      key={roundNumber} 
                      className={`flex items-center justify-between py-2 px-2 rounded transition-colors cursor-pointer ${
                        isActive 
                          ? 'bg-primary/10 border border-primary/20' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => handleRoundClick(roundNumber)}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${isActive ? 'font-medium text-primary' : ''}`}>
                          Round {roundNumber}
                        </span>
                        {isActive && (
                          <Badge variant="secondary" className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded">
                            {status === 'draft' ? 'Draft' : status === 'saved' ? 'Saved' : 'Sent'}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {getRoundIcon(roundNumber, status)}
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
            {!uploadedFile && !analysisComplete && (
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
            {(uploadedFile || analysisComplete) && (
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
                          {uploadedFile ? `AI analysis of ${uploadedFile.name}` : 'Saved round data'}
                        </CardDescription>
                      </div>
                      <div className="flex gap-3 ml-auto">
                        {uploadedFile && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDeleteFile}
                            className="flex items-center gap-1 text-danger hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={handleSaveRound}
                          disabled={!analysisResults || isSaving}
                          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                        >
                          <Save className="h-4 w-4" />
                          {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                        {uploadedFile && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => regenerateRound(currentRound)}
                            className="flex items-center gap-1 border-gray-300 text-gray-700 hover:bg-gray-50"
                          >
                            <RefreshCw className="h-4 w-4" />
                            Regenerate
                          </Button>
                        )}
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
                    onRoundStatusChange={(roundNumber, status) => {
                      if (status === 'sent') {
                        handleMarkRoundAsSent(roundNumber);
                      }
                    }}
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