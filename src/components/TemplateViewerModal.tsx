import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Calendar, Tag, Edit2, Trash2, Save, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface DisputeTemplate {
  id: string;
  name: string;
  content: string;
  file_type: string;
  tags: string[];
  is_active: boolean;
  preference_weight: number;
  similarity_score: number;
  created_at: string;
}

interface TemplateViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: DisputeTemplate[];
  onTemplateUpdated?: () => void;
}

export const TemplateViewerModal: React.FC<TemplateViewerModalProps> = ({
  isOpen,
  onClose,
  templates,
  onTemplateUpdated,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');

  const getPreviewText = (content: string, maxLength: number = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  const getSourceLabel = (name: string) => {
    if (name.startsWith('Quick Template')) return 'Quick Add';
    return 'File Upload';
  };

  const handleEdit = (template: DisputeTemplate) => {
    setEditingId(template.id);
    setEditName(template.name);
    setEditContent(template.content);
  };

  const handleSave = async (templateId: string) => {
    try {
      const { error } = await supabase
        .from('dispute_templates')
        .update({
          name: editName,
          content: editContent,
          updated_at: new Date().toISOString()
        })
        .eq('id', templateId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Template updated successfully",
      });

      setEditingId(null);
      onTemplateUpdated?.();
    } catch (error) {
      console.error('Error updating template:', error);
      toast({
        title: "Error",
        description: "Failed to update template",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (templateId: string, templateName: string) => {
    if (!confirm(`Delete template "${templateName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('dispute_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Template deleted successfully",
      });

      onTemplateUpdated?.();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({
        title: "Error",
        description: "Failed to delete template",
        variant: "destructive"
      });
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditName('');
    setEditContent('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Template Library
          </DialogTitle>
          <DialogDescription>
            View all uploaded templates and their previews
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          {templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No templates yet</p>
              <p className="text-sm">Upload files or use Quick-Add to get started</p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                <div className="col-span-3">Name</div>
                <div className="col-span-4">Preview</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-2">Created</div>
                <div className="col-span-1">Actions</div>
              </div>

              {/* Template Rows */}
              {templates.map((template) => (
                <div key={template.id} className="hover:bg-accent/30 transition-colors">
                  {editingId === template.id ? (
                    // Edit Mode
                    <div className="grid grid-cols-12 gap-2 p-3 border rounded-lg bg-accent/20">
                      <div className="col-span-3">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="text-xs h-8"
                          placeholder="Template name"
                        />
                      </div>
                      <div className="col-span-4">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="text-xs min-h-[60px] resize-none"
                          placeholder="Template content"
                        />
                      </div>
                      <div className="col-span-2 flex items-start">
                        <div className="flex flex-col gap-1">
                          <Badge variant={template.is_active ? "default" : "secondary"} className="text-xs w-fit">
                            {template.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          <Badge variant="outline" className="text-xs w-fit">
                            {template.file_type}
                          </Badge>
                        </div>
                      </div>
                      <div className="col-span-2 text-xs text-muted-foreground flex items-start">
                        {new Date(template.created_at).toLocaleDateString()}
                      </div>
                      <div className="col-span-1 flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => handleSave(template.id)}
                        >
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={handleCancel}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div className="grid grid-cols-12 gap-2 p-3 items-center">
                      <div className="col-span-3">
                        <div className="text-sm font-medium truncate" title={template.name}>
                          {template.name}
                        </div>
                      </div>
                      <div className="col-span-4">
                        <div className="text-xs text-muted-foreground truncate" title={template.content}>
                          {getPreviewText(template.content, 80)}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="flex flex-col gap-1">
                          <Badge variant={template.is_active ? "default" : "secondary"} className="text-xs w-fit">
                            {template.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          <Badge variant="outline" className="text-xs w-fit">
                            {getSourceLabel(template.name)}
                          </Badge>
                        </div>
                      </div>
                      <div className="col-span-2 text-xs text-muted-foreground">
                        {new Date(template.created_at).toLocaleDateString()}
                      </div>
                      <div className="col-span-1">
                        {template.file_type === 'txt' && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => handleEdit(template)}
                              title="Edit template"
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(template.id, template.name)}
                              title="Delete template"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};