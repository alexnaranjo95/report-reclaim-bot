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
    setIsGenerating(true);
    const apiKey = localStorage.getItem('openai_api_key');
    
    try {
      // Group items by creditor
      const itemsByCreditor = creditItems.reduce((acc, item) => {
        if (!acc[item.creditor]) {
          acc[item.creditor] = [];
        }
        acc[item.creditor].push(item);
        return acc;
      }, {} as Record<string, CreditItem[]>);

      const newLetters: DisputeLetter[] = [];

      for (const [creditor, items] of Object.entries(itemsByCreditor)) {
        const bureaus = [...new Set(items.flatMap(item => item.bureau))];
        
        for (const bureau of bureaus) {
          const bureauItems = items.filter(item => item.bureau.includes(bureau));
          
          let content = '';
          if (apiKey) {
            try {
              OpenAIService.initialize(apiKey);
              content = await OpenAIService.generateDisputeLetter(
                creditor,
                bureauItems.map(item => item.issue),
                'validation'
              );
            } catch (error) {
              console.error('AI letter generation failed:', error);
              content = generateFallbackLetter(creditor, bureauItems);
            }
          } else {
            content = generateFallbackLetter(creditor, bureauItems);
          }

          newLetters.push({
            id: `${creditor}-${bureau}`.toLowerCase().replace(/\s+/g, '-'),
            creditor,
            bureau,
            items: bureauItems.map(item => item.issue),
            content,
            status: 'draft',
            type: 'validation'
          });
        }
      }

      setLetters(newLetters);
    } catch (error) {
      console.error('Error generating letters:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateFallbackLetter = (creditor: string, items: CreditItem[]): string => {
    return `Dear ${creditor},

I am writing to formally dispute inaccurate information on my credit report. Upon reviewing my credit report, I have identified several items that are incorrectly reported and are negatively impacting my credit score.

The following items require immediate attention and correction:

${items.map((item, index) => `${index + 1}. ${item.issue} - Account: ${item.account}`).join('\n')}

I am requesting that you investigate these matters and provide proper documentation to support these claims. Under the Fair Credit Reporting Act (FCRA), I have the right to dispute inaccurate information and request validation.

Please remove or correct these items within 30 days as required by law.

Sincerely,
[Your Name]`;
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
    return type === 'bureau' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success';
  };

  return (
    <Card className="bg-gradient-card shadow-elevated animate-fade-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Dispute Letters {isGenerating && '(Generating...)'}
        </CardTitle>
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