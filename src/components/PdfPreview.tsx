import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Printer } from 'lucide-react';

interface PdfPreviewProps {
  html: string;
}

const PdfPreview: React.FC<PdfPreviewProps> = ({ html }) => {
  if (!html) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5" />
            PostGrid Print Preview
          </CardTitle>
          <CardDescription>
            Live preview of how your template will appear when printed
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[calc(100%-100px)]">
          <div className="text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Start editing to see preview</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="w-5 h-5" />
          PostGrid Print Preview
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">Letter Size (8.5" × 11")</Badge>
          <Badge variant="outline" className="text-xs">1" Margins</Badge>
          <Badge variant="outline" className="text-xs">Times New Roman 12pt</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="h-[calc(100%-120px)] overflow-y-auto">
        {/* Paper simulation */}
        <div className="bg-white border border-gray-300 shadow-lg mx-auto" style={{ width: '680px', minHeight: '880px' }}>
          {/* Print area simulation */}
          <div 
            className="p-8"
            style={{ 
              fontFamily: 'Times, "Times New Roman", serif',
              fontSize: '12pt',
              lineHeight: '1.6',
              color: '#000',
              minHeight: '816px' // 11" - 2" margins at 96 DPI
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default PdfPreview;