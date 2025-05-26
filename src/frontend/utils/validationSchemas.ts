// src/frontend/utils/validationSchemas.ts
import { ValidationSchema } from '../hooks/forms/useFormValidation';

/**
 * Interface for signup form data
 */
export interface SignupFormData extends Record<string, unknown> {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

/**
 * Interface for login form data
 */
export interface LoginFormData extends Record<string, unknown> {
  email: string;
  password: string;
}

/**
 * Interface for reset password form data
 */
export interface ResetPasswordFormData extends Record<string, unknown> {
  password: string;
  confirmPassword: string;
}

/**
 * Email validation regex
 * This pattern checks for:
 * - At least one character before the @
 * - The @ symbol
 * - At least one character for the domain name
 * - A dot (.)
 * - At least two characters for the TLD
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Password validation requirements
 * These match the backend requirements for consistency
 */
export const PASSWORD_REQUIREMENTS = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

/**
 * Password validation function
 * Checks all password requirements
 */
export function validatePasswordStrength(password: string): string | undefined {
  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    return `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`;
  }

  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }

  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }

  if (PASSWORD_REQUIREMENTS.requireNumbers && !/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }

  if (PASSWORD_REQUIREMENTS.requireSpecialChars && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return 'Password must contain at least one special character';
  }

  return undefined;
}

/**
 * Validates that a string is not empty
 * @param value - The value to validate
 * @returns Error message or null if valid
 */
export const requiredField = (value: unknown): string | null => {
  return typeof value === 'string' && value.trim() ? null : 'This field is required';
};

/**
 * Validates an email address
 * @param email - The email to validate
 * @returns Error message or null if valid
 */
export const validateEmail = (email: unknown): string | null => {
  if (typeof email !== 'string') return 'Email must be a string';
  if (!email) return 'Email is required';
  if (!EMAIL_REGEX.test(email)) return 'Invalid email address';
  return null;
};

/**
 * Validates a password
 * @param password - The password to validate
 * @returns Error message or null if valid
 */
export const validatePassword = (password: unknown): string | null => {
  if (typeof password !== 'string') return 'Password must be a string';
  if (!password) return 'Password is required';

  // Use the new password strength validation
  const strengthError = validatePasswordStrength(password);
  if (strengthError) return strengthError;

  return null;
};

/**
 * Validates that passwords match
 * @param password - The password to compare
 * @param confirmPassword - The confirmation password
 * @returns Error message or null if valid
 */
export const validatePasswordsMatch = (password: string, confirmPassword: string): string | null => {
  if (password !== confirmPassword) return 'Passwords do not match';
  return null;
};

/**
 * Validation schema for signup form
 */
export const signupValidationSchema: ValidationSchema<SignupFormData> = {
  firstName: (value) => {
    if (typeof value !== 'string') return 'First name must be a string';
    return requiredField(value);
  },
  lastName: (value) => {
    if (typeof value !== 'string') return 'Last name must be a string';
    return requiredField(value);
  },
  email: (value) => validateEmail(value),
  password: (value) => validatePassword(value),
  confirmPassword: (value, data) => {
    const passwordError = validatePassword(value);
    if (passwordError) return passwordError;
    if (typeof value !== 'string' || typeof data.password !== 'string') {
      return 'Passwords must be strings';
    }
    return validatePasswordsMatch(data.password, value);
  }
};

/**
 * Validation schema for login form
 */
export const loginValidationSchema: ValidationSchema<LoginFormData> = {
  email: (value) => validateEmail(value),
  password: (value) => requiredField(value)
};

/**
 * Validation schema for reset password form
 */
export const resetPasswordValidationSchema: ValidationSchema<ResetPasswordFormData> = {
  password: (value) => validatePassword(value),
  confirmPassword: (value, data) => {
    const passwordError = validatePassword(value);
    if (passwordError) return passwordError;
    if (typeof value !== 'string' || typeof data.password !== 'string') {
      return 'Passwords must be strings';
    }
    return validatePasswordsMatch(data.password, value);
  }
};