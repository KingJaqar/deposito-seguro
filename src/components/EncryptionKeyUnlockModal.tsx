import { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../contexts/ThemeContext';
import { SecureCrypto } from '../security/crypto';
import { useSettingsStore } from '../store/settingsStore';
import { EncryptionKeyMetadata } from '../types';

interface EncryptionKeyUnlockModalProps {
  visible: boolean;
  itemName: string;
  requiredKeyId: string;
  onUnlock: () => void;
  onCancel: () => void;
}

export function EncryptionKeyUnlockModal({
  visible,
  itemName,
  requiredKeyId,
  onUnlock,
  onCancel,
}: EncryptionKeyUnlockModalProps) {
  const colors = useThemeColors();
  const encryptionKeys = useSettingsStore((state: { encryptionKeys: EncryptionKeyMetadata[] }) => state.encryptionKeys);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [customKeyPhrase, setCustomKeyPhrase] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Find the required key
  const requiredKey = encryptionKeys.find(k => k.id === requiredKeyId);

  const handleUnlock = async () => {
    if (!requiredKey) {
      setError('Encryption key not found');
      return;
    }

    if (!customKeyPhrase.trim()) {
      setError('Please enter the encryption key phrase');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      const enteredPhrase = customKeyPhrase.trim();
      
      // Verification method depends on how the key was created
      if (requiredKey.salt) {
        // Key was created with a custom phrase - verify using the stored salt
        const hashedPhrase = await SecureCrypto.hashPassword(enteredPhrase, requiredKey.salt);
        const enteredFingerprint = SecureCrypto.fingerprint(hashedPhrase);
        
        if (enteredFingerprint === requiredKey.fingerprint) {
          // Verification successful - user entered the correct phrase
          setVerifying(false);
          onUnlock();
          resetState();
          return;
        }
      } else {
        // Key was auto-generated (random) - user must enter the exact key
        // The key is a 64-character hex string that should be copied from settings
        if (enteredPhrase === requiredKey.key) {
          setVerifying(false);
          onUnlock();
          resetState();
          return;
        }
      }
      
      // Verification failed
      setError('Invalid key phrase. Please enter the correct encryption key.');
      setVerifying(false);
    } catch (err) {
      console.error('Key verification error:', err);
      setError('Verification failed. Please try again.');
      setVerifying(false);
    }
  };

  const resetState = () => {
    setSelectedKeyId(null);
    setCustomKeyPhrase('');
    setError('');
    setVerifying(false);
  };

  const handleClose = () => {
    resetState();
    onCancel();
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.handle} />
          
          <Text style={[styles.title, { color: colors.text }]}>🔒 Encrypted Item</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            "{itemName}" is protected with an encryption key.
          </Text>

          {requiredKey ? (
            <>
              <Text style={[styles.label, { color: colors.text }]}>Required Key:</Text>
              <View style={[styles.keyCard, { backgroundColor: `${colors.primary}15`, borderColor: colors.border }]}>
                <Text style={[styles.keyName, { color: colors.text }]}>{requiredKey.name}</Text>
                <Text style={[styles.keyFingerprint, { color: colors.textMuted }]}>
                  Fingerprint: {requiredKey.fingerprint}
                </Text>
                {requiredKey.description ? (
                  <Text style={[styles.keyDescription, { color: colors.textMuted }]}>
                    {requiredKey.description}
                  </Text>
                ) : null}
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Enter the key phrase or password used to create this key:
              </Text>
              <TextInput
                style={[styles.input, { 
                  borderColor: error ? colors.error : colors.border, 
                  color: colors.text,
                  backgroundColor: `${colors.border}30`
                }]}
                placeholder="Enter encryption key phrase..."
                placeholderTextColor={colors.textMuted}
                value={customKeyPhrase}
                onChangeText={setCustomKeyPhrase}
                secureTextEntry
                autoFocus
              />

              {error ? (
                <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
              ) : null}

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  onPress={handleClose}
                  style={[styles.button, styles.cancelButton, { borderColor: colors.border }]}
                >
                  <Text style={[styles.buttonText, { color: colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleUnlock}
                  disabled={verifying || !customKeyPhrase.trim()}
                  style={[
                    styles.button, 
                    styles.unlockButton, 
                    { 
                      backgroundColor: verifying || !customKeyPhrase.trim() ? colors.border : colors.primary,
                    }
                  ]}
                >
                  {verifying ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={[styles.buttonText, { color: '#FFF', fontWeight: '700' }]}>Unlock</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={[styles.errorCard, { backgroundColor: `${colors.error}15` }]}>
              <Text style={[styles.errorTitle, { color: colors.error }]}>Key Not Found</Text>
              <Text style={[styles.errorText, { color: colors.textMuted }]}>
                The encryption key assigned to this item could not be found. 
                It may have been deleted. Please assign a new encryption key or remove encryption.
              </Text>
              <TouchableOpacity
                onPress={handleClose}
                style={[styles.button, styles.closeButton, { backgroundColor: colors.error }]}
              >
                <Text style={[styles.buttonText, { color: '#FFF', fontWeight: '700' }]}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  keyCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  keyName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  keyFingerprint: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  keyDescription: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  error: {
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorCard: {
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  unlockButton: {
    borderWidth: 0,
  },
  closeButton: {
    marginTop: 8,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});