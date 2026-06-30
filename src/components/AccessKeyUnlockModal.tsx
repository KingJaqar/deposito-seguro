import { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, ViewStyle } from 'react-native';
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
  const { isDark, space, font, radius, isTablet } = useTheme();
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

  const theme = {
    card: isDark ? '#1A1A1A' : '#FFFFFF',
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    ring: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    circle: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    title: isDark ? '#FFFFFF' : '#0F172A',
    subtitle: isDark ? '#8E8E93' : '#64748B',
    icon: isDark ? '#8E8E93' : '#64748B',
    idBox: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    idBoxBorder: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
    idText: isDark ? '#FFFFFF' : '#0F172A',
    hint: isDark ? '#8E8E93' : '#64748B',
    input: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    inputBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
    inputText: isDark ? '#FFFFFF' : '#0F172A',
    placeholder: isDark ? '#8E8E93' : '#64748B',
    eye: isDark ? '#FFFFFF' : '#0F172A',
    cancelBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    cancelText: isDark ? '#FFFFFF' : '#0F172A',
    unlockBg: isDark ? '#F5F0E8' : '#5162FF',
    unlockText: isDark ? '#000000' : '#FFFFFF',
  };

  const cardStyle: ViewStyle = {
    backgroundColor: theme.card,
    borderColor: theme.border,
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
          <View style={[styles.iconRing, { backgroundColor: theme.ring, marginBottom: space(5) }]}>
            <View style={[styles.iconCircle, { backgroundColor: theme.circle }]}>
              <Lock size={32} color={theme.icon} strokeWidth={1.5} />
            </View>
          </View>

          <Text style={[styles.title, { color: theme.title, marginBottom: space(1) }]}>
            Password Required
          </Text>
          <Text style={[styles.subtitle, { color: theme.subtitle, marginBottom: space(6), lineHeight: 20 }]}>
            Enter the access key password to access this {targetType}
          </Text>

          <View style={[styles.idBox, { backgroundColor: theme.idBox, borderColor: theme.idBoxBorder, marginBottom: space(5) }]}>
            <Text style={[styles.idText, { color: theme.idText }]} numberOfLines={1}>
              {targetId}
            </Text>
            {targetPassword && (
              <Text style={[styles.hintText, { color: theme.hint }]} numberOfLines={1}>
                Hint: {targetPassword.label}
                {targetPassword.description ? ` - ${targetPassword.description}` : ''}
              </Text>
            )}
          </View>

          <View style={styles.labelRow}>
            <Key size={14} color={theme.icon} strokeWidth={2} />
            <Text style={[styles.inputLabel, { color: theme.icon }]}>ENTER PASSWORD</Text>
          </View>

          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.input, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.inputText, paddingRight: space(12) }]}
              placeholder="Enter password"
              placeholderTextColor={theme.placeholder}
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
                <EyeOff size={18} color={theme.icon} strokeWidth={2} />
              ) : (
                <Eye size={18} color={theme.icon} strokeWidth={2} />
              )}
              <Text style={[styles.eyeText, { color: theme.icon }]}>{showPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.buttonRow, { gap: space(3) }]}>
            <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: theme.cancelBg }]} onPress={handleClose} accessibilityRole="button" accessibilityLabel="Cancel">
              <X size={18} color={theme.cancelText} strokeWidth={2.5} />
              <Text style={[styles.cancelText, { color: theme.cancelText }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.unlockBtn, { backgroundColor: theme.unlockBg }]} onPress={handleUnlock} accessibilityRole="button" accessibilityLabel="Unlock">
              <Lock size={18} color={theme.unlockText} strokeWidth={2.5} />
              <Text style={[styles.unlockText, { color: theme.unlockText }]}>Unlock</Text>
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
    fontSize: 24,
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
  },
  idText: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
    textAlign: 'center',
  },
  hintText: {
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
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
  unlockBtn: {
    flex: 1.2,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
  },
  unlockText: {
    fontWeight: '800',
    fontSize: 15,
  },
});
