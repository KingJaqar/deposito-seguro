// file: src/app/(main)/settings/auth-key.tsx

import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, EyeOff, Key, Lock, ShieldCheck } from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { useTheme } from '../../../contexts/ThemeContext';
import { PIN_LOCKOUT_KEY, useAuthStore } from '../../../store/authStore';
import { useLockoutStore } from '../../../store/lockoutStore';
import { validatePin } from '../../../utils/accessKeyValidation';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Durations } from '../../../constants/animations';

export default function AuthKeyScreen() {
  const { isDark, colors, space, screenPadding, bottomTabSpacing, headerPaddingTop, font, isTablet, clampSize, radius } = useTheme();
  const { isConfigured, securityHint, authenticate, initializeVault, updateSecurityHint, deleteSecurityHint } = useAuthStore();

  const [isVerified, setIsVerified] = useState(false);
  const [verifyPassword, setVerifyPassword] = useState('');
  const [showVerifyPassword, setShowVerifyPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  const [isEditingHint, setIsEditingHint] = useState(false);
  const [hintText, setHintText] = useState(securityHint || '');
  const currentHint = securityHint || '';

  const INPUT_H = clampSize(48, 56);
  const LABEL_H = clampSize(18, 22);
  const ICON_OUTER = clampSize(56, 72);
  const ICON_INNER = clampSize(48, 64);

  const screenOpacity = useSharedValue(0);
  const screenTranslateY = useSharedValue(12);
  const hasAnimated = useSharedValue(false);

  useFocusEffect(
    useCallback(() => {
      if (hasAnimated.value) return;
      hasAnimated.value = true;

      screenOpacity.value = withTiming(1, {
        duration: Durations.normal,
        easing: Easing.out(Easing.quad),
      });
      screenTranslateY.value = withTiming(0, {
        duration: Durations.normal,
        easing: Easing.out(Easing.quad),
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const screenAnimatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: screenOpacity.value,
    transform: [{ translateY: screenTranslateY.value }],
  }));

  const handleVerify = async () => {
    if (!verifyPassword.trim()) {
      Alert.alert('Password Required', 'Please enter your authentication key.');
      return;
    }
    const pinValidation = validatePin(verifyPassword);
    if (!pinValidation.valid) {
      Alert.alert('Invalid PIN', pinValidation.message);
      return;
    }
    if (useLockoutStore.getState().isLockedOut(PIN_LOCKOUT_KEY)) {
      const remaining = useLockoutStore.getState().getRemainingLockoutTime(PIN_LOCKOUT_KEY);
      Alert.alert('Too Many Attempts', `Try again in ${remaining}s.`);
      return;
    }
    setIsVerifying(true);
    try {
      const success = await authenticate(verifyPassword);
      if (success) {
        setIsVerified(true);
        setVerifyPassword('');
        setShowVerifyPassword(false);
      } else {
        Alert.alert('Incorrect Key', 'The authentication key you entered is incorrect.');
      }
    } catch {
      Alert.alert('Error', 'Failed to verify authentication key.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleChangeAuthKey = async () => {
    if (!currentPassword.trim()) {
      Alert.alert('Current Password Required', 'Please enter your current authentication key.');
      return;
    }
    if (useLockoutStore.getState().isLockedOut(PIN_LOCKOUT_KEY)) {
      const remaining = useLockoutStore.getState().getRemainingLockoutTime(PIN_LOCKOUT_KEY);
      Alert.alert('Too Many Attempts', `Try again in ${remaining}s.`);
      return;
    }
    setIsChanging(true);
    try {
      const valid = await authenticate(currentPassword);
      if (!valid) {
        Alert.alert('Incorrect Password', 'The current authentication key you entered is incorrect.');
        setIsChanging(false);
        return;
      }
      if (!newPassword.trim()) {
        Alert.alert('New Password Required', 'Please enter a new authentication key.');
        setIsChanging(false);
        return;
      }
      const pinValidation = validatePin(newPassword);
      if (!pinValidation.valid) {
        Alert.alert('Invalid PIN', pinValidation.message);
        setIsChanging(false);
        return;
      }
      if (newPassword !== confirmPassword) {
        Alert.alert('Passwords Do Not Match', 'Please confirm your new authentication key correctly.');
        setIsChanging(false);
        return;
      }
      const success = await initializeVault(newPassword, hintText.trim() || securityHint);
      if (success) {
        Alert.alert('Authentication Key Updated', 'Your vault authentication key has been changed.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        Alert.alert('Update Failed', 'Could not update the authentication key.');
      }
    } catch {
      Alert.alert('Error', 'Failed to update authentication key.');
    } finally {
      setIsChanging(false);
    }
  };

  const handleSaveHint = async () => {
    await updateSecurityHint(hintText.trim());
    setIsEditingHint(false);
    Alert.alert('Hint Updated', 'Your authentication key hint has been saved.');
  };

  const handleDeleteHint = async () => {
    await deleteSecurityHint();
    setHintText('');
    setIsEditingHint(false);
    Alert.alert('Hint Deleted', 'The authentication key hint has been removed.');
  };

  if (!isConfigured) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={screenAnimatedStyle}>
        <View style={[styles.header, { paddingHorizontal: screenPadding, paddingTop: headerPaddingTop }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={[styles.backIcon, { color: colors.text }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: font(22) }]}>Authentication Key</Text>
        </View>
        <View style={[styles.content, { paddingHorizontal: screenPadding, paddingBottom: bottomTabSpacing }]}>
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.vaultIconBg }]}>
              <Key size={32} color={colors.textMuted} strokeWidth={1.5} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text, fontSize: font(18) }]}>Vault Not Initialized</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted, fontSize: font(13) }]}>
              Please complete the initial vault setup to manage your authentication key.
            </Text>
          </View>
        </View>

        <AnimatedTabBar />
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (!isVerified) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={screenAnimatedStyle}>
        <View style={[styles.header, { paddingHorizontal: screenPadding, paddingTop: headerPaddingTop }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.backIcon, { color: colors.text }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: font(22) }]}>Authentication Key</Text>
          <View style={{ width: 32 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={[styles.verifyContent, { paddingHorizontal: screenPadding, paddingBottom: bottomTabSpacing }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.verifyCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
              <View style={[styles.lockIconWrap, { marginBottom: space(5) }]}>
                <View style={[styles.lockIconCircle, { backgroundColor: colors.vaultIconBg, width: ICON_OUTER, height: ICON_OUTER, borderRadius: ICON_OUTER / 2 }]}>
                  <Lock size={ICON_INNER * 0.55} color={colors.textMuted} strokeWidth={1.8} />
                </View>
              </View>

              <Text style={[styles.verifyTitle, { color: colors.text, fontSize: font(19), marginBottom: space(2) }]} numberOfLines={2}>
                Security Verification Required
              </Text>
              <Text style={[styles.verifySubtitle, { color: colors.textMuted, fontSize: font(14), marginBottom: space(6), lineHeight: 20 }]} numberOfLines={3}>
                Enter your authentication key to access the management screen.
              </Text>

              <View style={{ width: '100%', marginBottom: space(5) }}>
                <View style={{ minHeight: LABEL_H, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: space(2) }}>
                  <Lock size={14} color={colors.textMuted} strokeWidth={2} />
                  <Text style={{ fontSize: font(11), fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted, flexShrink: 1 }} numberOfLines={1}>
                    AUTHENTICATION KEY
                  </Text>
                </View>

                <View style={{ minHeight: INPUT_H, flexDirection: 'row', alignItems: 'center', position: 'relative' }}>
                  <TextInput
                    style={{ flex: 1, minHeight: INPUT_H, borderRadius: radius(8), paddingHorizontal: space(4), paddingVertical: space(3), fontSize: font(15), color: colors.text, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderWidth: 1, borderColor: colors.border, paddingRight: space(10) }}
                    value={verifyPassword}
                    onChangeText={setVerifyPassword}
                    placeholder="Enter current authentication key"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showVerifyPassword}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 }}
                    onPress={() => setShowVerifyPassword(!showVerifyPassword)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {showVerifyPassword ? (
                      <EyeOff size={16} color={colors.textMuted} strokeWidth={2} />
                    ) : (
                      <Eye size={16} color={colors.textMuted} strokeWidth={2} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ width: '100%' }}>
                <TouchableOpacity
                  onPress={handleVerify}
                  style={[styles.verifyButton, { opacity: isVerifying ? 0.65 : 1, backgroundColor: colors.primary, minHeight: INPUT_H }]}
                  disabled={isVerifying}
                  activeOpacity={0.78}
                >
                  <ShieldCheck size={18} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={[styles.verifyButtonText, { color: '#FFFFFF', fontSize: font(15) }]}>{isVerifying ? 'Verifying…' : 'Verify'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <AnimatedTabBar />
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <Animated.View style={screenAnimatedStyle}>
      <View style={[styles.header, { paddingHorizontal: screenPadding, paddingTop: headerPaddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.backIcon, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font(22) }]}>Authentication Key</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: screenPadding, paddingBottom: bottomTabSpacing }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={[styles.description, { color: colors.textMuted, fontSize: font(13), marginBottom: space(4), marginTop: space(1) }]}>
            Manage your vault authentication key. This key is required to access protected folders and files.
          </Text>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight, padding: isTablet ? space(8) : space(6) }]}>
            <View style={[styles.sectionHeaderRow, { marginBottom: isTablet ? space(6) : space(5) }]}>
              <ShieldCheck size={16} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font(13) }]}>Update Authentication Key</Text>
            </View>

            <View style={{ width: '100%', marginBottom: space(5) }}>
              <View style={[styles.fieldLabelRow, { marginBottom: space(2) }]}>
                <Lock size={14} color={colors.textMuted} strokeWidth={2} />
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>CURRENT AUTHENTICATION KEY</Text>
              </View>
              <View style={{ minHeight: INPUT_H, flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={{ flex: 1, minHeight: INPUT_H, borderRadius: radius(8), paddingHorizontal: space(4), paddingVertical: space(3), fontSize: font(15), color: colors.text, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderWidth: 1, borderColor: colors.border, paddingRight: space(10) }}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Enter current authentication key"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showCurrentPassword}
                />
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 }} onPress={() => setShowCurrentPassword(!showCurrentPassword)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  {showCurrentPassword ? (
                    <EyeOff size={16} color={colors.textMuted} strokeWidth={2} />
                  ) : (
                    <Eye size={16} color={colors.textMuted} strokeWidth={2} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderLight, marginVertical: space(4) }]} />

            <View style={{ width: '100%', marginBottom: space(5) }}>
              <View style={[styles.fieldLabelRow, { marginBottom: space(2) }]}>
                <Key size={14} color={colors.textMuted} strokeWidth={2} />
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>NEW AUTHENTICATION KEY</Text>
              </View>
              <View style={{ minHeight: INPUT_H, flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={{ flex: 1, minHeight: INPUT_H, borderRadius: radius(8), paddingHorizontal: space(4), paddingVertical: space(3), fontSize: font(15), color: colors.text, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderWidth: 1, borderColor: colors.border, paddingRight: space(10) }}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new authentication key"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showNewPassword}
                />
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 }} onPress={() => setShowNewPassword(!showNewPassword)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  {showNewPassword ? (
                    <EyeOff size={16} color={colors.textMuted} strokeWidth={2} />
                  ) : (
                    <Eye size={16} color={colors.textMuted} strokeWidth={2} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderLight, marginVertical: space(4) }]} />

            <View style={{ width: '100%' }}>
              <View style={[styles.fieldLabelRow, { marginBottom: space(2) }]}>
                <Key size={14} color={colors.textMuted} strokeWidth={2} />
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>CONFIRM NEW AUTHENTICATION KEY</Text>
              </View>
              <View style={{ minHeight: INPUT_H, flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={{ flex: 1, minHeight: INPUT_H, borderRadius: radius(8), paddingHorizontal: space(4), paddingVertical: space(3), fontSize: font(15), color: colors.text, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderWidth: 1, borderColor: colors.border, paddingRight: space(10) }}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new authentication key"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showConfirmPassword}
                />
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 }} onPress={() => setShowConfirmPassword(!showConfirmPassword)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  {showConfirmPassword ? (
                    <EyeOff size={16} color={colors.textMuted} strokeWidth={2} />
                  ) : (
                    <Eye size={16} color={colors.textMuted} strokeWidth={2} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={{ minHeight: INPUT_H, width: '100%', marginTop: space(6) }}>
            <TouchableOpacity
              onPress={handleChangeAuthKey}
              style={[styles.primaryBtn, { opacity: isChanging ? 0.7 : 1, backgroundColor: colors.primary, minHeight: INPUT_H }]}
              disabled={isChanging}
              activeOpacity={0.78}
            >
              <ShieldCheck size={18} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={[styles.primaryBtnText, { color: '#FFFFFF', fontSize: font(15) }]}>{isChanging ? 'Updating...' : 'Change Authentication Key'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight, marginTop: space(4), padding: isTablet ? space(8) : space(6) }]}>
            <View style={[styles.sectionHeaderRow, { marginBottom: isTablet ? space(6) : space(5) }]}>
              <Key size={16} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font(13) }]}>Authentication Key Hint</Text>
            </View>

            {currentHint ? (
              <View style={[styles.hintBoxColumn, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', borderColor: colors.borderLight }]}>
                <TextInput
                  style={[
                    styles.hintInput,
                    {
                      color: isEditingHint ? colors.text : colors.textMuted,
                      backgroundColor: isEditingHint
                        ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')
                        : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
                      borderColor: isEditingHint ? colors.border : colors.borderLight,
                    }
                  ]}
                  value={isEditingHint ? hintText : (currentHint || '')}
                  onChangeText={setHintText}
                  placeholder="No hint set"
                  placeholderTextColor={colors.textMuted}
                  editable={isEditingHint}
                />
                <View style={[styles.hintActions, { marginTop: space(3) }]}>
                  <TouchableOpacity onPress={handleDeleteHint} style={styles.hintBtnSecondary}>
                    <Text style={[styles.hintBtnText, { color: colors.error }]}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (isEditingHint) {
                        handleSaveHint();
                      } else {
                        setHintText(currentHint);
                        setIsEditingHint(true);
                      }
                    }}
                    style={[
                      styles.hintBtn,
                      {
                        backgroundColor: isEditingHint ? colors.primary : 'transparent',
                        borderColor: colors.borderLight,
                        borderWidth: 1,
                      }
                    ]}
                  >
                    <Text style={[styles.hintBtnText, { color: isEditingHint ? '#FFFFFF' : colors.text }]}>
                      {isEditingHint ? 'Save' : 'Edit'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={[styles.hintBoxColumn, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', borderColor: colors.borderLight }]}>
                <TextInput
                  style={[
                    styles.hintInput,
                    {
                      color: isEditingHint ? colors.text : colors.textMuted,
                      backgroundColor: isEditingHint
                        ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')
                        : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
                      borderColor: isEditingHint ? colors.border : colors.borderLight,
                    }
                  ]}
                  value={isEditingHint ? hintText : (currentHint || '')}
                  onChangeText={setHintText}
                  placeholder="No hint set"
                  placeholderTextColor={colors.textMuted}
                  editable={isEditingHint}
                />
                <View style={[styles.hintActions, { marginTop: space(3) }]}>
                  <TouchableOpacity
                    onPress={() => {
                      if (isEditingHint) {
                        handleSaveHint();
                      } else {
                        setHintText('');
                        setIsEditingHint(true);
                      }
                    }}
                    style={[
                      styles.hintBtn,
                      {
                        backgroundColor: isEditingHint ? colors.primary : 'transparent',
                        borderColor: colors.borderLight,
                        borderWidth: 1,
                      }
                    ]}
                  >
                    <Text style={[styles.hintBtnText, { color: isEditingHint ? '#FFFFFF' : colors.text }]}>
                      {isEditingHint ? 'Save' : 'Add Hint'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          <View style={{ height: bottomTabSpacing }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <AnimatedTabBar />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
  },
  backBtn: { padding: 6, marginRight: 4 },
  backIcon: { fontWeight: '600', fontSize: 22 },
  headerTitle: { fontWeight: '700', letterSpacing: -0.5, marginLeft: 12 },
  content: { paddingTop: 4 },
  description: { lineHeight: 18 },
  verifyContent: { paddingTop: 4, flexGrow: 1, justifyContent: 'center' },

  card: {
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: { fontWeight: '800', letterSpacing: 0.5 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
  },
  primaryBtnText: { fontWeight: '800' },
  hintBoxColumn: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  hintInput: {
    width: '100%',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
  },
  hintActions: { flexDirection: 'row', gap: 8 },
  hintBtn: {
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  hintBtnSecondary: {
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  hintBtnText: { fontWeight: '700' },
  emptyCard: {
    borderRadius: 24,
    alignItems: 'center',
    padding: 24,
    borderWidth: 1,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontWeight: '700', marginTop: 4, marginBottom: 8, textAlign: 'center' },
  emptyText: { textAlign: 'center', lineHeight: 18, paddingHorizontal: 24 },

  verifyCard: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    maxWidth: 420,
    alignSelf: 'center',
  },
  lockIconWrap: { alignItems: 'center', justifyContent: 'center' },
  lockIconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyTitle: {
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  verifySubtitle: {
    textAlign: 'center',
    lineHeight: 20,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    borderRadius: 14,
  },
  verifyButtonText: {
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
