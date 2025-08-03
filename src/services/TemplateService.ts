import { supabase } from '@/integrations/supabase/client';

export interface TemplateLayout {
  id: string;
  name: string;
  content: string;
  placeholders: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface RoundTemplate {
  id: string;
  round_number: number;
  layout_id: string;
  content_template: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  layout?: TemplateLayout;
}

export interface TemplateData {
  date: string;
  round: number;
  client_name: string;
  creditor_name: string;
  account_number: string;
  bureaus: string;
  reference_number?: string;
  previous_date?: string;
  [key: string]: any;
}

class TemplateService {
  async getTemplateLayouts(): Promise<TemplateLayout[]> {
    const { data, error } = await supabase
      .from('template_layouts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching template layouts:', error);
      throw error;
    }

    return data || [];
  }

  async getDefaultLayout(): Promise<TemplateLayout | null> {
    const { data, error } = await supabase
      .from('template_layouts')
      .select('*')
      .eq('is_default', true)
      .single();

    if (error) {
      console.error('Error fetching default layout:', error);
      return null;
    }

    return data;
  }

  async getRoundTemplates(): Promise<RoundTemplate[]> {
    const { data, error } = await supabase
      .from('round_templates')
      .select(`
        *,
        layout:template_layouts(*)
      `)
      .eq('is_active', true)
      .order('round_number', { ascending: true });

    if (error) {
      console.error('Error fetching round templates:', error);
      throw error;
    }

    return data || [];
  }

  async getRoundTemplate(roundNumber: number): Promise<RoundTemplate | null> {
    const { data, error } = await supabase
      .from('round_templates')
      .select(`
        *,
        layout:template_layouts(*)
      `)
      .eq('round_number', roundNumber)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('Error fetching round template:', error);
      return null;
    }

    return data;
  }

  async createTemplateLayout(layout: Omit<TemplateLayout, 'id' | 'created_at' | 'updated_at'>): Promise<TemplateLayout> {
    const { data, error } = await supabase
      .from('template_layouts')
      .insert(layout)
      .select()
      .single();

    if (error) {
      console.error('Error creating template layout:', error);
      throw error;
    }

    return data;
  }

  async updateTemplateLayout(id: string, updates: Partial<TemplateLayout>): Promise<TemplateLayout> {
    const { data, error } = await supabase
      .from('template_layouts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating template layout:', error);
      throw error;
    }

    return data;
  }

  async deleteTemplateLayout(id: string): Promise<void> {
    const { error } = await supabase
      .from('template_layouts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting template layout:', error);
      throw error;
    }
  }

  async createRoundTemplate(template: Omit<RoundTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<RoundTemplate> {
    const { data, error } = await supabase
      .from('round_templates')
      .insert(template)
      .select()
      .single();

    if (error) {
      console.error('Error creating round template:', error);
      throw error;
    }

    return data;
  }

  async updateRoundTemplate(id: string, updates: Partial<RoundTemplate>): Promise<RoundTemplate> {
    const { data, error } = await supabase
      .from('round_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating round template:', error);
      throw error;
    }

    return data;
  }

  async deleteRoundTemplate(id: string): Promise<void> {
    const { error } = await supabase
      .from('round_templates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting round template:', error);
      throw error;
    }
  }

  compileTemplate(layout: string, content: string, data: TemplateData): string {
    // First, fill in the content template
    const filledContent = this.replacePlaceholders(content, data);
    
    // Then, fill in the layout with the compiled content
    const templateData = { ...data, body: filledContent };
    return this.replacePlaceholders(layout, templateData);
  }

  private replacePlaceholders(template: string, data: TemplateData): string {
    return template.replace(/\{\{(.*?)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      return data[trimmedKey] !== undefined ? String(data[trimmedKey]) : match;
    });
  }

  extractPlaceholders(template: string): string[] {
    const matches = template.match(/\{\{(.*?)\}\}/g);
    if (!matches) return [];
    
    return matches
      .map(match => match.replace(/\{\{|\}\}/g, '').trim())
      .filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates
  }

  async getCompiledLetterForRound(roundNumber: number, data: TemplateData): Promise<string | null> {
    const roundTemplate = await this.getRoundTemplate(roundNumber);
    
    if (!roundTemplate || !roundTemplate.layout) {
      console.error(`No template found for round ${roundNumber}`);
      return null;
    }

    return this.compileTemplate(
      roundTemplate.layout.content,
      roundTemplate.content_template,
      data
    );
  }
}

export const templateService = new TemplateService();