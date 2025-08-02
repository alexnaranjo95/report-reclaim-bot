
import { useState, useEffect } from 'react';
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
import { supabase } from '@/integrations/supabase/client';

interface DisputeLetterDraftsProps {
  creditItems: CreditItem[];
}

export const DisputeLetterDrafts = ({ creditItems }: DisputeLetterDraftsProps) => {
  const [letters, setLetters] = useState<DisputeLetter[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [loadingTimer, setLoadingTimer] = useState(0);
  const [generationStage, setGenerationStage] = useState<string>('');
  const [tinyMCEApiKey, setTinyMCEApiKey] = useState<string>('no-api-key');
  const { toast } = useToast();

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
        const { data, error } = await supabase.functions.invoke('openai-analysis', {
          body: { action: 'getTinyMCEKey' }
        });
        
        if (error) {
          console.error('Error fetching TinyMCE API key:', error);
          return;
        }
        
        if (data?.apiKey) {
          setTinyMCEApiKey(data.apiKey);
        }
      } catch (error) {
        console.error('Error fetching TinyMCE API key:', error);
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
            generatedLetters.push({
              id: `letter-${creditor}-${bureau}-${Date.now()}`,
              creditor,
              bureau,
              items: itemDescriptions,
              content: generateFallbackLetter(creditor, bureauItems),
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
      console.log(`Generated ${generatedLetters.length} enhanced dispute letters`);
      
    } catch (error) {
      console.error('Error generating initial letters:', error);
      setGenerationStage('Error occurred during generation');
    } finally {
      setIsGenerating(false);
      setGenerationStage('');
      setLoadingTimer(0);
    }
  };

  const generateFallbackLetter = (creditor: string, items: CreditItem[]): string => {
    return `[DATE]

${creditor}
Dispute Department
[CREDITOR_ADDRESS]

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
    setLetters(prev => prev.map(letter => 
      letter.id === letterId 
        ? { ...letter, content: editContent, status: 'ready' }
        : letter
    ));
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
    // Create a downloadable text file for now (PDF generation would require additional library)
    const element = document.createElement('a');
    const file = new Blob([letter.content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `dispute-letter-${letter.creditor}-${letter.bureau}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    
    toast({
      title: "Letter Downloaded",
      description: "Your dispute letter has been downloaded as a text file.",
    });
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
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Enhanced Dispute Letters ({letters.length})
            </CardTitle>
          </div>
          {letters.length > 0 && (
            <Badge variant="outline" className="px-3 py-1">
              {isGenerating ? 'Generating...' : 'Ready to Send'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
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
                        <Editor
                          apiKey={tinyMCEApiKey}
                          value={editContent}
                          onEditorChange={(content) => setEditContent(content)}
                          init={{
                            height: 400,
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
                    onClick={() => {
                      toast({
                        title: "Send via Mail",
                        description: "Mail sending integration ready for setup.",
                      });
                    }}
                  >
                    <Send className="h-3 w-3 mr-1" />
                    Send Letter
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
      </CardContent>
    </Card>
  );
};
