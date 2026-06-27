import { Alert } from 'react-native';
import {
  validatePassword
} from './accessKeyValidation';

export interface AccessKeyCreateOptions {
  label: string;
  description?: string;
  password: string;
}

export type OnAccessKeyCreate = (options: AccessKeyCreateOptions) => void | Promise<void>;

/**
 * Multi-step prompt to create an access key with all fields:
 * 1. Access key label (required)
 * 2. Description (optional)
 * 3. Create password (required with validation)
 * 4. Confirm password
 */
export const promptCreateAccessKey = (
  targetName: string,
  onCreate: OnAccessKeyCreate
) => {
  Alert.prompt(
    'Create Access Key',
    `Enter a label for the access key assigned to "${targetName}".`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Next',
        onPress: (label?: string) => promptAccessKeyDescription(label?.trim() || targetName, onCreate),
      },
    ],
    'plain-text'
  );
};

const promptAccessKeyDescription = (
  label: string,
  onCreate: OnAccessKeyCreate
) => {
  Alert.prompt(
    'Optional Description',
    'Enter an optional description for this access key, or tap Skip.',
    [
      {
        text: 'Skip',
        onPress: () => promptAccessKeyCreation(label, '', onCreate),
      },
      {
        text: 'Next',
        onPress: (description?: string) => promptAccessKeyCreation(label, description?.trim() || '', onCreate),
      },
    ],
    'plain-text',
    undefined,
    undefined
  );
};

const promptAccessKeyCreation = (
  label: string,
  description: string,
  onCreate: OnAccessKeyCreate
) => {
  Alert.prompt(
    'Create Password',
    'Enter a strong password (8+ chars, uppercase, lowercase, number, special char).',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Next',
        onPress: (password?: string) => {
          if (!password) {
            Alert.alert('Password Required', 'Please enter a password.');
            return;
          }
          const validation = validatePassword(password);
          if (!validation.valid) {
            Alert.alert('Weak Password', validation.message);
            return;
          }
          promptAccessKeyConfirmation(label, description, password, onCreate);
        },
      },
    ],
    'secure-text'
  );
};

const promptAccessKeyConfirmation = (
  label: string,
  description: string,
  password: string,
  onCreate: OnAccessKeyCreate
) => {
  Alert.prompt(
    'Confirm Password',
    'Re-enter your password to confirm.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Create',
        onPress: (confirmPassword?: string) => {
          if (confirmPassword !== password) {
            Alert.alert('Passwords Do Not Match', 'Please confirm your password correctly.');
            return;
          }
          onCreate({ label, description: description || undefined, password });
        },
      },
    ],
    'secure-text'
  );
};