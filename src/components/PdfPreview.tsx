import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Printer, Paperclip } from 'lucide-react';

interface DocumentAppendSettings {
  includeGovId: boolean;
  includeProofOfAddress: boolean;
  includeSSN: boolean;
}

interface PdfPreviewProps {
  html: string;
  documentSettings?: DocumentAppendSettings;
  adminFiles?: File[];
}

const PdfPreview: React.FC<PdfPreviewProps> = ({ html, documentSettings, adminFiles = [] }) => {
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
        <CardDescription className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">Letter Size (8.5" × 11")</Badge>
          <Badge variant="outline" className="text-xs">1" Margins</Badge>
          <Badge variant="outline" className="text-xs">Times New Roman 12pt</Badge>
          {documentSettings && (documentSettings.includeGovId || documentSettings.includeProofOfAddress || documentSettings.includeSSN) && (
            <Badge variant="secondary" className="text-xs flex items-center gap-1">
              <Paperclip className="w-3 h-3" />
              + Documents
            </Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="h-[calc(100%-120px)] overflow-y-auto">
        <div className="space-y-4">
          {/* Main Letter Paper simulation */}
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

          {/* Document Appendages Preview */}
          {documentSettings && (documentSettings.includeGovId || documentSettings.includeProofOfAddress || documentSettings.includeSSN) && (
            <div className="space-y-2">
              <div className="text-center">
                <Badge variant="secondary" className="text-xs">
                  Attached Documents (Preview)
                </Badge>
              </div>
              
              {/* Show admin preview files or placeholders */}
              {adminFiles.length > 0 ? (
                adminFiles.map((file, index) => (
                  <div key={index} className="bg-white border border-gray-300 shadow-lg mx-auto relative" style={{ width: '680px', minHeight: '880px' }}>
                    <div className="absolute top-2 left-2 z-10">
                      <Badge variant="outline" className="text-xs bg-white/90">
                        Preview: {file.name}
                      </Badge>
                    </div>
                    {file.type.startsWith('image/') ? (
                      <img 
                        src={URL.createObjectURL(file)} 
                        alt={`Preview ${file.name}`}
                        className="w-full h-full object-contain p-8"
                        style={{ maxHeight: '880px' }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <div className="text-center">
                          <FileText className="w-16 h-16 mx-auto mb-4" />
                          <p>PDF Document: {file.name}</p>
                          <p className="text-sm">Preview not available</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                // Show placeholders for enabled document types
                <>
                  {documentSettings.includeGovId && (
                    <div className="bg-gray-50 border border-dashed border-gray-300 mx-auto flex items-center justify-center" style={{ width: '680px', height: '400px' }}>
                      <div className="text-center text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-2" />
                        <p className="font-medium">Government ID</p>
                        <p className="text-sm">Will be appended here</p>
                      </div>
                    </div>
                  )}
                  {documentSettings.includeProofOfAddress && (
                    <div className="bg-gray-50 border border-dashed border-gray-300 mx-auto flex items-center justify-center" style={{ width: '680px', height: '400px' }}>
                      <div className="text-center text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-2" />
                        <p className="font-medium">Proof of Address</p>
                        <p className="text-sm">Will be appended here</p>
                      </div>
                    </div>
                  )}
                  {documentSettings.includeSSN && (
                    <div className="bg-gray-50 border border-dashed border-gray-300 mx-auto flex items-center justify-center" style={{ width: '680px', height: '400px' }}>
                      <div className="text-center text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-2" />
                        <p className="font-medium">Social Security Number</p>
                        <p className="text-sm">Will be appended here</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PdfPreview;