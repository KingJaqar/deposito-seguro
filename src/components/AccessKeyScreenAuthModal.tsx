// src/components/AccessKeyScreenAuthModal.tsx
// Rebuilt on the Dialog primitive per §5. Another §1 "logic interleaved with
// markup" file: handleVerify is carried across BYTE-IDENTICAL — the empty-PIN
// guard, the lockout check and its message, validatePin(), the
// authenticate() call, resetAttempts/recordFailedAttempt handling including
// the auto-onClose() on lockout, the catch, and the finally. Only
// JSX/StyleSheet is new; the hand-rolled eye-icon input becomes TextField's
// secureToggle and the hardcoded '#FFFFFF' verify button becomes a Button.
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Key, Lock } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';
import { Dialog } from './primitives/Dialog';
import { TextField } from './primitives/TextField';
import { useAuthStore } from '../store/authStore';
import { MAX_PASSWORD_ATTEMPTS, LOCKOUT_DURATION_MS, useLockoutStore } from '../store/lockoutStore';
import { validatePin } from '../utils/accessKeyValidation';

interface AccessKeyScreenAuthModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AccessKeyScreenAuthModal({ visible, onClose, onSuccess }: AccessKeyScreenAuthModalProps) {
  const { colors, space, font, radius, iconSize } = useTheme();
  const { authenticate } = useAuthStore();
  const { recordFailedAttempt, resetAttempts, isLockedOut, getRemainingLockoutTime } = useLockoutStore();

  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const lockoutKey = 'access-keys:screen';
  const currentlyLockedOut = isLockedOut(lockoutKey);
  const remainingLockoutTime = getRemainingLockoutTime(lockoutKey);

  const handleVerify = async () => {
    if (!pin.trim()) {
      Alert.alert('PIN Required', 'Please enter your authentication key.');
      return;
    }

    if (currentlyLockedOut) {
      Alert.alert('Too Many Attempts', `Please wait ${remainingLockoutTime} seconds before trying again.`);
      return;
    }

    const pinValidation = validatePin(pin);
    if (!pinValidation.valid) {
      Alert.alert('Invalid PIN', pinValidation.message);
      return;
    }

    setIsVerifying(true);
    try {
      const success = await authenticate(pin);
      if (success) {
        setPin('');
        resetAttempts(lockoutKey);
        onSuccess();
      } else {
        const { remaining, isLockedOut: nowLockedOut } = recordFailedAttempt(lockoutKey);
        setPin('');

        if (nowLockedOut) {
          Alert.alert(
            'Too Many Failed Attempts',
            `You have exceeded the maximum number of attempts (${MAX_PASSWORD_ATTEMPTS}). Please wait ${LOCKOUT_DURATION_MS / 1000} seconds before trying again.`,
          );
          onClose();
        } else {
          Alert.alert(
            'Incorrect PIN',
            `The authentication key you entered is incorrect. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
          );
        }
      }
    } catch {
      Alert.alert('Error', 'Failed to verify authentication key.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClose = () => {
    setPin('');
    onClose();
  };

  return (
    <Dialog
      visible={visible}
      onRequestClose={handleClose}
      icon={Lock}
      title="Security Verification Required"
      message="Enter your authentication key to access the Access Keys screen."
      actions={[
        { label: 'Cancel', onPress: handleClose, variant: 'tertiary' },
        { label: isVerifying ? 'Verifying…' : 'Verify', onPress: handleVerify, variant: 'primary', loading: isVerifying },
      ]}
    >
      <View style={{ width: '100%' }}>
        <View style={[styles.idBox, { backgroundColor: colors.surfaceHover, borderColor: colors.borderLight, borderRadius: radius(4), paddingVertical: space(3), paddingHorizontal: space(4), marginBottom: space(4), gap: space(2) }]}>
          <Key size={iconSize(14)} color={colors.textMuted} strokeWidth={2} />
          <Text style={[styles.idText, { color: colors.text, fontSize: font(Type.label.size) }]} numberOfLines={1}>
            Access Keys
          </Text>
        </View>

        <TextField
          label="Authentication key"
          placeholder="Enter authentication key"
          value={pin}
          onChangeText={setPin}
          secureToggle
          autoFocus
          keyboardType="number-pad"
          maxLength={10}
          editable={!isVerifying}
          accessibilityLabel="Authentication key input"
        />
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  idBox: {
    width: '100%',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  idText: { fontWeight: '700', letterSpacing: 0.3, flexShrink: 1, textAlign: 'center' },
});
