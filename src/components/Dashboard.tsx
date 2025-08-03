import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';


import { UploadZone } from './UploadZone';
import { DocumentNotificationBanner } from './DocumentNotificationBanner';
import { ProfileIncompleteWarning } from './ProfileIncompleteWarning';
import { DisputeLetterDrafts } from './DisputeLetterDrafts';
import { RegenerateButton } from './RegenerateButton';
import { CreditAnalysis } from './CreditAnalysis';
import { FileText, TrendingUp, Shield, Clock, Trash2, RefreshCw, Save, LogOut, ChevronDown, ChevronRight, BarChart3, RotateCcw } from 'lucide-react';
import { CreditAnalysisService } from '../services/CreditAnalysisService';
import { CreditAnalysisResult } from '../types/CreditTypes';
import { SessionService, Session, Round } from '../services/SessionService';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { getRoundAccessibility } from '@/utils/RoundLockUtils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
export const Dashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentRound, setCurrentRound] = useState(1); // Always start on Round 1
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<CreditAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedRoundIndex, setExpandedRoundIndex] = useState<number | null>(null);
  
  const {
    toast
  } = useToast();
  const {
    signOut
  } = useAuth();
  const roleData = useRole();
  const {
    isSuperAdmin = false
  } = roleData || {};

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
        
        // Properly set current round to 1 initially
        setCurrentRound(1);
        
        // Only auto-load Round 1 data if it exists and user has completed a previous analysis
        const round1 = sessionRounds.find(r => r.round_number === 1);
        if (round1 && round1.snapshot_data && Object.keys(round1.snapshot_data).length > 0) {
          console.log('Auto-loading existing Round 1 data');
          setAnalysisResults(round1.snapshot_data as CreditAnalysisResult);
          setAnalysisComplete(true);
        }
      }
    } catch (error) {
      console.error('Failed to load session and rounds:', error);
      toast({
        title: "Failed to load data",
        description: "There was an error loading your session data.",
        variant: "destructive"
      });
    }
  };

  // Reset entire round functionality - clear all analysis and return to upload state
  const handleResetRound = () => {
    if (!confirm("Reset entire round? This will clear all analysis data and return to the upload screen.")) {
      return;
    }

    // Clear all analysis states
    setUploadedFile(null);
    setAnalysisComplete(false);
    setAnalysisResults(null);
    setIsAnalyzing(false);

    // Clear any saved round data for current round
    if (currentSession) {
      setRounds(prev => prev.filter(r => r.round_number !== currentRound));
    }

    toast({
      title: "Round Reset Complete",
      description: "Analysis cleared. You can now upload a new credit report to start fresh.",
    });
  };
  const handleLogout = async () => {
    try {
      await signOut();
      toast({
        title: "Logged out successfully",
        description: "You have been logged out of your account."
      });
    } catch (error) {
      toast({
        title: "Logout failed",
        description: "There was an error logging out. Please try again.",
        variant: "destructive"
      });
    }
  };
  const handleFileUpload = async (file: File) => {
    setUploadedFile(file);
    setIsAnalyzing(true);
    setAnalysisComplete(false);
    try {
      console.log('Starting analysis for file:', file.name);
      
      // Store the credit report in the database first
      try {
        const { default: CreditReportService } = await import('@/services/CreditReportService');
        const { data: { user } } = await import('@/integrations/supabase/client').then(mod => mod.supabase.auth.getUser());
        
        if (user) {
          console.log('Storing credit report in database...');
          
          // Create file path and upload file
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}-${file.name}`;
          const filePath = `${user.id}/${fileName}`;
          
          // Upload file to storage
          await CreditReportService.uploadFile(filePath, file);
          
          // Create credit report record
          const reportData = {
            bureau_name: file.name.toLowerCase().includes('equifax') ? 'Equifax' : 
                        file.name.toLowerCase().includes('experian') ? 'Experian' : 
                        file.name.toLowerCase().includes('transunion') ? 'TransUnion' : 'Unknown',
            file_name: file.name,
            file_path: filePath,
            report_date: new Date(),
            extraction_status: 'pending'
          };
          
          const creditReport = await CreditReportService.createCreditReport(reportData, user.id);
          console.log('Credit report stored successfully:', creditReport);
          
          toast({
            title: "Credit Report Stored",
            description: "Your credit report has been saved for future access.",
          });
        }
      } catch (storageError) {
        console.error('Failed to store credit report:', storageError);
        // Continue with analysis even if storage fails
        toast({
          title: "Storage Warning",
          description: "Analysis will proceed, but credit report storage failed.",
          variant: "destructive",
        });
      }
      
      // Continue with analysis
      const results = await CreditAnalysisService.analyzePDF({
        file,
        round: currentRound
      });
      console.log('Analysis results received:', results);
      setAnalysisResults(results);
      setAnalysisComplete(true);
      toast({
        title: "Analysis Complete",
        description: `Found ${results.summary.totalNegativeItems} negative items, ${results.summary.totalPositiveAccounts} positive accounts out of ${results.summary.totalAccounts} total accounts.`
      });
    } catch (error) {
      console.error('Analysis failed:', error);
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze credit report. Please try again.",
        variant: "destructive"
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
      description: "Upload a new credit report to begin analysis."
    });
  };
  const handleSaveRound = async () => {
    if (!analysisResults || !currentSession) {
      toast({
        title: "Nothing to save",
        description: "Please complete an analysis first.",
        variant: "destructive"
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

      // Log the data being saved for debugging
      console.log('[Saving Round]', {
        session_id: currentSession.id,
        round_number: currentRound,
        status: 'saved',
        snapshot_data: snapshotData
      });
      const round = await SessionService.createOrUpdateRound(currentSession.id, currentRound, snapshotData);
      console.log('[Round Saved Successfully]', round);

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
        description: `Round ${currentRound} saved successfully to database.`
      });
    } catch (error) {
      console.error('[Save Round Failed]', error);
      toast({
        title: "Save Failed",
        description: `Failed to save round data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };
  const handleMarkRoundAsSent = async (roundNumber: number) => {
    const round = rounds.find(r => r.round_number === roundNumber);
    if (!round) return;
    try {
      await SessionService.updateRoundStatus(round.id, 'sent');
      const now = new Date().toISOString();
      setRounds(prev => prev.map(r => r.round_number === roundNumber ? {
        ...r,
        status: 'sent' as Round['status'],
        sent_at: now
      } : r));
      toast({
        title: "Round Marked as Sent",
        description: `Round ${roundNumber} has been marked as sent.`
      });
    } catch (error) {
      console.error('Failed to update round status:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update round status.",
        variant: "destructive"
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
          description: `Round ${roundNumber} has been regenerated with new analysis.`
        });
      } catch (error) {
        console.error('Regeneration failed:', error);
        toast({
          title: "Regeneration Failed",
          description: "Failed to regenerate round. Please try again.",
          variant: "destructive"
        });
      } finally {
        setIsAnalyzing(false);
      }
    } else {
      toast({
        title: "No File to Regenerate",
        description: "Please upload a credit report first.",
        variant: "destructive"
      });
    }
  };
  const handleRoundClick = async (roundNumber: number) => {
    // Check if round is accessible using the updated logic
    const accessibility = getRoundAccessibility(roundNumber, 1, rounds); // Always compare against Round 1 as baseline
    if (!accessibility.isAccessible) {
      toast({
        title: "Round Locked",
        description: accessibility.lockReason || "This round is not yet available.",
        variant: "destructive"
      });
      return;
    }
    if (!currentSession) {
      try {
        const newSession = await SessionService.createSession(`Session ${new Date().toLocaleDateString()}`, {} as CreditAnalysisResult);
        setCurrentSession(newSession);
      } catch (error) {
        toast({
          title: "Failed to create session",
          description: "Please try again.",
          variant: "destructive"
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
        description: snapshotData.uploadedFileName ? `Loaded saved data from ${snapshotData.uploadedFileName}` : `Loaded saved round data`
      });
    } else {
      // Create a new round or switch to empty round
      setCurrentRound(roundNumber);
      setAnalysisResults(null);
      setAnalysisComplete(false);
      setUploadedFile(null);
      if (currentSession) {
        try {
          const newRound = await SessionService.createOrUpdateRound(currentSession.id, roundNumber);
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
        description: "Upload a credit report to begin analysis."
      });
    }
  };
  const getDaysUntilNextRound = (sentDate: string): number => {
    const daysElapsed = (Date.now() - new Date(sentDate).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 30 - Math.floor(daysElapsed));
  };
  const toggleRound = (roundNumber: number) => {
    setExpandedRoundIndex(prev => prev === roundNumber ? null : roundNumber);
  };
  const getRoundIcon = (roundNumber: number, status: string) => {
    if (status === 'sent') {
      return <div className="w-4 h-4 rounded-full bg-success flex items-center justify-center">
        <span className="text-xs text-white">✓</span>
      </div>;
    } else if (status === 'saved') {
      return;
    } else if (status === 'draft') {
      return <div className="w-4 h-4 rounded-full bg-secondary flex items-center justify-center">
        <span className="text-xs text-muted-foreground">D</span>
      </div>;
    }
    return null;
  };
  
  return <div className="min-h-screen bg-gradient-dashboard">
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
                asChild
              >
                <Link to="/credit-reports">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Credit Reports
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/settings">
                  Settings
                </Link>
              </Button>
              {isSuperAdmin && <Button variant="outline" size="sm" asChild>
                <Link to="/admin">
                  Admin
                </Link>
              </Button>}
              <Button variant="outline" size="sm" onClick={handleLogout} className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        
        {/* Profile Incomplete Warning */}
        <ProfileIncompleteWarning />
        
        {/* Document Notification Banner */}
        <DocumentNotificationBanner />

        <div className="w-full">
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
                <TooltipProvider>
                  {Array.from({
                  length: 12
                }, (_, i) => i + 1).map(roundNumber => {
                  const round = rounds.find(r => r.round_number === roundNumber);
                  const status = round?.status || 'draft';
                  const accessibility = getRoundAccessibility(roundNumber, 1, rounds); // Always check against Round 1 baseline
                  const isExpanded = expandedRoundIndex === roundNumber;

                  // Calculate countdown for rounds that are sent
                  let countdownDisplay = null;
                  if (round?.sent_at && status === 'sent') {
                    const daysRemaining = getDaysUntilNextRound(round.sent_at);
                    if (daysRemaining > 0) {
                      countdownDisplay = <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded">
                            {daysRemaining} days left
                          </Badge>;
                    } else {
                      countdownDisplay = <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded">
                            ✅ Ready to Start Round {roundNumber + 1}
                          </Badge>;
                    }
                  }
                  const roundButton = <div key={roundNumber} className={`space-y-2`}>
                        {/* Round Button/Header */}
                        <div className={`flex items-center justify-between py-2 px-3 rounded transition-colors ${accessibility.isAccessible ? 'hover:bg-muted/50 cursor-pointer' : 'opacity-50 cursor-not-allowed bg-muted/20'} ${accessibility.isCurrentRound ? 'bg-primary/10 border border-primary/20' : 'border border-transparent'}`} onClick={() => {
                      if (accessibility.isAccessible) {
                        if (round?.snapshot_data && Object.keys(round.snapshot_data).length > 0) {
                          toggleRound(roundNumber);
                        } else {
                          handleRoundClick(roundNumber);
                        }
                      }
                    }}>
                          <div className="flex items-center gap-2">
                            {round?.snapshot_data && Object.keys(round.snapshot_data).length > 0 && <div className="flex items-center">
                                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                              </div>}
                             <span className={`text-sm w-20 ${accessibility.isCurrentRound ? 'font-medium text-primary' : accessibility.isAccessible ? '' : 'text-muted-foreground'}`}>
                               Round {roundNumber}
                             </span>
                             {!accessibility.isAccessible ? <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center">
                                 
                               </div> : getRoundIcon(roundNumber, status)}
                          </div>
                          
                           <div className="flex items-center gap-2">
                             {!accessibility.isAccessible && accessibility.lockReason && <Badge variant="outline" className="text-xs bg-muted text-muted-foreground border-dashed">
                                 🔒 {accessibility.lockReason}
                               </Badge>}
                             {countdownDisplay}
                             {accessibility.isCurrentRound && <Badge variant="secondary" className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded">
                                 {status === 'draft' ? 'Draft' : status === 'saved' ? 'Saved' : 'Sent'}
                               </Badge>}
                             {accessibility.canGraduate && !accessibility.isCurrentRound && <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded">
                                 🟢 Ready
                               </Badge>}
                           </div>
                        </div>

                        {/* Collapsible Round Content */}
                        {isExpanded && round?.snapshot_data && Object.keys(round.snapshot_data).length > 0 && <div className="ml-6 p-3 bg-muted/30 rounded border-l-2 border-primary/30 space-y-2 mx-[14px] my-0 py-[7px]">
                            
                            {round.snapshot_data.uploadedFileName && <div className="text-xs text-muted-foreground">
                                📄 {round.snapshot_data.uploadedFileName}
                              </div>}
                            {round.snapshot_data.savedAt && <div className="text-xs text-muted-foreground">
                                💾 Saved: {new Date(round.snapshot_data.savedAt).toLocaleDateString()}
                              </div>}
                            {round.sent_at && <div className="text-xs text-muted-foreground">
                                📤 Sent: {new Date(round.sent_at).toLocaleDateString()}
                              </div>}
                            <Button size="sm" variant="outline" className="text-xs mt-2" onClick={() => handleRoundClick(roundNumber)}>
                              Load Round {roundNumber}
                            </Button>
                          </div>}
                      </div>;
                  return accessibility.lockReason ? <Tooltip key={roundNumber}>
                        <TooltipTrigger asChild>
                          {roundButton}
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{accessibility.lockReason}</p>
                        </TooltipContent>
                      </Tooltip> : roundButton;
                })}
                </TooltipProvider>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Upload Section */}
            {!uploadedFile && !analysisComplete && <Card className="bg-gradient-card shadow-card animate-fade-in">
                <CardHeader>
                  <CardTitle>Upload Your Credit Report</CardTitle>
                  <CardDescription>
                    Upload your monthly credit report PDF to begin Round {currentRound} analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <UploadZone onFileUpload={handleFileUpload} />
                </CardContent>
              </Card>}

            {/* Analysis Section */}
            {(uploadedFile || analysisComplete) && <div className="space-y-6 animate-fade-in">
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
                        {uploadedFile && <Button variant="outline" size="sm" onClick={handleDeleteFile} className="flex items-center gap-1 text-danger hover:text-danger">
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </Button>}
                        {(analysisComplete || uploadedFile) && <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={handleResetRound}
                          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Reset Round
                        </Button>}
                        <Button size="sm" onClick={handleSaveRound} disabled={!analysisResults || isSaving} className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                          <Save className="h-4 w-4" />
                          {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                        {uploadedFile && <RegenerateButton 
                          currentRound={currentRound}
                          sessionId={currentSession?.id}
                          onRegenerate={() => regenerateRound(currentRound)}
                          roundData={rounds.find(r => r.round_number === currentRound)}
                        />}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isAnalyzing ? <div className="space-y-4">
                        <div className="text-sm text-muted-foreground">
                          Analyzing credit report...
                        </div>
                        <Progress value={75} className="h-2" />
                      </div> : analysisComplete && analysisResults ? <CreditAnalysis analysisResults={analysisResults} /> : null}
                  </CardContent>
                </Card>

                {/* Dispute Letters Section */}
                {analysisComplete && analysisResults && <DisputeLetterDrafts creditItems={analysisResults.items} currentRound={currentRound} onRoundStatusChange={(roundNumber, status) => {
              if (status === 'sent') {
                handleMarkRoundAsSent(roundNumber);
              }
            }} />}
              </div>}
          </div>
            </div>
        </div>
      </div>
    </div>;
};