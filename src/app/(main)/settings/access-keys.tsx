import { useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AnimatedCard } from '../../../components/AnimatedCard';
import { AccessKeyUnlockModal } from '../../../components/AccessKeyUnlockModal';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { useTheme } from '../../../contexts/ThemeContext';
import { router } from 'expo-router';
import {
  Clipboard,
  Eye,
  EyeOff,
  Info,
  Key,
  Lock,
  ShieldCheck,
  Tag,
  Trash2,
} from 'lucide-react-native';
import { LOCKOUT_DURATION_MS, MAX_PASSWORD_ATTEMPTS, useLockoutStore } from '../../../store/lockoutStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { AccessKeyMetadata } from '../../../types';
import {
  getPasswordValidationMessages,
  getPasswordStrength,
  validatePassword,
} from '../../../utils/accessKeyValidation';

export default function AccessKeysScreen() {
  const { colors, isDark } = useTheme();
  const { accessKeys, createAccessKey, accessKeyExists, deleteAccessKey, updateAccessKey } = useSettingsStore();
  const { recordFailedAttempt, resetAttempts, isLockedOut, getRemainingLockoutTime } = useLockoutStore();

  const theme = useMemo(() => ({
    bg: colors.background,
    card: colors.surface,
    cardBorder: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
    text: colors.text,
    textMuted: colors.textMuted,
    label: colors.textMuted,
    inputBg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    inputBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
    divider: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    iconBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    badgeBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    badgeBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
    notSet: isDark ? '#8E8E93' : '#64748B',
    btnPrimary: isDark ? '#F5F0E8' : colors.text,
    btnPrimaryText: isDark ? '#000000' : '#FFFFFF',
    btnDisabled: isDark ? '#3A3A3C' : 'rgba(0,0,0,0.12)',
    btnDisabledText: isDark ? '#8E8E93' : '#64748B',
    sectionHeaderBorder: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    emptyBorder: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
    verifyCardBg: isDark ? '#1A1A1A' : '#FFFFFF',
    verifyCardBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    verifyOverlay: isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.35)',
    verifyIconRing: isDark ? 'rgba(255,69,58,0.12)' : 'rgba(239,68,68,0.08)',
    verifyIconInner: isDark ? 'rgba(255,69,58,0.15)' : 'rgba(239,68,68,0.1)',
    editCardBg: isDark ? '#1A1A1A' : '#FFFFFF',
    editCardBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    editOverlay: isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.35)',
    cancelBtnBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    cancelBtnBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    keyIconBoxBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
  }), [colors, isDark]);

  const [passwordLabel, setPasswordLabel] = useState('');
  const [passwordDescription, setPasswordDescription] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showValidationMessages, setShowValidationMessages] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const strength = getPasswordStrength(password);
  const strengthColor = strength === 'weak' ? colors.error : strength === 'medium' ? '#FBBF24' : '#34C759';
  const strengthLabelText = strength === 'weak' ? 'Weak' : strength === 'medium' ? 'Medium' : 'Strong';

  const [editingPassword, setEditingPassword] = useState<AccessKeyMetadata | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [pendingEditPassword, setPendingEditPassword] = useState<AccessKeyMetadata | null>(null);
  const [showEditUnlockModal, setShowEditUnlockModal] = useState(false);

  const [pendingDeletePassword, setPendingDeletePassword] = useState<AccessKeyMetadata | null>(null);
  const [deleteVerificationPassword, setDeleteVerificationPassword] = useState('');
  const [showDeleteVerificationModal, setShowDeleteVerificationModal] = useState(false);

  const handleDeleteVerification = async () => {
    if (!pendingDeletePassword) return;

    const lockoutKey = `delete:${pendingDeletePassword.id}`;
    const isCurrentlyLockedOut = isLockedOut(lockoutKey);
    const remainingLockoutTime = getRemainingLockoutTime(lockoutKey);

    if (isCurrentlyLockedOut) {
      Alert.alert('Too Many Attempts', `Please wait ${remainingLockoutTime} seconds before trying again.`);
      return;
    }

    if (deleteVerificationPassword === pendingDeletePassword.password) {
      const result = await deleteAccessKey(pendingDeletePassword.id);
      setShowDeleteVerificationModal(false);
      setPendingDeletePassword(null);
      setDeleteVerificationPassword('');
      resetAttempts(lockoutKey);

      if (result === 'in-use') {
        Alert.alert('Password In Use', 'This password is assigned to at least one file or folder. Reassign or remove before deleting it.');
      } else if (result === 'not-found') {
        Alert.alert('Password Not Found', 'This access key no longer exists.');
      } else {
        Alert.alert('Password Deleted', `${pendingDeletePassword.label} has been deleted.`);
      }
    } else {
      const { newAttempts, remaining, isLockedOut: nowLockedOut } = recordFailedAttempt(lockoutKey);
      setDeleteVerificationPassword('');

      if (nowLockedOut) {
        setShowDeleteVerificationModal(false);
        setPendingDeletePassword(null);
        setDeleteVerificationPassword('');
        Alert.alert(
          'Too Many Failed Attempts',
          `You have exceeded the maximum number of attempts (${MAX_PASSWORD_ATTEMPTS}). Please wait ${LOCKOUT_DURATION_MS / 1000} seconds before trying again.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Incorrect Password',
          `Password does not match. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
          [{ text: 'OK' }]
        );
      }
    }
  };

  const handleCreatePassword = async () => {
    if (accessKeys.length >= 20) {
      Alert.alert('Access Key Limit', 'You can only create up to 20 access keys.');
      return;
    }

    if (!passwordLabel.trim()) {
      Alert.alert('Password Label Required', 'Give this access key a recognizable name.');
      return;
    }

    if (accessKeyExists(passwordLabel)) {
      Alert.alert('Password Label Already Used', 'Access key labels must be unique.');
      return;
    }

    const validation = validatePassword(password);
    if (!validation.valid) {
      setShowValidationMessages(true);
      Alert.alert('Password Does Not Meet Requirements', validation.message);
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Passwords Do Not Match', 'Please confirm your password correctly.');
      return;
    }

    const fp = await createAccessKey(passwordLabel, password, passwordDescription);
    if (!fp) {
      Alert.alert('Access Key Limit', 'You can only create up to 20 access keys.');
      return;
    }

    setPasswordLabel('');
    setPasswordDescription('');
    setPassword('');
    setConfirmPassword('');
    setShowValidationMessages(false);
    Alert.alert('Access Key Created', `${fp.label} is ready to assign.`);
  };

  const handleEditConfirm = async () => {
    if (!editingPassword) return;

    if (!editLabel.trim()) {
      Alert.alert('Password Label Required', 'Give this access key a recognizable name.');
      return;
    }

    if (accessKeyExists(editLabel) && editLabel !== editingPassword.label) {
      Alert.alert('Password Label Already Used', 'Access key labels must be unique.');
      return;
    }

    if (editPassword) {
      const validation = validatePassword(editPassword);
      if (!validation.valid) {
        Alert.alert('Password Does Not Meet Requirements', validation.message);
        return;
      }

      if (editPassword !== editConfirmPassword) {
        Alert.alert('Passwords Do Not Match', 'Please confirm your password correctly.');
        return;
      }
    }

    const options: { label?: string; description?: string; password?: string } = {
      label: editLabel,
      description: editDescription,
    };
    if (editPassword) {
      options.password = editPassword;
    }

    const success = await updateAccessKey(editingPassword.id, options);
    if (success) {
      setShowEditModal(false);
      setEditingPassword(null);
      setEditLabel('');
      setEditDescription('');
      setEditPassword('');
      setEditConfirmPassword('');
      Alert.alert('Password Updated', `${editLabel} has been updated.`);
    } else {
      Alert.alert('Update Failed', 'Could not update the access key.');
    }
  };

  return (
    <View style={[{ backgroundColor: theme.bg }]}>
      <View style={styles.customHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backIcon, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.lockIconBox, { backgroundColor: theme.iconBg }]}>
            <Lock size={20} color={theme.label} strokeWidth={2} />
          </View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Access Keys</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.description, { color: theme.textMuted }]}>
          Create up to <Text style={{ color: theme.text, fontWeight: '800' }}>20 passwords</Text> to protect your folders and files. Stored securely and must meet strength requirements.
        </Text>

        <View style={[styles.createCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Tag size={14} color={theme.label} strokeWidth={2} />
              <Text style={[styles.label, { color: theme.label }]}>PASSWORD LABEL</Text>
            </View>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg }]}
              value={passwordLabel}
              onChangeText={setPasswordLabel}
              placeholder="e.g. Personal Vault Password"
              placeholderTextColor={theme.textMuted}
            />
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Clipboard size={14} color={theme.label} strokeWidth={2} />
              <Text style={[styles.label, { color: theme.label }]}>DESCRIPTION</Text>
              <View style={[styles.optionalBadge, { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder }]}>
                <Text style={[styles.optionalBadgeText, { color: theme.textMuted }]}>optional</Text>
              </View>
            </View>
            <TextInput
              style={[styles.input, styles.multilineInput, { color: theme.text, backgroundColor: theme.inputBg }]}
              value={passwordDescription}
              onChangeText={setPasswordDescription}
              placeholder="What is this password used for?"
              placeholderTextColor={theme.textMuted}
              multiline
            />
          </View>

          <View style={styles.sectionDivider}>
            <View style={[styles.dividerLine, { backgroundColor: theme.divider }]} />
            <Lock size={14} color={theme.label} strokeWidth={2} />
            <Text style={[styles.sectionDividerText, { color: theme.label }]}>SECURITY</Text>
            <Lock size={14} color={theme.label} strokeWidth={2} />
            <View style={[styles.dividerLine, { backgroundColor: theme.divider }]} />
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Key size={14} color={theme.label} strokeWidth={2} />
              <Text style={[styles.label, { color: theme.label }]}>CREATE A PASSWORD</Text>
            </View>
            <View style={styles.inputWithAction}>
              <TextInput
                style={[styles.input, styles.inputWithPadding, { color: theme.text, backgroundColor: theme.inputBg, paddingRight: 80 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter a strong password"
                placeholderTextColor={theme.textMuted}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity style={styles.actionButton} onPress={() => setShowPassword(!showPassword)}>
                <Eye size={16} color={theme.label} strokeWidth={2} />
                <Text style={[styles.actionButtonText, { color: theme.label }]}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            {password.length === 0 && <Text style={[styles.notSetText, { color: theme.notSet }]}>Not set</Text>}
            {password.length > 0 && (
              <View style={styles.strengthIndicator}>
                <View style={[styles.strengthBarBg, { backgroundColor: theme.iconBg }]}>
                  <View style={[styles.strengthBar, { backgroundColor: strengthColor, width: strength === 'weak' ? '33%' : strength === 'medium' ? '66%' : '100%' }]} />
                </View>
                <Text style={[styles.strengthText, { color: strengthColor }]}>{strengthLabelText}</Text>
              </View>
            )}
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Lock size={14} color={theme.label} strokeWidth={2} />
              <Text style={[styles.label, { color: theme.label }]}>CONFIRM PASSWORD</Text>
            </View>
            <View style={styles.inputWithAction}>
              <TextInput
                style={[styles.input, styles.inputWithPadding, { color: theme.text, backgroundColor: theme.inputBg, paddingRight: 80 }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm your password"
                placeholderTextColor={theme.textMuted}
                secureTextEntry={!showConfirmPassword}
              />
              <TouchableOpacity style={styles.actionButton} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                <Eye size={16} color={theme.label} strokeWidth={2} />
                <Text style={[styles.actionButtonText, { color: theme.label }]}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {confirmPassword.length > 0 && password !== confirmPassword && (
            <Text style={[styles.errorText, { color: colors.error, marginTop: 8 }]}>Passwords do not match</Text>
          )}

          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: accessKeys.length >= 20 ? theme.btnDisabled : theme.btnPrimary }]}
            onPress={accessKeys.length >= 20 ? undefined : handleCreatePassword}
            activeOpacity={accessKeys.length >= 20 ? 1 : 0.7}
          >
            <ShieldCheck size={18} color={accessKeys.length >= 20 ? theme.btnDisabledText : theme.btnPrimaryText} strokeWidth={2.5} />
            <Text style={[styles.createBtnText, { color: accessKeys.length >= 20 ? theme.btnDisabledText : theme.btnPrimaryText }]}>
              {accessKeys.length >= 20 ? 'Limit Reached' : 'Create Access Key'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <Key size={16} color={theme.text} strokeWidth={2} />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Existing Access Keys</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.counterBadge, { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder }]}>
              <Text style={[styles.counterText, { color: theme.textMuted }]}>{accessKeys.length} / 20</Text>
            </View>
          </View>
        </View>

        {accessKeys.length === 0 ? (
          <View style={[styles.empty, { borderColor: theme.emptyBorder }]}>
            <Text style={{ fontSize: 42, marginBottom: 10 }}>🔒</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No passwords yet</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Create a password to assign it to folders or files.</Text>
          </View>
        ) : (
          accessKeys.map((fp: AccessKeyMetadata) => (
            <View key={fp.id} style={[styles.passwordCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={styles.passwordLeft}>
                <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                  <Key size={20} color={theme.label} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.passwordName, { color: theme.text }]} numberOfLines={1}>{fp.label}</Text>
                  <Text style={[styles.passwordMeta, { color: theme.textMuted }]} numberOfLines={1}>
                    {fp.description || 'No description'}
                  </Text>
                </View>
              </View>
              <View style={styles.passwordActions}>
                <TouchableOpacity
                  style={[styles.editBtn, { borderColor: theme.badgeBorder }]}
                  onPress={() => {
                    setPendingEditPassword(fp);
                    setShowEditUnlockModal(true);
                  }}
                >
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteBtn, { backgroundColor: colors.error }]}
                  onPress={() => {
                    setPendingDeletePassword(fp);
                    setDeleteVerificationPassword('');
                    setShowDeleteVerificationModal(true);
                  }}
                >
                  <Trash2 size={14} color="#FFFFFF" strokeWidth={2} />
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Delete</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.infoBtn, { backgroundColor: theme.iconBg, borderColor: theme.badgeBorder }]}
                  onPress={() => {
                    Alert.alert(
                      fp.label,
                      `Created: ${new Date(fp.createdAt).toLocaleDateString()}\n${fp.description || 'No description provided'}`,
                      [{ text: 'OK' }]
                    );
                  }}
                >
                  <Info size={16} color={theme.label} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
      <AnimatedTabBar />

      {/* Delete Password Verification Modal */}
      {showDeleteVerificationModal && pendingDeletePassword && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.verifyOverlay, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={[styles.verifyCard, { backgroundColor: theme.verifyCardBg, borderColor: theme.verifyCardBorder }]}>
            <View style={[styles.verifyIconRing, { backgroundColor: theme.verifyIconRing }]}>
              <View style={[styles.verifyIconInner, { backgroundColor: theme.verifyIconInner }]}>
                <Lock size={28} color={colors.error} strokeWidth={1.5} />
              </View>
            </View>

            <Text style={[styles.verifyTitle, { color: theme.text }]}>Verify to Delete</Text>
            <Text style={[styles.verifySubtitle, { color: theme.textMuted }]}>
              Enter the password to confirm deletion of "{pendingDeletePassword.label}"
            </Text>

            {pendingDeletePassword.description && (
              <Text style={[styles.verifyHint, { color: theme.textMuted }]}>
                {pendingDeletePassword.description}
              </Text>
            )}

            <TextInput
              style={[styles.verifyInput, { borderColor: theme.inputBorder, color: theme.text, backgroundColor: theme.inputBg }]}
              placeholder="Enter password"
              placeholderTextColor={theme.textMuted}
              value={deleteVerificationPassword}
              onChangeText={setDeleteVerificationPassword}
              secureTextEntry
              autoFocus
            />

            <View style={styles.verifyButtonRow}>
              <TouchableOpacity
                style={[styles.verifyCancelBtn, { backgroundColor: theme.cancelBtnBg, borderColor: theme.cancelBtnBorder, borderWidth: 1 }]}
                onPress={() => {
                  setShowDeleteVerificationModal(false);
                  setPendingDeletePassword(null);
                  setDeleteVerificationPassword('');
                }}
              >
                <Text style={[styles.verifyCancelText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.verifyDeleteBtn, { backgroundColor: colors.error }]}
                onPress={handleDeleteVerification}
              >
                <Text style={[styles.verifyDeleteText, { color: '#FFFFFF' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Edit Password Verification Modal */}
      {showEditUnlockModal && pendingEditPassword && (
        <AccessKeyUnlockModal
          visible={showEditUnlockModal}
          targetName={pendingEditPassword.label}
          targetId={pendingEditPassword.id}
          targetType="file"
          accessKeyId={pendingEditPassword.id}
          onClose={() => {
            setShowEditUnlockModal(false);
            setPendingEditPassword(null);
          }}
          onUnlock={() => {
            const target = pendingEditPassword;
            setShowEditUnlockModal(false);
            setEditingPassword(target);
            setPendingEditPassword(null);
            setEditLabel(target.label);
            setEditDescription(target.description || '');
            setEditPassword('');
            setEditConfirmPassword('');
            setShowEditPassword(false);
            setShowEditConfirmPassword(false);
            setShowEditModal(true);
          }}
        />
      )}

      {/* Edit Password Modal */}
      {showEditModal && editingPassword && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.editOverlay, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={[styles.editCard, { backgroundColor: theme.editCardBg, borderColor: theme.editCardBorder }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8, width: '100%', alignItems: 'stretch' }}>
              <Text style={[styles.editTitle, { color: theme.text, marginBottom: 4 }]}>Edit Access Key</Text>
              <Text style={[styles.editSubtitle, { color: theme.textMuted, marginBottom: 24 }]}>Editing: {editingPassword.label}</Text>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.label, marginBottom: 8 }]}>Password Label</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg }]}
                  value={editLabel}
                  onChangeText={setEditLabel}
                  placeholder="e.g. Personal Vault Password"
                  placeholderTextColor={theme.textMuted}
                />
              </View>

              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Text style={[styles.label, { color: theme.label, marginBottom: 0 }]}>Description</Text>
                  <View style={[styles.optionalBadge, { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder }]}>
                    <Text style={[styles.optionalBadgeText, { color: theme.textMuted }]}>optional</Text>
                  </View>
                </View>
                <TextInput
                  style={[styles.input, styles.multilineInput, { color: theme.text, backgroundColor: theme.inputBg }]}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="What is this password used for?"
                  placeholderTextColor={theme.textMuted}
                  multiline
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.label, marginBottom: 8 }]}>New Password (Optional)</Text>
                <View style={styles.inputWithAction}>
                  <TextInput
                    style={[styles.input, styles.inputWithPadding, { color: theme.text, backgroundColor: theme.inputBg, paddingRight: 80 }]}
                    value={editPassword}
                    onChangeText={setEditPassword}
                    placeholder="Enter a new password"
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry={!showEditPassword}
                  />
                  <TouchableOpacity style={styles.actionButton} onPress={() => setShowEditPassword(!showEditPassword)}>
                    <Eye size={16} color={theme.label} strokeWidth={2} />
                    <Text style={[styles.actionButtonText, { color: theme.label }]}>{showEditPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
                {editPassword.length > 0 && (() => {
                  const editStrength = getPasswordStrength(editPassword);
                  const editBarColor = editStrength === 'weak' ? colors.error : editStrength === 'medium' ? '#FBBF24' : '#34C759';
                  const editBarWidth = editStrength === 'weak' ? '33%' : editStrength === 'medium' ? '66%' : '100%';
                  const editStrengthLabel = editStrength === 'weak' ? 'Weak' : editStrength === 'medium' ? 'Medium' : 'Strong';
                  return (
                    <View style={styles.strengthIndicator}>
                      <View style={[styles.strengthBarBg, { backgroundColor: theme.iconBg }]}>
                        <View style={[styles.strengthBar, { backgroundColor: editBarColor, width: editBarWidth }]} />
                      </View>
                      <Text style={[styles.strengthText, { color: editBarColor }]}>{editStrengthLabel}</Text>
                    </View>
                  );
                })()}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.label, marginBottom: 8 }]}>Confirm New Password</Text>
                <View style={styles.inputWithAction}>
                  <TextInput
                    style={[styles.input, styles.inputWithPadding, { color: theme.text, backgroundColor: theme.inputBg, paddingRight: 80 }]}
                    value={editConfirmPassword}
                    onChangeText={setEditConfirmPassword}
                    placeholder="Confirm your new password"
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry={!showEditConfirmPassword}
                  />
                  <TouchableOpacity style={styles.actionButton} onPress={() => setShowEditConfirmPassword(!showEditConfirmPassword)}>
                    <Eye size={16} color={theme.label} strokeWidth={2} />
                    <Text style={[styles.actionButtonText, { color: theme.label }]}>{showEditConfirmPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
                {editConfirmPassword.length > 0 && editPassword !== editConfirmPassword && (
                  <Text style={[styles.errorText, { color: colors.error, marginTop: 8 }]}>Passwords do not match</Text>
                )}
              </View>

              <View style={styles.editButtonRow}>
                <TouchableOpacity
                  onPress={() => {
                    setShowEditModal(false);
                    setEditingPassword(null);
                    setEditLabel('');
                    setEditDescription('');
                    setEditPassword('');
                    setEditConfirmPassword('');
                  }}
                  style={[styles.editCancelBtn, { borderColor: theme.cancelBtnBorder, backgroundColor: theme.cancelBtnBg }]}
                >
                  <Text style={[styles.editCancelText, { color: theme.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleEditConfirm}
                  style={[styles.editSaveBtn, { backgroundColor: isDark ? '#FFFFFF' : colors.primary }]}
                >
                  <Text style={[styles.editSaveText, { color: isDark ? '#000000' : '#FFFFFF' }]}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 50,
  },
  backBtn: { padding: 6 },
  backIcon: { fontSize: 22, fontWeight: '600' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lockIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  content: { paddingHorizontal: 20, paddingBottom: 110 },
  description: { fontSize: 13, lineHeight: 18, marginBottom: 16, marginTop: 4 },
  createCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
  },
  fieldGroup: { marginBottom: 18 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  optionalBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  optionalBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  input: {
    width: '100%',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  multilineInput: { minHeight: 100, textAlignVertical: 'top' },
  inputWithAction: { position: 'relative' },
  inputWithPadding: { paddingRight: 80 },
  actionButton: {
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
  actionButtonText: { fontSize: 12, fontWeight: '600' },
  notSetText: { fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 24,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  sectionDividerText: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  strengthIndicator: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 10 },
  strengthBarBg: { height: 4, borderRadius: 2, flex: 1, overflow: 'hidden' },
  strengthBar: { height: '100%', borderRadius: 2 },
  strengthText: { fontSize: 11, fontWeight: '600' },
  errorText: { fontSize: 12, marginTop: 8, fontWeight: '600' },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  createBtnText: { fontSize: 15, fontWeight: '800' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 8,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  counterBadge: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  counterText: { fontSize: 12, fontWeight: '700' },
  empty: { borderWidth: 1, borderRadius: 18, paddingVertical: 34, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 10 },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 6, paddingHorizontal: 24 },
  passwordCard: {
    flexDirection: 'row',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passwordLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  keyIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordName: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  passwordMeta: { fontSize: 12 },
  passwordActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deleteBtn: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
  },
  verifyIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  verifyIconInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 6,
    textAlign: 'center',
  },
  verifySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  verifyHint: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  verifyInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 20,
  },
  verifyButtonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  verifyCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  verifyCancelText: {
    fontWeight: '700',
    fontSize: 15,
  },
  verifyDeleteBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  verifyDeleteText: {
    fontWeight: '800',
    fontSize: 15,
  },
  editCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
  },
  editTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  editSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
  },
  editButtonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 16,
  },
  editCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  editCancelText: {
    fontWeight: '700',
    fontSize: 15,
  },
  editSaveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  editSaveText: {
    fontWeight: '800',
    fontSize: 15,
  },
});
