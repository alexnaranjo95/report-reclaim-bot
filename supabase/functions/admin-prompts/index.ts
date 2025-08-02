import { createClient } from '@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Check if user has superadmin role
    const { data: roleData, error: roleError } = await supabase
      .rpc('has_role', { _user_id: user.id, _role: 'superadmin' });

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: corsHeaders }
      );
    }

    if (req.method === 'GET') {
      // Get current active prompt
      const { data, error } = await supabase
        .from('admin_prompts')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('Error fetching prompt:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch prompt' }),
          { status: 500, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { headers: corsHeaders }
      );
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { prompt_text, version_name, description } = body;

      if (!prompt_text) {
        return new Response(
          JSON.stringify({ error: 'prompt_text is required' }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Deactivate all existing prompts
      await supabase
        .from('admin_prompts')
        .update({ is_active: false })
        .eq('is_active', true);

      // Insert new prompt
      const { data, error } = await supabase
        .from('admin_prompts')
        .insert({
          prompt_text,
          version_name: version_name || `Version ${new Date().toISOString()}`,
          description: description || 'Custom admin prompt',
          updated_by: user.id,
          is_active: true
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving prompt:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to save prompt' }),
          { status: 500, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ 
          message: 'Prompt saved & applied ✔︎',
          data 
        }),
        { headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: corsHeaders }
    );

  } catch (error) {
    console.error('Error in admin-prompts function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    );
  }
});