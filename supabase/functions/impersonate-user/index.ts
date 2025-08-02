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
    const { email, adminUserId } = reqBody;
    
    console.log('IMPERSONATE START:', { 
      email,
      adminUserId,
      timestamp: new Date().toISOString()
    });

    if (!email || !adminUserId) {
      return new Response(
        JSON.stringify({ error: 'email and adminUserId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin ${adminUserId} attempting to impersonate user with email ${email}`);

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

    // Check if target user exists
    const { data: targetProfile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, email, display_name, status')
      .eq('email', email)
      .single();

    if (profileError || !targetProfile) {
      console.error('Error fetching target user profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'Target user not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ROBUST IMPERSONATION: Use official OTP-verify flow
    console.log('GENERATING MAGIC LINK WITH OTP for user:', targetProfile.user_id);

    // Generate magic link to get OTP
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: targetProfile.email
    });

    if (linkError) {
      console.error('Error generating magic link:', linkError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate magic link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract OTP from the magic link data - skip parsing the URL entirely
    const otp = linkData.properties?.otp;

    if (!otp) {
      console.error('No OTP found in magic link data:', linkData);
      return new Response(
        JSON.stringify({ error: 'Failed to extract OTP from magic link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('OTP EXTRACTED SUCCESSFULLY:', { hasOtp: !!otp });

    // Verify OTP to get valid session tokens
    const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
      email: targetProfile.email,
      token: otp,
      type: 'email'
    });

    if (verifyError || !sessionData.session) {
      console.error('OTP verification failed:', verifyError);
      return new Response(
        JSON.stringify({ 
          error: 'OTP verification failed',
          details: verifyError?.message || 'No session data returned'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('OTP VERIFICATION SUCCESS:', {
      userId: sessionData.user?.id,
      email: sessionData.user?.email,
      hasAccessToken: !!sessionData.session.access_token,
      hasRefreshToken: !!sessionData.session.refresh_token
    });

    console.timeEnd('impersonate');

    // Return valid session tokens
    return new Response(
      JSON.stringify({
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        expires_in: sessionData.session.expires_in,
        user: {
          id: sessionData.user.id,
          email: sessionData.user.email,
          display_name: targetProfile.display_name
        },
        source: 'otp_verification'
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('FUNCTION ERROR:', error)
    console.error('ERROR STACK:', error.stack)
    console.timeEnd('impersonate');
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        stack: error.stack,
        timestamp: new Date().toISOString(),
        reqBody: reqBody || 'N/A'
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