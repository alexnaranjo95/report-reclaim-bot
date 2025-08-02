import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    // Create admin client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const { targetUserId, adminUserId } = await req.json();

    if (!targetUserId || !adminUserId) {
      return new Response(
        JSON.stringify({ error: 'targetUserId and adminUserId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin ${adminUserId} attempting to impersonate user ${targetUserId}`);

    // Verify the requesting user is a superadmin
    const { data: adminRoles, error: rolesError } = await supabase.rpc('get_user_roles', {
      _user_id: adminUserId
    });

    if (rolesError || !adminRoles?.some((role: any) => role.role === 'superadmin')) {
      console.error('Unauthorized impersonation attempt:', adminUserId);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if target user exists and is not suspended
    const { data: targetProfile, error: profileError } = await supabase
      .from('profiles')
      .select('status, email, display_name')
      .eq('user_id', targetUserId)
      .single();

    if (profileError) {
      console.error('Error fetching target user profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'Target user not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate access token for the target user
    const { data: tokenData, error: tokenError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: targetProfile.email,
      options: {
        redirectTo: `${req.headers.get('origin') || 'https://lovableproject.com'}/`
      }
    });

    if (tokenError) {
      console.error('Error generating impersonation token:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate impersonation token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract access and refresh tokens from the magic link
    const url = new URL(tokenData.properties.action_link);
    const accessToken = url.searchParams.get('access_token');
    const refreshToken = url.searchParams.get('refresh_token');

    if (!accessToken || !refreshToken) {
      console.error('Failed to extract tokens from magic link');
      return new Response(
        JSON.stringify({ error: 'Failed to extract impersonation tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generated impersonation tokens for user ${targetUserId}`);

    return new Response(
      JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: targetUserId,
          email: targetProfile.email,
          display_name: targetProfile.display_name
        }
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})