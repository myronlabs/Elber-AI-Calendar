"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateVerificationToken = exports.sendPasswordResetEmail = exports.sendVerificationEmail = void 0;
const resend_1 = require("resend");
// Initialize Resend with API key from environment variables
const resendApiKey = process.env.RESEND_API_KEY;
// Use verified domain email address for production sending
const fromEmail = 'Elber AI <notifications@myronlabs.net>';
const frontendUrl = process.env.FRONTEND_URL || 'https://elber-ai.netlify.app';
if (!resendApiKey) {
    console.error('CRITICAL: RESEND_API_KEY environment variable is not set. Email service will not function properly.');
}
const resend = new resend_1.Resend(resendApiKey);
/**
 * Sends a verification email to a new user after signup
 * @param email User's email address
 * @param firstName User's first name
 * @param userId User's ID
 * @param token The token to include in the verification link
 * @returns Result of the email send operation
 */
const sendVerificationEmail = async (email, firstName, userId, token) => {
    try {
        console.log(`[EmailService] Sending verification email to: ${email}`);
        const verificationLink = `${frontendUrl}/verify-email?id=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;
        const htmlContent = `
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
          .verification-code {
            font-size: 24px;
            font-weight: bold;
            letter-spacing: 5px;
            color: #1a73e8;
            background-color: #f0f7ff;
            padding: 15px;
            border-radius: 4px;
            display: inline-block;
            margin: 20px 0;
            border: 1px dashed #1a73e8;
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
          <p>Hello ${firstName},</p>
          <p>Thank you for signing up for Elber. To complete your registration and verify your email address, please use the verification code below:</p>
          
          <div class="verification-code">${token}</div>
          
          <p>Enter this code on the verification page to activate your account.</p>
          
          <p>Alternatively, you can click the link below to verify your email:</p>
          <a href="${verificationLink}" class="button">Verify Email Address</a>
          
          <p>If you did not sign up for an Elber account, you can safely ignore this email.</p>
          
          <div class="footer">
            <p>This email was sent from Elber, your AI-powered networking assistant.</p>
            <p>&copy; ${new Date().getFullYear()} Elber AI. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: email,
            subject: 'Verify Your Elber Account',
            html: htmlContent,
        });
        if (error) {
            console.error(`[EmailService] Error sending verification email:`, error);
            return { success: false, message: 'Failed to send verification email', error };
        }
        console.log(`[EmailService] Successfully sent verification email. ID: ${data?.id}`);
        return { success: true, message: 'Verification email sent successfully' };
    }
    catch (error) {
        console.error('[EmailService] Unexpected error sending verification email:', error);
        return { success: false, message: 'An unexpected error occurred while sending verification email', error };
    }
};
exports.sendVerificationEmail = sendVerificationEmail;
/**
 * Sends a password reset email
 * @param email User's email address
 * @param resetLink The password reset link
 * @returns Result of the email send operation
 */
const sendPasswordResetEmail = async (email, resetLink) => {
    try {
        console.log(`[EmailService] Preparing to send password reset email to: ${email}`);
        const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reset Your Password</title>
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
          <h1>Reset Your Password</h1>
          <p>Hello,</p>
          <p>We received a request to reset your password for your Elber account. To reset your password, please click the button below:</p>
          
          <a href="${resetLink}" class="button">Reset Password</a>
          
          <p>If you did not request a password reset, you can safely ignore this email.</p>
          
          <p>If the button above doesn't work, you can copy and paste the following link into your browser:</p>
          <p>${resetLink}</p>
          
          <div class="footer">
            <p>This email was sent from Elber, your AI-powered networking assistant.</p>
            <p>&copy; ${new Date().getFullYear()} Elber AI. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        const { error } = await resend.emails.send({
            from: fromEmail,
            to: email,
            subject: `Reset Your Elber Password`,
            html: htmlContent,
        });
        if (error) {
            console.error(`[EmailService] Error sending password reset email:`, error);
            return { success: false, message: 'Failed to send password reset email', error };
        }
        // Successfully sent log was removed as per previous instructions
        return { success: true, message: 'Password reset email sent successfully' };
    }
    catch (error) {
        const catchError = error; // Ensure 'error' is typed as 'unknown'
        console.error('[EmailService] Unexpected error sending password reset email:', catchError);
        return { success: false, message: 'An unexpected error occurred while sending password reset email', error: catchError };
    }
};
exports.sendPasswordResetEmail = sendPasswordResetEmail;
/**
 * Generates a verification token
 * This is a simple implementation - in production, you'd want something more secure
 */
const generateVerificationToken = () => {
    // Generate a simple 6-digit verification code for easier user input
    return Math.floor(100000 + Math.random() * 900000).toString();
};
exports.generateVerificationToken = generateVerificationToken;
//# sourceMappingURL=emailService.js.map