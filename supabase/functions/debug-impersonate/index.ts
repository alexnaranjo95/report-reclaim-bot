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

  console.time('debug-impersonate');
  
  try {
    // Only allow GET requests for debug
    if (req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const adminUserId = url.searchParams.get('adminUserId');

    if (!email || !adminUserId) {
      return new Response(
        JSON.stringify({ 
          error: 'email and adminUserId query parameters are required',
          example: '/debug-impersonate?email=user@example.com&adminUserId=uuid'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('DEBUG: Starting impersonation debug for', { email, adminUserId });

    // Log environment variables (without exposing sensitive data)
    const env = {
      SUPABASE_URL: Deno.env.get('SUPABASE_URL') ? 'SET' : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'SET' : 'MISSING',
      SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY') ? 'SET' : 'MISSING',
    };
    console.log('DEBUG: Environment variables status:', env);

    // Create admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('DEBUG: Created Supabase client');

    // Call the actual impersonate function
    const impersonateResponse = await supabase.functions.invoke('impersonate-user', {
      body: {
        targetUserId: email, // For debug, we'll use email as identifier
        adminUserId: adminUserId
      }
    });

    console.log('DEBUG: Impersonate function response:', {
      data: impersonateResponse.data,
      error: impersonateResponse.error
    });

    // Return comprehensive debug information
    const debugInfo = {
      timestamp: new Date().toISOString(),
      request: {
        email,
        adminUserId,
        method: req.method,
        url: req.url
      },
      environment: env,
      impersonateResponse: {
        data: impersonateResponse.data,
        error: impersonateResponse.error
      },
      supabaseClient: {
        url: supabaseUrl,
        hasServiceKey: !!supabaseServiceKey
      }
    };

    console.timeEnd('debug-impersonate');

    return new Response(
      JSON.stringify(debugInfo, null, 2),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('DEBUG: Function error:', error);
    console.error('DEBUG: Error stack:', error.stack);
    console.timeEnd('debug-impersonate');
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
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