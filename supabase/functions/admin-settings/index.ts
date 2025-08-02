import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple encryption for API keys (in production, use proper encryption)
const encryptValue = (value: string): string => {
  return btoa(value); // Base64 encoding - replace with proper encryption
};

const decryptValue = (encryptedValue: string): string => {
  return atob(encryptedValue); // Base64 decoding - replace with proper decryption
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user has superadmin role
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roles, error: roleError } = await supabase.rpc('get_user_roles', {
      _user_id: user.id
    });

    if (roleError || !roles?.some((role: any) => role.role === 'superadmin')) {
      return new Response(JSON.stringify({ error: 'Superadmin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const method = req.method;

    if (method === 'GET') {
      // Get all settings or specific setting
      const settingKey = url.searchParams.get('key');
      
      let query = supabase.from('admin_settings').select('*');
      
      if (settingKey) {
        query = query.eq('setting_key', settingKey);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching settings:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch settings' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Decrypt encrypted values for display (mask API keys)
      const processedData = data?.map(setting => {
        if (setting.is_encrypted) {
          try {
            const decrypted = decryptValue(setting.setting_value.value || '');
            return {
              ...setting,
              setting_value: {
                ...setting.setting_value,
                value: '*'.repeat(Math.min(decrypted.length, 20)), // Mask the key
                hasValue: decrypted.length > 0
              }
            };
          } catch {
            return {
              ...setting,
              setting_value: {
                ...setting.setting_value,
                value: '',
                hasValue: false
              }
            };
          }
        }
        return setting;
      });

      return new Response(JSON.stringify({ data: processedData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (method === 'POST' || method === 'PUT') {
      const body = await req.json();
      
      if (body.type === 'api_keys') {
        // Handle API key updates
        const { postgrid_key, openai_key, tinymce_key } = body;
        
        const keyUpdates = [];
        
        if (postgrid_key) {
          keyUpdates.push({
            setting_key: 'postgrid_api_key',
            setting_value: { value: encryptValue(postgrid_key) },
            is_encrypted: true,
            description: 'PostGrid API key for letter delivery',
            updated_by: user.id
          });
        }
        
        if (openai_key) {
          keyUpdates.push({
            setting_key: 'openai_api_key',
            setting_value: { value: encryptValue(openai_key) },
            is_encrypted: true,
            description: 'OpenAI API key for AI-powered dispute generation',
            updated_by: user.id
          });
        }
        
        if (tinymce_key) {
          keyUpdates.push({
            setting_key: 'tinymce_api_key',
            setting_value: { value: encryptValue(tinymce_key) },
            is_encrypted: true,
            description: 'TinyMCE API key for rich text editing',
            updated_by: user.id
          });
        }

        for (const keyUpdate of keyUpdates) {
          const { error } = await supabase
            .from('admin_settings')
            .upsert(keyUpdate, { onConflict: 'setting_key' });

          if (error) {
            console.error('Error updating API key:', error);
            return new Response(JSON.stringify({ 
              error: 'Failed to update API keys',
              details: error.message 
            }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        return new Response(JSON.stringify({ 
          success: true,
          message: 'API keys updated successfully',
          updated: keyUpdates.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        // Handle general settings update
        const { setting_key, setting_value, description, is_encrypted = false } = body;

        if (!setting_key || !setting_value) {
          return new Response(JSON.stringify({ error: 'setting_key and setting_value are required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const settingData = {
          setting_key,
          setting_value: is_encrypted ? { value: encryptValue(setting_value) } : setting_value,
          is_encrypted,
          description,
          updated_by: user.id
        };

        const { data, error } = await supabase
          .from('admin_settings')
          .upsert(settingData, { onConflict: 'setting_key' })
          .select()
          .single();

        if (error) {
          console.error('Error updating setting:', error);
          return new Response(JSON.stringify({ 
            error: 'Failed to update setting',
            details: error.message 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (method === 'DELETE') {
      const settingKey = url.searchParams.get('key');

      if (!settingKey) {
        return new Response(JSON.stringify({ error: 'Setting key required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase
        .from('admin_settings')
        .delete()
        .eq('setting_key', settingKey);

      if (error) {
        console.error('Error deleting setting:', error);
        return new Response(JSON.stringify({ 
          error: 'Failed to delete setting',
          details: error.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in admin-settings function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});