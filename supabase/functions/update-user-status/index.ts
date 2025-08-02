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

    const { targetUserId, status, adminUserId } = await req.json();

    if (!targetUserId || !status || !adminUserId) {
      return new Response(
        JSON.stringify({ error: 'targetUserId, status, and adminUserId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return new Response(
        JSON.stringify({ error: 'Invalid status. Must be active, inactive, or suspended' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin ${adminUserId} updating user ${targetUserId} status to ${status}`);

    // Verify the requesting user is a superadmin
    const { data: adminRoles, error: rolesError } = await supabase.rpc('get_user_roles', {
      _user_id: adminUserId
    });

    if (rolesError || !adminRoles?.some((role: any) => role.role === 'superadmin')) {
      console.error('Unauthorized status update attempt:', adminUserId);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update user status in the database
    const { data, error } = await supabase
      .from('profiles')
      .update({ status })
      .eq('user_id', targetUserId)
      .select('status, email, display_name')
      .single();

    if (error) {
      console.error('Error updating user status:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to update user status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully updated user ${targetUserId} status to ${status}`);

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: targetUserId,
          status: data.status,
          email: data.email,
          display_name: data.display_name
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