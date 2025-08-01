import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Edit3, Send, Eye, Download } from 'lucide-react';

interface DisputeLetter {
  id: string;
  recipient: string;
  type: 'bureau' | 'creditor';
  issue: string;
  content: string;
  status: 'draft' | 'approved' | 'sent';
}

interface DisputeLetterDraftsProps {
  roundNumber: number;
}

export const DisputeLetterDrafts = ({ roundNumber }: DisputeLetterDraftsProps) => {
  const [letters] = useState<DisputeLetter[]>([
    {
      id: '1',
      recipient: 'Experian Credit Bureau',
      type: 'bureau',
      issue: 'Capital One late payment dispute',
      content: `Dear Experian Credit Reporting Agency,

I am writing to formally dispute an inaccurate item on my credit report. After reviewing my credit report dated [DATE], I found the following error that requires immediate correction:

Account Information:
- Creditor: Capital One
- Account Number: ****4567
- Dispute Reason: The reported late payment on [DATE] is inaccurate

I have enclosed supporting documentation that proves this payment was made on time. According to the Fair Credit Reporting Act (FCRA), I have the right to dispute inaccurate information, and you are required to investigate and correct this error within 30 days.

Please investigate this matter and remove this inaccurate information from my credit report immediately.

Sincerely,
[Your Name]`,
      status: 'draft'
    },
    {
      id: '2',
      recipient: 'Chase Bank',
      type: 'creditor',
      issue: 'Incorrect balance reporting',
      content: `Dear Chase Bank,

I am writing to dispute inaccurate information being reported to the credit bureaus regarding my account ****8901.

The issue is: Your records show an incorrect balance that does not match my account statements.

I am requesting that you:
1. Investigate this discrepancy immediately
2. Correct your records
3. Update all credit bureaus with the accurate information
4. Provide me with written confirmation of these corrections

As per the Fair Credit Reporting Act, you have 30 days to investigate and respond to this dispute.

Thank you for your prompt attention to this matter.

Sincerely,
[Your Name]`,
      status: 'draft'
    }
  ]);

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
          Dispute Letters - Round {roundNumber}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {letters.map((letter) => (
            <div key={letter.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{letter.recipient}</h4>
                    <Badge 
                      variant="outline" 
                      className={getTypeColor(letter.type)}
                    >
                      {letter.type === 'bureau' ? 'Credit Bureau' : 'Creditor'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{letter.issue}</p>
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