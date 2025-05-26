"use strict";
// src/backend/utils/passwordValidator.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PASSWORD_REQUIREMENTS = void 0;
exports.validatePassword = validatePassword;
exports.generatePasswordStrengthMessage = generatePasswordStrengthMessage;
exports.checkPasswordBreach = checkPasswordBreach;
const crypto_1 = __importDefault(require("crypto"));
const node_fetch_1 = __importDefault(require("node-fetch"));
exports.DEFAULT_PASSWORD_REQUIREMENTS = {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
};
function validatePassword(password, requirements = exports.DEFAULT_PASSWORD_REQUIREMENTS) {
    const feedback = [];
    let score = 0;
    // Length check
    if (password.length < requirements.minLength) {
        feedback.push(`Password must be at least ${requirements.minLength} characters long`);
    }
    else {
        score++;
        // Extra points for longer passwords
        if (password.length >= 16)
            score++;
        if (password.length >= 20)
            score++;
    }
    // Uppercase check
    if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
        feedback.push('Password must contain at least one uppercase letter');
    }
    else if (requirements.requireUppercase) {
        score++;
    }
    // Lowercase check
    if (requirements.requireLowercase && !/[a-z]/.test(password)) {
        feedback.push('Password must contain at least one lowercase letter');
    }
    else if (requirements.requireLowercase) {
        score++;
    }
    // Number check
    if (requirements.requireNumbers && !/[0-9]/.test(password)) {
        feedback.push('Password must contain at least one number');
    }
    else if (requirements.requireNumbers) {
        score++;
    }
    // Special character check
    if (requirements.requireSpecialChars && !/[!@#$%^&*()_+=;:'",.<>?|{}[\]]/.test(password)) {
        feedback.push('Password must contain at least one special character');
    }
    else if (requirements.requireSpecialChars) {
        score++;
    }
    // Additional checks for password strength
    // Check for common patterns
    const commonPatterns = [
        /^(password|123456|qwerty|abc123|letmein|monkey|dragon)/i,
        /^(\d)\1+$/, // Repeated digits
        /^([a-z])\1+$/i, // Repeated letters
        /^(abcd|1234|qwert|asdf)/i, // Sequential patterns
    ];
    for (const pattern of commonPatterns) {
        if (pattern.test(password)) {
            feedback.push('Password contains common patterns that are easy to guess');
            score = Math.max(0, score - 2);
            break;
        }
    }
    // Check for variety of character types
    const types = [
        /[a-z]/.test(password),
        /[A-Z]/.test(password),
        /[0-9]/.test(password),
        /[^a-zA-Z0-9]/.test(password),
    ].filter(Boolean).length;
    if (types >= 4) {
        score++;
    }
    const isValid = feedback.length === 0;
    return {
        score: Math.min(5, score),
        feedback,
        isValid,
    };
}
function generatePasswordStrengthMessage(strength) {
    const scoreMessages = [
        'Very Weak',
        'Weak',
        'Fair',
        'Good',
        'Strong',
        'Very Strong',
    ];
    return scoreMessages[strength.score] || 'Unknown';
}
// Check if password was previously breached using Have I Been Pwned API
async function checkPasswordBreach(password) {
    try {
        const hash = crypto_1.default.createHash('sha1').update(password).digest('hex').toUpperCase();
        const prefix = hash.substring(0, 5);
        const suffix = hash.substring(5);
        // Use node-fetch for server-side fetch
        const response = await (0, node_fetch_1.default)(`https://api.pwnedpasswords.com/range/${prefix}`, {
            headers: {
                'User-Agent': 'Elber-CRM-Security-Check'
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.text();
        const breaches = data.split('\n');
        for (const breach of breaches) {
            const [hashSuffix] = breach.split(':');
            if (hashSuffix && hashSuffix.trim() === suffix) {
                return true; // Password has been breached
            }
        }
        return false;
    }
    catch (error) {
        console.error('Error checking password breach:', error);
        // In case of error, we'll assume it's not breached to avoid blocking users
        // but log the error for monitoring
        return false;
    }
}
//# sourceMappingURL=passwordValidator.js.map