import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Eye, EyeOff, Key, Lock, X } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { LOCKOUT_DURATION_MS, MAX_PASSWORD_ATTEMPTS, useLockoutStore } from '../store/lockoutStore';
import { useSettingsStore } from '../store/settingsStore';
import { AccessKeyMetadata } from '../types';

interface AccessKeyUnlockModalProps {
  visible: boolean;
  targetName: string;
  targetId: string;
  targetType: 'file' | 'folder';
  accessKeyId: string;
  onClose: () => void;
  onUnlock: () => void;
}

export function AccessKeyUnlockModal({
  visible,
  targetName,
  targetId,
  targetType,
  accessKeyId,
  onClose,
  onUnlock,
}: AccessKeyUnlockModalProps) {
  const { isDark, colors, space, font, radius, isTablet, screenPadding, clampSize } = useTheme();
  const accessKeys = useSettingsStore((state: { accessKeys: AccessKeyMetadata[] }) => state.accessKeys);
  const { recordFailedAttempt, resetAttempts, isLockedOut, getRemainingLockoutTime } = useLockoutStore();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const lockoutKey = `${targetType}:${targetId}`;
  const isCurrentlyLockedOut = isLockedOut(lockoutKey);
  const remainingLockoutTime = getRemainingLockoutTime(lockoutKey);

  if (!visible) return null;

  const targetPassword = accessKeys.find(ak => ak.id === accessKeyId);

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

  const ICON_OUTER = clampSize(52, 64);
  const ICON_INNER = clampSize(44, 56);

  const cardStyle: ViewStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.borderLight,
    width: '100%',
    maxWidth: isTablet ? 420 : 360,
    borderRadius: radius(16),
    paddingVertical: space(6),
    paddingHorizontal: space(5),
    alignItems: 'center',
    borderWidth: 1,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.45)', padding: screenPadding }]}>
          <TouchableOpacity style={styles.backdrop} onPress={handleClose} activeOpacity={1} />
          <View style={cardStyle}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={20} color={colors.textMuted} strokeWidth={2.5} />
            </TouchableOpacity>
            <View style={[styles.iconRing, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', width: ICON_OUTER, height: ICON_OUTER, borderRadius: ICON_OUTER / 2, marginBottom: space(4) }]}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', width: ICON_INNER, height: ICON_INNER, borderRadius: ICON_INNER / 2 }]}>
                <Lock size={ICON_INNER * 0.5} color={colors.textMuted} strokeWidth={1.8} />
              </View>
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text, marginBottom: space(2) }]}>
            Password Required
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted, marginBottom: space(5), lineHeight: 20 }]}>
            Enter the access key password to access this {targetType}
          </Text>

          <View style={[styles.idBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', borderColor: colors.borderLight, marginBottom: space(4) }]}>
            <Text style={[styles.idText, { color: colors.text }]} numberOfLines={1}>
              {targetId}
            </Text>
            {targetPassword && (
              <Text style={[styles.hintText, { color: colors.textMuted }]} numberOfLines={1}>
                {targetPassword.label}
                {targetPassword.description ? ` · ${targetPassword.description}` : ''}
              </Text>
            )}
          </View>

          <View style={styles.labelRow}>
            <Key size={13} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>ENTER PASSWORD</Text>
          </View>

          <View style={[styles.inputWrap, { marginBottom: space(5) }]}>
            <TextInput
              style={[styles.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: colors.border, color: colors.text, paddingRight: space(10) }]}
              placeholder="Enter password"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoFocus
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(!showPassword)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff size={16} color={colors.textMuted} strokeWidth={2} />
              ) : (
                <Eye size={16} color={colors.textMuted} strokeWidth={2} />
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.buttonRow, { gap: space(3) }]}>
            <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderColor: colors.borderLight }]} onPress={handleClose} accessibilityRole="button" accessibilityLabel="Cancel">
              <X size={16} color={colors.text} strokeWidth={2.5} />
              <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.unlockBtn, { backgroundColor: colors.primary }]} onPress={handleUnlock} accessibilityRole="button" accessibilityLabel="Unlock">
              <Lock size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={[styles.unlockText, { color: '#FFFFFF' }]}>Unlock</Text>
            </TouchableOpacity>
            </View>
        </View>
      </View>
    </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalHeader: {
    width: '100%',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    padding: 4,
    zIndex: 1,
  },
  iconRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
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
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  idText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
    flexShrink: 1,
    textAlign: 'center',
  },
  hintText: {
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
    flexShrink: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 6,
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
    right: 10,
    top: '50%',
    marginTop: -16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
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
    gap: 6,
    justifyContent: 'center',
    minHeight: 48,
    borderWidth: 1,
  },
  cancelText: {
    fontWeight: '700',
    fontSize: 15,
  },
  unlockBtn: {
    flex: 1.2,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 48,
  },
  unlockText: {
    fontWeight: '800',
    fontSize: 15,
  },
});
