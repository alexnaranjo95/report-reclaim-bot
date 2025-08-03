import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { templateService, type TemplateLayout } from '@/services/TemplateService';
import TemplateEditor from '@/components/TemplateEditor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const TemplateEditorPage: React.FC = () => {
  const { templateId } = useParams<{ templateId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSuperAdmin, loading } = useRole();
  const [template, setTemplate] = useState<TemplateLayout | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTemplate();
  }, [templateId]);

  const loadTemplate = async () => {
    if (!templateId || templateId === 'new') {
      setIsLoading(false);
      return;
    }

    try {
      const layouts = await templateService.getTemplateLayouts();
      const foundTemplate = layouts.find(t => t.id === templateId);
      
      if (foundTemplate) {
        setTemplate(foundTemplate);
      } else {
        toast.error('Template not found');
        navigate('/admin');
      }
    } catch (error) {
      console.error('Error loading template:', error);
      toast.error('Failed to load template');
      navigate('/admin');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = (savedTemplate: TemplateLayout) => {
    toast.success('Template saved successfully');
    navigate('/admin');
  };

  const handleCancel = () => {
    navigate('/admin');
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-dashboard flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || !isSuperAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You need super admin privileges to access the template editor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Please contact your administrator for access.</p>
            <Button onClick={() => navigate('/')} className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-dashboard">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button onClick={() => navigate('/admin')} variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Admin
            </Button>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                Template Editor
              </h1>
              <p className="text-muted-foreground">
                {template ? `Editing: ${template.name}` : 'Create new template'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <TemplateEditor
          template={template}
          onSave={handleSave}
          onCancel={handleCancel}
          isAdmin={isSuperAdmin}
        />
      </div>
    </div>
  );
};

export default TemplateEditorPage;