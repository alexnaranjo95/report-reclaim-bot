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
    // Create admin client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('Fetching all auth users...');

    // Get all auth users (requires service role)
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      console.error('Error fetching auth users:', authError);
      throw authError;
    }

    console.log(`Found ${authUsers.users.length} auth users`);

    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*, status')

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      throw profilesError;
    }

    console.log(`Found ${profiles?.length || 0} profiles`);

    // Get activity data
    const { data: sessions } = await supabase.from('sessions').select('user_id');
    const { data: letters } = await supabase.from('letters').select('user_id, status');
    const { data: rounds } = await supabase.from('rounds').select('user_id, status');

    // Process stats
    const sessionStats = sessions?.reduce((acc, session) => {
      acc[session.user_id] = (acc[session.user_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    const letterStats = letters?.reduce((acc, letter) => {
      if (!acc[letter.user_id]) {
        acc[letter.user_id] = { total: 0, sent: 0 };
      }
      acc[letter.user_id].total++;
      if (letter.status === 'sent') {
        acc[letter.user_id].sent++;
      }
      return acc;
    }, {} as Record<string, { total: number; sent: number }>) || {};

    const roundStats = rounds?.reduce((acc, round) => {
      if (!acc[round.user_id]) {
        acc[round.user_id] = { total: 0, active: 0 };
      }
      acc[round.user_id].total++;
      if (round.status === 'active') {
        acc[round.user_id].active++;
      }
      return acc;
    }, {} as Record<string, { total: number; active: number }>) || {};

    // Get user roles
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('user_id, role');

    const roleStats = userRoles?.reduce((acc, userRole) => {
      if (!acc[userRole.user_id]) {
        acc[userRole.user_id] = [];
      }
      acc[userRole.user_id].push(userRole.role);
      return acc;
    }, {} as Record<string, string[]>) || {};

    // Create profile lookup
    const profileLookup = profiles?.reduce((acc, profile) => {
      acc[profile.user_id] = profile;
      return acc;
    }, {} as Record<string, any>) || {};

    // Combine auth users with profile data
    const allUsers = authUsers.users.map(authUser => {
      const profile = profileLookup[authUser.id];
      const userSessions = sessionStats[authUser.id] || 0;
      const userLetters = letterStats[authUser.id] || { total: 0, sent: 0 };
      const userRounds = roundStats[authUser.id] || { total: 0, active: 0 };
      
      // Use database status if available, otherwise default to 'active'
      const status = profile?.status || 'active';

      // Get user's primary role (highest privilege)
      const userRolesList = roleStats[authUser.id] || [];
      let primaryRole = 'user'; // default
      if (userRolesList.includes('superadmin')) primaryRole = 'superadmin';
      else if (userRolesList.includes('admin')) primaryRole = 'admin';
      
      // Also check raw_app_metadata for role
      const metadataRole = authUser.raw_app_metadata?.role;
      if (metadataRole && !userRolesList.length) {
        primaryRole = metadataRole;
      }

      return {
        user_id: authUser.id,
        display_name: profile?.display_name || authUser.email || 'Unknown User',
        email: authUser.email || 'No email',
        total_sessions: userSessions,
        total_letters: userLetters.total,
        letters_sent: userLetters.sent,
        last_activity: authUser.last_sign_in_at || authUser.created_at,
        status,
        active_rounds: userRounds.active,
        user_created_at: authUser.created_at,
        has_profile: !!profile,
        database_status: profile?.status || null, // Keep track of what's in the database
        role: primaryRole
      };
    });

    console.log(`Returning ${allUsers.length} combined users`);

    return new Response(
      JSON.stringify(allUsers),
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