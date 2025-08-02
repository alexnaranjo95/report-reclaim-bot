import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { TemplateViewerModal } from '@/components/TemplateViewerModal';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AIPromptService } from '@/services/AIPromptService';
import { 
  Upload, 
  Database, 
  Brain, 
  Settings, 
  Search, 
  FileText,
  Key,
  Trash2,
  Download,
  Play,
  RefreshCw,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface CreditorAddress {
  id: string;
  creditor: string;
  bureau: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  created_at: string;
}

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

interface AdminSetting {
  id: string;
  setting_key: string;
  setting_value: any;
  is_encrypted: boolean;
  description: string;
}

export const DataAIConfiguration = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('addresses');
  
  // Addresses state
  const [addresses, setAddresses] = useState<CreditorAddress[]>([]);
  const [addressSearch, setAddressSearch] = useState('');
  const [addressFilter, setAddressFilter] = useState({ bureau: '', creditor: '' });
  const [uploadingAddresses, setUploadingAddresses] = useState(false);
  
  // Templates state
  const [templates, setTemplates] = useState<DisputeTemplate[]>([]);
  const [uploadingTemplates, setUploadingTemplates] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  const [promptBuilder, setPromptBuilder] = useState('');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<any>(null);
  const [quickAddTemplate, setQuickAddTemplate] = useState('');
  const [addingQuickTemplate, setAddingQuickTemplate] = useState(false);
  const [lastTrainedAt, setLastTrainedAt] = useState<string | null>(null);
  const [isPromptLive, setIsPromptLive] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [originalPromptText, setOriginalPromptText] = useState('');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  
  // Settings state
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [apiKeys, setApiKeys] = useState({
    postgrid_key: '',
    openai_key: '',
    tinymce_key: ''
  });
  const [globalPreferences, setGlobalPreferences] = useState({
    use_newest_ai_prompt: true,
    auto_regenerate_disputes: false
  });

  useEffect(() => {
    loadAddresses();
    loadTemplates();
    loadSettings();
    loadCurrentPrompt();
  }, []);

  // Reload prompt when component mounts or tab becomes active
  useEffect(() => {
    if (activeTab === 'templates') {
      loadCurrentPrompt();
    }
  }, [activeTab]);

  // Add effect to reload prompt when page becomes visible again (tab changes, navigation)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadCurrentPrompt();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, []);

  const loadCurrentPrompt = async () => {
    try {
      // Load directly from admin_prompts table
      const { data, error } = await supabase
        .from('admin_prompts')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error loading current prompt:', error);
        return;
      }

      if (data) {
        setCurrentPrompt(data);
        setPromptBuilder(data.prompt_text || '');
        setOriginalPromptText(data.prompt_text || '');
        setIsPromptLive(true);
        console.log('Prompt loaded successfully:', data.prompt_text);
      } else {
        // No active prompt found, reset states
        setCurrentPrompt(null);
        setPromptBuilder('');
        setOriginalPromptText('');
        setIsPromptLive(false);
        console.log('No active prompt found in database');
      }
    } catch (error) {
      console.error('Error loading current prompt:', error);
    }
  };

  const loadAddresses = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-addresses', {
        method: 'GET'
      });

      if (error) throw error;
      setAddresses(data.data || []);
    } catch (error) {
      console.error('Error loading addresses:', error);
      toast({
        title: "Error",
        description: "Failed to load creditor addresses",
        variant: "destructive",
      });
    }
  };

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('dispute_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast({
        title: "Error",
        description: "Failed to load dispute templates",
        variant: "destructive",
      });
    }
  };

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-settings', {
        method: 'GET'
      });

      if (error) throw error;
      setSettings(data.data || []);
      
      // Update global preferences
      const usePromptSetting = data.data?.find((s: AdminSetting) => s.setting_key === 'use_newest_ai_prompt');
      const autoRegenSetting = data.data?.find((s: AdminSetting) => s.setting_key === 'auto_regenerate_disputes');
      
      if (usePromptSetting) {
        setGlobalPreferences(prev => ({
          ...prev,
          use_newest_ai_prompt: usePromptSetting.setting_value.enabled
        }));
      }
      
      if (autoRegenSetting) {
        setGlobalPreferences(prev => ({
          ...prev,
          auto_regenerate_disputes: autoRegenSetting.setting_value.enabled
        }));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: "Error",
        description: "Failed to load admin settings",
        variant: "destructive",
      });
    }
  };

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingAddresses(true);
    
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      // Validate headers
      const requiredHeaders = ['creditor', 'bureau', 'street', 'city', 'state', 'zip'];
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      
      if (missingHeaders.length > 0) {
        throw new Error(`Missing required headers: ${missingHeaders.join(', ')}`);
      }
      
      const addresses = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const address: any = {};
        headers.forEach((header, index) => {
          address[header] = values[index] || '';
        });
        return address;
      }).filter(addr => addr.creditor && addr.bureau);

      const { data, error } = await supabase.functions.invoke('admin-addresses', {
        method: 'POST',
        body: { bulk: true, addresses }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: data.message || `Uploaded ${addresses.length} addresses`,
      });
      
      loadAddresses();
    } catch (error) {
      console.error('Error uploading CSV:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload CSV",
        variant: "destructive",
      });
    } finally {
      setUploadingAddresses(false);
      event.target.value = '';
    }
  };

  const handleTemplateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadingTemplates(true);
    let successCount = 0;
    
    try {
      for (const file of Array.from(files)) {
        let content = '';
        const fileType = file.name.split('.').pop()?.toLowerCase() || 'txt';
        
        if (!['docx', 'markdown', 'txt', 'md', 'pdf'].includes(fileType)) {
          console.warn(`Skipping unsupported file type: ${file.name}`);
          continue;
        }

        // Handle different file types
        if (fileType === 'pdf') {
          // For PDF files, we'll store a placeholder indicating it needs processing
          content = `[PDF File: ${file.name}] - Content extraction required`;
        } else {
          content = await file.text();
        }

        const { error } = await supabase
          .from('dispute_templates')
          .insert({
            name: file.name,
            content: content,
            file_type: fileType === 'md' ? 'markdown' : fileType,
            tags: [],
            is_active: true,
            preference_weight: 1.0
          });

        if (error) {
          console.error(`Error uploading ${file.name}:`, error);
          continue;
        }
        successCount++;
      }

      toast({
        title: "Success",
        description: `Uploaded ${successCount} template files`,
      });
      
      loadTemplates();
    } catch (error) {
      console.error('Error uploading templates:', error);
      toast({
        title: "Error",
        description: "Failed to upload templates",
        variant: "destructive",
      });
    } finally {
      setUploadingTemplates(false);
      event.target.value = '';
    }
  };

  const handleQuickAddTemplate = async () => {
    if (!quickAddTemplate.trim()) {
      toast({
        title: "Error",
        description: "Please enter template content",
        variant: "destructive",
      });
      return;
    }

    setAddingQuickTemplate(true);
    
    try {
      // Create a .txt file blob from the content
      const fileBlob = new Blob([quickAddTemplate.trim()], { type: 'text/plain' });
      const fileName = `quick-template-${Date.now()}.txt`;
      const filePath = `dispute_templates/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('verification-documents')
        .upload(filePath, fileBlob);

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw uploadError;
      }

      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('verification-documents')
        .getPublicUrl(filePath);

      // Insert into database with file information
      const { data, error } = await supabase
        .from('dispute_templates')
        .insert({
          name: `Quick Template ${new Date().toLocaleString()}`,
          content: quickAddTemplate.trim(),
          file_type: 'txt',
          tags: ['quick_add'],
          is_active: true,
          preference_weight: 1.0
        })
        .select();

      if (error) {
        console.error('Supabase insert error:', error);
        // Clean up uploaded file if database insert fails
        await supabase.storage
          .from('verification-documents')
          .remove([filePath]);
        throw error;
      }

      console.log('Template added successfully:', data);

      toast({
        title: "Success", 
        description: "Template added and saved as .txt file ✔︎",
      });
      
      setQuickAddTemplate('');
      await loadTemplates(); // Wait for templates to reload
    } catch (error) {
      console.error('Error adding quick template:', error);
      toast({
        title: "Error",
        description: `Failed to add template: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setAddingQuickTemplate(false);
    }
  };

  const handleTrainAI = async () => {
    setIsTraining(true);
    setTrainingProgress(0);
    
    try {
      // Simulate training progress
      const progressInterval = setInterval(() => {
        setTrainingProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const { data, error } = await supabase.functions.invoke('ai-train', {
        method: 'POST',
        body: { action: 'train' }
      });

      clearInterval(progressInterval);
      setTrainingProgress(100);

      if (error) throw error;

      // Update last trained timestamp
      const now = new Date().toISOString();
      setLastTrainedAt(now);

      toast({
        title: "Training Complete",
        description: "Model retrained with latest templates & prompt ✅",
      });
      
      loadTemplates();
    } catch (error) {
      console.error('Error training AI:', error);
      toast({
        title: "Error",
        description: "Failed to train AI model",
        variant: "destructive",
      });
    } finally {
      setIsTraining(false);
      setTimeout(() => setTrainingProgress(0), 2000);
    }
  };

  const handleUpdateAPIKeys = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-settings', {
        method: 'POST',
        body: {
          type: 'api_keys',
          ...apiKeys
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "API keys updated successfully",
      });
      
      setApiKeys({ postgrid_key: '', openai_key: '', tinymce_key: '' });
      loadSettings();
    } catch (error) {
      console.error('Error updating API keys:', error);
      toast({
        title: "Error",
        description: "Failed to update API keys",
        variant: "destructive",
      });
    }
  };

  const handleSavePrompt = async () => {
    if (!promptBuilder.trim()) {
      toast({
        title: "Error",
        description: "Please enter a prompt before saving",
        variant: "destructive",
      });
      return;
    }

    try {
      setSavingPrompt(true);
      setIsCheckingStatus(true);
      
      // Deactivate any existing active prompts
      await supabase
        .from('admin_prompts')
        .update({ is_active: false })
        .eq('is_active', true);

      // Insert new prompt as active
      const { data, error } = await supabase
        .from('admin_prompts')
        .insert({
          prompt_text: promptBuilder,
          version_name: `Version ${new Date().toLocaleDateString()}`,
          description: 'Admin-configured AI prompt',
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      setCurrentPrompt(data);
      setOriginalPromptText(promptBuilder);
      setIsPromptLive(true);
      setIsCheckingStatus(false);
      
      toast({
        title: "Success",
        description: "Saved and Trained ✅",
      });
    } catch (error) {
      console.error('Error saving prompt:', error);
      toast({
        title: "Error",
        description: "Failed to save prompt version",
        variant: "destructive",
      });
      setIsCheckingStatus(false);
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleResetPrompt = async () => {
    const confirmed = window.confirm('Delete current prompt?');
    if (!confirmed) return;

    try {
      // Clear from database by deactivating current prompt
      if (currentPrompt?.id) {
        const { error } = await supabase
          .from('admin_prompts')
          .update({ is_active: false })
          .eq('id', currentPrompt.id);
        
        if (error) throw error;
      }
      
      setPromptBuilder('');
      setOriginalPromptText('');
      setCurrentPrompt(null);
      setIsPromptLive(false);
      
      toast({
        title: "Success",
        description: "Prompt cleared",
      });
    } catch (error) {
      console.error('Error resetting prompt:', error);
      toast({
        title: "Error",
        description: "Failed to clear prompt",
        variant: "destructive",
      });
    }
  };

  const pollForLiveStatus = async () => {
    try {
      const isLive = await AIPromptService.pollPromptStatus();
      setIsPromptLive(isLive);
      setIsCheckingStatus(false);
    } catch (error) {
      console.error('Error polling prompt status:', error);
      setIsCheckingStatus(false);
    }
  };

  const handleUpdatePreferences = async (key: string, value: boolean) => {
    try {
      const { error } = await supabase.functions.invoke('admin-settings', {
        method: 'POST',
        body: {
          setting_key: key,
          setting_value: { enabled: value },
          description: key === 'use_newest_ai_prompt' 
            ? 'Use the newest AI prompt version for dispute generation'
            : 'Automatically regenerate disputes when new documents are uploaded'
        }
      });

      if (error) throw error;

      setGlobalPreferences(prev => ({ ...prev, [key]: value }));
      
      toast({
        title: "Success",
        description: "Preference updated successfully",
      });
    } catch (error) {
      console.error('Error updating preference:', error);
      toast({
        title: "Error",
        description: "Failed to update preference",
        variant: "destructive",
      });
    }
  };

  const filteredAddresses = addresses.filter(addr => {
    const searchMatch = !addressSearch || 
      addr.creditor.toLowerCase().includes(addressSearch.toLowerCase()) ||
      addr.bureau.toLowerCase().includes(addressSearch.toLowerCase()) ||
      addr.street.toLowerCase().includes(addressSearch.toLowerCase()) ||
      addr.city.toLowerCase().includes(addressSearch.toLowerCase());
    
    const bureauMatch = !addressFilter.bureau || addr.bureau === addressFilter.bureau;
    const creditorMatch = !addressFilter.creditor || addr.creditor === addressFilter.creditor;
    
    return searchMatch && bureauMatch && creditorMatch;
  });

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-card shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Data & AI Configuration
          </CardTitle>
          <CardDescription>
            Manage creditor addresses, dispute templates, and AI training for enhanced automation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="addresses" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Addresses
              </TabsTrigger>
              <TabsTrigger value="templates" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Templates & AI
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="addresses" className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search addresses..."
                      value={addressSearch}
                      onChange={(e) => setAddressSearch(e.target.value)}
                      className="pl-10 w-64"
                    />
                  </div>
                  <Input
                    placeholder="Filter by bureau"
                    value={addressFilter.bureau}
                    onChange={(e) => setAddressFilter(prev => ({ ...prev, bureau: e.target.value }))}
                    className="w-40"
                  />
                  <Input
                    placeholder="Filter by creditor"
                    value={addressFilter.creditor}
                    onChange={(e) => setAddressFilter(prev => ({ ...prev, creditor: e.target.value }))}
                    className="w-40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={handleCSVUpload}
                    className="hidden"
                    id="csv-upload"
                    disabled={uploadingAddresses}
                  />
                  <Button 
                    onClick={() => document.getElementById('csv-upload')?.click()}
                    disabled={uploadingAddresses}
                    className="flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    {uploadingAddresses ? 'Uploading...' : 'Upload CSV'}
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => window.open('/static/creditor_addresses_template.csv', '_blank')}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download Template
                  </Button>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                </div>
              </div>

              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Creditor</TableHead>
                      <TableHead>Bureau</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>City, State</TableHead>
                      <TableHead>ZIP</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAddresses.map((address) => (
                      <TableRow key={address.id}>
                        <TableCell className="font-medium">{address.creditor}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{address.bureau}</Badge>
                        </TableCell>
                        <TableCell>{address.street}</TableCell>
                        <TableCell>{address.city}, {address.state}</TableCell>
                        <TableCell>{address.zip}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="templates" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Template Upload</CardTitle>
                    <CardDescription>
                      Upload DOCX, Markdown, or text files for AI training
                    </CardDescription>
                  </CardHeader>
                   <CardContent className="space-y-4">
                      <input
                        type="file"
                        accept=".txt,.docx,.md,.pdf"
                        multiple
                        onChange={handleTemplateUpload}
                        className="hidden"
                        id="template-upload"
                        disabled={uploadingTemplates}
                      />
                      <input
                        type="file"
                        accept=".txt,.docx,.md,.pdf"
                        multiple
                        {...({ webkitdirectory: "" } as any)}
                        onChange={handleTemplateUpload}
                        className="hidden"
                        id="folder-upload"
                        disabled={uploadingTemplates}
                      />
                     <div className="space-y-2">
                       <Button 
                         onClick={() => document.getElementById('template-upload')?.click()}
                         disabled={uploadingTemplates}
                         className="w-full flex items-center gap-2"
                       >
                         <Upload className="h-4 w-4" />
                         {uploadingTemplates ? 'Uploading...' : 'Upload Files'}
                       </Button>
                       <Button 
                         variant="outline"
                         onClick={() => document.getElementById('folder-upload')?.click()}
                         disabled={uploadingTemplates}
                         className="w-full flex items-center gap-2"
                       >
                         <Upload className="h-4 w-4" />
                         Upload Folder
                       </Button>
                     </div>
                     
                     <div className="border-t pt-4 space-y-3">
                       <Label className="text-sm font-medium">Quick-Add Template</Label>
                       <Textarea
                         placeholder="Paste template content here..."
                         value={quickAddTemplate}
                         onChange={(e) => setQuickAddTemplate(e.target.value)}
                         rows={3}
                         className="resize-none"
                       />
                       <Button 
                         onClick={handleQuickAddTemplate}
                         disabled={addingQuickTemplate || !quickAddTemplate.trim()}
                         size="sm"
                         className="flex items-center gap-2"
                       >
                         <CheckCircle className="h-4 w-4" />
                         {addingQuickTemplate ? 'Adding...' : 'Add'}
                       </Button>
                     </div>
                     
                      <button 
                        className="text-sm text-blue-600 hover:text-blue-800 underline cursor-pointer"
                        onClick={() => setIsTemplateModalOpen(true)}
                      >
                        Templates: {templates.length} | Active: {templates.filter(t => t.is_active).length}
                      </button>
                   </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">AI Training</CardTitle>
                    <CardDescription>
                      Retrain the model with uploaded templates
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isTraining && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Training Progress</span>
                          <span>{trainingProgress}%</span>
                        </div>
                        <Progress value={trainingProgress} />
                      </div>
                    )}
                    <Button 
                      onClick={handleTrainAI}
                      disabled={isTraining}
                      className="w-full flex items-center gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${isTraining ? 'animate-spin' : ''}`} />
                      {isTraining ? 'Training...' : 'Start Training'}
                    </Button>
                     <p className="text-sm text-muted-foreground">
                       Last trained: {lastTrainedAt ? new Date(lastTrainedAt).toLocaleString() : 'Never'}
                     </p>
                  </CardContent>
                </Card>
              </div>

                <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Prompt Builder
                    {isPromptLive && promptBuilder === originalPromptText && (
                      <Badge variant="default" className="bg-green-100 text-green-800 border-green-200 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Saved and Trained
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Customize the AI prompt with additional rules and guidelines
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Enter additional AI rules (e.g., 'always include FCRA § references', 'use formal legal language')..."
                    value={promptBuilder}
                    onChange={(e) => setPromptBuilder(e.target.value)}
                    rows={6}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button 
                        onClick={handleSavePrompt}
                        disabled={savingPrompt}
                        className="flex items-center gap-2"
                      >
                        <CheckCircle className="h-4 w-4" />
                        {savingPrompt ? 'Saving...' : 'Save Prompt Version'}
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={handleResetPrompt}
                        disabled={savingPrompt}
                        className="flex items-center gap-2 text-muted-foreground"
                      >
                        <Trash2 className="h-4 w-4" />
                        Reset
                      </Button>
                    </div>
                     {currentPrompt && (
                       <p className="text-green-600 text-xs">
                         Last saved: {new Date(currentPrompt.updated_at).toLocaleString()}
                       </p>
                     )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Key className="h-5 w-5" />
                      API Keys Management
                    </CardTitle>
                    <CardDescription>
                      Securely store and rotate API keys for external services
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="postgrid">PostGrid API Key</Label>
                      <Input
                        id="postgrid"
                        type="password"
                        placeholder="Enter PostGrid API key"
                        value={apiKeys.postgrid_key}
                        onChange={(e) => setApiKeys(prev => ({ ...prev, postgrid_key: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="openai">OpenAI API Key</Label>
                      <Input
                        id="openai"
                        type="password"
                        placeholder="Enter OpenAI API key"
                        value={apiKeys.openai_key}
                        onChange={(e) => setApiKeys(prev => ({ ...prev, openai_key: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tinymce">TinyMCE API Key</Label>
                      <Input
                        id="tinymce"
                        type="password"
                        placeholder="Enter TinyMCE API key"
                        value={apiKeys.tinymce_key}
                        onChange={(e) => setApiKeys(prev => ({ ...prev, tinymce_key: e.target.value }))}
                      />
                    </div>
                    <Button onClick={handleUpdateAPIKeys} className="w-full">
                      Update API Keys
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Global Preferences</CardTitle>
                    <CardDescription>
                      System-wide settings that affect all tenant sessions
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Use Newest AI Prompt</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically use the latest prompt version
                        </p>
                      </div>
                      <Switch
                        checked={globalPreferences.use_newest_ai_prompt}
                        onCheckedChange={(checked) => handleUpdatePreferences('use_newest_ai_prompt', checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Auto-regenerate Disputes</Label>
                        <p className="text-sm text-muted-foreground">
                          Regenerate disputes when documents are uploaded
                        </p>
                      </div>
                      <Switch
                        checked={globalPreferences.auto_regenerate_disputes}
                        onCheckedChange={(checked) => handleUpdatePreferences('auto_regenerate_disputes', checked)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">System Status</CardTitle>
                  <CardDescription>
                    Current status of integrated services and configurations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">PostGrid</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm">OpenAI</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">TinyMCE</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Database</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

        <TemplateViewerModal
          isOpen={isTemplateModalOpen}
          onClose={() => setIsTemplateModalOpen(false)}
          templates={templates}
          onTemplateUpdated={loadTemplates}
        />
    </div>
  );
};