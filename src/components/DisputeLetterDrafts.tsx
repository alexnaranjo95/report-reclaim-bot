
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Edit3, Send, Eye, Download } from 'lucide-react';
import { CreditItem, DisputeLetter } from '../types/CreditTypes';
import { OpenAIService } from '../services/OpenAIService';

interface DisputeLetterDraftsProps {
  creditItems: CreditItem[];
}

export const DisputeLetterDrafts = ({ creditItems }: DisputeLetterDraftsProps) => {
  const [letters, setLetters] = useState<DisputeLetter[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    generateInitialLetters();
  }, [creditItems]);

  const generateInitialLetters = async () => {
    if (creditItems.length === 0) return;
    
    setIsGenerating(true);
    const generatedLetters: DisputeLetter[] = [];

    try {
      // Group items by creditor and bureau for targeted letters
      const creditorGroups = creditItems.reduce((groups, item) => {
        const key = item.creditor;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
        return groups;
      }, {} as Record<string, typeof creditItems>);

      // Generate letters for each creditor
      for (const [creditor, items] of Object.entries(creditorGroups)) {
        const bureausAffected = [...new Set(items.flatMap(item => item.bureau))];
        
        // Generate separate letters for each bureau
        for (const bureau of bureausAffected) {
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

      setLetters(generatedLetters);
      console.log(`Generated ${generatedLetters.length} enhanced dispute letters`);
      
    } catch (error) {
      console.error('Error generating initial letters:', error);
    } finally {
      setIsGenerating(false);
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

  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<string | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'secondary';
      case 'approved': return 'outline';
      case 'sent': return 'default';
      default: return 'secondary';
    }
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
        <div className="space-y-4">
          {letters.map((letter) => (
            <div key={letter.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{letter.creditor}</h4>
                    <Badge 
                      variant="outline" 
                      className="bg-primary/10 text-primary"
                    >
                      {letter.bureau}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {letter.items.join(', ')}
                  </p>
                </div>
                <Badge variant={getStatusColor(letter.status)} className="capitalize">
                  {letter.status}
                </Badge>
              </div>

              {selectedLetter === letter.id && (
                <div className="space-y-4 border-t pt-4">
                  {editMode === letter.id ? (
                    <div className="space-y-3">
                      <Textarea 
                        value={letter.content}
                        className="min-h-[300px] font-mono text-xs"
                        readOnly={editMode !== letter.id}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => setEditMode(null)}>
                          Save Changes
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditMode(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-muted/50 p-4 rounded-md">
                        <pre className="text-xs whitespace-pre-wrap font-mono">
                          {letter.content}
                        </pre>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setEditMode(letter.id)}
                        >
                          <Edit3 className="h-3 w-3 mr-1" />
                          Edit in TinyMCE
                        </Button>
                        <Button variant="outline" size="sm">
                          <Download className="h-3 w-3 mr-1" />
                          Export PDF
                        </Button>
                        <Button size="sm" className="bg-gradient-success">
                          <Send className="h-3 w-3 mr-1" />
                          Approve & Send via Lob
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
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
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-primary" />
            <span className="font-medium">Integration Status:</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            TinyMCE editor and Lob.com print/send integration ready for setup
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
