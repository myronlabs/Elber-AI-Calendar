// supabase/functions/_shared/resendDenoClient.ts

interface ResendError {
  name: string;
  message: string;
}

interface ResendSuccess {
  id: string;
}

interface SendEmailOptions {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  bcc?: string | string[];
  cc?: string | string[];
  reply_to?: string;
  tags?: Array<{ name: string; value: string }>;
}

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail(
  options: SendEmailOptions,
): Promise<{ success: boolean; data?: ResendSuccess; error?: ResendError | string }> {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set in environment variables.");
    return { success: false, error: "Resend API key is not configured." };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: options.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        bcc: options.bcc,
        cc: options.cc,
        reply_to: options.reply_to,
        tags: options.tags,
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("Resend API Error:", responseData);
      // Assuming error structure from Resend is { name: string, message: string }
      const error = responseData as ResendError || { name: "UnknownError", message: "Failed to send email via Resend" };
      return { success: false, error };
    }

    return { success: true, data: responseData as ResendSuccess };
  } catch (e) {
    console.error("Error calling Resend API:", e);
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Example helper for sending a password reset email
// You would create similar helpers for other email types (magic link, invite, etc.)
// or construct the options directly in the custom-auth-mailer.
export async function sendPasswordResetViaDenoClient(
  to: string,
  resetLink: string,
  firstName?: string,
): Promise<{ success: boolean; error?: string }> {
  const subject = "Reset Your Password";
  // Basic HTML body, you should use more robust templating
  const htmlBody = `
    <p>Hello ${firstName || "User"},</p>
    <p>You requested a password reset. Click the link below to reset your password:</p>
    <p><a href="${resetLink}">Reset Password</a></p>
    <p>If you did not request this, please ignore this email.</p>
  `;

  const SENDER_EMAIL = Deno.env.get("EMAIL_FROM") || "onboarding@resend.dev";
  // Ensure SENDER_EMAIL_FROM is set in your Supabase Edge Function environment variables
  // and is a verified domain/email in Resend.

  const result = await sendEmail({
    from: `Elber Platform <${SENDER_EMAIL}>`, // Or your desired "from" address
    to: to,
    subject: subject,
    html: htmlBody,
  });

  return { success: result.success, error: result.error ? (typeof result.error === 'string' ? result.error : result.error.message) : undefined };
}

export async function sendMagicLinkViaDenoClient(
  to: string,
  magicLink: string,
  firstName?: string,
): Promise<{ success: boolean; error?: string }> {
  const subject = "Your Magic Link to Sign In";
  
  // Styled HTML email template based on the verification email design
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Your Magic Link to Sign In</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .container {
          background-color: #f9f9f9;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);
        }
        h1 {
          color: #1a73e8;
        }
        .button {
          display: inline-block;
          background-color: #1a73e8;
          color: white;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 4px;
          font-weight: bold;
          margin: 20px 0;
        }
        .footer {
          font-size: 12px;
          color: #666;
          margin-top: 30px;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Sign In to Elber</h1>
        <p>Hello ${firstName || "User"},</p>
        <p>Here's your magic link to sign in to your Elber account:</p>
        
        <a href="${magicLink}" class="button">Sign In Now</a>
        
        <p>If you did not request this link, you can safely ignore this email.</p>
        
        <div class="footer">
          <p>This email was sent from Elber, your AI-powered CRM assistant.</p>
          <p>&copy; ${new Date().getFullYear()} Elber AI. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "onboarding@resend.dev";

  const result = await sendEmail({
    from: `Elber AI <${EMAIL_FROM}>`,
    to: to,
    subject: subject,
    html: htmlBody,
  });

  return { 
    success: result.success, 
    error: result.error ? (typeof result.error === 'string' ? result.error : result.error.message) : undefined 
  };
}

export async function sendInviteViaDenoClient(
  to: string,
  inviteLink: string,
  firstName?: string,
): Promise<{ success: boolean; error?: string }> {
  const subject = "You've Been Invited to Join Elber AI";
  
  // Styled HTML email template based on the verification email design
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>You've Been Invited to Join Elber AI</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .container {
          background-color: #f9f9f9;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);
        }
        h1 {
          color: #1a73e8;
        }
        .button {
          display: inline-block;
          background-color: #1a73e8;
          color: white;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 4px;
          font-weight: bold;
          margin: 20px 0;
        }
        .footer {
          font-size: 12px;
          color: #666;
          margin-top: 30px;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>You're Invited!</h1>
        <p>Hello,</p>
        <p>${firstName || 'Someone'} has invited you to join Elber AI, the intelligent CRM platform.</p>
        <p>Click the button below to create your account:</p>
        
        <a href="${inviteLink}" class="button">Accept Invitation</a>
        
        <p>If you did not expect this invitation, you can safely ignore this email.</p>
        
        <div class="footer">
          <p>This email was sent from Elber, your AI-powered CRM assistant.</p>
          <p>&copy; ${new Date().getFullYear()} Elber AI. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "onboarding@resend.dev";

  const result = await sendEmail({
    from: `Elber AI <${EMAIL_FROM}>`,
    to: to,
    subject: subject,
    html: htmlBody,
  });

  return { 
    success: result.success, 
    error: result.error ? (typeof result.error === 'string' ? result.error : result.error.message) : undefined 
  };
}

export async function sendVerificationEmailViaDenoClient(
  to: string,
  verificationLink: string,
  firstName?: string,
): Promise<{ success: boolean; error?: string }> {
  const subject = "Verify Your Email Address";
  
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Verify Your Email Address</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .container {
          background-color: #f9f9f9;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);
        }
        h1 {
          color: #1a73e8;
        }
        .button {
          display: inline-block;
          background-color: #1a73e8;
          color: white;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 4px;
          font-weight: bold;
          margin: 20px 0;
        }
        .footer {
          font-size: 12px;
          color: #666;
          margin-top: 30px;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Welcome to Elber!</h1>
        <p>Hello ${firstName || "User"},</p>
        <p>Thank you for signing up! Please verify your email address by clicking the button below:</p>
        
        <a href="${verificationLink}" class="button">Verify Email Address</a>
        
        <p>If you did not sign up for an account, please ignore this email.</p>
        
        <div class="footer">
          <p>This email was sent from Elber, your AI-powered CRM assistant.</p>
          <p>&copy; ${new Date().getFullYear()} Elber AI. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "onboarding@resend.dev";

  const result = await sendEmail({
    from: `Elber AI <${EMAIL_FROM}>`,
    to: to,
    subject: subject,
    html: htmlBody,
  });

  return { 
    success: result.success, 
    error: result.error ? (typeof result.error === 'string' ? result.error : result.error.message) : undefined 
  };
}

export async function sendEmailChangeViaDenoClient(
  to: string,
  confirmationLink: string,
  firstName?: string,
  newEmail?: string,
): Promise<{ success: boolean; error?: string }> {
  const isNewEmail = newEmail === to;
  const subject = isNewEmail 
    ? "Confirm Your New Email Address" 
    : "Your Email Address Is Being Changed";
  
  let htmlBody;
  
  if (isNewEmail) {
    htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Confirm Your New Email Address</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background-color: #f9f9f9;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);
          }
          h1 {
            color: #1a73e8;
          }
          .button {
            display: inline-block;
            background-color: #1a73e8;
            color: white;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 4px;
            font-weight: bold;
            margin: 20px 0;
          }
          .footer {
            font-size: 12px;
            color: #666;
            margin-top: 30px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Confirm Your New Email Address</h1>
          <p>Hello,</p>
          <p>Please confirm this new email address for your Elber AI account by clicking the button below:</p>
          
          <a href="${confirmationLink}" class="button">Confirm Email</a>
          
          <p>If you did not request this change, please ignore this email, and your account email will remain unchanged.</p>
          
          <div class="footer">
            <p>This email was sent from Elber, your AI-powered CRM assistant.</p>
            <p>&copy; ${new Date().getFullYear()} Elber AI. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  } else {
    htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Your Email Address Is Being Changed</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background-color: #f9f9f9;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);
          }
          h1 {
            color: #1a73e8;
          }
          .button {
            display: inline-block;
            background-color: #1a73e8;
            color: white;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 4px;
            font-weight: bold;
            margin: 20px 0;
          }
          .footer {
            font-size: 12px;
            color: #666;
            margin-top: 30px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Email Change Request</h1>
          <p>Hello ${firstName || 'User'},</p>
          <p>We received a request to change your Elber AI account email address to: <strong>${newEmail || 'a new email address'}</strong>.</p>
          <p>If you did not request this change, please click the button below to cancel:</p>
          
          <a href="${confirmationLink}" class="button">Cancel Email Change</a>
          
          <p>If you did request this change, no action is needed.</p>
          
          <div class="footer">
            <p>This email was sent from Elber, your AI-powered CRM assistant.</p>
            <p>&copy; ${new Date().getFullYear()} Elber AI. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "onboarding@resend.dev";

  const result = await sendEmail({
    from: `Elber AI <${EMAIL_FROM}>`,
    to: to,
    subject: subject,
    html: htmlBody,
  });

  return { 
    success: result.success, 
    error: result.error ? (typeof result.error === 'string' ? result.error : result.error.message) : undefined 
  };
} 