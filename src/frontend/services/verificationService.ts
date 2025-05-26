// src/frontend/services/verificationService.ts
import { VerificationStatus, ProfileData } from '../types/auth';

/**
 * Service to handle user verification status consistently across the application
 */
export class VerificationService {
  /**
   * Check if a user is verified by calling the backend
   * @param userId User ID to check
   * @param accessToken Current access token
   * @returns Verification status
   */
  public static async checkVerificationStatus(
    userId: string, 
    accessToken: string
  ): Promise<VerificationStatus> {
    if (!userId || !accessToken) {
      console.log('[VerificationService] Missing userId or token, returning UNKNOWN');
      return VerificationStatus.UNKNOWN;
    }

    try {
      console.log(`[VerificationService] Checking verification status for user: ${userId}`);
      const profileResponse = await fetch(`/.netlify/functions/get-profile`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (profileResponse.ok) {
        const profileData = await profileResponse.json() as ProfileData;
        console.log(`[VerificationService] Profile data received:`, profileData);
        
        if (profileData.is_custom_verified) {
          return VerificationStatus.VERIFIED;
        } else {
          return VerificationStatus.UNVERIFIED;
        }
      } else if (profileResponse.status === 404) {
        console.log(`[VerificationService] No profile found for user ${userId}`);
        return VerificationStatus.UNKNOWN;
      } else {
        console.error('[VerificationService] Error fetching profile status:', 
          profileResponse.status, await profileResponse.text());
        return VerificationStatus.UNKNOWN;
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error('[VerificationService] Exception during profile check:', err);
      return VerificationStatus.UNKNOWN;
    }
  }

  /**
   * Determine if a given flow should bypass verification
   * @param pathname Current path
   * @param authFlow Current authentication flow
   * @returns True if verification should be bypassed
   */
  public static shouldBypassVerification(
    pathname: string,
    authFlow: string | null
  ): boolean {
    // Check URL hash for password recovery tokens with improved token detection
    const hash = window.location.hash;
    const hasResetToken = !!hash && (
      hash.includes('type=recovery') ||
      hash.includes('access_token=') ||
      hash.includes('refresh_token=')
    );

    // Check for recovery flow in the session storage (for persistence across page loads)
    const hasRecoverySessionFlag = sessionStorage.getItem('elber_password_recovery_flow') === 'true';

    // Paths that should bypass verification
    const bypassPaths = [
      '/reset-password',
      '/verify-email',
      '/forgot-password'
    ];

    // Auth flows that should bypass verification
    const bypassFlows = [
      'PASSWORD_RECOVERY',
      'EMAIL_VERIFICATION',
      'USER_UPDATED'
    ];

    // Determine if verification should be bypassed with improved path checking
    const bypassPath = bypassPaths.some(path => pathname.startsWith(path) || pathname.includes(path));
    const bypassFlow = (authFlow !== null && bypassFlows.includes(authFlow));

    // If we're on the reset password page or have a reset token, set a flag in session storage
    // This helps maintain the recovery context across page refreshes
    if (pathname.includes('reset-password') || hasResetToken) {
      sessionStorage.setItem('elber_password_recovery_flow', 'true');
    }

    // Always bypass when there's a reset token, recovery session flag, or we're in a bypass flow/path
    const shouldBypass = bypassPath || bypassFlow || hasResetToken || hasRecoverySessionFlag;

    // Log detailed verification bypass decision for debugging
    console.log(`[VerificationService] Bypass verification decision:`, {
      pathname,
      authFlow,
      bypassPath,
      bypassFlow,
      decision: shouldBypass ? 'BYPASS' : 'ENFORCE',
      timestamp: new Date().toISOString()
    });

    return shouldBypass;
  }

  /**
   * Mark a user as verified in our system
   * @param userId User ID to verify
   * @returns Success status
   */
  public static async markUserAsVerified(userId: string): Promise<boolean> {
    if (!userId) {
      console.error('[VerificationService] Cannot verify null userId');
      return false;
    }

    try {
      console.log(`[VerificationService] Marking user ${userId} as verified`);
      
      // Call our backend to verify the user
      const response = await fetch('/.netlify/functions/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          // Pass a special token that indicates this is an automatic verification
          token: 'AUTO_VERIFY_ON_PASSWORD_RESET'
        })
      });

      if (!response.ok) {
        console.error('[VerificationService] Error marking user as verified:', 
          response.status, await response.text());
        return false;
      }

      const data = await response.json();
      console.log(`[VerificationService] User ${userId} successfully verified`, data);
      return true;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error('[VerificationService] Exception during verification:', err);
      return false;
    }
  }
}