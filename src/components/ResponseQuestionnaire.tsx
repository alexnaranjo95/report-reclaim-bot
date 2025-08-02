import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { SessionService, Round } from '@/services/SessionService';
import { OpenAIService } from '@/services/OpenAIService';
import { PDFProcessor } from '@/services/PDFProcessor';
import { useToast } from '@/hooks/use-toast';

interface ResponseQuestionnaireProps {
  round: Round;
  creditors: string[];
  onComplete: () => void;
}

interface CreditorResponse {
  creditor: string;
  receivedResponse: boolean;
  responseContent: string;
  documents: File[];
}

export const ResponseQuestionnaire: React.FC<ResponseQuestionnaireProps> = ({
  round,
  creditors,
  onComplete
}) => {
  const [responses, setResponses] = useState<Record<string, CreditorResponse>>(
    creditors.reduce((acc, creditor) => ({
      ...acc,
      [creditor]: {
        creditor,
        receivedResponse: false,
        responseContent: '',
        documents: []
      }
    }), {})
  );
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  const handleResponseChange = (creditor: string, field: keyof CreditorResponse, value: any) => {
    setResponses(prev => ({
      ...prev,
      [creditor]: {
        ...prev[creditor],
        [field]: value
      }
    }));
  };

  const handleFileUpload = (creditor: string, files: FileList | null) => {
    if (!files) return;
    
    const fileArray = Array.from(files).filter(file => 
      file.type === 'application/pdf' || file.type.startsWith('image/')
    );

    setResponses(prev => ({
      ...prev,
      [creditor]: {
        ...prev[creditor],
        documents: [...prev[creditor].documents, ...fileArray]
      }
    }));
  };

  const removeDocument = (creditor: string, index: number) => {
    setResponses(prev => ({
      ...prev,
      [creditor]: {
        ...prev[creditor],
        documents: prev[creditor].documents.filter((_, i) => i !== index)
      }
    }));
  };

  const processDocuments = async (documents: File[]): Promise<string> => {
    let combinedText = '';
    
    for (const doc of documents) {
      try {
        if (doc.type === 'application/pdf') {
          const text = await PDFProcessor.extractTextFromPDF(doc);
          combinedText += `\n\nDocument: ${doc.name}\n${text}`;
        }
        // For images, we could add OCR processing here in the future
      } catch (error) {
        console.error(`Error processing document ${doc.name}:`, error);
      }
    }
    
    return combinedText;
  };

  const analyzeResponse = async (content: string, documents: string): Promise<string> => {
    try {
      const prompt = `Analyze this credit report response and extract key information:

Response Content: ${content}

Documents Text: ${documents}

Please provide a summary of:
1. What the creditor/bureau said
2. Any account changes or updates mentioned
3. Whether they verified, deleted, or modified any information
4. Next recommended actions based on their response

Format the response in a clear, structured way.`;

      return await OpenAIService.analyzeCreditReport(prompt);
    } catch (error) {
      console.error('Error analyzing response:', error);
      return 'Analysis failed. Manual review required.';
    }
  };

  const handleSubmit = async () => {
    setProcessing(true);
    
    try {
      for (const [creditor, response] of Object.entries(responses)) {
        if (response.receivedResponse) {
          let documentText = '';
          if (response.documents.length > 0) {
            documentText = await processDocuments(response.documents);
          }
          
          let responseSummary = response.responseContent;
          if (response.responseContent || documentText) {
            responseSummary = await analyzeResponse(response.responseContent, documentText);
          }

          await SessionService.saveResponseLog({
            round_id: round.id,
            creditor: response.creditor,
            received_response: response.receivedResponse,
            response_content: response.responseContent,
            response_summary: responseSummary,
            documents: response.documents.map(doc => doc.name)
          });
        } else {
          await SessionService.saveResponseLog({
            round_id: round.id,
            creditor: response.creditor,
            received_response: false
          });
        }
      }

      // Complete the current round
      await SessionService.completeRound(round.id);
      
      toast({
        title: "Responses Recorded",
        description: "Your responses have been saved and the next round will be available in 30 days."
      });
      
      onComplete();
    } catch (error) {
      console.error('Error submitting responses:', error);
      toast({
        title: "Error",
        description: "Failed to save responses. Please try again.",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  const hasReceivedAnyResponse = Object.values(responses).some(r => r.receivedResponse);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Round {round.round_number} - Response Collection</CardTitle>
        <p className="text-sm text-muted-foreground">
          Have you received any responses from the creditors/bureaus in the mail?
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {creditors.map((creditor) => (
          <Card key={creditor} className="border-l-4 border-l-primary">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">{creditor}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-base font-medium">Did you receive a response?</Label>
                <RadioGroup
                  value={responses[creditor].receivedResponse ? "yes" : "no"}
                  onValueChange={(value) => 
                    handleResponseChange(creditor, 'receivedResponse', value === 'yes')
                  }
                  className="mt-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id={`${creditor}-yes`} />
                    <Label htmlFor={`${creditor}-yes`}>Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id={`${creditor}-no`} />
                    <Label htmlFor={`${creditor}-no`}>No</Label>
                  </div>
                </RadioGroup>
              </div>

              {responses[creditor].receivedResponse && (
                <>
                  <div>
                    <Label htmlFor={`${creditor}-content`} className="text-base font-medium">
                      What was said and included in the response?
                    </Label>
                    <Textarea
                      id={`${creditor}-content`}
                      placeholder="Describe what the creditor/bureau said in their response..."
                      className="mt-2"
                      rows={4}
                      value={responses[creditor].responseContent}
                      onChange={(e) => 
                        handleResponseChange(creditor, 'responseContent', e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <Label className="text-base font-medium">Upload Response Documents</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Upload PDFs or images of the response letters for AI analysis
                    </p>
                    <div className="space-y-3">
                      <div className="flex items-center gap-4">
                        <Button
                          type="button"
                          variant="outline"
                          className="flex items-center gap-2"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.multiple = true;
                            input.accept = '.pdf,image/*';
                            input.onchange = (e) => handleFileUpload(creditor, (e.target as HTMLInputElement).files);
                            input.click();
                          }}
                        >
                          <Upload className="h-4 w-4" />
                          Upload Documents
                        </Button>
                      </div>

                      {responses[creditor].documents.length > 0 && (
                        <div className="space-y-2">
                          {responses[creditor].documents.map((doc, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-secondary rounded">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                <span className="text-sm">{doc.name}</span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeDocument(creditor, index)}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}

        <div className="flex justify-between pt-6">
          <div className="text-sm text-muted-foreground">
            {hasReceivedAnyResponse 
              ? "Responses will be analyzed to improve future dispute strategies."
              : "No responses received. The next round will use the same strategy."
            }
          </div>
          <Button 
            onClick={handleSubmit} 
            disabled={processing}
            className="flex items-center gap-2"
          >
            {processing && <Loader2 className="h-4 w-4 animate-spin" />}
            Complete Round & Schedule Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};