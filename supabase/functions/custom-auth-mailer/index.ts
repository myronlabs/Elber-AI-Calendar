import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'; // For verifying the hook secret

// Import from the Resend email client
import {
  sendEmail, // Generic sender
  sendPasswordResetViaDenoClient,
  sendVerificationEmailViaDenoClient,
  // Other senders will be implemented directly here
} from '../_shared/resendDenoClient.ts';

const HOOK_SECRET = Deno.env.get('SEND_EMAIL_HOOK_SECRET');
const SITE_URL = Deno.env.get('SITE_URL') || 'https://elber-ai.netlify.app'; // Your frontend site URL

interface Identity {
  id: string;
  user_id: string;
  identity_data?: Record<string, unknown>; // Provider-specific data
  provider: string;
  last_sign_in_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface SupabaseAuthHookPayload {
  type: 'VERIFY_USER_EMAIL' | 'SEND_MAGIC_LINK' | 'SEND_RECOVERY_EMAIL' | 'SEND_EMAIL_CHANGE_EMAIL' | 'SEND_INVITE_EMAIL';
  user: {
    id: string;
    aud: string;
    role: string;
    email: string;
    email_confirmed_at?: string;
    phone?: string;
    confirmed_at?: string;
    last_sign_in_at?: string;
    app_metadata: {
      provider?: string;
      providers?: string[];
    };
    user_metadata: {
      first_name?: string;
      last_name?: string;
    };
    identities?: Array<Identity>;
    created_at: string;
    updated_at: string;
  };
  email_data?: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    site_url?: string; 
    new_email?: string;
    token_new_email?: string;
  };
}


serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  if (!HOOK_SECRET) {
    console.error('SEND_EMAIL_HOOK_SECRET is not set.');
    return new Response('Internal Server Error: Hook secret not configured', { status: 500 });
  }

  const requestBody = await req.text();
  // Convert Headers to a plain object manually
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const wh = new Webhook(HOOK_SECRET);

  let payload: SupabaseAuthHookPayload;
  try {
    payload = wh.verify(requestBody, headers) as SupabaseAuthHookPayload;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return new Response('Unauthorized: Invalid signature', { status: 401 });
  }

  console.log('Received Auth Hook Payload:', JSON.stringify(payload, null, 2));

  const { type, user, email_data } = payload;
  const recipientEmail = user.email;
  const firstName = user.user_metadata?.first_name || ''; // Pass as undefined if empty string is not desired by template
  const hookSiteUrl = email_data?.site_url || SITE_URL; 

  try {
    switch (type) {
      case 'VERIFY_USER_EMAIL':
        if (email_data?.token_hash && recipientEmail && email_data.redirect_to) {
          const verificationLink = `${hookSiteUrl}/auth/v1/verify?token=${email_data.token_hash}&type=signup&redirect_to=${encodeURIComponent(email_data.redirect_to)}`;
          console.log(`Auth Hook: Sending verification email to ${recipientEmail} via Deno client.`);
          
          const { success, error } = await sendVerificationEmailViaDenoClient(recipientEmail, verificationLink, firstName);
          if (!success) throw new Error(error || 'Failed to send verification email via Resend Deno client');
          
          console.log(`Auth Hook: Successfully sent verification email to ${recipientEmail}`);
        } else {
          console.error('Auth Hook: Missing data for email verification.', { 
            recipientEmail, 
            token_hash: !!email_data?.token_hash, 
            redirect_to: !!email_data?.redirect_to 
          });
          throw new Error('Missing token_hash, recipient email, or redirect_to for email verification.');
        }
        break;

      case 'SEND_RECOVERY_EMAIL':
        if (email_data?.token_hash && recipientEmail && email_data.redirect_to) {
          const recoveryLink = `${hookSiteUrl}/auth/v1/verify?token=${email_data.token_hash}&type=recovery&redirect_to=${encodeURIComponent(email_data.redirect_to)}`;
          console.log(`Auth Hook: Sending password recovery email to ${recipientEmail} via Deno client.`);
          // Using the new Deno client helper
          const { success, error } = await sendPasswordResetViaDenoClient(recipientEmail, recoveryLink, firstName);
          if (!success) throw new Error(error || 'Failed to send recovery email via Resend Deno client');
        } else {
          console.error('Auth Hook: Missing data for password recovery.', { recipientEmail, token_hash: !!email_data?.token_hash, redirect_to: !!email_data?.redirect_to });
          throw new Error('Missing token_hash, recipient email, or redirect_to for password recovery.');
        }
        break;

      case 'SEND_MAGIC_LINK':
        if (email_data?.token_hash && recipientEmail && email_data.redirect_to) {
          const magicLink = `${hookSiteUrl}/auth/v1/verify?token=${email_data.token_hash}&type=magiclink&redirect_to=${encodeURIComponent(email_data.redirect_to)}`;
          console.log(`Auth Hook: Sending magic link email to ${recipientEmail}`);
          // Use the proper Deno client function for magic links
          const { success, error } = await sendMagicLinkViaDenoClient(recipientEmail, magicLink, firstName);
          if (!success) throw new Error(error instanceof Object ? error.message : error || 'Failed to send magic link');
        } else {
          console.error('Auth Hook: Missing data for magic link.', { recipientEmail, token_hash: !!email_data?.token_hash, redirect_to: !!email_data?.redirect_to });
          throw new Error('Missing data for magic link.');
        }
        break;
        
      case 'SEND_INVITE_EMAIL':
        if (email_data?.token_hash && recipientEmail && email_data.redirect_to) {
          const inviteLink = `${hookSiteUrl}/auth/v1/verify?token=${email_data.token_hash}&type=invite&redirect_to=${encodeURIComponent(email_data.redirect_to)}`;
          console.log(`Auth Hook: Sending invite email to ${recipientEmail}`);
          // Use the proper Deno client function for invites
          const { success, error } = await sendInviteViaDenoClient(recipientEmail, inviteLink, firstName);
          if (!success) throw new Error(error || 'Failed to send invite email');
        } else {
          console.error('Auth Hook: Missing data for user invitation.', { recipientEmail, token_hash: !!email_data?.token_hash, redirect_to: !!email_data?.redirect_to });
          throw new Error('Missing data for user invitation.');
        }
        break;

      case 'SEND_EMAIL_CHANGE_EMAIL':
        if (email_data?.token_hash && recipientEmail && email_data.redirect_to) {
          const typeSuffix = recipientEmail === email_data.new_email ? 'email_change_new' : 'email_change_current';
          const confirmationLink = `${hookSiteUrl}/auth/v1/verify?token=${email_data.token_hash}&type=${typeSuffix}&redirect_to=${encodeURIComponent(email_data.redirect_to)}`;
          console.log(`Auth Hook: Sending email change confirmation to ${recipientEmail} (New email: ${email_data.new_email || 'N/A'})`);
          // Use the proper Deno client function for email change confirmation
          const { success, error } = await sendEmailChangeViaDenoClient(recipientEmail, confirmationLink, firstName, email_data.new_email);
          if (!success) throw new Error(error || 'Failed to send email change confirmation');
        } else {
          console.error('Auth Hook: Missing data for email change.', { recipientEmail, token_hash: !!email_data?.token_hash, new_email: !!email_data?.new_email, redirect_to: !!email_data?.redirect_to });
          throw new Error('Missing data for email change.');
        }
        break;

      default:
        // Use a type assertion to inform TypeScript that `type` can be other string values
        console.warn(`Auth Hook: Received unhandled email type: ${(type as string)}`);
    }

    return new Response(JSON.stringify({ message: 'Email processed successfully by custom hook.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`Error processing auth hook for type ${type} for ${recipientEmail}:`, error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to process email via custom hook.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}); 