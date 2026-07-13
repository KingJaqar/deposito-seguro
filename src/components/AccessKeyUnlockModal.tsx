import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Eye, EyeOff, Key, Lock, X } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { LOCKOUT_DURATION_MS, MAX_PASSWORD_ATTEMPTS, useLockoutStore } from '../store/lockoutStore';
import { useSettingsStore } from '../store/settingsStore';
import { AccessKeyMetadata } from '../types';
import { FileInfoCard } from './FileInfoCard';

const MIN_PASSWORD_LENGTH = 4;
const ICON_OUTER = 56;
const ICON_INNER = 48;

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
  const { colors, isDark } = useTheme();
  const accessKeys = useSettingsStore((state: { accessKeys: AccessKeyMetadata[] }) => state.accessKeys);
  const { recordFailedAttempt, resetAttempts, isLockedOut, getRemainingLockoutTime } = useLockoutStore();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
    setShowPassword(false);
    setShowConfirmPassword(false);
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

    if (password === targetPassword.password) {
      onUnlockSuccess();
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

  const inputBorderColor = formError
    ? colors.error
    : ((password.length > 0 && confirmPassword.length > 0 && password === confirmPassword)
      ? colors.success
      : colors.dashboardBorder ?? colors.border);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.overlay, { padding: 24 }]}>
          <TouchableOpacity style={styles.backdrop} onPress={handleClose} activeOpacity={1} />

          <View style={[
            styles.card,
            {
              backgroundColor: colors.dashboardSurface ?? colors.surface,
              maxWidth: 400,
              width: '100%',
              alignSelf: 'center',
              flexShrink: 1,
              paddingHorizontal: 24,
              paddingVertical: 24,
              borderRadius: 24,
              ...({
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.25,
                shadowRadius: 24,
                elevation: 16,
              }),
            }
          ]}>
            {/* Header with close button */}
            <View style={[styles.header, { marginBottom: 16 }]}>
              <View style={[
                styles.iconRing,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  width: ICON_OUTER,
                  height: ICON_OUTER,
                  borderRadius: ICON_OUTER / 2,
                }
              ]}>
                <View style={[
                  styles.iconCircle,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    width: ICON_INNER,
                    height: ICON_INNER,
                    borderRadius: ICON_INNER / 2,
                  }
                ]}>
                  <Lock size={ICON_INNER * 0.5} color={colors.textMuted} strokeWidth={1.8} />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleClose}
                style={[styles.closeBtn, { backgroundColor: colors.dashboardBg ?? colors.background }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={20} color={colors.dashboardText ?? colors.text} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {/* Title and subtitle */}
            <Text style={[styles.title, { color: colors.dashboardText ?? colors.text, fontSize: 20, marginBottom: 8 }]}>
              {mode === 'unlock' ? 'Password Required' : 'Register Access Key'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.dashboardTextMuted ?? colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 16 }]}>
              {mode === 'unlock'
                ? `Enter the access key password to access this ${targetType}`
                : `Create a secure password for this ${targetType}`}
            </Text>

            {/* File/Folder info card */}
            <FileInfoCard
              name={targetName}
              type={targetType}
              maxWidth={400}
              truncate
              style={{ marginBottom: 20 }}
            />

            {/* Access key hint (unlock mode only) */}
            {mode === 'unlock' && targetPassword && (
              <View style={[styles.hintChip, { backgroundColor: colors.dashboardBg ?? colors.background, marginBottom: 16 }]}>
                <Text style={[styles.hintText, { color: colors.dashboardTextMuted ?? colors.textMuted, fontSize: 13 }]}>
                  {targetPassword.label}
                  {targetPassword.description ? ` · ${targetPassword.description}` : ''}
                </Text>
              </View>
            )}

            {/* Password input */}
            <View style={[styles.inputSection, { marginBottom: 20 }]}>
              <View style={[styles.labelRow, { marginBottom: 8 }]}>
                <Key size={13} color={colors.dashboardTextMuted ?? colors.textMuted} strokeWidth={2} />
                <Text style={[styles.inputLabel, { color: colors.dashboardTextMuted ?? colors.textMuted, fontSize: 11 }]}>
                  {mode === 'unlock' ? 'ENTER PASSWORD' : 'CREATE PASSWORD'}
                </Text>
              </View>

              <View style={styles.inputWrap}>
                <TextInput
                   style={[
                     styles.input,
                     {
                       backgroundColor: colors.dashboardBg ?? colors.background,
                       borderColor: inputBorderColor,
                       color: colors.dashboardText ?? colors.text,
                       paddingHorizontal: 32,
                       paddingVertical: 28,
                       paddingRight: 48,
                       fontSize: 15,
                       borderRadius: 12,
                       minHeight: 48,
                     }
                   ]}
                  placeholder={mode === 'unlock' ? 'Enter password' : 'Create a password (min. 4 chars)'}
                  placeholderTextColor={colors.dashboardTextMuted ?? colors.textMuted}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (formError) setFormError(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoFocus
                  returnKeyType={mode === 'unlock' ? 'done' : 'next'}
                  onSubmitEditing={() => {
                    if (mode === 'register') {
                      confirmPasswordRef.current?.focus();
                    } else {
                      handleSubmit();
                    }
                  }}
                />
                {password.length > 0 && (
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowPassword(!showPassword)}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {showPassword ? (
                      <EyeOff size={18} color={colors.dashboardTextMuted ?? colors.textMuted} strokeWidth={2} />
                    ) : (
                      <Eye size={18} color={colors.dashboardTextMuted ?? colors.textMuted} strokeWidth={2} />
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {formError && (
                <Text style={[styles.errorText, { color: colors.error, fontSize: 12, marginTop: 8 }]}>
                  {formError}
                </Text>
              )}
            </View>

            {/* Confirm password input (register mode only) */}
            {mode === 'register' && (
              <View style={[styles.inputSection, { marginBottom: 16 }]}>
                <View style={[styles.labelRow, { marginBottom: 8 }]}>
                  <Key size={13} color={colors.dashboardTextMuted ?? colors.textMuted} strokeWidth={2} />
                  <Text style={[styles.inputLabel, { color: colors.dashboardTextMuted ?? colors.textMuted, fontSize: 11 }]}>
                    CONFIRM PASSWORD
                  </Text>
                </View>

                <View style={styles.inputWrap}>
                  <TextInput
                    ref={confirmPasswordRef}
                     style={[
                       styles.input,
                       {
                         backgroundColor: colors.dashboardBg ?? colors.background,
                         borderColor: inputBorderColor,
                         color: colors.dashboardText ?? colors.text,
                         paddingHorizontal: 32,
                         paddingVertical: 28,
                         paddingRight: 48,
                         fontSize: 15,
                         borderRadius: 12,
                         minHeight: 48,
                       }
                     ]}
                    placeholder="Re-enter your password"
                    placeholderTextColor={colors.dashboardTextMuted ?? colors.textMuted}
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      if (formError) setFormError(null);
                    }}
                    secureTextEntry={!showConfirmPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                  />
                  {confirmPassword.length > 0 && (
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      accessibilityRole="button"
                      accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={18} color={colors.dashboardTextMuted ?? colors.textMuted} strokeWidth={2} />
                      ) : (
                        <Eye size={18} color={colors.dashboardTextMuted ?? colors.textMuted} strokeWidth={2} />
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                {/* Password match indicator */}
                {confirmPassword.length > 0 && (
                  <Text style={[
                    styles.matchIndicator,
                    {
                      color: password === confirmPassword ? colors.success : colors.error,
                      fontSize: 12,
                      marginTop: 8,
                    }
                  ]}>
                    {password === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </Text>
                )}
              </View>
            )}

            {/* Action buttons */}
            <View style={[styles.buttonRow, { marginTop: 16, gap: 12 }]}>
              <TouchableOpacity
                style={[
                  styles.cancelBtn,
                  {
                    borderColor: colors.dashboardBorder ?? colors.border,
                    paddingVertical: 28,
                    borderRadius: 12,
                    minHeight: 48,
                  }
                ]}
                onPress={handleClose}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.cancelText, { color: colors.dashboardText ?? colors.text, fontSize: 15 }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor: '#000000',
                    opacity: isFormValid ? 1 : 0.6,
                    paddingVertical: 28,
                    borderRadius: 12,
                    minHeight: 48,
                  }
                ]}
                onPress={handleSubmit}
                disabled={!isFormValid}
                accessibilityRole="button"
                accessibilityLabel={mode === 'unlock' ? 'Unlock' : 'Register'}
                accessibilityState={{ disabled: !isFormValid }}
              >
                <Lock size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={[styles.submitText, { color: '#FFFFFF', fontSize: 15 }]}>
                  {mode === 'unlock' ? 'Unlock' : 'Register'}
                </Text>
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
    backgroundColor: 'rgba(0,0,0,0.6)',
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
  card: {
    width: '100%',
    alignSelf: 'center',
    flexShrink: 1,
  },
  header: {
    width: '100%',
    alignItems: 'center',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    textAlign: 'center',
    fontWeight: '500',
  },
  hintChip: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  hintText: {
    textAlign: 'center',
    fontWeight: '500',
    fontStyle: 'italic',
  },
  inputSection: {
    width: '100%',
    flexShrink: 1,
    minWidth: 0,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
    flexWrap: 'wrap',
  },
  inputLabel: {
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  inputWrap: {
    width: '100%',
    position: 'relative',
    flexShrink: 1,
    minWidth: 0,
  },
  input: {
    width: '100%',
    borderWidth: 1.5,
    minHeight: 48,
    flexShrink: 1,
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontWeight: '600',
  },
  matchIndicator: {
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    flexShrink: 1,
    minWidth: 0,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    flexShrink: 1,
    minWidth: 0,
  },
  cancelText: {
    fontWeight: '700',
  },
  submitBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  submitText: {
    fontWeight: '700',
  },
});
