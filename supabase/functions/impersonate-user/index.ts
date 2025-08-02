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

  let reqBody;
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

    reqBody = await req.json();
    const { targetUserId, adminUserId } = reqBody;
    
    // Log comprehensive environment and request info
    const env = {
      SUPABASE_URL: Deno.env.get('SUPABASE_URL') ? 'SET' : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'SET' : 'MISSING',
      SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY') ? 'SET' : 'MISSING',
      PROJECT_REF: Deno.env.get('SUPABASE_URL')?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'UNKNOWN'
    };
    
    console.log('IMPERSONATE START:', { 
      reqBody, 
      env,
      timestamp: new Date().toISOString()
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
      
      // Enhanced token extraction using the exact pattern requested
      const url = new URL(magicLinkData.properties.action_link);
      const qs = url.searchParams;
      const hash = new URLSearchParams(magicLinkData.properties.action_link.split('#')[1] ?? '');
      const access = qs.get('access_token') ?? hash.get('access_token');
      const refresh = qs.get('refresh_token') ?? hash.get('refresh_token');

      console.log('TOKEN EXTRACTION:', { 
        queryStringTokens: {
          access_token: !!qs.get('access_token'),
          refresh_token: !!qs.get('refresh_token')
        },
        hashTokens: {
          access_token: !!hash.get('access_token'),
          refresh_token: !!hash.get('refresh_token')
        },
        finalTokens: {
          access: !!access,
          refresh: !!refresh
        }
      });

      // Fail-safe token generation - if either token is falsy, use refresh endpoint
      if (!access || !refresh) {
        console.log('TOKENS MISSING - ATTEMPTING FALLBACK:', { 
          hasAccess: !!access, 
          hasRefresh: !!refresh,
          fallbackRequired: true
        });
        
        if (!refresh) {
          console.error('CRITICAL ERROR: No refresh token available for fallback');
          return new Response(
            JSON.stringify({ 
              error: 'Failed to extract tokens from magic link - no refresh token available',
              debug: {
                actionLink: magicLinkData.properties.action_link,
                extractedTokens: { access: !!access, refresh: !!refresh },
                stage: 'token_extraction_failed'
              }
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fail-safe token generation using the exact pattern requested
        try {
          console.log('CALLING TOKEN REFRESH ENDPOINT...');
          const tokenResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { 
              apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
              'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ refresh_token: refresh })
          });

          console.log('TOKEN REFRESH RESPONSE:', {
            status: tokenResponse.status,
            ok: tokenResponse.ok,
            statusText: tokenResponse.statusText
          });

          const tokenData = await tokenResponse.json();
          
          if (tokenResponse.ok) {
            console.log('TOKEN REFRESH SUCCESS:', {
              hasAccessToken: !!tokenData.access_token,
              hasRefreshToken: !!tokenData.refresh_token,
              expiresIn: tokenData.expires_in
            });
            
            console.timeEnd('impersonate');
            
            return new Response(
              JSON.stringify({
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expires_in: tokenData.expires_in,
                user: {
                  id: targetUserId,
                  email: targetProfile.email,
                  display_name: targetProfile.display_name
                },
                source: 'token_refresh_fallback'
              }),
              { 
                headers: { 
                  ...corsHeaders, 
                  'Content-Type': 'application/json' 
                } 
              }
            );
          } else {
            console.error('TOKEN REFRESH FAILED:', tokenData);
            return new Response(
              JSON.stringify({ 
                error: 'Token refresh failed',
                details: tokenData,
                status: tokenResponse.status,
                stage: 'token_refresh_failed'
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } catch (refreshError) {
          console.error('TOKEN REFRESH ERROR:', refreshError);
          return new Response(
            JSON.stringify({ 
              error: 'Token refresh error',
              details: refreshError.message,
              stage: 'token_refresh_exception'
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      console.log('TOKENS SUCCESSFULLY EXTRACTED:', {
        userId: targetUserId,
        hasAccess: !!access,
        hasRefresh: !!refresh,
        source: 'magic_link_direct'
      });
      console.timeEnd('impersonate');

      return new Response(
        JSON.stringify({
          access_token: access,
          refresh_token: refresh,
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
    } catch (tokenParsingError) {
      console.error('TOKEN PARSING ERROR:', tokenParsingError);
      console.timeEnd('impersonate');
      return new Response(
        JSON.stringify({ 
          error: 'Failed to parse tokens from magic link',
          details: tokenParsingError.message,
          stage: 'token_parsing_error'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


  } catch (error) {
    console.error('FUNCTION ERROR:', error)
    console.error('ERROR STACK:', error.stack)
    console.timeEnd('impersonate');
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        stack: error.stack,
        timestamp: new Date().toISOString(),
        reqBody: reqBody || 'N/A',
        stage: 'function_error'
      }),
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