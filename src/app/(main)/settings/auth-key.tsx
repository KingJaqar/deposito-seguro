// src/app/(main)/settings/auth-key.tsx
// Rebuilt per plans/you-are-a-senior-majestic-swing.md §3/§7 Phase 4.
// Every store hook and handler body (verify/authenticate, change-key flow via
// initializeVault, hint save/delete, lockout checks via useLockoutStore) is
// unchanged; only JSX/StyleSheet is new. Notable per-plan changes:
//  - VaultHeader (newly adopted — three separate inline `header` blocks +
//    headerPaddingTop before, one per state branch, all collapsed onto this
//    one component per §2/§5)
//  - TextField.secureToggle replaces the 3 duplicated eye-icon blocks in this
//    file (verify / current / new / confirm password inputs)
//  - the 3 states (not-initialized / verify-gate / change-key form) keep their
//    exact structure — EmptyState, a verify Card, and the change-key form Card
//    + hint Card — per §3's screen row
//  - the screen-enter fade goes through the shared useScreenEnterAnimation()
//    hook (§4) instead of a hand-rolled copy — see folder/[id].tsx
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Key, Lock, ShieldCheck } from 'lucide-react-native';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { VaultHeader } from '../../../components/VaultHeader';
import { Button } from '../../../components/primitives/Button';
import { Card } from '../../../components/primitives/Card';
import { EmptyState } from '../../../components/primitives/EmptyState';
import { TextField } from '../../../components/primitives/TextField';
import { Type } from '../../../constants/typography';
import { useTheme } from '../../../contexts/ThemeContext';
import Animated from 'react-native-reanimated';
import { useScreenEnterAnimation } from '../../../hooks/useScreenEnterAnimation';
import { PIN_LOCKOUT_KEY, useAuthStore } from '../../../store/authStore';
import { useLockoutStore } from '../../../store/lockoutStore';
import { validatePin } from '../../../utils/accessKeyValidation';

