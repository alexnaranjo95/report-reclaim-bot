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

    // Create Supabase client with service role for database access
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user authentication using anon client
    const anonSupabase = createClient(
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

    const { data: { user }, error: authError } = await anonSupabase.auth.getUser();
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

    // Get TinyMCE API key from admin_settings table using service role
    console.log('TinyMCE API key request from user:', user.id);
    
    const { data: settingData, error: settingError } = await supabase
      .from('admin_settings')
      .select('setting_value')
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
    
    if (!settingData || !settingData.setting_value) {
      console.error('TinyMCE API key not found in database. SettingData:', settingData);
      return new Response(JSON.stringify({ 
        error: 'TinyMCE API key not configured in admin settings',
        apiKey: null
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Return the API key directly (it's stored as a string in the database)
    const tinyMCEApiKey = settingData.setting_value;

    console.log('TinyMCE API key configured:', !!tinyMCEApiKey);
    console.log('Successfully returning TinyMCE API key length:', tinyMCEApiKey.length);
    
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