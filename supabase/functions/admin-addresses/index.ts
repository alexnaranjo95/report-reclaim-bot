import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreditorAddress {
  id?: string;
  creditor: string;
  bureau: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  created_by?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user has superadmin role
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roles, error: roleError } = await supabase.rpc('get_user_roles', {
      _user_id: user.id
    });

    if (roleError || !roles?.some((role: any) => role.role === 'superadmin')) {
      return new Response(JSON.stringify({ error: 'Superadmin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const method = req.method;

    if (method === 'GET') {
      // Handle search/filter for addresses
      const bureau = url.searchParams.get('bureau');
      const creditor = url.searchParams.get('creditor');
      const search = url.searchParams.get('search');

      let query = supabase.from('creditor_addresses').select('*');

      if (bureau) {
        query = query.eq('bureau', bureau);
      }
      if (creditor) {
        query = query.eq('creditor', creditor);
      }
      if (search) {
        query = query.or(`creditor.ilike.%${search}%,bureau.ilike.%${search}%,street.ilike.%${search}%,city.ilike.%${search}%`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching addresses:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch addresses' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (method === 'POST') {
      const body = await req.json();
      
      if (body.bulk && Array.isArray(body.addresses)) {
        // Handle bulk insert from CSV upload
        const addresses: CreditorAddress[] = body.addresses.map((addr: any) => ({
          ...addr,
          created_by: user.id
        }));

        // Check for duplicates - more efficient approach
        const existingCombos = new Set();
        
        if (addresses.length > 0) {
          const { data: existingAddresses } = await supabase
            .from('creditor_addresses')
            .select('creditor, bureau');
          
          if (existingAddresses) {
            existingAddresses.forEach(addr => {
              existingCombos.add(`${addr.creditor}-${addr.bureau}`);
            });
          }
        }

        const newAddresses = addresses.filter(
          addr => !existingCombos.has(`${addr.creditor}-${addr.bureau}`)
        );

        const skippedCount = addresses.length - newAddresses.length;

        if (newAddresses.length > 0) {
          const { data, error } = await supabase
            .from('creditor_addresses')
            .insert(newAddresses)
            .select();

          if (error) {
            console.error('Error bulk inserting addresses:', error);
            return new Response(JSON.stringify({ 
              error: 'Failed to insert addresses',
              details: error.message 
            }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          return new Response(JSON.stringify({ 
            data,
            inserted: newAddresses.length,
            skipped: skippedCount,
            message: `Inserted ${newAddresses.length} addresses, skipped ${skippedCount} duplicates`
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          return new Response(JSON.stringify({ 
            data: [],
            inserted: 0,
            skipped: skippedCount,
            message: 'All addresses were duplicates, none inserted'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        // Handle single address insert
        const address: CreditorAddress = {
          ...body,
          created_by: user.id
        };

        const { data, error } = await supabase
          .from('creditor_addresses')
          .insert([address])
          .select()
          .single();

        if (error) {
          console.error('Error inserting address:', error);
          return new Response(JSON.stringify({ 
            error: 'Failed to insert address',
            details: error.message 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (method === 'PUT') {
      const body = await req.json();
      const id = url.searchParams.get('id');

      if (!id) {
        return new Response(JSON.stringify({ error: 'Address ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from('creditor_addresses')
        .update(body)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating address:', error);
        return new Response(JSON.stringify({ 
          error: 'Failed to update address',
          details: error.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (method === 'DELETE') {
      const body = await req.json();
      const id = body.id || url.searchParams.get('id');

      if (!id) {
        return new Response(JSON.stringify({ error: 'Address ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase
        .from('creditor_addresses')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting address:', error);
        return new Response(JSON.stringify({ 
          error: 'Failed to delete address',
          details: error.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in admin-addresses function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});