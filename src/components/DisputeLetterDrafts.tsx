
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileText, Edit3, Send, Eye, Download, Copy } from 'lucide-react';
import { CreditItem, DisputeLetter } from '../types/CreditTypes';
import { OpenAIService } from '../services/OpenAIService';
import { Editor } from '@tinymce/tinymce-react';
import { useToast } from '@/hooks/use-toast';
import { postgridService, PostgridLetter } from '../services/PostgridService';
import { creditorAddressService } from '@/services/CreditorAddressService';
import { supabase } from '@/integrations/supabase/client';
import { LetterCostNotification } from './LetterCostNotification';

import { Session } from '../services/SessionService';

interface DisputeLetterDraftsProps {
  creditItems: CreditItem[];
  currentRound: number;
  onRoundStatusChange: (roundNumber: number, status: 'draft' | 'saved' | 'sent', data?: any) => void;
}

export const DisputeLetterDrafts = ({ creditItems, currentRound, onRoundStatusChange }: DisputeLetterDraftsProps) => {
  const [letters, setLetters] = useState<DisputeLetter[]>([]);
  const [draftsByRound, setDraftsByRound] = useState<Record<number, DisputeLetter[]>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [loadingTimer, setLoadingTimer] = useState(0);
  const [generationStage, setGenerationStage] = useState<string>('');
  const [tinyMCEApiKey, setTinyMCEApiKey] = useState<string | null>(null);
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(true);
  const [showCostConfirmation, setShowCostConfirmation] = useState<string | null>(null);
  const { toast } = useToast();

  // Load drafts from localStorage on component mount
  useEffect(() => {
    const loadDraftsFromStorage = () => {
      try {
        const storedDrafts = localStorage.getItem('creditRepairDrafts');
        if (storedDrafts) {
          const parsedDrafts = JSON.parse(storedDrafts);
          setDraftsByRound(parsedDrafts);
          
          // Load letters for current round if available
          if (parsedDrafts[currentRound]) {
            setLetters(parsedDrafts[currentRound]);
          }
        }
      } catch (error) {
        console.error('Error loading drafts from localStorage:', error);
      }
    };
    
    loadDraftsFromStorage();
  }, []);

  // Load drafts for current round when round changes
  useEffect(() => {
    if (draftsByRound[currentRound]) {
      setLetters(draftsByRound[currentRound]);
    } else {
      setLetters([]); // Clear letters if no drafts for this round
    }
  }, [currentRound, draftsByRound]);

  // Save drafts to localStorage when draftsByRound changes
  useEffect(() => {
    if (Object.keys(draftsByRound).length > 0) {
      try {
        localStorage.setItem('creditRepairDrafts', JSON.stringify(draftsByRound));
      } catch (error) {
        console.error('Error saving drafts to localStorage:', error);
      }
    }
  }, [draftsByRound]);

  // Save current letters to round-specific storage
  const saveDraftsForCurrentRound = useCallback(() => {
    setDraftsByRound(prev => ({
      ...prev,
      [currentRound]: letters
    }));
  }, [letters, currentRound]);

  // Manual save function for the Save Round button
  const saveDrafts = useCallback(() => {
    saveDraftsForCurrentRound();
    onRoundStatusChange(currentRound, 'saved', letters);
    toast({
      title: "Round Saved",
      description: `Round ${currentRound} drafts have been saved successfully.`,
    });
  }, [saveDraftsForCurrentRound, currentRound, onRoundStatusChange, toast, letters]);

  // Auto-save drafts when letters change (on blur events)
  const handleAutoSave = useCallback(() => {
    if (letters.length > 0) {
      saveDraftsForCurrentRound();
      onRoundStatusChange(currentRound, 'draft', letters);
    }
  }, [letters, saveDraftsForCurrentRound, currentRound, onRoundStatusChange]);

  // Timer effect for loading state
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      setLoadingTimer(0);
      interval = setInterval(() => {
        setLoadingTimer(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGenerating]);

  useEffect(() => {
    generateInitialLetters();
  }, [creditItems]);

  useEffect(() => {
    const fetchTinyMCEKey = async () => {
      try {
        console.log('[TinyMCE] Fetching API key...');
        
        const { data, error } = await supabase.functions.invoke('get-tinymce-key');
        
        console.log('[TinyMCE] Response:', { 
          hasData: !!data, 
          hasApiKey: !!data?.apiKey, 
          error: error?.message 
        });
        
        if (error) {
          console.error('[TinyMCE] Function invocation error:', error);
          setTinyMCEApiKey(null);
          toast({
            title: "Editor Configuration Error",
            description: "Failed to load TinyMCE editor. Please contact support.",
            variant: "destructive",
          });
          return;
        }
        
        if (data?.apiKey && data.apiKey !== 'no-key-configured') {
          console.log('[TinyMCE] ✅ Successfully retrieved API key:', data.apiKey.substring(0, 10) + '...');
          setTinyMCEApiKey(data.apiKey);
        } else {
          console.error('[TinyMCE] ❌ No valid API key in response:', data);
          setTinyMCEApiKey(null);
          if (data?.apiKey === 'no-key-configured') {
            toast({
              title: "TinyMCE Not Configured",
              description: "TinyMCE API key needs to be configured by admin. Using fallback editor.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Editor Configuration Missing",
              description: data?.error || "TinyMCE API key not configured. Using fallback editor.",
              variant: "destructive",
            });
          }
        }
      } catch (error) {
        console.error('[TinyMCE] Unexpected error:', error);
        setTinyMCEApiKey(null);
        toast({
          title: "Editor Error",
          description: "Failed to initialize editor",
          variant: "destructive",
        });
      } finally {
        setIsLoadingApiKey(false);
      }
    };

    fetchTinyMCEKey();
  }, []);

  const generateInitialLetters = async () => {
    if (creditItems.length === 0) return;
    
    setIsGenerating(true);
    setLoadingTimer(0);
    setGenerationStage('Analyzing credit items...');
    const generatedLetters: DisputeLetter[] = [];

    try {
      setGenerationStage('Grouping items by creditor and bureau...');
      
      // Group items by creditor and bureau for targeted letters
      const creditorGroups = creditItems.reduce((groups, item) => {
        const key = item.creditor;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
        return groups;
      }, {} as Record<string, typeof creditItems>);

      setGenerationStage('Generating dispute letters...');

      // Generate letters for each creditor
      let letterCount = 0;
      const totalLetters = Object.values(creditorGroups).reduce((total, items) => 
        total + [...new Set(items.flatMap(item => item.bureau))].length, 0
      );
      
      for (const [creditor, items] of Object.entries(creditorGroups)) {
        const bureausAffected = [...new Set(items.flatMap(item => item.bureau))];
        
        // Generate separate letters for each bureau
        for (const bureau of bureausAffected) {
          letterCount++;
          setGenerationStage(`Generating letter ${letterCount}/${totalLetters} for ${creditor} - ${bureau}...`);
          
          const bureauItems = items.filter(item => item.bureau.includes(bureau));
          const itemDescriptions = bureauItems.map(item => `${item.issue} (Account: ${item.account})`);
          
          try {
            console.log(`Generating enhanced letter for ${creditor} - ${bureau}`);
            
            // Use multiple AI calls for better results
            const letterContent = await OpenAIService.generateDisputeLetter(
              creditor,
              itemDescriptions,
              'validation'
            );

            generatedLetters.push({
              id: `letter-${creditor}-${bureau}-${Date.now()}`,
              creditor,
              bureau,
              items: itemDescriptions,
              content: letterContent,
              status: 'ready',
              type: 'validation'
            });

          } catch (error) {
            console.error(`Error generating letter for ${creditor} - ${bureau}:`, error);
            // Provide fallback letter if API fails
            const fallbackContent = await generateFallbackLetter(creditor, bureauItems, bureau);
            generatedLetters.push({
              id: `letter-${creditor}-${bureau}-${Date.now()}`,
              creditor,
              bureau,
              items: itemDescriptions,
              content: fallbackContent,
              status: 'ready',
              type: 'validation'
            });
          }
        }
      }

      // Generate additional specialized letters
      const highImpactItems = creditItems.filter(item => item.impact === 'high');
      if (highImpactItems.length > 0) {
        setGenerationStage('Generating comprehensive letter for high-impact items...');
        
        // Generate a comprehensive letter for all high-impact items
        try {
          const comprehensiveContent = await OpenAIService.generateDisputeLetter(
            'Multiple Creditors',
            highImpactItems.map(item => `${item.creditor}: ${item.issue}`),
            'comprehensive'
          );

          generatedLetters.push({
            id: `comprehensive-${Date.now()}`,
            creditor: 'Multiple Creditors',
            bureau: 'All Bureaus',
            items: highImpactItems.map(item => `${item.creditor}: ${item.issue}`),
            content: comprehensiveContent,
            status: 'ready',
            type: 'comprehensive'
          });
        } catch (error) {
          console.error('Error generating comprehensive letter:', error);
        }
      }

      setGenerationStage('Finalizing letters...');
      setLetters(generatedLetters);
      setDraftsByRound(prev => ({
        ...prev,
        [currentRound]: generatedLetters
      }));
      console.log(`Generated ${generatedLetters.length} enhanced dispute letters for Round ${currentRound}`);
      
    } catch (error) {
      console.error('Error generating initial letters:', error);
      setGenerationStage('Error occurred during generation');
    } finally {
      setIsGenerating(false);
      setGenerationStage('');
      setLoadingTimer(0);
    }
  };

  const generateFallbackLetter = async (creditor: string, items: CreditItem[], bureau: string): Promise<string> => {
    // Try to get creditor address from database
    let creditorAddress = '';
    try {
      const { data } = await supabase.functions.invoke('admin-addresses', {
        method: 'GET',
        body: { 
          bureau: bureau,
          creditor: creditor 
        }
      });
      
      if (data?.data && data.data.length > 0) {
        const address = data.data[0];
        creditorAddress = `${address.street}\n${address.city}, ${address.state} ${address.zip}`;
      } else {
        creditorAddress = '[ADDRESS NOT FOUND - PLEASE UPDATE MANUALLY]';
      }
    } catch (error) {
      console.error('Error fetching creditor address:', error);
      creditorAddress = '[ADDRESS LOOKUP FAILED - PLEASE UPDATE MANUALLY]';
    }

    return `[DATE]

${creditor}
Dispute Department
${creditorAddress}

RE: FCRA Section 623 Dispute - Request for Investigation and Validation

Dear ${creditor} Dispute Department,

I am writing to formally dispute the following inaccurate information that you have furnished to the credit reporting agencies regarding my account(s):

DISPUTED ITEMS:
${items.map((item, index) => `${index + 1}. ${item.issue} - Account: ${item.account}`).join('\n')}

Pursuant to the Fair Credit Reporting Act (FCRA) Section 623(b), upon notification of a dispute, you are required to:

1. Conduct a reasonable investigation with respect to the disputed information
2. Review all relevant information provided by the consumer
3. Report the results of the investigation to the credit reporting agency
4. Modify, delete, or permanently block the reporting of the information if found to be incomplete or inaccurate

I am requesting that you:
• Immediately investigate the above-mentioned items
• Provide complete documentation supporting these entries
• Remove these items if verification cannot be provided
• Confirm in writing the actions taken within 30 days

Please note that under FCRA Section 623(a)(1)(A), you are prohibited from furnishing information to credit reporting agencies that you know or have reasonable cause to believe is inaccurate.

I look forward to your prompt attention to this matter. Please send your response to the address below within thirty (30) days of receipt of this letter.

Sincerely,

[YOUR_NAME]
[YOUR_ADDRESS]
[PHONE_NUMBER]

Enclosures: Copy of credit report, Copy of ID`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'secondary';
      case 'ready': return 'default';
      case 'sent': return 'outline';
      default: return 'secondary';
    }
  };

  const handleEditLetter = (letterId: string, content: string) => {
    setEditContent(content);
    setEditMode(letterId);
  };

  const handleSaveEdit = (letterId: string) => {
    const updatedLetters = letters.map(letter => 
      letter.id === letterId 
        ? { ...letter, content: editContent, status: 'ready' as const }
        : letter
    );
    setLetters(updatedLetters);
    setDraftsByRound(prev => ({
      ...prev,
      [currentRound]: updatedLetters
    }));
    setEditMode(null);
    setEditContent('');
    toast({
      title: "Letter Updated",
      description: "Your dispute letter has been successfully updated.",
    });
  };

  const handleCopyLetter = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({
        title: "Copied to Clipboard",
        description: "Letter content has been copied to your clipboard.",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Unable to copy to clipboard. Please select and copy manually.",
        variant: "destructive",
      });
    }
  };

  const handleExportPDF = (letter: DisputeLetter) => {
    // Import jsPDF dynamically
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF();
      
      // Set up the document
      doc.setFontSize(12);
      
      // Add title
      doc.setFontSize(16);
      doc.text(`Dispute Letter - ${letter.creditor}`, 20, 20);
      
      // Add bureau info
      doc.setFontSize(12);
      doc.text(`Bureau: ${letter.bureau}`, 20, 35);
      doc.text(`Type: ${letter.type.charAt(0).toUpperCase() + letter.type.slice(1)}`, 20, 45);
      
      // Add content with proper wrapping
      const splitContent = doc.splitTextToSize(letter.content, 170);
      doc.text(splitContent, 20, 60);
      
      // Save the PDF
      doc.save(`dispute-letter-${letter.creditor}-${letter.bureau}.pdf`);
      
      toast({
        title: "PDF Downloaded",
        description: "Your dispute letter has been downloaded as a PDF file.",
      });
    }).catch(error => {
      console.error('Error generating PDF:', error);
      toast({
        title: "PDF Generation Failed",
        description: "Unable to generate PDF. Please try again.",
        variant: "destructive",
      });
    });
  };

  const handleSendAllLetters = () => {
    setShowCostConfirmation('send-all');
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'validation': return 'bg-primary/10 text-primary';
      case 'verification': return 'bg-secondary/10 text-secondary';
      case 'goodwill': return 'bg-success/10 text-success';
      case 'cease_and_desist': return 'bg-danger/10 text-danger';
      case 'comprehensive': return 'bg-warning/10 text-warning';
      case 'follow_up': return 'bg-info/10 text-info';
      default: return 'bg-muted/10 text-muted-foreground';
    }
  };

  if (creditItems.length === 0) {
    return (
      <Card className="bg-gradient-card shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Enhanced Dispute Letter Generation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Upload and analyze a credit report to generate professional dispute letters.</p>
        </div>
      </CardContent>

    </Card>
  );
}

  return (
    <Card className="bg-gradient-card shadow-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Dispute Letters - Round {currentRound} of 12
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                ({letters.length} letters)
              </span>
            </div>
          </div>
          {letters.length > 0 && (
            <Badge variant="outline" className="px-3 py-1">
              {isGenerating ? 'Generating...' : 'Ready to Send'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Action buttons at the top */}
        {letters.length > 0 && !isGenerating && (
          <div className="flex gap-2 mb-6 p-4 bg-muted/30 rounded-lg border">
            <Button 
              variant="outline"
              onClick={() => saveDrafts()}
              className="text-primary hover:text-primary"
            >
              Save
            </Button>
            <Button 
              className="bg-gradient-primary text-white"
              onClick={() => handleSendAllLetters()}
            >
              <Send className="h-3 w-3 mr-1" />
              Send All Letters ({letters.length} letters @ $2.94 each)
            </Button>
          </div>
        )}
        
        {isGenerating ? (
          <div className="space-y-6 py-8">
            {/* Enhanced Loading Header with Timer */}
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-3">
                <div className="relative">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-2 w-2 bg-primary rounded-full animate-pulse"></div>
                  </div>
                </div>
                <div className="text-lg font-semibold text-foreground">
                  Generating Enhanced Dispute Letters
                </div>
              </div>
              
              {/* Active Timer Display */}
              <div className="flex items-center justify-center gap-4 text-sm">
                <div className="bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                  <span className="text-primary font-mono">
                    ⏱️ {Math.floor(loadingTimer / 60)}:{(loadingTimer % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  Active Processing
                </div>
              </div>
              
              {/* Loading Time Notice */}
              <div className="text-center text-xs text-muted-foreground">
                Loading can take up to 5 minutes for comprehensive analysis
              </div>
            </div>

            {/* Current Stage Display */}
            <div className="bg-muted/30 rounded-lg p-4 border border-muted">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                Current Stage:
              </div>
              <div className="text-sm text-muted-foreground">
                {generationStage || 'Initializing AI analysis...'}
              </div>
            </div>

            {/* Process Steps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <div className="font-medium text-foreground">AI Enhancement Process:</div>
                <div className="space-y-1 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-success rounded-full"></div>
                    Multiple OpenAI API calls per letter
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-success rounded-full"></div>
                    FCRA-compliant template generation
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-success rounded-full"></div>
                    Legal citation integration
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-success rounded-full"></div>
                    Documentation requirements
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="font-medium text-foreground">Letter Organization:</div>
                <div className="space-y-1 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-warning rounded-full"></div>
                    Grouping by creditor & bureau
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-warning rounded-full"></div>
                    Individual targeted letters
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-warning rounded-full"></div>
                    Comprehensive high-impact letters
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-warning rounded-full"></div>
                    Professional formatting
                  </div>
                </div>
              </div>
            </div>

            {/* Progress Indicator */}
            <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
              <div className="flex items-center gap-2 text-xs text-primary">
                <div className="animate-bounce">💳</div>
                <span>Using premium AI models for maximum accuracy</span>
                <div className="ml-auto animate-pulse">🔄</div>
              </div>
            </div>
          </div>
        ) : letters.length > 0 ? (
          <div className="space-y-4">
            {letters.map((letter) => (
              <div key={letter.id} className="border rounded-lg p-4 space-y-3 bg-card">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-foreground">{letter.creditor}</h4>
                      <Badge variant="outline" className="bg-primary/10 text-primary">
                        {letter.bureau}
                      </Badge>
                      <Badge className={getTypeColor(letter.type)} variant="outline">
                        {letter.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {letter.items.slice(0, 2).join(', ')}
                      {letter.items.length > 2 && ` +${letter.items.length - 2} more`}
                    </p>
                  </div>
                  <Badge variant={getStatusColor(letter.status)} className="capitalize">
                    {letter.status}
                  </Badge>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedLetter(
                      selectedLetter === letter.id ? null : letter.id
                    )}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    {selectedLetter === letter.id ? 'Hide' : 'Preview'}
                  </Button>
                  
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEditLetter(letter.id, letter.content)}
                      >
                        <Edit3 className="h-3 w-3 mr-1" />
                        Edit in TinyMCE
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
                      <DialogHeader>
                        <DialogTitle>Edit Dispute Letter - {letter.creditor}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        {isLoadingApiKey ? (
                          <div className="flex items-center justify-center h-96 bg-muted/30 rounded-md">
                            <div className="text-center space-y-2">
                              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
                              <p className="text-sm text-muted-foreground">Loading TinyMCE editor...</p>
                            </div>
                          </div>
                         ) : tinyMCEApiKey ? (
                          <Editor
                            apiKey={tinyMCEApiKey}
                            value={editContent}
                            onEditorChange={(content) => setEditContent(content)}
                            onBlur={handleAutoSave}
                            init={{
                              height: 600,
                              menubar: false,
                              plugins: [
                                'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
                                'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
                                'insertdatetime', 'media', 'table', 'code', 'help', 'wordcount'
                              ],
                              toolbar: 'undo redo | blocks | ' +
                                'bold italic forecolor | alignleft aligncenter ' +
                                'alignright alignjustify | bullist numlist outdent indent | ' +
                                'removeformat | help',
                              content_style: 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; line-height: 1.6; }'
                            }}
                          />
                        ) : (
                          <div className="bg-muted/30 p-4 rounded-md">
                            <p className="text-sm text-muted-foreground">
                              TinyMCE editor unavailable. Using fallback text editor.
                            </p>
                            <Textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              onBlur={handleAutoSave}
                              className="mt-2 min-h-96"
                              placeholder="Edit your dispute letter content here..."
                            />
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setEditMode(null);
                              setEditContent('');
                            }}
                          >
                            Cancel
                          </Button>
                          <Button onClick={() => handleSaveEdit(letter.id)}>
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleCopyLetter(letter.content)}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleExportPDF(letter)}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>

                  
                  <Button 
                    size="sm" 
                    className="bg-gradient-primary text-white"
                    onClick={() => setShowCostConfirmation(letter.id)}
                  >
                    <Send className="h-3 w-3 mr-1" />
                    Send via Postgrid ($2.94)
                  </Button>
                </div>

                {selectedLetter === letter.id && (
                  <div className="space-y-4 border-t pt-4">
                    <div className="bg-muted/30 p-4 rounded-md max-h-96 overflow-y-auto">
                      <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">
                        {letter.content}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No dispute letters generated yet.</p>
            <p className="text-sm">Upload and analyze a credit report to generate dispute letters.</p>
          </div>
        )}

        <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-primary" />
            <span className="font-medium">Enhanced Letter Features:</span>
          </div>
          <div className="text-xs text-muted-foreground mt-2 space-y-1">
            <p>✓ TinyMCE rich text editor for professional editing</p>
            <p>✓ Multiple AI calls per letter for maximum accuracy</p>
            <p>✓ FCRA-compliant templates with legal citations</p>
            <p>✓ Copy, download, and send functionality ready</p>
          </div>
        </div>

        {showCostConfirmation && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-900 rounded-lg max-w-md w-full">
              <div className="p-6">
                <LetterCostNotification
                  onConfirm={async () => {
                    if (showCostConfirmation === 'send-all') {
                      // Handle sending all letters
                      try {
                        let successCount = 0;
                        let errorCount = 0;

                        for (const letter of letters) {
                          // Get creditor address from database
                          const creditorAddress = await creditorAddressService.getPostgridAddress(letter.creditor, letter.bureau);
                          
                          if (!creditorAddress) {
                            console.error(`No address found for ${letter.creditor} (${letter.bureau})`);
                            errorCount++;
                            continue;
                          }

                          // Create letter for sending
                          const sampleLetter: PostgridLetter = {
                            to: creditorAddress,
                            from: {
                              firstName: "User", // TODO: Get from user profile
                              lastName: "Name",
                              addressLine1: "456 User Street",
                              city: "User City",
                              provinceOrState: "CA",
                              postalOrZip: "54321",
                              country: "US"
                            },
                            content: letter.content,
                            color: true,
                            doubleSided: false,
                            returnEnvelope: true
                          };

                          try {
                            const result = await postgridService.sendLetter(sampleLetter);
                            if (result.error) {
                              throw new Error(result.error);
                            }
                            successCount++;
                          } catch (error) {
                            console.error(`Failed to send letter to ${letter.creditor}:`, error);
                            errorCount++;
                          }
                        }

                        // Mark round as sent if all letters were successful
                        if (errorCount === 0) {
                          onRoundStatusChange(currentRound, 'sent', letters);
                          toast({
                            title: "All Letters Sent Successfully!",
                            description: `${successCount} letters sent successfully.`,
                          });
                        } else {
                          toast({
                            title: "Partial Success",
                            description: `${successCount} letters sent, ${errorCount} failed.`,
                            variant: errorCount > successCount ? "destructive" : "default",
                          });
                        }

                        setShowCostConfirmation(null);
                      } catch (error: any) {
                        console.error('❌ Failed to send letters:', error);
                        toast({
                          title: "Send Failed",
                          description: "Failed to send letters. Please try again.",
                          variant: "destructive"
                        });
                        setShowCostConfirmation(null);
                      }
                      return;
                    }

                    const letter = letters.find(l => l.id === showCostConfirmation);
                    if (!letter) return;

                    // Get creditor address from database
                    const creditorAddress = await creditorAddressService.getPostgridAddress(letter.creditor, letter.bureau);
                    
                    if (!creditorAddress) {
                      toast({
                        title: "Address Not Found",
                        description: `No address found for ${letter.creditor} (${letter.bureau}). Please add the address in the Admin panel first.`,
                        variant: "destructive"
                      });
                      setShowCostConfirmation(null);
                      return;
                    }

                    // Create letter for sending
                    const sampleLetter: PostgridLetter = {
                      to: creditorAddress,
                      from: {
                        firstName: "User", // TODO: Get from user profile
                        lastName: "Name",
                        addressLine1: "456 User Street",
                        city: "User City",
                        provinceOrState: "CA",
                        postalOrZip: "54321",
                        country: "US"
                      },
                      content: letter.content,
                      color: true,
                      doubleSided: false,
                      returnEnvelope: true
                    };

                    try {
                      const result = await postgridService.sendLetter(sampleLetter);
                      if (result.error) {
                        throw new Error(result.error);
                      }
                      
                      console.log('✅ Letter sent successfully:', result);
                      
                      // Mark letter as sent
                      onRoundStatusChange(currentRound, 'sent', letters);
                      
                      toast({
                        title: "Letter Sent Successfully!",
                        description: `Letter sent to ${letter.creditor}. Tracking ID: ${result.id}`,
                      });
                      
                      setShowCostConfirmation(null);
                    } catch (error: any) {
                      console.error('❌ Failed to send letter:', error);
                      
                      let errorMessage = "Failed to send letter via Postgrid";
                      
                      if (error.message) {
                        errorMessage = error.message;
                      }
                      
                      // Handle specific error types
                      if (error.status === 400 || error.status === 422) {
                        errorMessage = "Invalid address or letter data. Please check all fields are filled correctly.";
                      } else if (error.status === 401) {
                        errorMessage = "Authentication failed. Please check your Postgrid API configuration.";
                      } else if (error.status === 429) {
                        errorMessage = "Too many requests. Please try again in a moment.";
                      }
                      
                      toast({
                        title: "Send Failed",
                        description: errorMessage,
                        variant: "destructive"
                      });
                    } finally {
                      setShowCostConfirmation(null);
                    }
                  }}
                  onCancel={() => setShowCostConfirmation(null)}
                  letterCount={showCostConfirmation === 'send-all' ? letters.length : 1}
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
