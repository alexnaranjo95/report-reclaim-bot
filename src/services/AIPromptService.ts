import { supabase } from '@/integrations/supabase/client';

export class AIPromptService {
  static async getCurrentPrompt(): Promise<any> {
    try {
      const { data, error } = await supabase.functions.invoke('admin-prompts', {
        method: 'GET'
      });

      if (error) throw error;
      return data?.data;
    } catch (error) {
      console.error('Error loading current prompt:', error);
      throw error;
    }
  }

  static async savePromptVersion(promptText: string, versionName?: string, description?: string): Promise<any> {
    try {
      const { data, error } = await supabase.functions.invoke('admin-prompts', {
        method: 'POST',
        body: {
          prompt_text: promptText,
          version_name: versionName || `Version ${new Date().toLocaleDateString()}`,
          description: description || 'Admin-configured AI prompt'
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error saving prompt:', error);
      throw error;
    }
  }

  static async verifyPromptIsLive(): Promise<{ isLive: boolean; promptId?: string }> {
    try {
      // For now, we'll check if there's an active prompt
      // This can be enhanced later to check training status
      const currentPrompt = await this.getCurrentPrompt();
      
      return {
        isLive: !!currentPrompt && currentPrompt.is_active,
        promptId: currentPrompt?.id
      };
    } catch (error) {
      console.error('Error verifying prompt status:', error);
      return { isLive: false };
    }
  }

  static async pollPromptStatus(maxAttempts = 10, interval = 2000): Promise<boolean> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { isLive } = await this.verifyPromptIsLive();
      if (isLive) return true;
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    return false;
  }
}