import { Alert } from 'react-native';

export interface EncryptionKeyCreateOptions {
  name: string;
  description?: string;
  customKey?: string;
}

export type OnEncryptionKeyCreate = (options: EncryptionKeyCreateOptions) => void | Promise<void>;

/**
 * Multi-step prompt to create an encryption key with all fields:
 * 1. Key name (required)
 * 2. Description (optional)
 * 3. Custom key phrase (optional)
 */
export const promptCreateEncryptionKey = (
  targetName: string,
  onCreate: OnEncryptionKeyCreate
) => {
  Alert.prompt(
    'Create Encryption Key',
    `Enter a name for the key assigned to "${targetName}".`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Next',
        onPress: (keyName?: string) => promptEncryptionKeyDescription(keyName?.trim() || targetName, onCreate),
      },
    ],
    'plain-text'
  );
};

const promptEncryptionKeyDescription = (
  keyName: string,
  onCreate: OnEncryptionKeyCreate
) => {
  Alert.prompt(
    'Optional Description',
    'Enter an optional description for this key, or tap Skip.',
    [
      {
        text: 'Skip',
        onPress: () => promptEncryptionKeyPhrase(keyName, '', onCreate),
      },
      {
        text: 'Next',
        onPress: (description?: string) => promptEncryptionKeyPhrase(keyName, description?.trim() || '', onCreate),
      },
    ],
    'plain-text',
    undefined,
    undefined
  );
};

const promptEncryptionKeyPhrase = (
  keyName: string,
  description: string,
  onCreate: OnEncryptionKeyCreate
) => {
  Alert.prompt(
    'Custom Key Phrase (Optional)',
    'Enter a custom key phrase to remember, or tap Skip to auto-generate.',
    [
      {
        text: 'Skip',
        onPress: () => onCreate({ name: keyName, description: description || undefined }),
      },
      {
        text: 'Create',
        onPress: (customKey?: string) => onCreate({ 
          name: keyName, 
          description: description || undefined,
          customKey: customKey?.trim() 
        }),
      },
    ],
    'secure-text',
    undefined,
    undefined
  );
};
