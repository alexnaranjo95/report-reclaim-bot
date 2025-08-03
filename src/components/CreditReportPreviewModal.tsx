import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Download, X, AlertCircle, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { CreditReport } from '@/services/CreditReportService';
interface CreditReportPreviewModalProps {
  report: CreditReport | null;
  isOpen: boolean;
  onClose: () => void;
}
export const CreditReportPreviewModal: React.FC<CreditReportPreviewModalProps> = ({
  report,
  isOpen,
  onClose
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (report && report.file_path && isOpen) {
      loadPreview();
    } else {
      setPreviewUrl(null);
      setError(null);
    }
  }, [report, isOpen]);
  const loadPreview = async () => {
    if (!report?.file_path) return;
    setLoading(true);
    setError(null);
    try {
      // Get signed URL for the file from credit-reports bucket
      const { data, error } = await supabase.storage
        .from('credit-reports')
        .createSignedUrl(report.file_path, 3600); // 1 hour expiry

      if (error) {
        console.error('Storage error:', error);
        throw new Error(`Failed to access file: ${error.message}`);
      }
      
      if (!data?.signedUrl) {
        throw new Error('No signed URL returned from storage');
      }
      
      setPreviewUrl(data.signedUrl);
    } catch (error) {
      console.error('Error loading preview:', error);
      setError('Failed to load document preview');
      toast.error('Failed to load document preview');
    } finally {
      setLoading(false);
    }
  };
  const handleDownload = () => {
    if (previewUrl && report) {
      const link = document.createElement('a');
      link.href = previewUrl;
      link.download = report.file_name || 'credit-report';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Download started');
    }
  };
  const isImage = report?.file_name?.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);
  const isPdf = report?.file_name?.toLowerCase().endsWith('.pdf');
  if (!report) return null;
  return <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5" />
              <div>
                <span className="font-medium">{report.file_name}</span>
                <div className="text-sm text-muted-foreground font-normal">
                  {report.bureau_name} • {new Date(report.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {previewUrl && <Button variant="outline" size="sm" onClick={handleDownload} className="flex items-center gap-2 py-0 px-0 mx-[73px] my-px">
                  <Download className="w-4 h-4" />
                  Download
                </Button>}
              
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-auto flex-1">
          {loading ? <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="ml-2">Loading preview...</span>
            </div> : error ? <Card className="border-destructive">
              <CardContent className="p-8 text-center">
                <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                <h3 className="font-medium text-destructive mb-2">Preview Not Available</h3>
                <p className="text-sm text-muted-foreground mb-4">{error}</p>
                <div className="space-y-2">
                  <Button variant="outline" onClick={loadPreview} size="sm">
                    Try Again
                  </Button>
                  {previewUrl && <Button variant="outline" onClick={handleDownload} size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Download File
                    </Button>}
                </div>
              </CardContent>
            </Card> : previewUrl ? <div className="flex items-center justify-center min-h-[400px] bg-muted/30 rounded-lg">
              {isImage ? <img src={previewUrl} alt={report.file_name} className="max-w-full max-h-[70vh] object-contain rounded" onError={() => setError('Failed to load image')} /> : isPdf ? <div className="w-full h-[70vh] rounded border bg-white">
                  <object data={previewUrl} type="application/pdf" className="w-full h-full">
                    <iframe src={`${previewUrl}#view=FitH`} title={report.file_name} className="w-full h-full border-0" />
                  </object>
                </div> : <div className="text-center p-8">
                  <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium mb-2">File Preview Not Available</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    This file type cannot be previewed in the browser.
                  </p>
                  <Button onClick={handleDownload} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Download to View
                  </Button>
                </div>}
            </div> : <div className="text-center p-8">
              <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">No File Available</h3>
              <p className="text-sm text-muted-foreground">
                This credit report does not have an associated file.
              </p>
            </div>}
        </div>

        {/* Document Info */}
        <div className="border-t pt-4 space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Bureau:</span>
              <div className="font-medium">{report.bureau_name}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Upload Date:</span>
              <div className="font-medium">{new Date(report.created_at).toLocaleDateString()}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>
              <div className="font-medium capitalize">{report.extraction_status}</div>
            </div>
            {report.report_date && <div>
                <span className="text-muted-foreground">Report Date:</span>
                <div className="font-medium">{new Date(report.report_date).toLocaleDateString()}</div>
              </div>}
          </div>
        </div>
      </DialogContent>
    </Dialog>;
};