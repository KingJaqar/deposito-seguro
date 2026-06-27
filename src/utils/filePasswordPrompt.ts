import { Alert } from 'react-native';
import {
  validatePassword
} from './filePasswordValidation';

export interface FilePasswordCreateOptions {
  label: string;
  description?: string;
  password: string;
}

export type OnFilePasswordCreate = (options: FilePasswordCreateOptions) => void | Promise<void>;

/**
 * Multi-step prompt to create a file password with all fields:
 * 1. Password label (required)
 * 2. Description (optional)
 * 3. Create password (required with validation)
 * 4. Confirm password
 */
export const promptCreateFilePassword = (
  targetName: string,
  onCreate: OnFilePasswordCreate
) => {
  Alert.prompt(
    'Create File Password',
    `Enter a label for the password assigned to "${targetName}".`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Next',
        onPress: (label?: string) => promptPasswordDescription(label?.trim() || targetName, onCreate),
      },
    ],
    'plain-text'
  );
};

const promptPasswordDescription = (
  label: string,
  onCreate: OnFilePasswordCreate
) => {
  Alert.prompt(
    'Optional Description',
    'Enter an optional description for this password, or tap Skip.',
    [
      {
        text: 'Skip',
        onPress: () => promptPasswordCreation(label, '', onCreate),
      },
      {
        text: 'Next',
        onPress: (description?: string) => promptPasswordCreation(label, description?.trim() || '', onCreate),
      },
    ],
    'plain-text',
    undefined,
    undefined
  );
};

const promptPasswordCreation = (
  label: string,
  description: string,
  onCreate: OnFilePasswordCreate
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
          promptPasswordConfirmation(label, description, password, onCreate);
        },
      },
    ],
    'secure-text'
  );
};

const promptPasswordConfirmation = (
  label: string,
  description: string,
  password: string,
  onCreate: OnFilePasswordCreate
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