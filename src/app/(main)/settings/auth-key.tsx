import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Eye, EyeOff, Key, Lock, ShieldCheck } from 'lucide-react-native';
import { router } from 'expo-router';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuthStore } from '../../../store/authStore';
import { validatePin, PIN_MIN_LENGTH } from '../../../utils/accessKeyValidation';

export default function AuthKeyScreen() {
  const { colors, isDark } = useTheme();
  const { isConfigured, securityHint, authenticate, initializeVault, updateSecurityHint, deleteSecurityHint } = useAuthStore();

  const theme = {
    bg: colors.background,
    surface: colors.surface,
    text: colors.text,
    textMuted: colors.textMuted,
    border: colors.border,
    inputBg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
  };

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
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={[styles.header, { backgroundColor: theme.bg }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={[styles.backIcon, { color: theme.text }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Authentication Key</Text>
        </View>
        <View style={styles.content}>
          <View style={[styles.emptyCard, { backgroundColor: theme.surface }]}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🔑</Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Vault Not Initialized</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              Please complete the initial vault setup to manage your authentication key.
            </Text>
          </View>
        </View>
        <AnimatedTabBar />
      </View>
    );
  }

  if (!isVerified) {
    return (
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={[styles.header, { backgroundColor: theme.bg }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={[styles.backIcon, { color: theme.text }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Authentication Key</Text>
        </View>
        <View style={styles.content}>
          <View style={[styles.emptyCard, { backgroundColor: theme.surface }]}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🔒</Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Security Verification Required</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              Enter your current authentication key to access the management screen.
            </Text>
            <View style={{ marginTop: 20 }}>
              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Lock size={14} color={theme.textMuted} strokeWidth={2} />
                  <Text style={[styles.label, { color: theme.textMuted }]}>CURRENT AUTHENTICATION KEY</Text>
                </View>
                <View style={styles.inputWithAction}>
                  <TextInput
                    style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg }]}
                    value={verifyPassword}
                    onChangeText={setVerifyPassword}
                    placeholder="Enter current authentication key"
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry={!showVerifyPassword}
                    autoFocus
                  />
                  <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowVerifyPassword(!showVerifyPassword)}>
                    {showVerifyPassword ? <EyeOff size={16} color={theme.textMuted} strokeWidth={2} /> : <Eye size={16} color={theme.textMuted} strokeWidth={2} />}
                    <Text style={[styles.eyeText, { color: theme.textMuted }]}>{showVerifyPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleVerify}
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: isVerifying ? 0.7 : 1 }]}
                disabled={isVerifying}
              >
                <ShieldCheck size={18} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.primaryBtnText}>{isVerifying ? 'Verifying...' : 'Verify'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <AnimatedTabBar />
      </View>
    );
  }

  const currentHint = securityHint || '';

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { backgroundColor: theme.bg }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backIcon, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Authentication Key</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.description, { color: theme.textMuted }]}>
          Manage your vault authentication key. This key is required to access protected folders and files.
        </Text>

        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Update Authentication Key</Text>

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Lock size={14} color={theme.textMuted} strokeWidth={2} />
              <Text style={[styles.label, { color: theme.textMuted }]}>CURRENT AUTHENTICATION KEY</Text>
            </View>
            <View style={styles.inputWithAction}>
              <TextInput
                style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg }]}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Enter current authentication key"
                placeholderTextColor={theme.textMuted}
                secureTextEntry={!showCurrentPassword}
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                {showCurrentPassword ? <EyeOff size={16} color={theme.textMuted} strokeWidth={2} /> : <Eye size={16} color={theme.textMuted} strokeWidth={2} />}
                <Text style={[styles.eyeText, { color: theme.textMuted }]}>{showCurrentPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Key size={14} color={theme.textMuted} strokeWidth={2} />
              <Text style={[styles.label, { color: theme.textMuted }]}>NEW AUTHENTICATION KEY</Text>
            </View>
            <View style={styles.inputWithAction}>
              <TextInput
                style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg }]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Enter new authentication key"
                placeholderTextColor={theme.textMuted}
                secureTextEntry={!showNewPassword}
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowNewPassword(!showNewPassword)}>
                {showNewPassword ? <EyeOff size={16} color={theme.textMuted} strokeWidth={2} /> : <Eye size={16} color={theme.textMuted} strokeWidth={2} />}
                <Text style={[styles.eyeText, { color: theme.textMuted }]}>{showNewPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Key size={14} color={theme.textMuted} strokeWidth={2} />
              <Text style={[styles.label, { color: theme.textMuted }]}>CONFIRM NEW AUTHENTICATION KEY</Text>
            </View>
            <View style={styles.inputWithAction}>
              <TextInput
                style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new authentication key"
                placeholderTextColor={theme.textMuted}
                secureTextEntry={!showConfirmPassword}
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                {showConfirmPassword ? <EyeOff size={16} color={theme.textMuted} strokeWidth={2} /> : <Eye size={16} color={theme.textMuted} strokeWidth={2} />}
                <Text style={[styles.eyeText, { color: theme.textMuted }]}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleChangeAuthKey}
            style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: isChanging ? 0.7 : 1 }]}
            disabled={isChanging}
          >
            <ShieldCheck size={18} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.primaryBtnText}>{isChanging ? 'Updating...' : 'Change Authentication Key'}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, marginTop: 20 }]}>
          <View style={styles.hintHeader}>
            <Key size={16} color={theme.text} strokeWidth={2} />
            <Text style={[styles.hintTitle, { color: theme.text }]}>Authentication Key Hint</Text>
          </View>

          {currentHint ? (
            <View style={[styles.hintBox, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
              <Text style={[styles.hintText, { color: theme.text }]}>{currentHint}</Text>
              <View style={styles.hintActions}>
                <TouchableOpacity
                  onPress={() => {
                    setHintText(currentHint);
                    setEditingHint(true);
                  }}
                  style={[styles.hintBtn, { borderColor: theme.border }]}
                >
                  <Text style={[styles.hintBtnText, { color: theme.text }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDeleteHint} style={[styles.hintBtn, { backgroundColor: colors.error }]}>
                  <Text style={[styles.hintBtnText, { color: '#FFFFFF' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[styles.hintBox, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
              <Text style={[styles.hintText, { color: theme.textMuted }]}>No hint set</Text>
              <TouchableOpacity
                onPress={() => setEditingHint(true)}
                style={[styles.hintBtn, { borderColor: theme.border }]}
              >
                <Text style={[styles.hintBtnText, { color: theme.text }]}>Add Hint</Text>
              </TouchableOpacity>
            </View>
          )}

          {editingHint && (
            <View style={[styles.editHintBox, { borderColor: theme.border }]}>
              <TextInput
                style={[styles.hintInput, { color: theme.text, backgroundColor: theme.inputBg }]}
                value={hintText}
                onChangeText={setHintText}
                placeholder="Enter a hint for your authentication key"
                placeholderTextColor={theme.textMuted}
              />
              <View style={styles.editHintActions}>
                <TouchableOpacity
                  onPress={() => {
                    setEditingHint(false);
                    setHintText(currentHint);
                  }}
                  style={[styles.hintBtn, { borderColor: theme.border }]}
                >
                  <Text style={[styles.hintBtnText, { color: theme.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveHint} style={[styles.hintBtn, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.hintBtnText, { color: '#FFFFFF' }]}>Save</Text>
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
  backBtn: { padding: 6 },
  backIcon: { fontSize: 22, fontWeight: '600' },
  headerTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, marginLeft: 12 },
  content: { paddingHorizontal: 20, paddingBottom: 110 },
  description: { fontSize: 13, lineHeight: 18, marginBottom: 16, marginTop: 4 },
  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, marginBottom: 16 },
  fieldGroup: { marginBottom: 16 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  input: {
    width: '100%',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  inputWithAction: { position: 'relative' },
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
  eyeText: { fontSize: 12, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 20 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  hintHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  hintTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
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
});
