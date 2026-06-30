import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, Key, Lock, ShieldCheck } from 'lucide-react-native';
import { router } from 'expo-router';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuthStore } from '../../../store/authStore';
import { validatePin } from '../../../utils/accessKeyValidation';

export default function AuthKeyScreen() {
  const { isDark, colors, space, screenPadding, bottomTabSpacing, headerPaddingTop, font, isTablet, clampSize } = useTheme();
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

  const [editingHint, setEditingHint] = useState(false);
  const [hintText, setHintText] = useState(securityHint || '');
  const currentHint = securityHint || '';

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
    setEditingHint(false);
    Alert.alert('Hint Updated', 'Your authentication key hint has been saved.');
  };

  const handleDeleteHint = async () => {
    await deleteSecurityHint();
    setHintText('');
    setEditingHint(false);
    Alert.alert('Hint Deleted', 'The authentication key hint has been removed.');
  };

  if (!isConfigured) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: isDark ? '#000000' : '#F5EFE0' }]}>
        <View style={[styles.header, { paddingHorizontal: screenPadding, paddingTop: headerPaddingTop }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={[styles.backIcon, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: font(22) }]}>Authentication Key</Text>
        </View>
        <View style={[styles.content, { paddingHorizontal: screenPadding, paddingBottom: bottomTabSpacing }]}>
          <View style={[styles.emptyCard, { backgroundColor: isDark ? '#141428' : '#FFFFFF' }]}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🔑</Text>
            <Text style={[styles.emptyTitle, { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: font(18) }]}>Vault Not Initialized</Text>
            <Text style={[styles.emptyText, { color: isDark ? '#8E8EA0' : '#64748B', fontSize: font(13) }]}>
              Please complete the initial vault setup to manage your authentication key.
            </Text>
          </View>
        </View>
        <AnimatedTabBar />
      </SafeAreaView>
    );
  }

  if (!isVerified) {
    const CREAM = '#F5EFE0';
    const WHITE = '#FFFFFF';
    const BLUE = '#5162FF';
    const BLACK = '#000000';
    const GREY_DARK = '#141428';
    const GREY_MID = '#2A2A35';
    const GREY_LIGHT = '#E2E8F0';
    const GREY_TEXT = '#8E8EA0';
    const RED = '#EF4444';

    const c = isDark
      ? { bg: BLACK, card: GREY_DARK, border: GREY_MID, divider: GREY_MID, iconCircle: GREY_MID, iconTint: GREY_TEXT, title: WHITE, subtitle: GREY_TEXT, label: GREY_TEXT, inputBg: BLACK, inputBorder: GREY_MID, inputText: WHITE, placeholder: GREY_TEXT, eye: WHITE, btnBg: WHITE, btnText: BLACK, btnIcon: BLACK, hintBoxBg: BLACK, hintBoxBorder: GREY_MID, hintText: WHITE, editBorder: GREY_MID, editText: WHITE, delBg: RED, delText: WHITE }
      : { bg: CREAM, card: WHITE, border: GREY_LIGHT, divider: GREY_LIGHT, iconCircle: GREY_LIGHT, iconTint: GREY_TEXT, title: BLACK, subtitle: GREY_TEXT, label: GREY_TEXT, inputBg: WHITE, inputBorder: GREY_LIGHT, inputText: BLACK, placeholder: GREY_TEXT, eye: BLACK, btnBg: BLUE, btnText: WHITE, btnIcon: WHITE, hintBoxBg: WHITE, hintBoxBorder: GREY_LIGHT, hintText: BLACK, editBorder: GREY_LIGHT, editText: BLACK, delBg: RED, delText: WHITE };

    const INPUT_H = clampSize(48, 56);
    const LABEL_H = clampSize(16, 20);

    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={[styles.header, { paddingHorizontal: screenPadding, paddingTop: headerPaddingTop }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.backIcon, { color: c.title }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.title, fontSize: font(22) }]}>Authentication Key</Text>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: screenPadding, paddingBottom: bottomTabSpacing }]} showsVerticalScrollIndicator={false}>
          <View style={[styles.verifyCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.lockIconWrap}>
              <View style={[styles.lockIconCircle, { backgroundColor: c.iconCircle }]}>
                <Lock size={28} color={c.iconTint} strokeWidth={1.8} />
              </View>
            </View>

            <View style={{ justifyContent: 'center', width: '100%' }}>
              <Text style={[styles.verifyTitle, { color: c.title, fontSize: font(20) }]} numberOfLines={2}>
                Security Verification Required
              </Text>
              <Text style={[styles.verifySubtitle, { color: c.subtitle, fontSize: font(13) }]} numberOfLines={2}>
                Enter your current authentication key to access{'\n'}the management screen.
              </Text>
            </View>

            <View style={{ width: '100%', justifyContent: 'space-between' }}>
              <View style={{ minHeight: LABEL_H, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Lock size={13} color={c.label} strokeWidth={2} />
                <Text style={{ fontSize: font(11), fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: c.label, flexShrink: 1 }} numberOfLines={1}>
                  CURRENT AUTHENTICATION KEY
                </Text>
              </View>

              <View style={{ minHeight: INPUT_H, flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={{ flex: 1, minHeight: INPUT_H, borderRadius: 14, paddingHorizontal: space(4), paddingVertical: space(3), fontSize: font(15), color: c.inputText, backgroundColor: c.inputBg, borderWidth: 1, borderColor: c.inputBorder, paddingRight: space(10) }}
                  value={verifyPassword}
                  onChangeText={setVerifyPassword}
                  placeholder="Enter current authentication key"
                  placeholderTextColor={c.placeholder}
                  secureTextEntry={!showVerifyPassword}
                  autoFocus
                />
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 }} onPress={() => setShowVerifyPassword(!showVerifyPassword)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={{ fontSize: font(12), fontWeight: '600', color: c.eye }} numberOfLines={1}>{showVerifyPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ width: '100%', marginTop: space(6) }}>
              <TouchableOpacity
                onPress={handleVerify}
                style={[styles.verifyButton, { opacity: isVerifying ? 0.65 : 1, backgroundColor: c.btnBg, minHeight: INPUT_H }]}
                disabled={isVerifying}
                activeOpacity={0.78}
              >
                <ShieldCheck size={18} color={c.btnIcon} strokeWidth={2.5} />
                <Text style={[styles.verifyButtonText, { color: c.btnText, fontSize: font(15) }]}>{isVerifying ? 'Verifying…' : 'Verify'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        <AnimatedTabBar />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: isDark ? '#000000' : '#F5EFE0' }]}>
      <View style={[styles.header, { paddingHorizontal: screenPadding, paddingTop: headerPaddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.backIcon, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: font(22) }]}>Authentication Key</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: screenPadding, paddingBottom: bottomTabSpacing }]} showsVerticalScrollIndicator={false}>
        <Text style={[styles.description, { color: isDark ? '#8E8EA0' : '#64748B', fontSize: font(13) }]}>
          Manage your vault authentication key. This key is required to access protected folders and files.
        </Text>

        <View style={[styles.card, { backgroundColor: isDark ? '#141428' : '#FFFFFF', borderColor: isDark ? '#2A2A35' : '#E2E8F0' }]}>
          <View style={styles.sectionHeaderRow}>
            <ShieldCheck size={16} color={isDark ? '#8E8EA0' : '#64748B'} strokeWidth={2} />
            <Text style={[styles.sectionTitle, { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: font(13) }]}>Update Authentication Key</Text>
          </View>

          <View style={{ width: '100%' }}>
            <View style={{ minHeight: 70, justifyContent: 'space-between' }}>
              <View style={{ minHeight: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Lock size={13} color={isDark ? '#8E8EA0' : '#64748B'} strokeWidth={2} />
                <Text style={{ fontSize: font(11), fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: isDark ? '#8E8EA0' : '#64748B', flexShrink: 1 }} numberOfLines={1}>
                  CURRENT AUTHENTICATION KEY
                </Text>
              </View>
              <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={{ flex: 1, minHeight: 52, borderRadius: 14, paddingHorizontal: space(4), paddingVertical: space(3), fontSize: font(15), color: isDark ? '#FFFFFF' : '#0F172A', backgroundColor: isDark ? '#000000' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#2A2A35' : '#E2E8F0', paddingRight: space(10) }}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Enter current authentication key"
                  placeholderTextColor={isDark ? '#8E8EA0' : '#64748B'}
                  secureTextEntry={!showCurrentPassword}
                />
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 }} onPress={() => setShowCurrentPassword(!showCurrentPassword)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Eye size={14} color={isDark ? '#FFFFFF' : '#0F172A'} strokeWidth={2} />
                  <Text style={{ fontSize: font(12), fontWeight: '600', color: isDark ? '#FFFFFF' : '#0F172A' }} numberOfLines={1}>{showCurrentPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: isDark ? '#2A2A35' : '#E2E8F0', marginVertical: space(4) }} />

            <View style={{ minHeight: 70, justifyContent: 'space-between' }}>
              <View style={{ minHeight: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Key size={13} color={isDark ? '#8E8EA0' : '#64748B'} strokeWidth={2} />
                <Text style={{ fontSize: font(11), fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: isDark ? '#8E8EA0' : '#64748B', flexShrink: 1 }} numberOfLines={1}>
                  NEW AUTHENTICATION KEY
                </Text>
              </View>
              <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={{ flex: 1, minHeight: 52, borderRadius: 14, paddingHorizontal: space(4), paddingVertical: space(3), fontSize: font(15), color: isDark ? '#FFFFFF' : '#0F172A', backgroundColor: isDark ? '#000000' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#2A2A35' : '#E2E8F0', paddingRight: space(10) }}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new authentication key"
                  placeholderTextColor={isDark ? '#8E8EA0' : '#64748B'}
                  secureTextEntry={!showNewPassword}
                />
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 }} onPress={() => setShowNewPassword(!showNewPassword)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Eye size={14} color={isDark ? '#FFFFFF' : '#0F172A'} strokeWidth={2} />
                  <Text style={{ fontSize: font(12), fontWeight: '600', color: isDark ? '#FFFFFF' : '#0F172A' }} numberOfLines={1}>{showNewPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: isDark ? '#2A2A35' : '#E2E8F0', marginVertical: space(4) }} />

            <View style={{ minHeight: 70, justifyContent: 'space-between' }}>
              <View style={{ minHeight: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Key size={13} color={isDark ? '#8E8EA0' : '#64748B'} strokeWidth={2} />
                <Text style={{ fontSize: font(11), fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: isDark ? '#8E8EA0' : '#64748B', flexShrink: 1 }} numberOfLines={1}>
                  CONFIRM NEW AUTHENTICATION KEY
                </Text>
              </View>
              <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={{ flex: 1, minHeight: 52, borderRadius: 14, paddingHorizontal: space(4), paddingVertical: space(3), fontSize: font(15), color: isDark ? '#FFFFFF' : '#0F172A', backgroundColor: isDark ? '#000000' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#2A2A35' : '#E2E8F0', paddingRight: space(10) }}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new authentication key"
                  placeholderTextColor={isDark ? '#8E8EA0' : '#64748B'}
                  secureTextEntry={!showConfirmPassword}
                />
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 }} onPress={() => setShowConfirmPassword(!showConfirmPassword)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Eye size={14} color={isDark ? '#FFFFFF' : '#0F172A'} strokeWidth={2} />
                  <Text style={{ fontSize: font(12), fontWeight: '600', color: isDark ? '#FFFFFF' : '#0F172A' }} numberOfLines={1}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={{ minHeight: 52, width: '100%', marginTop: space(6) }}>
            <TouchableOpacity
              onPress={handleChangeAuthKey}
              style={[styles.primaryBtn, { opacity: isChanging ? 0.7 : 1, backgroundColor: isDark ? '#FFFFFF' : '#5162FF', minHeight: 52 }]}
              disabled={isChanging}
              activeOpacity={0.78}
            >
              <ShieldCheck size={18} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
              <Text style={[styles.primaryBtnText, { color: isDark ? '#000000' : '#FFFFFF', fontSize: font(15) }]}>{isChanging ? 'Updating...' : 'Change Authentication Key'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: isDark ? '#141428' : '#FFFFFF', borderColor: isDark ? '#2A2A35' : '#E2E8F0', marginTop: space(4) }]}>
          <View style={styles.sectionHeaderRow}>
            <Key size={16} color={isDark ? '#8E8EA0' : '#64748B'} strokeWidth={2} />
            <Text style={[styles.sectionTitle, { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: font(13) }]}>Authentication Key Hint</Text>
          </View>

          {currentHint ? (
            <View style={[styles.hintBox, { backgroundColor: isDark ? '#000000' : '#FFFFFF', borderColor: isDark ? '#2A2A35' : '#E2E8F0' }]}>
              <Text style={[styles.hintText, { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: font(14) }]}>{currentHint}</Text>
              <View style={styles.hintActions}>
                <TouchableOpacity
                  onPress={() => {
                    setHintText(currentHint);
                    setEditingHint(true);
                  }}
                  style={[styles.hintBtn, { borderColor: isDark ? '#2A2A35' : '#E2E8F0' }]}
                >
                  <Text style={[styles.hintBtnText, { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: font(12) }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDeleteHint} style={[styles.hintBtn, { backgroundColor: '#EF4444' }]}>
                  <Text style={[styles.hintBtnText, { color: '#FFFFFF', fontSize: font(12) }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[styles.hintBox, { backgroundColor: isDark ? '#000000' : '#FFFFFF', borderColor: isDark ? '#2A2A35' : '#E2E8F0' }]}>
              <Text style={[styles.hintText, { color: isDark ? '#8E8EA0' : '#64748B', fontSize: font(14) }]}>No hint set</Text>
              <TouchableOpacity
                onPress={() => setEditingHint(true)}
                style={[styles.hintBtn, { borderColor: isDark ? '#2A2A35' : '#E2E8F0' }]}
              >
                <Text style={[styles.hintBtnText, { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: font(12) }]}>Add Hint</Text>
              </TouchableOpacity>
            </View>
          )}

          {editingHint && (
            <View style={[styles.editHintBox, { borderColor: isDark ? '#2A2A35' : '#E2E8F0', marginTop: space(3) }]}>
              <TextInput
                style={[styles.hintInput, { color: isDark ? '#FFFFFF' : '#0F172A', backgroundColor: isDark ? '#000000' : '#FFFFFF', paddingHorizontal: space(4), paddingVertical: space(3), fontSize: font(15) }]}
                value={hintText}
                onChangeText={setHintText}
                placeholder="Enter a hint for your authentication key"
                placeholderTextColor={isDark ? '#8E8EA0' : '#64748B'}
              />
              <View style={styles.editHintActions}>
                <TouchableOpacity
                  onPress={() => {
                    setEditingHint(false);
                    setHintText(currentHint);
                  }}
                  style={[styles.hintBtn, { borderColor: isDark ? '#2A2A35' : '#E2E8F0' }]}
                >
                  <Text style={[styles.hintBtnText, { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: font(12) }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveHint} style={[styles.hintBtn, { backgroundColor: isDark ? '#FFFFFF' : '#5162FF' }]}>
                  <Text style={[styles.hintBtnText, { color: isDark ? '#000000' : '#FFFFFF', fontSize: font(12) }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={{ height: bottomTabSpacing }} />
      </ScrollView>

      <AnimatedTabBar />
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
  backIcon: { fontWeight: '600' },
  headerTitle: { fontWeight: '700', letterSpacing: -0.5, marginLeft: 12 },
  content: { paddingTop: 4 },
  description: { lineHeight: 18, marginBottom: 16, marginTop: 2 },

  card: {
    borderRadius: 20,
    marginBottom: 16,
  },
  sectionTitle: { fontWeight: '800', letterSpacing: 0.5, marginBottom: 16 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
  },
  primaryBtnText: { fontWeight: '800' },
  hintBox: {
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  hintText: { flex: 1 },
  hintActions: { flexDirection: 'row', gap: 8 },
  hintBtn: {
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintBtnText: { fontWeight: '700' },
  editHintBox: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  hintInput: {
    width: '100%',
    borderRadius: 14,
  },
  editHintActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  emptyCard: {
    borderRadius: 24,
    alignItems: 'center',
  },
  emptyTitle: { fontWeight: '700', marginTop: 4, marginBottom: 2 },
  emptyText: { textAlign: 'center', marginTop: 2 },

  verifyCard: {
    borderWidth: 1,
    borderRadius: 20,
    alignItems: 'center',
  },
  lockIconWrap: { marginBottom: 20 },
  lockIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
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
    lineHeight: 18,
  },
  inputWrapper: {
    width: '100%',
    minHeight: 52,
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
