import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  userId: string;
  type: 'email' | 'sms';
  subject?: string;
  message: string;
  emailTemplate?: 'letter_response' | 'round_complete' | 'dispute_update';
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { userId, type, subject, message, emailTemplate }: NotificationRequest = await req.json();

    // Get user profile and preferences
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, phone, email_notifications, text_notifications, first_name, last_name')
      .eq('user_id', userId)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      return new Response(
        JSON.stringify({ error: "User profile not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    if (type === 'email' && profile.email_notifications && profile.email) {
      if (!sendgridApiKey) {
        console.error('SendGrid API key not configured');
        return new Response(
          JSON.stringify({ error: "Email service not configured" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      // Send email using SendGrid
      const emailData = {
        personalizations: [
          {
            to: [{ email: profile.email, name: `${profile.first_name} ${profile.last_name}` }],
            subject: subject || "Credit Repair Update"
          }
        ],
        from: { email: "noreply@creditrepair.com", name: "Credit Repair Pro" },
        content: [
          {
            type: "text/html",
            value: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #3b82f6;">Credit Repair Update</h2>
                <p>Hi ${profile.first_name},</p>
                <p>${message}</p>
                <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
                <p style="color: #6b7280; font-size: 14px;">
                  This is an automated notification from Credit Repair Pro.
                  You can manage your notification preferences in your account settings.
                </p>
              </div>
            `
          }
        ]
      };

      const emailResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData),
      });

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text();
        console.error('SendGrid error:', errorText);
        throw new Error(`SendGrid error: ${emailResponse.status}`);
      }

      console.log('Email sent successfully to:', profile.email);
    }

    if (type === 'sms' && profile.text_notifications && profile.phone) {
      // SMS functionality would go here (Twilio integration)
      console.log('SMS notification would be sent to:', profile.phone);
      console.log('Message:', message);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: {
          email: type === 'email' && profile.email_notifications && profile.email,
          sms: type === 'sms' && profile.text_notifications && profile.phone
        }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error) {
    console.error("Error in send-notification function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});