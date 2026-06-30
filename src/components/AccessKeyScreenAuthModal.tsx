import { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Eye, EyeOff, Key, Lock, ShieldCheck, X } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { useLockoutStore } from '../store/lockoutStore';
import { validatePin } from '../utils/accessKeyValidation';

interface AccessKeyScreenAuthModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AccessKeyScreenAuthModal({ visible, onClose, onSuccess }: AccessKeyScreenAuthModalProps) {
  const { isDark, colors, space, font, radius, isTablet } = useTheme();
  const { authenticate } = useAuthStore();
  const { recordFailedAttempt, resetAttempts, isLockedOut, getRemainingLockoutTime } = useLockoutStore();

  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const lockoutKey = 'access-keys:screen';
  const currentlyLockedOut = isLockedOut(lockoutKey);
  const remainingLockoutTime = getRemainingLockoutTime(lockoutKey);

  if (!visible) return null;

  const handleVerify = async () => {
    if (!pin.trim()) {
      Alert.alert('PIN Required', 'Please enter your authentication key.');
      return;
    }

    const pinValidation = validatePin(pin);
    if (!pinValidation.valid) {
      Alert.alert('Invalid PIN', pinValidation.message);
      return;
    }

    if (currentlyLockedOut) {
      Alert.alert('Too Many Attempts', `Please wait ${remainingLockoutTime} seconds before trying again.`);
      return;
    }

    setIsVerifying(true);
    try {
      const success = await authenticate(pin);
      if (success) {
        setPin('');
        setShowPin(false);
        resetAttempts(lockoutKey);
        onSuccess();
      } else {
        const { newAttempts, remaining, isLockedOut: nowLockedOut } = recordFailedAttempt(lockoutKey);
        setPin('');

        if (nowLockedOut) {
          Alert.alert(
            'Too Many Failed Attempts',
            'You have exceeded the maximum number of attempts (5). Please wait 30 seconds before trying again.',
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
    setShowPin(false);
    onClose();
  };

  const cardStyle: ViewStyle = {
    backgroundColor: isDark ? '#000000' : '#FFFFFF',
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    width: '100%',
    maxWidth: isTablet ? 480 : 360,
    borderRadius: radius(12),
    paddingVertical: space(7),
    paddingHorizontal: space(5),
    alignItems: 'center',
    borderWidth: 1,
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={handleClose} activeOpacity={1} />
        <View style={cardStyle}>
          <View style={[styles.iconRing, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', marginBottom: space(5) }]}>
            <View style={[styles.iconCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
              <Lock size={28} color={colors.textMuted} strokeWidth={1.8} />
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text, marginBottom: space(1) }]}>
            Security Verification Required
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted, marginBottom: space(5), lineHeight: 20 }]}>
            Enter your authentication key to access the Access Keys screen.
          </Text>

          <View style={[
            styles.idBox,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)', marginBottom: space(5) }
          ]}>
            <Key size={16} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.idText, { color: colors.text }]}>Access Keys</Text>
          </View>

          <View style={styles.labelRow}>
            <Lock size={14} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>AUTHENTICATION KEY</Text>
          </View>

          <View style={styles.inputWrap}>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                  paddingRight: space(12),
                },
              ]}
              placeholder="Enter authentication key"
              placeholderTextColor={colors.textMuted}
              value={pin}
              onChangeText={setPin}
              secureTextEntry={!showPin}
              autoFocus
              keyboardType="number-pad"
              maxLength={10}
              accessibilityLabel="Authentication key input"
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPin(!showPin)}
              accessibilityRole="button"
              accessibilityLabel={showPin ? 'Hide PIN' : 'Show PIN'}
            >
              {showPin ? (
                <EyeOff size={18} color={colors.textMuted} strokeWidth={2} />
              ) : (
                <Eye size={18} color={colors.textMuted} strokeWidth={2} />
              )}
              <Text style={[styles.eyeText, { color: colors.textMuted }]}>{showPin ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.buttonRow, { gap: space(3) }]}>
            <TouchableOpacity
              style={[styles.cancelBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <X size={18} color={colors.text} strokeWidth={2.5} />
              <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.verifyBtn, { backgroundColor: '#4A90D9', opacity: isVerifying ? 0.65 : 1 }]}
              onPress={handleVerify}
              disabled={isVerifying}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Verify"
            >
              <ShieldCheck size={18} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.verifyText}>{isVerifying ? 'Verifying…' : 'Verify'}</Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: 'rgba(0,0,0,0.75)',
    padding: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  idBox: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  idText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
    flexShrink: 1,
    textAlign: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  inputWrap: {
    width: '100%',
    position: 'relative',
    marginBottom: 24,
  },
  input: {
    width: '100%',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    borderWidth: 1,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: -16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  eyeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelText: {
    fontWeight: '700',
    fontSize: 15,
  },
  verifyBtn: {
    flex: 1.2,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
  },
  verifyText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
