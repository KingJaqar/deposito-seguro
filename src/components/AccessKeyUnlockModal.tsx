// src/components/AccessKeyUnlockModal.tsx
// Rebuilt on the Dialog primitive per §5 (short-form content → Dialog).
// This is one of the §1 "business logic interleaved with markup" files: every
// security-bearing line is carried across BYTE-IDENTICAL — the lockoutKey
// derivation, isLockedOut/getRemainingLockoutTime gating, the
// SecureCrypto.secureCompare check, recordFailedAttempt/resetAttempts calls
// and their exact Alert.alert copy, MIN_PASSWORD_LENGTH validation, the
// register-mode match check, and isFormValid. Only JSX/StyleSheet is new:
// the 24 `colors.dashboardX ?? colors.X` fallback chains are gone, the two
// hand-rolled eye-icon input blocks collapse onto TextField's secureToggle,
// and the hardcoded '#000000'/'#FFFFFF' submit button becomes a themed Button.
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';
import { Dialog } from './primitives/Dialog';
import { TextField } from './primitives/TextField';
import { FileInfoCard } from './FileInfoCard';
import { SecureCrypto } from '../security/crypto';
import { LOCKOUT_DURATION_MS, MAX_PASSWORD_ATTEMPTS, useLockoutStore } from '../store/lockoutStore';
import { useSettingsStore } from '../store/settingsStore';
import { AccessKeyMetadata } from '../types';

const MIN_PASSWORD_LENGTH = 4;

interface AccessKeyUnlockModalProps {
  visible: boolean;
  targetName: string;
  targetId: string;
  targetType: 'file' | 'folder';
  accessKeyId: string;
  mode?: 'unlock' | 'register';
  onClose: () => void;
  onUnlock: () => void;
}

export function AccessKeyUnlockModal({
  visible,
  targetName,
  targetId,
  targetType,
  accessKeyId,
  mode = 'unlock',
  onClose,
  onUnlock,
}: AccessKeyUnlockModalProps) {
  const { colors, space, font, radius } = useTheme();
  const accessKeys = useSettingsStore((state: { accessKeys: AccessKeyMetadata[] }) => state.accessKeys);
  const { recordFailedAttempt, resetAttempts, isLockedOut, getRemainingLockoutTime } = useLockoutStore();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const lockoutKey = `${targetType}:${targetId}`;
  const isCurrentlyLockedOut = isLockedOut(lockoutKey);
  const remainingLockoutTime = getRemainingLockoutTime(lockoutKey);

  if (!visible) return null;

  const targetPassword = accessKeys.find(ak => ak.id === accessKeyId);

  const resetForm = () => {
    setPassword('');
    setConfirmPassword('');
    setFormError(null);
  };

  const onUnlockSuccess = () => {
    resetForm();
    onUnlock();
  };

  const handleUnlock = () => {
    setFormError(null);
    if (isCurrentlyLockedOut) {
      Alert.alert('Too Many Attempts', `Please wait ${remainingLockoutTime} seconds before trying again.`);
      return;
    }

    if (!targetPassword) {
      Alert.alert('Error', 'Password configuration not found.');
      return;
    }

    if (SecureCrypto.secureCompare(password, targetPassword.password)) {
      resetAttempts(lockoutKey);
      onUnlockSuccess();
    } else {
      const { remaining, isLockedOut: nowLockedOut } = recordFailedAttempt(lockoutKey);
      setPassword('');

      if (nowLockedOut) {
        Alert.alert(
          'Too Many Failed Attempts',
          `You have exceeded the maximum number of attempts (${MAX_PASSWORD_ATTEMPTS}). Please wait ${LOCKOUT_DURATION_MS / 1000} seconds before trying again.`,
          [{ text: 'OK' }]
        );
      } else {
        setFormError(`Incorrect password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
      }
    }
  };

  const handleRegister = () => {
    setFormError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError('Password must be at least 4 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    onUnlockSuccess();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = () => {
    if (mode === 'unlock') {
      handleUnlock();
    } else {
      handleRegister();
    }
  };

  const isFormValid = mode === 'unlock'
    ? password.length > 0
    : password.length >= MIN_PASSWORD_LENGTH && confirmPassword.length > 0;

  return (
    <Dialog
      visible={visible}
      onRequestClose={handleClose}
      icon={Lock}
      title={mode === 'unlock' ? 'Password Required' : 'Register Access Key'}
      message={
        mode === 'unlock'
          ? `Enter the access key password to access this ${targetType}`
          : `Create a secure password for this ${targetType}`
      }
      actions={[
        { label: 'Cancel', onPress: handleClose, variant: 'tertiary' },
        { label: mode === 'unlock' ? 'Unlock' : 'Register', onPress: handleSubmit, variant: 'primary', disabled: !isFormValid },
      ]}
    >
      <View style={{ width: '100%' }}>
        <FileInfoCard name={targetName} type={targetType} maxWidth={400} truncate style={{ marginBottom: space(4) }} />

        {mode === 'unlock' && targetPassword && (
          <View style={[styles.hintChip, { backgroundColor: colors.surfaceHover, borderRadius: radius(4), paddingHorizontal: space(3), paddingVertical: space(2), marginBottom: space(4) }]}>
            <Text style={[styles.hintText, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>
              {targetPassword.label}
              {targetPassword.description ? ` · ${targetPassword.description}` : ''}
            </Text>
          </View>
        )}

        <TextField
          label={mode === 'unlock' ? 'Enter password' : 'Create password'}
          placeholder={mode === 'unlock' ? 'Enter password' : 'Create a password (min. 4 chars)'}
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (formError) setFormError(null);
          }}
          secureToggle
          autoFocus
          error={formError ?? undefined}
          returnKeyType={mode === 'unlock' ? 'done' : 'next'}
          onSubmitEditing={() => {
            if (mode === 'register') {
              confirmPasswordRef.current?.focus();
            } else {
              handleSubmit();
            }
          }}
        />

        {mode === 'register' && (
          <TextField
            label="Confirm password"
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              if (formError) setFormError(null);
            }}
            secureToggle
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            helper={
              confirmPassword.length > 0
                ? (password === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match')
                : undefined
            }
          />
        )}
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  hintChip: { alignSelf: 'stretch' },
  hintText: { textAlign: 'center', fontWeight: '500', fontStyle: 'italic' },
});
