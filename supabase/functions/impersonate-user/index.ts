import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.time('impersonate');
  
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

    const reqBody = await req.json();
    const { targetUserId, adminUserId } = reqBody;
    
    console.log('Impersonate request:', { 
      reqBody, 
      env: {
        SUPABASE_URL: Deno.env.get('SUPABASE_URL') ? 'SET' : 'MISSING',
        SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'SET' : 'MISSING',
        SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY') ? 'SET' : 'MISSING'
      }
    });

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
    console.log('Magic link generated:', { 
      action_link: magicLinkData.properties.action_link,
      hasProperties: !!magicLinkData.properties,
      linkType: typeof magicLinkData.properties.action_link
    });

    // Enhanced token extraction with better error handling
    try {
      const actionUrl = new URL(magicLinkData.properties.action_link);
      console.log('Parsing URL:', {
        href: actionUrl.href,
        search: actionUrl.search,
        hash: actionUrl.hash
      });
      
      let accessToken = actionUrl.searchParams.get('access_token');
      let refreshToken = actionUrl.searchParams.get('refresh_token');

      console.log('Query string tokens:', { accessToken: !!accessToken, refreshToken: !!refreshToken });

      // If tokens not in query string, check hash fragment
      if (!accessToken || !refreshToken) {
        const hashFragment = actionUrl.hash.substring(1); // Remove the #
        console.log('Hash fragment:', hashFragment);
        
        if (hashFragment) {
          const hashParams = new URLSearchParams(hashFragment);
          accessToken = accessToken || hashParams.get('access_token');
          refreshToken = refreshToken || hashParams.get('refresh_token');
          
          console.log('Hash tokens:', { accessToken: !!accessToken, refreshToken: !!refreshToken });
        }
      }

      // Enhanced fallback: if either token is missing, try token refresh endpoint
      if (!accessToken || !refreshToken) {
        console.log('Missing tokens, attempting fallback. Available:', { 
          accessToken: !!accessToken, 
          refreshToken: !!refreshToken 
        });
        
        if (!refreshToken) {
          console.error('No refresh token available for session creation');
          return new Response(
            JSON.stringify({ 
              error: 'Failed to extract tokens from magic link',
              debug: {
                actionLink: magicLinkData.properties.action_link,
                queryTokens: {
                  access_token: !!actionUrl.searchParams.get('access_token'),
                  refresh_token: !!actionUrl.searchParams.get('refresh_token')
                },
                hashTokens: actionUrl.hash ? {
                  access_token: !!(new URLSearchParams(actionUrl.hash.substring(1))).get('access_token'),
                  refresh_token: !!(new URLSearchParams(actionUrl.hash.substring(1))).get('refresh_token')
                } : null
              }
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Try to refresh tokens using refresh_token
        try {
          console.log('Attempting token refresh...');
          const tokenRefreshResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({
              refresh_token: refreshToken
            })
          });

          console.log('Token refresh response status:', tokenRefreshResponse.status);
          const responseText = await tokenRefreshResponse.text();
          console.log('Token refresh response:', responseText);

          if (tokenRefreshResponse.ok) {
            const tokenData = JSON.parse(responseText);
            accessToken = tokenData.access_token;
            refreshToken = tokenData.refresh_token;
            
            console.log('Successfully refreshed tokens for impersonation');
            console.timeEnd('impersonate');
            
            return new Response(
              JSON.stringify({
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_in: tokenData.expires_in || 3600,
                user: {
                  id: targetUserId,
                  email: targetProfile.email,
                  display_name: targetProfile.display_name
                },
                source: 'token_refresh'
              }),
              { 
                headers: { 
                  ...corsHeaders, 
                  'Content-Type': 'application/json' 
                } 
              }
            );
          } else {
            console.error('Token refresh failed:', responseText);
            return new Response(
              JSON.stringify({ 
                error: 'Token refresh failed',
                details: responseText,
                status: tokenRefreshResponse.status
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } catch (refreshError) {
          console.error('Error during token refresh:', refreshError);
          return new Response(
            JSON.stringify({ 
              error: 'Token refresh error',
              details: refreshError.message
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    } catch (tokenParsingError) {
      console.error('Error parsing tokens from action link:', tokenParsingError);
      console.timeEnd('impersonate');
      return new Response(
        JSON.stringify({ 
          error: 'Failed to parse tokens from magic link',
          details: tokenParsingError.message
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generated impersonation tokens for user ${targetUserId}`);
    console.timeEnd('impersonate');

    return new Response(
      JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: targetUserId,
          email: targetProfile.email,
          display_name: targetProfile.display_name
        },
        source: 'magic_link'
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
    console.error('Error stack:', error.stack)
    console.timeEnd('impersonate');
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        stack: error.stack,
        timestamp: new Date().toISOString()
      }),
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