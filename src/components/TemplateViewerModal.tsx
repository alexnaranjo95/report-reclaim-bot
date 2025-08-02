import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Calendar, Tag } from 'lucide-react';

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
}

export const TemplateViewerModal: React.FC<TemplateViewerModalProps> = ({
  isOpen,
  onClose,
  templates,
}) => {
  const getPreviewText = (content: string, maxLength: number = 200) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  const getSourceLabel = (name: string) => {
    if (name.startsWith('Quick Template')) return 'Quick Add';
    return 'File Upload';
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
            <div className="space-y-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="border rounded-lg p-4 space-y-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">{template.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge 
                          variant={template.is_active ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {template.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {getSourceLabel(template.name)}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {template.file_type}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(template.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <p className="leading-relaxed">
                      {getPreviewText(template.content)}
                    </p>
                  </div>

                  {template.tags && template.tags.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Tag className="h-3 w-3 text-muted-foreground" />
                      <div className="flex gap-1 flex-wrap">
                        {template.tags.map((tag, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">
                    Weight: {template.preference_weight} | 
                    Similarity: {(template.similarity_score * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};