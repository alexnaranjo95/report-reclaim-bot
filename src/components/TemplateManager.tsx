import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { sanitizeHtml } from '@/utils/SecurityUtils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { templateService, type TemplateLayout, type RoundTemplate } from '@/services/TemplateService';
import { Plus, Edit, Trash2, Eye, Save, X, FileText, Settings, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
const TemplateManager: React.FC = () => {
  const navigate = useNavigate();
  const [layouts, setLayouts] = useState<TemplateLayout[]>([]);
  const [roundTemplates, setRoundTemplates] = useState<RoundTemplate[]>([]);
  const [editingLayout, setEditingLayout] = useState<TemplateLayout | null>(null);
  const [editingRoundTemplate, setEditingRoundTemplate] = useState<RoundTemplate | null>(null);
  const [isCreatingLayout, setIsCreatingLayout] = useState(false);
  const [isCreatingRoundTemplate, setIsCreatingRoundTemplate] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);
  useEffect(() => {
    loadData();
  }, []);
  const loadData = async () => {
    try {
      const [layoutsData, roundTemplatesData] = await Promise.all([templateService.getTemplateLayouts(), templateService.getRoundTemplates()]);
      setLayouts(layoutsData);
      setRoundTemplates(roundTemplatesData);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Failed to load templates');
    }
  };
  const handleCreateLayout = async (layoutData: Omit<TemplateLayout, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      await templateService.createTemplateLayout(layoutData);
      toast.success('Template layout created successfully');
      setIsCreatingLayout(false);
      loadData();
    } catch (error) {
      console.error('Error creating layout:', error);
      toast.error('Failed to create template layout');
    }
  };
  const handleUpdateLayout = async (id: string, updates: Partial<TemplateLayout>) => {
    try {
      await templateService.updateTemplateLayout(id, updates);
      toast.success('Template layout updated successfully');
      setEditingLayout(null);
      loadData();
    } catch (error) {
      console.error('Error updating layout:', error);
      toast.error('Failed to update template layout');
    }
  };
  const handleDeleteLayout = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template layout?')) return;
    try {
      await templateService.deleteTemplateLayout(id);
      toast.success('Template layout deleted successfully');
      loadData();
    } catch (error) {
      console.error('Error deleting layout:', error);
      toast.error('Failed to delete template layout');
    }
  };
  const handleCreateRoundTemplate = async (templateData: Omit<RoundTemplate, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      await templateService.createRoundTemplate(templateData);
      toast.success('Round template created successfully');
      setIsCreatingRoundTemplate(false);
      loadData();
    } catch (error) {
      console.error('Error creating round template:', error);
      toast.error('Failed to create round template');
    }
  };
  const handleUpdateRoundTemplate = async (id: string, updates: Partial<RoundTemplate>) => {
    try {
      await templateService.updateRoundTemplate(id, updates);
      toast.success('Round template updated successfully');
      setEditingRoundTemplate(null);
      loadData();
    } catch (error) {
      console.error('Error updating round template:', error);
      toast.error('Failed to update round template');
    }
  };
  const handleDeleteRoundTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this round template?')) return;
    try {
      await templateService.deleteRoundTemplate(id);
      toast.success('Round template deleted successfully');
      loadData();
    } catch (error) {
      console.error('Error deleting round template:', error);
      toast.error('Failed to delete round template');
    }
  };
  const handlePreviewTemplate = (layout: TemplateLayout, content?: string, roundTemplate?: RoundTemplate) => {
    const sampleData = {
      date: new Date().toLocaleDateString(),
      round: roundTemplate?.round_number || 1,
      client_name: 'John Doe',
      creditor_name: 'Sample Creditor',
      account_number: 'ACC123456',
      bureaus: 'Experian, Equifax, TransUnion',
      body: content || 'Sample content body...',
      reference_number: 'REF123456',
      previous_date: '01/15/2024'
    };
    const compiled = templateService.compileTemplate(layout.content, content || 'Sample content', sampleData);
    setPreviewTemplate(compiled);
    setShowPreview(true);
  };
  return <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Template Management</h2>
          <p className="text-muted-foreground">Manage letter layouts and round-specific templates</p>
        </div>
      </div>

      <Tabs defaultValue="layouts" className="space-y-6">
        <TabsList>
          <TabsTrigger value="layouts">Template Layouts</TabsTrigger>
          <TabsTrigger value="rounds">Round Templates (1-12)</TabsTrigger>
        </TabsList>

        <TabsContent value="layouts" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Template Layouts</h3>
            <div className="flex gap-2">
              
              <Button onClick={() => setIsCreatingLayout(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Layout
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            {layouts.map(layout => <LayoutCard key={layout.id} layout={layout} isEditing={editingLayout?.id === layout.id} onEdit={() => setEditingLayout(layout)} onSave={updates => handleUpdateLayout(layout.id, updates)} onCancel={() => setEditingLayout(null)} onDelete={() => handleDeleteLayout(layout.id)} onPreview={() => handlePreviewTemplate(layout)} navigate={navigate} />)}
          </div>

          {isCreatingLayout && <CreateLayoutDialog onSave={handleCreateLayout} onCancel={() => setIsCreatingLayout(false)} />}
        </TabsContent>

        <TabsContent value="rounds" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Round Templates (1-12)</h3>
            <Button onClick={() => setIsCreatingRoundTemplate(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Round Template
            </Button>
          </div>

          <div className="grid gap-4">
            {[...Array(12)].map((_, index) => {
            const roundNumber = index + 1;
            const template = roundTemplates.find(t => t.round_number === roundNumber);
            return <RoundTemplateCard key={roundNumber} template={template} roundNumber={roundNumber} layouts={layouts} isEditing={editingRoundTemplate?.id === template?.id} onEdit={() => template && setEditingRoundTemplate(template)} onSave={updates => template && handleUpdateRoundTemplate(template.id, updates)} onCancel={() => setEditingRoundTemplate(null)} onDelete={() => template && handleDeleteRoundTemplate(template.id)} onPreview={() => template?.layout && handlePreviewTemplate(template.layout, template.content_template, template)} onCreate={templateData => handleCreateRoundTemplate({
              ...templateData,
              round_number: roundNumber
            })} />;
          })}
          </div>

          {isCreatingRoundTemplate && <CreateRoundTemplateDialog layouts={layouts} onSave={handleCreateRoundTemplate} onCancel={() => setIsCreatingRoundTemplate(false)} />}
        </TabsContent>
      </Tabs>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Document Preview</DialogTitle>
            <DialogDescription>Preview of how the compiled template will appear when printed and sent via PostGrid</DialogDescription>
          </DialogHeader>
          <div className="border rounded-lg bg-white shadow-lg">
            <div className="bg-gray-50 px-4 py-2 border-b text-sm text-gray-600">
              Print Preview - Letter Size (8.5" x 11")
            </div>
            <div className="p-8 bg-white text-black min-h-[800px] max-w-[680px] mx-auto" style={{
            fontFamily: 'Times, serif',
            fontSize: '12pt',
            lineHeight: '1.6'
          }} dangerouslySetInnerHTML={{
            __html: sanitizeHtml(previewTemplate)
          }} />
          </div>
        </DialogContent>
      </Dialog>
    </div>;
};

// Layout Card Component
interface LayoutCardProps {
  layout: TemplateLayout;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (updates: Partial<TemplateLayout>) => void;
  onCancel: () => void;
  onDelete: () => void;
  onPreview: () => void;
  navigate: (path: string) => void;
}
const LayoutCard: React.FC<LayoutCardProps> = ({
  layout,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onPreview,
  navigate
}) => {
  const [editData, setEditData] = useState({
    name: layout.name,
    content: layout.content,
    is_default: layout.is_default
  });
  if (isEditing) {
    return <Card>
        <CardHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Layout Name</Label>
              <Input id="name" value={editData.name} onChange={e => setEditData({
              ...editData,
              name: e.target.value
            })} />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="default" checked={editData.is_default} onCheckedChange={checked => setEditData({
              ...editData,
              is_default: !!checked
            })} />
              <Label htmlFor="default">Set as default layout</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="content">Layout Content (HTML)</Label>
            <Textarea id="content" value={editData.content} onChange={e => setEditData({
            ...editData,
            content: e.target.value
          })} rows={12} placeholder="Use {{placeholders}} for dynamic content" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => onSave(editData)} size="sm">
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>
            <Button onClick={onCancel} variant="outline" size="sm">
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>;
  }
  const placeholders = templateService.extractPlaceholders ? templateService.extractPlaceholders(layout.content) : [];
  return <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              {layout.name}
              {layout.is_default && <Badge variant="secondary">Default</Badge>}
            </CardTitle>
            <CardDescription>
              Created: {new Date(layout.created_at).toLocaleDateString()}
            </CardDescription>
          </div>
          <div className="flex gap-1">
            <Button onClick={onPreview} variant="outline" size="sm" title="PDF Preview">
              <FileText className="w-4 h-4" />
            </Button>
            <Button onClick={() => navigate(`/admin/templates/editor/${layout.id}`)} variant="outline" size="sm">
              <Wand2 className="w-4 h-4" />
            </Button>
            
            <Button onClick={onDelete} variant="outline" size="sm">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div>
            <Label className="text-sm font-medium">Placeholders:</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {placeholders.map(placeholder => <Badge key={placeholder} variant="outline" className="text-xs">
                  {placeholder}
                </Badge>)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>;
};

// Round Template Card Component
interface RoundTemplateCardProps {
  template?: RoundTemplate;
  roundNumber: number;
  layouts: TemplateLayout[];
  isEditing: boolean;
  onEdit: () => void;
  onSave: (updates: Partial<RoundTemplate>) => void;
  onCancel: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onCreate: (templateData: Omit<RoundTemplate, 'id' | 'created_at' | 'updated_at' | 'round_number'>) => void;
}
const RoundTemplateCard: React.FC<RoundTemplateCardProps> = ({
  template,
  roundNumber,
  layouts,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onPreview,
  onCreate
}) => {
  const [editData, setEditData] = useState({
    layout_id: template?.layout_id || '',
    content_template: template?.content_template || '',
    is_active: template?.is_active ?? true,
    tone_settings: template?.tone_settings || {
      aggression_level: 'standard' as const,
      tone: 'professional' as const
    },
    append_documents: template?.append_documents || {
      proof_of_address: false,
      identity: false,
      social_security: false
    }
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const aggressionLevels = [{
    value: 'polite',
    label: 'Polite & Respectful'
  }, {
    value: 'standard',
    label: 'Standard Professional'
  }, {
    value: 'firm',
    label: 'Firm & Direct'
  }, {
    value: 'aggressive',
    label: 'Aggressive & Legal'
  }] as const;
  const toneOptions = [{
    value: 'professional',
    label: 'Professional'
  }, {
    value: 'assertive',
    label: 'Assertive'
  }, {
    value: 'legal',
    label: 'Legal Notice'
  }] as const;
  if (!template && !showCreateForm) {
    return <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <FileText className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">Round {roundNumber}</h3>
          <p className="text-muted-foreground text-center mb-4">No template configured for this round</p>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Template
          </Button>
        </CardContent>
      </Card>;
  }
  if (showCreateForm || isEditing) {
    return <Card>
        <CardHeader>
          <CardTitle>Round {roundNumber} Template</CardTitle>
          <CardDescription>Configure template content and document append settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="layout">Layout Template</Label>
              <Select value={editData.layout_id} onValueChange={value => setEditData({
              ...editData,
              layout_id: value
            })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select layout" />
                </SelectTrigger>
                <SelectContent>
                  {layouts.map(layout => <SelectItem key={layout.id} value={layout.id}>
                      {layout.name}
                    </SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <Checkbox id="active" checked={editData.is_active} onCheckedChange={checked => setEditData({
              ...editData,
              is_active: !!checked
            })} />
              <Label htmlFor="active">Active template</Label>
            </div>
          </div>

          <div>
            <Label htmlFor="content">Template Content</Label>
            <Textarea id="content" value={editData.content_template} onChange={e => setEditData({
            ...editData,
            content_template: e.target.value
          })} rows={8} placeholder="Use {{placeholders}} for dynamic content" />
          </div>

          <div className="space-y-4">
            <Label className="text-base font-semibold">Tone & Aggression Settings</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="aggression">Aggression Level</Label>
                <Select value={editData.tone_settings.aggression_level} onValueChange={value => setEditData({
                ...editData,
                tone_settings: {
                  ...editData.tone_settings,
                  aggression_level: value as any
                }
              })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {aggressionLevels.map(level => <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="tone">Tone Style</Label>
                <Select value={editData.tone_settings.tone} onValueChange={value => setEditData({
                ...editData,
                tone_settings: {
                  ...editData.tone_settings,
                  tone: value as any
                }
              })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {toneOptions.map(tone => <SelectItem key={tone.value} value={tone.value}>
                        {tone.label}
                      </SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <Label className="text-base font-semibold">Document Attachments</Label>
            <p className="text-sm text-muted-foreground">
              Select which documents to automatically append to letters sent via PostGrid
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox id="proof_address" checked={editData.append_documents.proof_of_address} onCheckedChange={checked => setEditData({
                ...editData,
                append_documents: {
                  ...editData.append_documents,
                  proof_of_address: !!checked
                }
              })} />
                <Label htmlFor="proof_address" className="text-sm">Proof of Address</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="identity" checked={editData.append_documents.identity} onCheckedChange={checked => setEditData({
                ...editData,
                append_documents: {
                  ...editData.append_documents,
                  identity: !!checked
                }
              })} />
                <Label htmlFor="identity" className="text-sm">Identity Document</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="social_security" checked={editData.append_documents.social_security} onCheckedChange={checked => setEditData({
                ...editData,
                append_documents: {
                  ...editData.append_documents,
                  social_security: !!checked
                }
              })} />
                <Label htmlFor="social_security" className="text-sm">Social Security</Label>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => {
            if (template) {
              onSave(editData);
            } else {
              onCreate(editData);
              setShowCreateForm(false);
            }
          }} size="sm">
              <Save className="w-4 h-4 mr-1" />
              {template ? 'Save' : 'Create'}
            </Button>
            <Button onClick={() => {
            if (template) {
              onCancel();
            } else {
              setShowCreateForm(false);
            }
          }} variant="outline" size="sm">
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>;
  }
  return <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              Round {template.round_number}
              {template.is_active && <Badge variant="secondary">Active</Badge>}
              <Badge variant="outline" className="text-xs">
                {template.tone_settings?.aggression_level || 'standard'}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {template.tone_settings?.tone || 'professional'}
              </Badge>
            </CardTitle>
            <CardDescription>
              Layout: {template.layout?.name || 'Unknown'} | 
              Created: {new Date(template.created_at).toLocaleDateString()}
            </CardDescription>
          </div>
          <div className="flex gap-1">
            <Button onClick={onPreview} variant="outline" size="sm">
              <Eye className="w-4 h-4" />
            </Button>
            <Button onClick={onEdit} variant="outline" size="sm">
              <Edit className="w-4 h-4" />
            </Button>
            <Button onClick={onDelete} variant="outline" size="sm">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground max-h-24 overflow-hidden">
            {template.content_template.substring(0, 200)}...
          </div>
          
          {template.append_documents && <div className="space-y-2">
              <Label className="text-sm font-medium">Auto-Append Documents:</Label>
              <div className="flex flex-wrap gap-2">
                {template.append_documents.proof_of_address && <Badge variant="outline" className="text-xs">Proof of Address</Badge>}
                {template.append_documents.identity && <Badge variant="outline" className="text-xs">Identity</Badge>}
                {template.append_documents.social_security && <Badge variant="outline" className="text-xs">Social Security</Badge>}
                {!template.append_documents.proof_of_address && !template.append_documents.identity && !template.append_documents.social_security && <span className="text-sm text-muted-foreground">None</span>}
              </div>
            </div>}
        </div>
      </CardContent>
    </Card>;
};

// Create Layout Dialog Component  
interface CreateLayoutDialogProps {
  onSave: (data: Omit<TemplateLayout, 'id' | 'created_at' | 'updated_at'>) => void;
  onCancel: () => void;
}
const CreateLayoutDialog: React.FC<CreateLayoutDialogProps> = ({
  onSave,
  onCancel
}) => {
  const [formData, setFormData] = useState({
    name: '',
    content: `<div class="header">
  <div class="date">{{date}}</div>
  <div class="round-info">Round {{round}}</div>
</div>
<div class="body">{{body}}</div>
<div class="footer">
  <p>Sincerely,</p>
  <br />
  <p>{{client_name}}</p>
</div>`,
    placeholders: ['date', 'round', 'body', 'client_name'],
    is_default: false
  });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };
  return <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>Create New Layout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Layout Name</Label>
            <Input id="name" value={formData.name} onChange={e => setFormData({
            ...formData,
            name: e.target.value
          })} required />
          </div>
          <div>
            <Label htmlFor="content">Layout Content (HTML)</Label>
            <Textarea id="content" value={formData.content} onChange={e => setFormData({
            ...formData,
            content: e.target.value
          })} rows={12} required />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="default" checked={formData.is_default} onCheckedChange={checked => setFormData({
            ...formData,
            is_default: !!checked
          })} />
            <Label htmlFor="default">Set as default layout</Label>
          </div>
          <div className="flex gap-2">
            <Button type="submit">Create Layout</Button>
            <Button type="button" onClick={onCancel} variant="outline">Cancel</Button>
          </div>
        </CardContent>
      </form>
    </Card>;
};

// Create Round Template Dialog Component
interface CreateRoundTemplateDialogProps {
  layouts: TemplateLayout[];
  onSave: (data: Omit<RoundTemplate, 'id' | 'created_at' | 'updated_at'>) => void;
  onCancel: () => void;
}
const CreateRoundTemplateDialog: React.FC<CreateRoundTemplateDialogProps> = ({
  layouts,
  onSave,
  onCancel
}) => {
  const [formData, setFormData] = useState({
    round_number: 1,
    layout_id: '',
    content_template: '',
    is_active: true,
    tone_settings: {
      aggression_level: 'standard' as const,
      tone: 'professional' as const
    },
    append_documents: {
      proof_of_address: false,
      identity: false,
      social_security: false
    }
  });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };
  return <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>Create New Round Template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="round">Round Number</Label>
              <Input id="round" type="number" min="1" max="12" value={formData.round_number} onChange={e => setFormData({
              ...formData,
              round_number: parseInt(e.target.value)
            })} required />
            </div>
            <div>
              <Label htmlFor="layout">Layout</Label>
              <Select value={formData.layout_id} onValueChange={value => setFormData({
              ...formData,
              layout_id: value
            })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select layout" />
                </SelectTrigger>
                <SelectContent>
                  {layouts.map(layout => <SelectItem key={layout.id} value={layout.id}>
                      {layout.name}
                    </SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="content">Template Content</Label>
            <Textarea id="content" value={formData.content_template} onChange={e => setFormData({
            ...formData,
            content_template: e.target.value
          })} rows={8} placeholder="Use {{placeholders}} for dynamic content" required />
          </div>
          <div className="flex gap-2">
            <Button type="submit">Create Template</Button>
            <Button type="button" onClick={onCancel} variant="outline">Cancel</Button>
          </div>
        </CardContent>
      </form>
    </Card>;
};
export default TemplateManager;