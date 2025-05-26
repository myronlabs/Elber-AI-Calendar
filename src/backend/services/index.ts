// services/index.ts
// This file exports all services in a flat structure that can be imported consistently

export * from './supabaseAdmin';
export {
  sendVerificationEmail,
  sendPasswordResetEmail,
  generateVerificationToken
} from './emailService';
export * from './confirmationAnalyzer';

// OAuth services - complete token management system
export * from './errors/oauthErrors';
export { oauthConfigService } from './oauthConfigService';
export { oauthTokenManager } from './oauthTokenManager';

// Add any additional service exports here as needed