export default function AuthKeyScreen() {
  const { colors, space, font, screenPadding, bottomTabSpacing, isTablet , iconSize } = useTheme();
  const { isConfigured, securityHint, authenticate, initializeVault, updateSecurityHint, deleteSecurityHint } = useAuthStore();

  const [isVerified, setIsVerified] = useState(false);
  const [verifyPassword, setVerifyPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChanging, setIsChanging] = useState(false);

  const [isEditingHint, setIsEditingHint] = useState(false);
  const [hintText, setHintText] = useState(securityHint || '');
  const currentHint = securityHint || '';

  const screenAnimatedStyle = useScreenEnterAnimation();

  const handleVerify = async () => {
    if (!verifyPassword.trim()) { Alert.alert('Password Required', 'Please enter your authentication key.'); return; }
    const pinValidation = validatePin(verifyPassword);
    if (!pinValidation.valid) { Alert.alert('Invalid PIN', pinValidation.message); return; }
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
    if (!currentPassword.trim()) { Alert.alert('Current Password Required', 'Please enter your current authentication key.'); return; }
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
      <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
        <VaultHeader title="Authentication Key" showBack />
        <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
          <View style={{ paddingHorizontal: screenPadding, paddingTop: space(6) }}>
            <EmptyState icon={Key} title="Vault Not Initialized" message="Please complete the initial vault setup to manage your authentication key." />
          </View>
        </Animated.View>
        <AnimatedTabBar />
      </SafeAreaView>
    );
  }

  if (!isVerified) {
    return (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
        <VaultHeader title="Authentication Key" showBack />
        <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
          <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              contentContainerStyle={[styles.verifyContent, { paddingHorizontal: screenPadding, paddingBottom: bottomTabSpacing }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Card style={[styles.verifyCard, { maxWidth: isTablet ? 420 : undefined, padding: space(6) }]}>
                <View style={[styles.lockIconCircle, { backgroundColor: colors.surfaceHover, marginBottom: space(5) }]}>
                  <Lock size={iconSize(28)} color={colors.textMuted} strokeWidth={1.8} />
                </View>
                <Text style={[styles.verifyTitle, { color: colors.text, fontSize: font(Type.headline.size), marginBottom: space(2) }]}>Security Verification Required</Text>
                <Text style={[styles.verifySubtitle, { color: colors.textMuted, fontSize: font(Type.body.size), marginBottom: space(6) }]}>
                  Enter your authentication key to access the management screen.
                </Text>
                <View style={{ width: '100%' }}>
                  <TextField label="Authentication Key" value={verifyPassword} onChangeText={setVerifyPassword} placeholder="Enter current authentication key" secureToggle autoFocus accessibilityLabel="Authentication key" />
                  <Button title={isVerifying ? 'Verifying…' : 'Verify'} onPress={handleVerify} loading={isVerifying} icon={ShieldCheck} />
                </View>
              </Card>
            </ScrollView>
          </KeyboardAvoidingView>
        </Animated.View>
        <AnimatedTabBar />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Authentication Key" showBack />
      <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
        <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: screenPadding, paddingTop: space(4), paddingBottom: bottomTabSpacing }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[styles.description, { color: colors.textMuted, fontSize: font(Type.caption.size), marginBottom: space(4) }]}>
              Manage your vault authentication key. This key is required to access protected folders and files.
            </Text>

            <Card style={{ marginBottom: space(4) }}>
              <View style={[styles.sectionHeaderRow, { marginBottom: space(4), gap: space(2) }]}>
                <ShieldCheck size={iconSize(16)} color={colors.textMuted} strokeWidth={2} />
                <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font(Type.eyebrow.size) }]}>Update Authentication Key</Text>
              </View>
              <TextField label="Current Authentication Key" value={currentPassword} onChangeText={setCurrentPassword} placeholder="Enter current authentication key" secureToggle accessibilityLabel="Current authentication key" />
              <TextField label="New Authentication Key" value={newPassword} onChangeText={setNewPassword} placeholder="Enter new authentication key" secureToggle accessibilityLabel="New authentication key" />
              <TextField
                label="Confirm New Authentication Key"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new authentication key"
                secureToggle
                error={confirmPassword.length > 0 && newPassword !== confirmPassword ? 'Passwords do not match' : undefined}
                accessibilityLabel="Confirm new authentication key"
              />
            </Card>

            <Button title={isChanging ? 'Updating…' : 'Change Authentication Key'} onPress={handleChangeAuthKey} loading={isChanging} icon={ShieldCheck} style={{ marginBottom: space(4) }} />

            <Card>
              <View style={[styles.sectionHeaderRow, { marginBottom: space(4), gap: space(2) }]}>
                <Key size={iconSize(16)} color={colors.textMuted} strokeWidth={2} />
                <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font(Type.eyebrow.size) }]}>Authentication Key Hint</Text>
              </View>

              <TextField
                value={isEditingHint ? hintText : currentHint}
                onChangeText={setHintText}
                placeholder="No hint set"
                editable={isEditingHint}
                accessibilityLabel="Authentication key hint"
              />
              <View style={[styles.hintActions, { gap: space(2) }]}>
                {currentHint ? (
                  <Button
                    title="Delete"
                    variant="tertiary"
                    size="sm"
                    onPress={handleDeleteHint}
                  />
                ) : null}
                <Button
                  title={isEditingHint ? 'Save' : currentHint ? 'Edit' : 'Add Hint'}
                  variant={isEditingHint ? 'primary' : 'tertiary'}
                  size="sm"
                  onPress={() => {
                    if (isEditingHint) {
                      handleSaveHint();
                    } else {
                      setHintText(currentHint);
                      setIsEditingHint(true);
                    }
                  }}
                />
              </View>
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
      <AnimatedTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  content: {},
  description: { lineHeight: 18 },
  verifyContent: { flexGrow: 1, justifyContent: 'center' },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },

  verifyCard: { alignItems: 'center', alignSelf: 'center', width: '100%' },
  lockIconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  verifyTitle: { fontWeight: '700', textAlign: 'center' },
  verifySubtitle: { textAlign: 'center', lineHeight: 20 },

  hintActions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
