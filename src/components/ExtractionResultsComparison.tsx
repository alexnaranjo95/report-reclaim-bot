import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { DataConsolidationService, ExtractionResult, ConsolidationMetadata } from '@/services/DataConsolidationService';
import { CheckCircle, AlertTriangle, RefreshCw, Eye, BarChart3 } from 'lucide-react';

interface ExtractionResultsComparisonProps {
  reportId: string;
}

export const ExtractionResultsComparison: React.FC<ExtractionResultsComparisonProps> = ({ reportId }) => {
  const [extractionResults, setExtractionResults] = useState<ExtractionResult[]>([]);
  const [consolidationMetadata, setConsolidationMetadata] = useState<ConsolidationMetadata | null>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reconsolidating, setReconsolidating] = useState(false);
  const [selectedText, setSelectedText] = useState<string | null>(null);

  useEffect(() => {
    loadExtractionData();
  }, [reportId]);

  const loadExtractionData = async () => {
    try {
      setLoading(true);
      const [results, metadata, comparisonData] = await Promise.all([
        DataConsolidationService.getExtractionResults(reportId),
        DataConsolidationService.getConsolidationMetadata(reportId),
        DataConsolidationService.compareExtractionResults(reportId)
      ]);

      setExtractionResults(results);
      setConsolidationMetadata(metadata);
      setComparison(comparisonData.comparison);
    } catch (error) {
      console.error('Failed to load extraction data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReconsolidate = async (strategy: 'highest_confidence' | 'majority_vote' | 'manual_review') => {
    try {
      setReconsolidating(true);
      await DataConsolidationService.reconsolidate(reportId, strategy);
      await loadExtractionData(); // Reload data after reconsolidation
    } catch (error) {
      console.error('Failed to reconsolidate:', error);
    } finally {
      setReconsolidating(false);
    }
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'google-document-ai':
        return 'bg-blue-500';
      case 'google-vision':
        return 'bg-green-500';
      case 'textract':
        return 'bg-orange-500';
      case 'fallback':
        return 'bg-gray-500';
      default:
        return 'bg-purple-500';
    }
  };

  const getMethodBadgeVariant = (method: string) => {
    switch (method) {
      case 'google-document-ai':
        return 'default';
      case 'google-vision':
        return 'secondary';
      case 'textract':
        return 'outline';
      case 'fallback':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const formatConfidence = (confidence: number) => {
    return `${Math.round(confidence * 100)}%`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Loading extraction results...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (extractionResults.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <BarChart3 className="h-8 w-8 mx-auto mb-2" />
            <p>No extraction results found for this report.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Consolidation Summary */}
      {consolidationMetadata && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>Consolidation Summary</span>
            </CardTitle>
            <CardDescription>
              Overview of the data consolidation process and results
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Primary Source</p>
                <Badge variant={getMethodBadgeVariant(consolidationMetadata.primary_source)}>
                  {consolidationMetadata.primary_source}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Confidence Level</p>
                <div className="flex items-center space-x-2">
                  <Progress value={consolidationMetadata.confidence_level * 100} className="flex-1" />
                  <span className="text-sm font-medium">
                    {formatConfidence(consolidationMetadata.confidence_level)}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Strategy</p>
                <span className="text-sm capitalize">{consolidationMetadata.consolidation_strategy}</span>
              </div>
            </div>
            
            {consolidationMetadata.requires_human_review && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This consolidation requires human review due to low confidence or conflicts.
                </AlertDescription>
              </Alert>
            )}

            {consolidationMetadata.conflict_count > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {consolidationMetadata.conflict_count} conflicts detected between extraction methods.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReconsolidate('highest_confidence')}
                disabled={reconsolidating}
              >
                {reconsolidating ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                Use Highest Confidence
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReconsolidate('majority_vote')}
                disabled={reconsolidating}
              >
                Use Majority Vote
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReconsolidate('manual_review')}
                disabled={reconsolidating}
              >
                Flag for Review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extraction Results Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Extraction Results Comparison</CardTitle>
          <CardDescription>
            Compare results from {extractionResults.length} different extraction methods
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="detailed">Detailed Results</TabsTrigger>
              <TabsTrigger value="comparison">Side by Side</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {extractionResults.map((result) => (
                  <Card key={result.id} className="relative">
                    <div className={`absolute top-0 left-0 w-full h-1 ${getMethodColor(result.extraction_method)}`} />
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <Badge variant={getMethodBadgeVariant(result.extraction_method)}>
                          {result.extraction_method}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatConfidence(result.confidence_score)}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Characters</p>
                          <p className="font-medium">{result.character_count?.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Words</p>
                          <p className="font-medium">{result.word_count?.toLocaleString()}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Structured Data: {result.has_structured_data ? 'Yes' : 'No'}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedText(result.extracted_text)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>

                      <Progress value={result.confidence_score * 100} className="h-2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="detailed" className="space-y-4 mt-4">
              {extractionResults.map((result) => (
                <Card key={result.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">
                        {result.extraction_method}
                      </CardTitle>
                      <Badge variant={getMethodBadgeVariant(result.extraction_method)}>
                        {formatConfidence(result.confidence_score)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Characters</p>
                        <p className="font-medium">{result.character_count?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Words</p>
                        <p className="font-medium">{result.word_count?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Processing Time</p>
                        <p className="font-medium">{result.processing_time_ms}ms</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Structured</p>
                        <p className="font-medium">{result.has_structured_data ? 'Yes' : 'No'}</p>
                      </div>
                    </div>

                    {result.extraction_metadata?.errorMessage && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          Error: {result.extraction_metadata.errorMessage}
                        </AlertDescription>
                      </Alert>
                    )}

                    <div>
                      <p className="text-sm font-medium mb-2">Text Preview:</p>
                      <div className="bg-muted p-3 rounded text-sm max-h-32 overflow-y-auto">
                        {result.extracted_text?.substring(0, 500)}
                        {result.extracted_text && result.extracted_text.length > 500 && '...'}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="comparison" className="space-y-4 mt-4">
              {comparison && (
                <div className="space-y-4">
                  {comparison.similarities.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-green-600">Similarities</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="list-disc list-inside space-y-1">
                          {comparison.similarities.map((similarity: string, index: number) => (
                            <li key={index} className="text-sm">{similarity}</li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {comparison.differences.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-orange-600">Differences & Conflicts</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {comparison.differences.map((diff: any, index: number) => (
                          <div key={index}>
                            <h4 className="font-medium mb-2">{diff.field}</h4>
                            <div className="space-y-2">
                              {diff.values.map((value: any, valueIndex: number) => (
                                <div key={valueIndex} className="flex items-center justify-between bg-muted p-2 rounded">
                                  <span className="text-sm">{value.method}: {value.value}</span>
                                  <Badge variant="outline">{formatConfidence(value.confidence)}</Badge>
                                </div>
                              ))}
                            </div>
                            {index < comparison.differences.length - 1 && <Separator className="mt-4" />}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Text Preview Modal */}
      {selectedText && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-4xl max-h-[80vh] overflow-hidden">
            <CardHeader>
              <CardTitle>Extracted Text Preview</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-4 right-4"
                onClick={() => setSelectedText(null)}
              >
                ×
              </Button>
            </CardHeader>
            <CardContent>
              <div className="bg-muted p-4 rounded max-h-96 overflow-y-auto whitespace-pre-wrap text-sm">
                {selectedText}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};