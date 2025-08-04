import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Shield, 
  Image, 
  AlertTriangle,
  Download,
  Eye
} from 'lucide-react';

interface PDFValidationGuideProps {
  className?: string;
}

export const PDFValidationGuide: React.FC<PDFValidationGuideProps> = ({ className = "" }) => {
  const validFormats = [
    {
      icon: CheckCircle2,
      title: "Official Bureau PDFs",
      description: "Direct downloads from Experian, Equifax, or TransUnion",
      status: "supported",
      example: "✓ Annual Credit Report PDF from annualcreditreport.com"
    },
    {
      icon: CheckCircle2,
      title: "Text-Based PDFs",
      description: "PDFs with selectable text content",
      status: "supported",
      example: "✓ You can copy and paste text from the PDF"
    },
    {
      icon: CheckCircle2,
      title: "Unprotected Files",
      description: "No password or encryption",
      status: "supported",
      example: "✓ Opens directly without requiring a password"
    }
  ];

  const unsupportedFormats = [
    {
      icon: XCircle,
      title: "Image-Based PDFs",
      description: "Scanned documents or screenshots saved as PDF",
      status: "unsupported",
      example: "✗ Screenshots of credit reports"
    },
    {
      icon: Image,
      title: "Browser-Generated PDFs",
      description: "PDFs created by printing web pages to PDF",
      status: "unsupported",
      example: "✗ Print-to-PDF from browser"
    },
    {
      icon: Shield,
      title: "Protected/Encrypted PDFs",
      description: "Password-protected or encrypted files",
      status: "unsupported",
      example: "✗ Requires password to open"
    },
    {
      icon: FileText,
      title: "Other File Types",
      description: "HTML, Word documents, or images",
      status: "unsupported",
      example: "✗ .html, .docx, .jpg, .png files"
    }
  ];

  const troubleshootingSteps = [
    {
      step: 1,
      title: "Get a Fresh Copy",
      description: "Download a new PDF directly from your credit bureau's official website",
      icon: Download
    },
    {
      step: 2,
      title: "Verify PDF Quality",
      description: "Open the PDF and try to select/copy text. If you can't, it's likely image-based",
      icon: Eye
    },
    {
      step: 3,
      title: "Check File Size",
      description: "Genuine text-based credit reports are typically 100KB-2MB. Very small or very large files may have issues",
      icon: FileText
    },
    {
      step: 4,
      title: "Use Official Sources",
      description: "Only use PDFs from Experian.com, Equifax.com, TransUnion.com, or AnnualCreditReport.com",
      icon: Shield
    }
  ];

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            PDF Upload Requirements
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            To ensure successful processing, your credit report PDF must meet these requirements
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Supported Formats */}
          <div>
            <h4 className="font-medium text-green-600 dark:text-green-400 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Supported PDF Types
            </h4>
            <div className="space-y-3">
              {validFormats.map((format, index) => (
                <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                  <format.icon className="w-4 h-4 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{format.title}</span>
                      <Badge variant="default" className="bg-green-500 text-xs">Supported</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">{format.description}</p>
                    <p className="text-xs text-green-700 dark:text-green-300">{format.example}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Unsupported Formats */}
          <div>
            <h4 className="font-medium text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Unsupported PDF Types
            </h4>
            <div className="space-y-3">
              {unsupportedFormats.map((format, index) => (
                <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                  <format.icon className="w-4 h-4 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{format.title}</span>
                      <Badge variant="destructive" className="text-xs">Not Supported</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">{format.description}</p>
                    <p className="text-xs text-red-700 dark:text-red-300">{format.example}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Troubleshooting */}
          <div>
            <h4 className="font-medium text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Troubleshooting Steps
            </h4>
            <div className="space-y-3">
              {troubleshootingSteps.map((step, index) => (
                <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-medium">
                    {step.step}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <step.icon className="w-4 h-4 text-blue-600" />
                      <span className="font-medium text-sm">{step.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Check Alert */}
          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950">
            <Eye className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              <div className="font-medium mb-1">Quick PDF Test</div>
              <div className="text-sm">
                Before uploading, open your PDF and try to select text with your mouse. 
                If you can highlight and copy text, it's likely compatible with our system.
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};