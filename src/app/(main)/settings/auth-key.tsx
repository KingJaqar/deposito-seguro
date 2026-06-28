import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Eye, Key, Lock, ShieldCheck } from 'lucide-react-native';
import { router } from 'expo-router';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuthStore } from '../../../store/authStore';
import { validatePin } from '../../../utils/accessKeyValidation';

export default function AuthKeyScreen() {
  const { isDark } = useTheme();
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
      <View style={[styles.root, { backgroundColor: isDark ? '#000000' : '#F5EFE0' }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={[styles.backIcon, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Authentication Key</Text>
        </View>
        <View style={styles.content}>
          <View style={[styles.emptyCard, { backgroundColor: isDark ? '#141428' : '#FFFFFF' }]}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🔑</Text>
            <Text style={[styles.emptyTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Vault Not Initialized</Text>
            <Text style={[styles.emptyText, { color: isDark ? '#8E8EA0' : '#64748B' }]}>
              Please complete the initial vault setup to manage your authentication key.
            </Text>
          </View>
        </View>
        <AnimatedTabBar />
      </View>
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

    const INPUT_H = 52;
    const LABEL_H = 18;

    return (
      <View style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.backIcon, { color: c.title }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.title }]}>Authentication Key</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.verifyCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.lockIconWrap}>
              <View style={[styles.lockIconCircle, { backgroundColor: c.iconCircle }]}>
                <Lock size={28} color={c.iconTint} strokeWidth={1.8} />
              </View>
            </View>

            <View style={{ height: 104, justifyContent: 'center', width: '100%' }}>
              <Text style={[styles.verifyTitle, { color: c.title }]} numberOfLines={2}>
                Security Verification Required
              </Text>
              <Text style={[styles.verifySubtitle, { color: c.subtitle }]} numberOfLines={2}>
                Enter your current authentication key to access{'\n'}the management screen.
              </Text>
            </View>

            <View style={{ width: '100%', height: LABEL_H + INPUT_H + 10, justifyContent: 'space-between' }}>
              <View style={{ height: LABEL_H }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Lock size={13} color={c.label} strokeWidth={2} />
                  <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: c.label }} numberOfLines={1}>
                    CURRENT AUTHENTICATION KEY
                  </Text>
                </View>
              </View>

              <View style={{ height: INPUT_H, position: 'relative' }}>
                <TextInput
                  style={{ width: '100%', height: INPUT_H, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: c.inputText, backgroundColor: c.inputBg, borderWidth: 1, borderColor: c.inputBorder, paddingRight: 90 }}
                  value={verifyPassword}
                  onChangeText={setVerifyPassword}
                  placeholder="Enter current authentication key"
                  placeholderTextColor={c.placeholder}
                  secureTextEntry={!showVerifyPassword}
                  autoFocus
                />
                <TouchableOpacity
                  style={{ position: 'absolute', right: 12, top: '50%', marginTop: -18, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, height: 36 }}
                  onPress={() => setShowVerifyPassword(!showVerifyPassword)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: c.eye }} numberOfLines={1}>{showVerifyPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ height: 52, width: '100%', marginTop: 24 }}>
              <TouchableOpacity
                onPress={handleVerify}
                style={[styles.verifyButton, { opacity: isVerifying ? 0.65 : 1, backgroundColor: c.btnBg, height: 52 }]}
                disabled={isVerifying}
                activeOpacity={0.78}
              >
                <ShieldCheck size={18} color={c.btnIcon} strokeWidth={2.5} />
                <Text style={[styles.verifyButtonText, { color: c.btnText }]}>{isVerifying ? 'Verifying…' : 'Verify'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        <AnimatedTabBar />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: isDark ? '#000000' : '#F5EFE0' }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.backIcon, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Authentication Key</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.description, { color: isDark ? '#8E8EA0' : '#64748B' }]}>
          Manage your vault authentication key. This key is required to access protected folders and files.
        </Text>

        <View style={[styles.card, { backgroundColor: isDark ? '#141428' : '#FFFFFF', borderColor: isDark ? '#2A2A35' : '#E2E8F0' }]}>
          <View style={styles.sectionHeaderRow}>
            <ShieldCheck size={16} color={isDark ? '#8E8EA0' : '#64748B'} strokeWidth={2} />
            <Text style={[styles.sectionTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Update Authentication Key</Text>
          </View>

          <View style={{ width: '100%' }}>
            <View style={{ height: 70, justifyContent: 'space-between' }}>
              <View style={{ height: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Lock size={13} color={isDark ? '#8E8EA0' : '#64748B'} strokeWidth={2} />
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: isDark ? '#8E8EA0' : '#64748B' }} numberOfLines={1}>
                  CURRENT AUTHENTICATION KEY
                </Text>
              </View>
              <View style={{ height: 52, position: 'relative' }}>
                <TextInput
                  style={{ width: '100%', height: 52, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: isDark ? '#FFFFFF' : '#0F172A', backgroundColor: isDark ? '#000000' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#2A2A35' : '#E2E8F0', paddingRight: 80 }}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Enter current authentication key"
                  placeholderTextColor={isDark ? '#8E8EA0' : '#64748B'}
                  secureTextEntry={!showCurrentPassword}
                />
                <TouchableOpacity style={{ position: 'absolute', right: 10, top: '50%', marginTop: -16, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4 }} onPress={() => setShowCurrentPassword(!showCurrentPassword)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Eye size={14} color={isDark ? '#FFFFFF' : '#0F172A'} strokeWidth={2} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#FFFFFF' : '#0F172A' }} numberOfLines={1}>{showCurrentPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: isDark ? '#2A2A35' : '#E2E8F0', marginVertical: 16 }} />

            <View style={{ height: 70, justifyContent: 'space-between' }}>
              <View style={{ height: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Key size={13} color={isDark ? '#8E8EA0' : '#64748B'} strokeWidth={2} />
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: isDark ? '#8E8EA0' : '#64748B' }} numberOfLines={1}>
                  NEW AUTHENTICATION KEY
                </Text>
              </View>
              <View style={{ height: 52, position: 'relative' }}>
                <TextInput
                  style={{ width: '100%', height: 52, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: isDark ? '#FFFFFF' : '#0F172A', backgroundColor: isDark ? '#000000' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#2A2A35' : '#E2E8F0', paddingRight: 80 }}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new authentication key"
                  placeholderTextColor={isDark ? '#8E8EA0' : '#64748B'}
                  secureTextEntry={!showNewPassword}
                />
                <TouchableOpacity style={{ position: 'absolute', right: 10, top: '50%', marginTop: -16, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4 }} onPress={() => setShowNewPassword(!showNewPassword)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Eye size={14} color={isDark ? '#FFFFFF' : '#0F172A'} strokeWidth={2} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#FFFFFF' : '#0F172A' }} numberOfLines={1}>{showNewPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: isDark ? '#2A2A35' : '#E2E8F0', marginVertical: 16 }} />

            <View style={{ height: 70, justifyContent: 'space-between' }}>
              <View style={{ height: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Key size={13} color={isDark ? '#8E8EA0' : '#64748B'} strokeWidth={2} />
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: isDark ? '#8E8EA0' : '#64748B' }} numberOfLines={1}>
                  CONFIRM NEW AUTHENTICATION KEY
                </Text>
              </View>
              <View style={{ height: 52, position: 'relative' }}>
                <TextInput
                  style={{ width: '100%', height: 52, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: isDark ? '#FFFFFF' : '#0F172A', backgroundColor: isDark ? '#000000' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#2A2A35' : '#E2E8F0', paddingRight: 80 }}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new authentication key"
                  placeholderTextColor={isDark ? '#8E8EA0' : '#64748B'}
                  secureTextEntry={!showConfirmPassword}
                />
                <TouchableOpacity style={{ position: 'absolute', right: 10, top: '50%', marginTop: -16, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4 }} onPress={() => setShowConfirmPassword(!showConfirmPassword)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Eye size={14} color={isDark ? '#FFFFFF' : '#0F172A'} strokeWidth={2} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#FFFFFF' : '#0F172A' }} numberOfLines={1}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={{ height: 52, width: '100%', marginTop: 24 }}>
            <TouchableOpacity
              onPress={handleChangeAuthKey}
              style={[styles.primaryBtn, { opacity: isChanging ? 0.7 : 1, backgroundColor: isDark ? '#FFFFFF' : '#5162FF', height: 52 }]}
              disabled={isChanging}
              activeOpacity={0.78}
            >
              <ShieldCheck size={18} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
              <Text style={[styles.primaryBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>{isChanging ? 'Updating...' : 'Change Authentication Key'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: isDark ? '#141428' : '#FFFFFF', borderColor: isDark ? '#2A2A35' : '#E2E8F0', marginTop: 20 }]}>
          <View style={styles.sectionHeaderRow}>
            <Key size={16} color={isDark ? '#8E8EA0' : '#64748B'} strokeWidth={2} />
            <Text style={[styles.sectionTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Authentication Key Hint</Text>
          </View>

          {currentHint ? (
            <View style={[styles.hintBox, { backgroundColor: isDark ? '#000000' : '#FFFFFF', borderColor: isDark ? '#2A2A35' : '#E2E8F0' }]}>
              <Text style={[styles.hintText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>{currentHint}</Text>
              <View style={styles.hintActions}>
                <TouchableOpacity
                  onPress={() => {
                    setHintText(currentHint);
                    setEditingHint(true);
                  }}
                  style={[styles.hintBtn, { borderColor: isDark ? '#2A2A35' : '#E2E8F0' }]}
                >
                  <Text style={[styles.hintBtnText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDeleteHint} style={[styles.hintBtn, { backgroundColor: '#EF4444' }]}>
                  <Text style={[styles.hintBtnText, { color: '#FFFFFF' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[styles.hintBox, { backgroundColor: isDark ? '#000000' : '#FFFFFF', borderColor: isDark ? '#2A2A35' : '#E2E8F0' }]}>
              <Text style={[styles.hintText, { color: isDark ? '#8E8EA0' : '#64748B' }]}>No hint set</Text>
              <TouchableOpacity
                onPress={() => setEditingHint(true)}
                style={[styles.hintBtn, { borderColor: isDark ? '#2A2A35' : '#E2E8F0' }]}
              >
                <Text style={[styles.hintBtnText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Add Hint</Text>
              </TouchableOpacity>
            </View>
          )}

          {editingHint && (
            <View style={[styles.editHintBox, { borderColor: isDark ? '#2A2A35' : '#E2E8F0', marginTop: 12 }]}>
              <TextInput
                style={[styles.hintInput, { color: isDark ? '#FFFFFF' : '#0F172A', backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}
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
                  <Text style={[styles.hintBtnText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveHint} style={[styles.hintBtn, { backgroundColor: isDark ? '#FFFFFF' : '#5162FF' }]}>
                  <Text style={[styles.hintBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <AnimatedTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
  },
  backBtn: { padding: 6, marginRight: 4 },
  backIcon: { fontSize: 22, fontWeight: '600' },
  headerTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, marginLeft: 12 },
  content: { paddingHorizontal: 20, paddingBottom: 110, paddingTop: 4 },
  description: { fontSize: 13, lineHeight: 18, marginBottom: 16, marginTop: 4 },

  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, marginBottom: 16 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
  hintBox: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  hintText: { flex: 1, fontSize: 14 },
  hintActions: { flexDirection: 'row', gap: 8 },
  hintBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintBtnText: { fontSize: 12, fontWeight: '700' },
  editHintBox: {
    marginTop: 12,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  hintInput: {
    width: '100%',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  editHintActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  emptyCard: {
    borderRadius: 24,
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 6, paddingHorizontal: 24 },

  verifyCard: {
    backgroundColor: '#141428',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingVertical: 44,
    paddingHorizontal: 28,
    alignItems: 'center',
    minHeight: 480,
    justifyContent: 'space-between',
  },
  lockIconWrap: { marginBottom: 20 },
  lockIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1E1E33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginTop: 20,
    marginBottom: 8,
    height: 56,
  },
  verifySubtitle: {
    color: '#8E8EA0',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 32,
    height: 54,
  },
  inputWrapper: {
    position: 'relative',
    width: '100%',
    minHeight: 52,
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    minHeight: 52,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  verifyButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.2,
  },
});
