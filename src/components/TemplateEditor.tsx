import React, { useState, useEffect, useRef } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { templateService, type TemplateLayout } from '@/services/TemplateService';
import { Save, Eye, RefreshCw, FileText, Settings } from 'lucide-react';
import PdfPreview from './PdfPreview';
import ClientDocAppend from './ClientDocAppend';

interface DocumentAppendSettings {
  includeGovId: boolean;
  includeProofOfAddress: boolean;
  includeSSN: boolean;
}

interface TemplateEditorProps {
  template?: TemplateLayout;
  onSave?: (template: TemplateLayout) => void;
  onCancel?: () => void;
  isAdmin?: boolean;
}

const TemplateEditor: React.FC<TemplateEditorProps> = ({ template, onSave, onCancel, isAdmin = false }) => {
  const [tinymceApiKey, setTinymceApiKey] = useState<string>('');
  const [editorContent, setEditorContent] = useState(template?.body_html || template?.content || '');
  const [templateName, setTemplateName] = useState(template?.name || '');
  const [isDefault, setIsDefault] = useState(template?.is_default || false);
  const [isSaving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [documentSettings, setDocumentSettings] = useState<DocumentAppendSettings>({
    includeGovId: false,
    includeProofOfAddress: false,
    includeSSN: false
  });
  const [adminFiles, setAdminFiles] = useState<File[]>([]);
  const editorRef = useRef<any>(null);

  // Sample data for template preview
  const sampleData = {
    date: new Date().toLocaleDateString(),
    round: 1,
    client_name: 'John Doe',
    creditor_name: 'Sample Creditor Inc.',
    account_number: 'ACC123456789',
    bureaus: 'Experian, Equifax, TransUnion',
    reference_number: 'REF987654321',
    previous_date: '01/15/2024',
    tenant: {
      fullName: 'John Doe',
      address: '123 Main Street, Anytown, ST 12345'
    },
    client: {
      address: '123 Main Street, Anytown, ST 12345'
    },
    creditor: {
      name: 'Sample Creditor Inc.'
    }
  };

  useEffect(() => {
    loadTinymceApiKey();
  }, []);

  useEffect(() => {
    // Update preview when content changes
    if (editorContent) {
      generatePreview();
    }
  }, [editorContent]);

  const loadTinymceApiKey = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-tinymce-key');
      
      if (error) {
        console.error('Error loading TinyMCE API key:', error);
        toast.error('Failed to load editor configuration');
        return;
      }

      if (data?.apiKey) {
        setTinymceApiKey(data.apiKey);
      } else {
        toast.error('TinyMCE API key not configured');
      }
    } catch (error) {
      console.error('Error fetching TinyMCE key:', error);
      toast.error('Failed to initialize editor');
    }
  };

  const generatePreview = () => {
    if (!editorContent) return;

    // Replace placeholders with sample data
    let compiledHtml = editorContent;
    
    // Replace all placeholders
    Object.entries(sampleData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      compiledHtml = compiledHtml.replace(regex, String(value));
    });

    // Handle nested placeholders like {{tenant.fullName}}
    compiledHtml = compiledHtml.replace(/\{\{tenant\.fullName\}\}/g, sampleData.tenant.fullName);
    compiledHtml = compiledHtml.replace(/\{\{client\.address\}\}/g, sampleData.client.address);
    compiledHtml = compiledHtml.replace(/\{\{creditor\.name\}\}/g, sampleData.creditor.name);

    setPreviewHtml(compiledHtml);
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }

    if (!editorContent.trim()) {
      toast.error('Please enter template content');
      return;
    }

    setSaving(true);

    try {
      const templateData = {
        name: templateName,
        content: editorContent, // Keep original for backward compatibility
        body_html: editorContent, // New WYSIWYG content
        is_default: isDefault,
        placeholders: templateService.extractPlaceholders(editorContent)
      };

      if (template?.id) {
        // Update existing template
        const updatedTemplate = await templateService.updateTemplateLayout(template.id, templateData);
        toast.success('Template updated successfully');
        onSave?.(updatedTemplate);
      } else {
        // Create new template
        const newTemplate = await templateService.createTemplateLayout(templateData);
        toast.success('Template created successfully');
        onSave?.(newTemplate);
      }
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePdfPreview = async () => {
    if (!previewHtml) {
      toast.error('No content to preview');
      return;
    }

    setIsGeneratingPreview(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-pdf-preview', {
        body: {
          html: previewHtml,
          templateId: template?.id,
          fileName: `${templateName || 'template'}-preview.html`
        }
      });

      if (error) throw error;

      if (data?.preview_url) {
        // Open preview in new tab
        window.open(data.preview_url, '_blank');
        toast.success('PDF preview generated');
      }
    } catch (error) {
      console.error('Error generating PDF preview:', error);
      toast.error('Failed to generate PDF preview');
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const insertPlaceholder = (placeholder: string) => {
    if (editorRef.current) {
      editorRef.current.insertContent(`{{${placeholder}}}`);
    }
  };

  const commonPlaceholders = [
    'date', 'round', 'client_name', 'creditor_name', 'account_number', 
    'bureaus', 'reference_number', 'previous_date', 'tenant.fullName', 
    'client.address', 'creditor.name'
  ];

  if (!tinymceApiKey) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p>Loading editor...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            {template ? 'Edit Template' : 'Create New Template'}
          </h2>
          <p className="text-muted-foreground">
            Design and preview your letter template with live PostGrid formatting
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleGeneratePdfPreview} 
            variant="outline"
            disabled={isGeneratingPreview}
          >
            {isGeneratingPreview ? (
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Eye className="w-4 h-4 mr-2" />
            )}
            PDF Preview
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Template
          </Button>
          {onCancel && (
            <Button onClick={onCancel} variant="outline">
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Template Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Template Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Enter template name"
              />
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <input
                type="checkbox"
                id="is-default"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              <Label htmlFor="is-default">Set as default template</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Placeholder Helper */}
      <Card>
        <CardHeader>
          <CardTitle>Available Placeholders</CardTitle>
          <CardDescription>
            Click any placeholder to insert it into your template
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {commonPlaceholders.map(placeholder => (
              <Badge
                key={placeholder}
                variant="outline"
                className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                onClick={() => insertPlaceholder(placeholder)}
              >
                {placeholder}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Document Append Settings */}
      <ClientDocAppend
        settings={documentSettings}
        onSettingsChange={setDocumentSettings}
        isAdmin={isAdmin}
        onAdminFilesChange={setAdminFiles}
      />

      {/* Editor and Preview */}
      <ResizablePanelGroup direction="horizontal" className="min-h-[600px]">
        {/* Editor Panel */}
        <ResizablePanel defaultSize={50} minSize={30}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                WYSIWYG Editor
              </CardTitle>
              <CardDescription>
                Design your template with rich text formatting
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[calc(100%-100px)]">
              <Editor
                apiKey={tinymceApiKey}
                onInit={(evt, editor) => editorRef.current = editor}
                initialValue={editorContent}
                init={{
                  height: '100%',
                  menubar: false,
                  plugins: [
                    'advlist', 'autolink', 'lists', 'link', 'image', 'charmap',
                    'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
                    'insertdatetime', 'media', 'table', 'preview', 'help', 'wordcount'
                  ],
                  toolbar: 'undo redo | blocks | bold italic forecolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | removeformat | help',
                  content_style: `
                    body { 
                      font-family: 'Times New Roman', Times, serif; 
                      font-size: 12pt; 
                      line-height: 1.6; 
                      color: #000;
                      background: #fff;
                      max-width: 680px;
                      margin: 0 auto;
                      padding: 20px;
                    }
                    .header { margin-bottom: 20px; }
                    .date { text-align: right; margin-bottom: 10px; }
                    .round-info { text-align: right; font-weight: bold; }
                    .body { margin: 20px 0; }
                    .footer { margin-top: 30px; }
                    p { margin: 10px 0; }
                  `,
                  setup: (editor) => {
                    editor.on('keyup change', () => {
                      setEditorContent(editor.getContent());
                    });
                  }
                }}
              />
            </CardContent>
          </Card>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Preview Panel */}
        <ResizablePanel defaultSize={50} minSize={30}>
          <PdfPreview 
            html={previewHtml}
            documentSettings={documentSettings}
            adminFiles={adminFiles}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default TemplateEditor;