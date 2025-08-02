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
    // Handle both GET and POST requests for debugging
    let email: string;
    
    if (req.method === 'GET') {
      const url = new URL(req.url);
      email = url.searchParams.get('email') || '';
    } else if (req.method === 'POST') {
      const body = await req.json();
      email = body.email || '';
    } else {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    if (!email) {
      return new Response(
        JSON.stringify({ 
          error: 'email parameter is required',
          example_get: '/admin-debug-impersonate?email=user@example.com',
          example_post: '{ "email": "user@example.com" }'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`DEBUG ROUTE: Starting impersonation debug for email: ${email}`);

    // Create admin client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // First, find the user by email to get their user_id
    const { data: targetProfile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, email, display_name')
      .eq('email', email)
      .single();

    if (profileError || !targetProfile) {
      console.error('DEBUG ROUTE: Target user not found:', profileError);
      return new Response(
        JSON.stringify({ 
          error: 'Target user not found',
          email: email,
          profileError: profileError
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get admin user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: adminUser, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !adminUser.user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`DEBUG ROUTE: Admin user ${adminUser.user.id} requesting impersonation of ${targetProfile.user_id}`);

    // Call the impersonate-user function exactly as the UI does
    const impersonateResponse = await supabase.functions.invoke('impersonate-user', {
      body: {
        targetUserId: targetProfile.user_id,
        adminUserId: adminUser.user.id
      }
    });

    // Return comprehensive debug information
    const debugResponse = {
      timestamp: new Date().toISOString(),
      request: {
        email,
        method: req.method,
        url: req.url,
        authHeaderPresent: !!authHeader
      },
      targetProfile,
      adminUser: {
        id: adminUser.user.id,
        email: adminUser.user.email
      },
      impersonateFunction: {
        status: impersonateResponse.error ? 'ERROR' : 'SUCCESS',
        data: impersonateResponse.data,
        error: impersonateResponse.error,
        rawResponse: {
          hasData: !!impersonateResponse.data,
          hasError: !!impersonateResponse.error,
          errorMessage: impersonateResponse.error?.message
        }
      }
    };

    console.log('DEBUG ROUTE: Complete response:', JSON.stringify(debugResponse, null, 2));

    // Return the raw response with appropriate status
    const responseStatus = impersonateResponse.error ? 500 : 200;
    
    return new Response(
      JSON.stringify(debugResponse, null, 2),
      { 
        status: responseStatus,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('DEBUG ROUTE: Function error:', error);
    console.error('DEBUG ROUTE: Error stack:', error.stack);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        source: 'debug-route'
      }, null, 2),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});