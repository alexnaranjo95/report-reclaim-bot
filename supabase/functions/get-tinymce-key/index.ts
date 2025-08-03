import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Create Supabase client to verify user
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Get TinyMCE API key from admin_settings table
    console.log('TinyMCE API key request from user:', user.id);
    
    const { data: settingData, error: settingError } = await supabase
      .from('admin_settings')
      .select('setting_value, is_encrypted')
      .eq('setting_key', 'tinymce_key')
      .maybeSingle();
    
    if (settingError) {
      console.error('Database error fetching TinyMCE key:', settingError);
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch TinyMCE configuration',
        apiKey: null
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    if (!settingData?.setting_value) {
      console.error('TinyMCE API key not found in database');
      return new Response(JSON.stringify({ 
        error: 'TinyMCE API key not configured in admin settings',
        apiKey: null
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Extract the API key from the JSON structure
    let tinyMCEApiKey;
    try {
      const settingValue = typeof settingData.setting_value === 'string' 
        ? JSON.parse(settingData.setting_value) 
        : settingData.setting_value;
      tinyMCEApiKey = settingValue;
      
      if (typeof tinyMCEApiKey === 'object' && tinyMCEApiKey.value) {
        tinyMCEApiKey = tinyMCEApiKey.value;
      }
    } catch (parseError) {
      // If it's not JSON, treat as plain string
      tinyMCEApiKey = settingData.setting_value;
    }

    console.log('TinyMCE API key configured:', !!tinyMCEApiKey);
    console.log('Successfully returning TinyMCE API key:', typeof tinyMCEApiKey === 'string' ? tinyMCEApiKey.substring(0, 10) + '...' : 'invalid format');
    
    return new Response(JSON.stringify({ 
      apiKey: tinyMCEApiKey,
      success: true 
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error) {
    console.error('Error in get-tinymce-key function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      apiKey: null 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});