import { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../contexts/ThemeContext';
import { LOCKOUT_DURATION_MS, MAX_PASSWORD_ATTEMPTS, useLockoutStore } from '../store/lockoutStore';
import { useSettingsStore } from '../store/settingsStore';
import { FilePasswordMetadata } from '../types';

interface FilePasswordUnlockModalProps {
  visible: boolean;
  targetName: string;
  targetId: string;
  targetType: 'file' | 'folder';
  filePasswordId: string;
  onClose: () => void;
  onUnlock: () => void;
}

export function FilePasswordUnlockModal({
  visible,
  targetName,
  targetId,
  targetType,
  filePasswordId,
  onClose,
  onUnlock,
}: FilePasswordUnlockModalProps) {
  const colors = useThemeColors();
  const filePasswords = useSettingsStore((state: { filePasswords: FilePasswordMetadata[] }) => state.filePasswords);
  const { recordFailedAttempt, resetAttempts, isLockedOut, getRemainingLockoutTime } = useLockoutStore();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Create a unique key for this target
  const lockoutKey = `${targetType}:${targetId}`;
  const isCurrentlyLockedOut = isLockedOut(lockoutKey);
  const remainingLockoutTime = getRemainingLockoutTime(lockoutKey);

  if (!visible) return null;

  const targetPassword = filePasswords.find(fp => fp.id === filePasswordId);

  const handleUnlock = () => {
    if (isCurrentlyLockedOut) {
      Alert.alert('Too Many Attempts', `Please wait ${remainingLockoutTime} seconds before trying again.`);
      return;
    }

    if (!targetPassword) {
      Alert.alert('Error', 'Password configuration not found.');
      return;
    }

    if (password === targetPassword.password) {
      setPassword('');
      setShowPassword(false);
      resetAttempts(lockoutKey);
      onUnlock();
    } else {
      const { newAttempts, remaining, isLockedOut: nowLockedOut } = recordFailedAttempt(lockoutKey);
      setPassword('');

      if (nowLockedOut) {
        Alert.alert(
          'Too Many Failed Attempts',
          `You have exceeded the maximum number of attempts (${MAX_PASSWORD_ATTEMPTS}). Please wait ${LOCKOUT_DURATION_MS / 1000} seconds before trying again.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Incorrect Password',
          `The entered password does not match. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
          [{ text: 'OK' }]
        );
      }
    }
  };

  const handleClose = () => {
    setPassword('');
    setShowPassword(false);
    onClose();
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableOpacity
        style={styles.overlay}
        onPress={handleClose}
        activeOpacity={1}
      >
        <View
          style={[styles.modal, { backgroundColor: colors.surface }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          
          <View style={styles.lockIconContainer}>
            <Text style={styles.lockIcon}>🔒</Text>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>Password Required</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Enter the file password to access this {targetType}
          </Text>

          <Text style={[styles.nameLabel, { color: colors.text }]}>
            {targetName}
          </Text>

          {targetPassword && (
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              Hint: {targetPassword.label}
              {targetPassword.description ? ` - ${targetPassword.description}` : ''}
            </Text>
          )}

          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}30` },
              ]}
              placeholder="Enter password"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoFocus
            />
            <TouchableOpacity 
              style={styles.showPasswordBtn}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{showPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border, borderWidth: 1 }]}
              onPress={handleClose}
            >
              <Text style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.unlockBtn, { backgroundColor: colors.primary }]}
              onPress={handleUnlock}
            >
              <Text style={styles.unlockBtnText}>Unlock</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  lockIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,69,58,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  lockIcon: {
    fontSize: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  nameLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  inputContainer: {
    width: '100%',
    position: 'relative',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 20,
    paddingRight: 60,
  },
  showPasswordBtn: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -12,
    padding: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontWeight: '700',
    fontSize: 14,
  },
  unlockBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  unlockBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});