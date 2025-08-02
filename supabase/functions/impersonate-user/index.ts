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

    // Generate magic link for the target user
    const { data: magicLinkData, error: magicLinkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: targetProfile.email
    });

    if (magicLinkError) {
      console.error('Error generating magic link:', magicLinkError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate magic link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the action link for debugging
    console.log({ action_link: magicLinkData.properties.action_link });

    // Parse both query string and hash fragment for tokens
    try {
      const actionUrl = new URL(magicLinkData.properties.action_link);
      let accessToken = actionUrl.searchParams.get('access_token');
      let refreshToken = actionUrl.searchParams.get('refresh_token');

      // If tokens not in query string, check hash fragment
      if (!accessToken || !refreshToken) {
        const hashParams = new URLSearchParams(actionUrl.hash.substring(1));
        accessToken = accessToken || hashParams.get('access_token');
        refreshToken = refreshToken || hashParams.get('refresh_token');
      }

      // If still missing tokens, try token refresh endpoint
      if (!refreshToken) {
        console.error('No refresh token available for session creation');
        return new Response(
          JSON.stringify({ error: 'Failed to extract tokens from magic link' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If access token is missing, refresh it using the refresh token
      if (!accessToken && refreshToken) {
      try {
        const tokenRefreshResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': Deno.env.get('SUPABASE_ANON_KEY')!
          },
          body: JSON.stringify({
            refresh_token: refreshToken
          })
        });

        if (tokenRefreshResponse.ok) {
          const tokenData = await tokenRefreshResponse.json();
          accessToken = tokenData.access_token;
          refreshToken = tokenData.refresh_token;
          
          console.log('Successfully refreshed tokens for impersonation');
          
          return new Response(
            JSON.stringify({
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_in: tokenData.expires_in || 3600,
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
          );
        } else {
          console.error('Token refresh failed:', await tokenRefreshResponse.text());
        }
      } catch (refreshError) {
        console.error('Error refreshing token:', refreshError);
      }
      }
    } catch (tokenParsingError) {
      console.error('Error parsing tokens from action link:', tokenParsingError);
      return new Response(
        JSON.stringify({ error: 'Failed to parse tokens from magic link' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { 
        status: 400,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})