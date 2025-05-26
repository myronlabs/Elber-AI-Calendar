// src/frontend/components/PasswordStrengthIndicator.tsx
import React, { useMemo } from 'react';
import Badge from '../common/Badge';
import { getPasswordStrengthVariant } from '../../utils/badgeHelpers';

interface PasswordStrengthIndicatorProps {
  password: string;
  showFeedback?: boolean;
}

interface PasswordStrength {
  score: number;
  feedback: string[];
  isValid: boolean;
}

const DEFAULT_PASSWORD_REQUIREMENTS = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

function validatePassword(password: string): PasswordStrength {
  const feedback: string[] = [];
  let score = 0;

  if (!password) {
    return { score: 0, feedback: [], isValid: false };
  }

  // Length check
  if (password.length < DEFAULT_PASSWORD_REQUIREMENTS.minLength) {
    feedback.push(`At least ${DEFAULT_PASSWORD_REQUIREMENTS.minLength} characters`);
  } else {
    score++;
    if (password.length >= 16) score++;
    if (password.length >= 20) score++;
  }

  // Uppercase check
  if (!/[A-Z]/.test(password)) {
    feedback.push('One uppercase letter');
  } else {
    score++;
  }

  // Lowercase check
  if (!/[a-z]/.test(password)) {
    feedback.push('One lowercase letter');
  } else {
    score++;
  }

  // Number check
  if (!/[0-9]/.test(password)) {
    feedback.push('One number');
  } else {
    score++;
  }

  // Special character check
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    feedback.push('One special character');
  } else {
    score++;
  }

  // Common patterns check
  const commonPatterns = [
    /^(password|123456|qwerty|abc123|letmein)/i,
    /^(\d)\1+$/,
    /^([a-z])\1+$/i,
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      feedback.push('Avoid common patterns');
      score = Math.max(0, score - 2);
      break;
    }
  }

  const isValid = feedback.length === 0;

  return {
    score: Math.min(5, score),
    feedback,
    isValid,
  };
}

const PasswordStrengthIndicator: React.FC<PasswordStrengthIndicatorProps> = ({
  password,
  showFeedback = true,
}) => {
  const strength = useMemo(() => validatePassword(password), [password]);

  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  const badgeVariant = getPasswordStrengthVariant(strength.score);

  if (!password) {
    return null;
  }

  return (
    <div className="password-strength-indicator">
      <div className="strength-bars">
        {[...Array(5)].map((_, index) => (
          <div
            key={index}
            className={`strength-bar strength-bar--${badgeVariant} ${index < strength.score ? 'active' : ''}`}
          />
        ))}
      </div>
      
      <Badge variant={badgeVariant} size="small" className="strength-label">
        {strengthLabels[strength.score]}
      </Badge>

      {showFeedback && strength.feedback.length > 0 && (
        <ul className="strength-feedback">
          {strength.feedback.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

export { PasswordStrengthIndicator };