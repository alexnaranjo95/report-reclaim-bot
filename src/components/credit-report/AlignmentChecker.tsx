import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CreditReport } from '../../schema';

interface AlignmentCheckerProps {
  normalizedData: CreditReport;
  pdfText?: string;
}

export const AlignmentChecker: React.FC<AlignmentCheckerProps> = ({ 
  normalizedData, 
  pdfText = '' 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [highlights, setHighlights] = useState<string[]>([]);

  const checkAlignment = () => {
    if (!searchTerm.trim()) return;
    
    // Simple search for mismatches - can be enhanced with more sophisticated logic
    const normalizedStr = JSON.stringify(normalizedData).toLowerCase();
    const pdfStr = pdfText.toLowerCase();
    const term = searchTerm.toLowerCase();
    
    const inNormalized = normalizedStr.includes(term);
    const inPdf = pdfStr.includes(term);
    
    const newHighlights = [];
    if (inNormalized && !inPdf) {
      newHighlights.push(`"${searchTerm}" found in normalized data but NOT in PDF`);
    } else if (!inNormalized && inPdf) {
      newHighlights.push(`"${searchTerm}" found in PDF but NOT in normalized data`);
    } else if (inNormalized && inPdf) {
      newHighlights.push(`"${searchTerm}" found in BOTH normalized data and PDF`);
    } else {
      newHighlights.push(`"${searchTerm}" NOT found in either source`);
    }
    
    setHighlights(newHighlights);
  };

  const highlightText = (text: string, term: string) => {
    if (!term.trim()) return text;
    
    const regex = new RegExp(`(${term})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200">$1</mark>');
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Alignment Checker</CardTitle>
        <div className="flex gap-2">
          <Input
            placeholder="Search for field or value to check alignment..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && checkAlignment()}
          />
          <Button onClick={checkAlignment} size="sm">
            Check
          </Button>
        </div>
        {highlights.length > 0 && (
          <div className="space-y-1">
            {highlights.map((highlight, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {highlight}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="h-[calc(100%-8rem)] p-0">
        <div className="grid grid-cols-2 h-full">
          {/* Normalized Data View */}
          <div className="border-r">
            <div className="p-3 bg-muted font-medium text-sm">Normalized Data</div>
            <div className="p-3 h-[calc(100%-2.5rem)] overflow-auto">
              <pre 
                className="text-xs whitespace-pre-wrap font-mono"
                dangerouslySetInnerHTML={{
                  __html: highlightText(
                    JSON.stringify(normalizedData, null, 2),
                    searchTerm
                  )
                }}
              />
            </div>
          </div>
          
          {/* PDF Text View */}
          <div>
            <div className="p-3 bg-muted font-medium text-sm">PDF Text Content</div>
            <div className="p-3 h-[calc(100%-2.5rem)] overflow-auto">
              {pdfText ? (
                <div 
                  className="text-xs whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{
                    __html: highlightText(pdfText, searchTerm)
                  }}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  No PDF text provided. Upload a PDF file to compare alignment.
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};