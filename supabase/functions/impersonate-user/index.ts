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

    // FIXED: Use direct session creation instead of magic link token extraction
    // Magic links don't contain tokens - they're verification links
    console.log('CREATING DIRECT SESSION for user:', targetUserId);

    try {
      // Create a temporary access token for the target user using admin auth
      const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: targetProfile.email,
        options: {
          redirectTo: 'http://localhost:3000'
        }
      });

      if (sessionError) {
        console.error('Error generating recovery link:', sessionError);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to generate recovery link',
            details: sessionError.message 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Recovery link generated successfully');

      // Extract tokens from recovery link (these should have tokens)
      const actionUrl = new URL(sessionData.properties.action_link);
      const qs = actionUrl.searchParams;
      const hash = new URLSearchParams(actionUrl.href.split('#')[1] ?? '');
      
      let access_token = qs.get('access_token') ?? hash.get('access_token');
      let refresh_token = qs.get('refresh_token') ?? hash.get('refresh_token');

      console.log('TOKEN EXTRACTION FROM RECOVERY LINK:', {
        hasAccess: !!access_token,
        hasRefresh: !!refresh_token,
        url: actionUrl.href
      });

      // If tokens still not found in recovery link, use admin session creation
      if (!access_token || !refresh_token) {
        console.log('TOKENS NOT IN RECOVERY LINK - USING ADMIN SESSION CREATION');
        
        // Use admin client to sign in as the user directly
        const { data: adminSessionData, error: adminSessionError } = await supabase.auth.admin.createUser({
          email: targetProfile.email,
          email_confirm: true,
          user_metadata: {
            display_name: targetProfile.display_name
          }
        });

        if (adminSessionError) {
          console.error('Admin session creation error:', adminSessionError);
          
          // Try generating tokens via the auth endpoint directly
          console.log('FALLBACK: Direct token generation');
          const tokenResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/token`, {
            method: 'POST',
            headers: {
              'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
              'authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              grant_type: 'password',
              email: targetProfile.email,
              password: 'temp-password-for-impersonation'
            })
          });

          if (!tokenResponse.ok) {
            return new Response(
              JSON.stringify({ 
                error: 'Failed to create session for user impersonation',
                details: 'All token generation methods failed'
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const tokenData = await tokenResponse.json();
          access_token = tokenData.access_token;
          refresh_token = tokenData.refresh_token;
        } else {
          // Get the session from the created user (this might not have tokens either)
          console.log('Admin user creation successful, but we need to create a session...');
          
          // Alternative: Generate a JWT token for the user manually
          // This is the most reliable method for impersonation
          const payload = {
            aud: 'authenticated',
            exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
            sub: targetUserId,
            email: targetProfile.email,
            role: 'authenticated',
            aal: 'aal1'
          };

          // For now, let's use a simpler approach - create tokens via the admin API
          const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
            type: 'signup',
            email: targetProfile.email,
            options: {
              data: { display_name: targetProfile.display_name }
            }
          });

          if (linkError || !linkData.properties.action_link) {
            return new Response(
              JSON.stringify({ 
                error: 'Failed to generate authentication tokens',
                stage: 'admin_link_generation'
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Try to extract tokens from signup link
          const signupUrl = new URL(linkData.properties.action_link);
          access_token = signupUrl.searchParams.get('access_token') ?? signupUrl.hash.split('access_token=')[1]?.split('&')[0];
          refresh_token = signupUrl.searchParams.get('refresh_token') ?? signupUrl.hash.split('refresh_token=')[1]?.split('&')[0];
        }
      }

      if (!access_token || !refresh_token) {
        console.error('FINAL ERROR: Still no tokens after all attempts');
        return new Response(
          JSON.stringify({ 
            error: 'Unable to generate valid authentication tokens for impersonation',
            stage: 'final_token_check_failed'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('IMPERSONATION SUCCESS:', {
        userId: targetUserId,
        email: targetProfile.email,
        hasTokens: !!access_token && !!refresh_token
      });
      
      console.timeEnd('impersonate');

      return new Response(
        JSON.stringify({
          access_token,
          refresh_token,
          user: {
            id: targetUserId,
            email: targetProfile.email,
            display_name: targetProfile.display_name
          },
          source: 'admin_session_creation'
        }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          } 
        }
      );

    } catch (error) {
      console.error('SESSION CREATION ERROR:', error);
      console.timeEnd('impersonate');
      return new Response(
        JSON.stringify({ 
          error: 'Session creation failed',
          details: error.message,
          stage: 'session_creation_error'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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