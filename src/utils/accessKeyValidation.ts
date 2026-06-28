/**
 * Shared access key validation utilities
 * Centralized validation logic to ensure consistency across the app
 */

export interface PasswordValidationResult {
  valid: boolean;
  message: string;
  checks: {
    minLength: boolean;
    maxLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecialChar: boolean;
  };
}

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
const SPECIAL_CHARS_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

/**
 * Validates a password against all requirements
 */
export const validatePassword = (password: string): PasswordValidationResult => {
  const checks = {
    minLength: password.length >= MIN_LENGTH,
    maxLength: password.length <= MAX_LENGTH,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: SPECIAL_CHARS_REGEX.test(password),
  };

  const passedChecks = Object.values(checks).filter(Boolean).length;
  const totalChecks = Object.values(checks).length;

  if (!checks.minLength) {
    return {
      valid: false,
      message: `Password must be at least ${MIN_LENGTH} characters long`,
      checks,
    };
  }

  if (!checks.maxLength) {
    return {
      valid: false,
      message: `Password must not exceed ${MAX_LENGTH} characters`,
      checks,
    };
  }

  if (!checks.hasUppercase) {
    return {
      valid: false,
      message: 'Password must contain at least one uppercase letter',
      checks,
    };
  }

  if (!checks.hasLowercase) {
    return {
      valid: false,
      message: 'Password must contain at least one lowercase letter',
      checks,
    };
  }

  if (!checks.hasNumber) {
    return {
      valid: false,
      message: 'Password must contain at least one number',
      checks,
    };
  }

  if (!checks.hasSpecialChar) {
    return {
      valid: false,
      message: 'Password must contain at least one special character (!@#$%^&*)',
      checks,
    };
  }

  return {
    valid: true,
    message: 'Password meets all requirements',
    checks,
  };
};

/**
 * Gets detailed validation messages for each requirement
 */
export const getPasswordValidationMessages = (password: string) => {
  const checks = {
    minLength: password.length >= MIN_LENGTH,
    maxLength: password.length <= MAX_LENGTH,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: SPECIAL_CHARS_REGEX.test(password),
  };

  return {
    messages: [
      { text: `At least ${MIN_LENGTH} characters`, valid: checks.minLength },
      { text: `Not exceed ${MAX_LENGTH} characters`, valid: checks.maxLength },
      { text: 'One uppercase letter', valid: checks.hasUppercase },
      { text: 'One lowercase letter', valid: checks.hasLowercase },
      { text: 'One number', valid: checks.hasNumber },
      { text: 'One special character (!@#$%^&*)', valid: checks.hasSpecialChar },
    ],
    passedCount: Object.values(checks).filter(Boolean).length,
    totalCount: Object.values(checks).length,
  };
};

/**
 * Calculates password strength based on criteria met
 */
export type PasswordStrength = 'weak' | 'medium' | 'strong';

export const getPasswordStrength = (password: string): PasswordStrength => {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (SPECIAL_CHARS_REGEX.test(password)) score++;

  if (score <= 3) return 'weak';
  if (score <= 5) return 'medium';
  return 'strong';
};

/**
 * Gets the color for password strength indicator
 */
export const getStrengthColor = (strength: PasswordStrength): string => {
  switch (strength) {
    case 'weak':
      return '#FF453A';
    case 'medium':
      return '#FBBF24';
    case 'strong':
      return '#34C759';
  }
};

/**
 * Gets the label for password strength
 */
export const getStrengthLabel = (strength: PasswordStrength): string => {
  switch (strength) {
    case 'weak':
      return 'Weak';
    case 'medium':
      return 'Medium';
    case 'strong':
      return 'Strong';
  }
};

/**
 * Calculates strength bar width percentage
 */
export const getStrengthBarWidth = (strength: PasswordStrength): string => {
  switch (strength) {
    case 'weak':
      return '33%';
    case 'medium':
      return '66%';
    case 'strong':
      return '100%';
  }
};

export const PIN_MIN_LENGTH = 6;
const PIN_MAX_LENGTH = 20;
const PIN_REGEX = /^[0-9]+$/;

export interface PinValidationResult {
  valid: boolean;
  message: string;
}

export const validatePin = (pin: string): PinValidationResult => {
  if (!PIN_REGEX.test(pin)) {
    return {
      valid: false,
      message: 'PIN must contain only numbers (0-9)',
    };
  }

  if (pin.length < PIN_MIN_LENGTH) {
    return {
      valid: false,
      message: `PIN must be at least ${PIN_MIN_LENGTH} digits`,
    };
  }

  if (pin.length > PIN_MAX_LENGTH) {
    return {
      valid: false,
      message: `PIN must not exceed ${PIN_MAX_LENGTH} digits`,
    };
  }

  return {
    valid: true,
    message: 'PIN is valid',
  };
};