import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AnimatedCard } from '../../../components/AnimatedCard';
import { FilePasswordUnlockModal } from '../../../components/FilePasswordUnlockModal';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { VaultHeader } from '../../../components/VaultHeader';
import { useThemeColors } from '../../../contexts/ThemeContext';
import { LOCKOUT_DURATION_MS, MAX_PASSWORD_ATTEMPTS, useLockoutStore } from '../../../store/lockoutStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { FilePasswordMetadata } from '../../../types';
import {
  getPasswordValidationMessages,
  getPasswordStrength,
  validatePassword
} from '../../../utils/filePasswordValidation';

export default function FilePasswordsScreen() {
  const colors = useThemeColors();
  const { filePasswords, createFilePassword, filePasswordExists, deleteFilePassword, updateFilePassword } = useSettingsStore();
  const { recordFailedAttempt, resetAttempts, isLockedOut, getRemainingLockoutTime } = useLockoutStore();
  const [passwordLabel, setPasswordLabel] = useState('');
  const [passwordDescription, setPasswordDescription] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showValidationMessages, setShowValidationMessages] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [editingPassword, setEditingPassword] = useState<FilePasswordMetadata | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [pendingEditPassword, setPendingEditPassword] = useState<FilePasswordMetadata | null>(null);
  const [showEditUnlockModal, setShowEditUnlockModal] = useState(false);
  
  // Password verification for deletion
  const [pendingDeletePassword, setPendingDeletePassword] = useState<FilePasswordMetadata | null>(null);
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
      // Password matches, proceed with deletion
      const result = await deleteFilePassword(pendingDeletePassword.id);
      setShowDeleteVerificationModal(false);
      setPendingDeletePassword(null);
      setDeleteVerificationPassword('');
      resetAttempts(lockoutKey);
      
      if (result === 'in-use') {
        Alert.alert('Password In Use', 'This password is assigned to at least one file or folder. Reassign or remove before deleting it.');
      } else if (result === 'not-found') {
        Alert.alert('Password Not Found', 'This file password no longer exists.');
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
    if (filePasswords.length >= 20) {
      Alert.alert('File Password Limit', 'You can only create up to 20 file passwords.');
      return;
    }

    if (!passwordLabel.trim()) {
      Alert.alert('Password Label Required', 'Give this file password a recognizable name.');
      return;
    }

    if (filePasswordExists(passwordLabel)) {
      Alert.alert('Password Label Already Used', 'File password labels must be unique.');
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

    const fp = await createFilePassword(passwordLabel, password, passwordDescription);
    if (!fp) {
      Alert.alert('File Password Limit', 'You can only create up to 20 file passwords.');
      return;
    }

    setPasswordLabel('');
    setPasswordDescription('');
    setPassword('');
    setConfirmPassword('');
    setShowValidationMessages(false);
    Alert.alert('File Password Created', `${fp.label} is ready to assign.`);
  };

  const handleEditConfirm = async () => {
    if (!editingPassword) return;

    if (!editLabel.trim()) {
      Alert.alert('Password Label Required', 'Give this file password a recognizable name.');
      return;
    }

    if (filePasswordExists(editLabel) && editLabel !== editingPassword.label) {
      Alert.alert('Password Label Already Used', 'File password labels must be unique.');
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

    const success = await updateFilePassword(editingPassword.id, options);
    if (success) {
      setShowEditModal(false);
      setEditingPassword(null);
      setEditLabel('');
      setEditDescription('');
      setEditPassword('');
      setEditConfirmPassword('');
      Alert.alert('Password Updated', `${editLabel} has been updated.`);
    } else {
      Alert.alert('Update Failed', 'Could not update the file password.');
    }
  };

  const strength = getPasswordStrength(password);
  const strengthColor = strength === 'weak' ? colors.error : strength === 'medium' ? '#FBBF24' : '#34C759';
  const strengthLabelText = strength === 'weak' ? 'Weak' : strength === 'medium' ? 'Medium' : 'Strong';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="File Passwords" showBack />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.description, { color: colors.textMuted }]}>
          Create up to 20 passwords to protect your folders and files. Passwords are securely stored and must meet strength requirements.
        </Text>

        <AnimatedCard style={styles.createCard}>
          <Text style={[styles.label, { color: colors.text }]}>Password Label</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}30` }]}
            value={passwordLabel}
            onChangeText={setPasswordLabel}
            placeholder="e.g. Personal Vault Password"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[styles.label, { color: colors.text, marginTop: 14 }]}>Description (Optional)</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}30` }]}
            value={passwordDescription}
            onChangeText={setPasswordDescription}
            placeholder="What is this password used for?"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <Text style={[styles.label, { color: colors.text, marginTop: 14 }]}>Create a Password *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}30` }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter a strong password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity 
            style={styles.showPasswordBtn}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
          
          {password.length > 0 && (
            <View style={styles.strengthIndicator}>
              <View style={[styles.strengthBar, { backgroundColor: strengthColor, width: strength === 'weak' ? '33%' : strength === 'medium' ? '66%' : '100%' }]} />
              <Text style={[styles.strengthText, { color: strengthColor }]}>Password Strength: {strengthLabelText}</Text>
            </View>
          )}

          {showValidationMessages && password.length > 0 && (
            <View style={styles.validationRules}>
              <Text style={[styles.validationTitle, { color: colors.textMuted }]}>Password Requirements:</Text>
              {getPasswordValidationMessages(password).messages.map((msg, index) => (
                <ValidationRule 
                  key={index} 
                  valid={msg.valid} 
                  text={msg.text} 
                  colors={colors} 
                />
              ))}
            </View>
          )}

          <Text style={[styles.label, { color: colors.text, marginTop: 14 }]}>Confirm Password *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}30` }]}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm your password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!showConfirmPassword}
          />
          <TouchableOpacity 
            style={styles.showPasswordBtn}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>

          {confirmPassword.length > 0 && password !== confirmPassword && (
            <Text style={[styles.errorText, { color: colors.error }]}>Passwords do not match</Text>
          )}

          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: filePasswords.length >= 20 ? colors.textMuted : colors.primary }]}
            onPress={filePasswords.length >= 20 ? undefined : handleCreatePassword}
            activeOpacity={filePasswords.length >= 20 ? 1 : 0.7}
          >
            <Text style={styles.createBtnText}>{filePasswords.length >= 20 ? 'Limit Reached' : 'Create File Password'}</Text>
          </TouchableOpacity>
        </AnimatedCard>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Existing File Passwords ({filePasswords.length}/20)
        </Text>

        {filePasswords.length === 0 ? (
          <View style={[styles.empty, { borderColor: colors.border }]}>
            <Text style={{ fontSize: 42, marginBottom: 10 }}>🔒</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No passwords yet</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Create a password to assign it to folders or files.</Text>
          </View>
        ) : (
          filePasswords.map((fp: FilePasswordMetadata) => (
            <View key={fp.id}>
              <TouchableOpacity
                style={[styles.passwordCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => {
                  // Show password info without exposing sensitive fingerprint in alert
                  Alert.alert(
                    fp.label,
                    `Created: ${new Date(fp.createdAt).toLocaleDateString()}\n${fp.description || 'No description provided'}`,
                    [{ text: 'OK' }]
                  );
                }}
              >
                <View style={styles.passwordHeader}>
                  <View>
                    <Text style={[styles.passwordName, { color: colors.text }]} numberOfLines={1}>{fp.label}</Text>
                    <Text style={[styles.passwordMeta, { color: colors.textMuted }]}>Fingerprint {fp.fingerprint}</Text>
                    {fp.description ? <Text style={[styles.passwordMeta, { color: colors.textMuted }]} numberOfLines={1}>{fp.description}</Text> : null}
                  </View>
                  <Text style={{ color: colors.primary, fontSize: 22 }}>ⓘ</Text>
                </View>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                    <TouchableOpacity
                      style={[styles.editBtn, { borderColor: colors.primary }]}
                      onPress={() => {
                        setPendingEditPassword(fp);
                        setShowEditUnlockModal(true);
                      }}
                    >
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.deleteBtn, { borderColor: colors.error }]}
                      onPress={() => {
                        setPendingDeletePassword(fp);
                        setDeleteVerificationPassword('');
                        setShowDeleteVerificationModal(true);
                      }}
                    >
                      <Text style={{ color: colors.error, fontSize: 12, fontWeight: '700' }}>Delete</Text>
                    </TouchableOpacity>
                  </View>
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
      <AnimatedTabBar />

      {/* Delete Password Verification Modal */}
      {showDeleteVerificationModal && pendingDeletePassword && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={[{ width: '100%', maxWidth: 360, borderRadius: 24, padding: 24, backgroundColor: colors.surface, alignItems: 'center' }]}>
            <View style={[{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 }]} />
            
            <View style={[{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,69,58,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }]}>
              <Text style={{ fontSize: 32 }}>🔒</Text>
            </View>

              <Text style={[{ fontSize: 20, fontWeight: '800', marginBottom: 6, letterSpacing: -0.3, color: colors.text }]}>Verify to Delete</Text>
              <Text style={[{ fontSize: 14, textAlign: 'center', marginBottom: 16, color: colors.textMuted }]}>
                Enter the password to confirm deletion of &quot;{pendingDeletePassword.label}&quot;
              </Text>

            {pendingDeletePassword.description && (
              <Text style={[{ fontSize: 12, textAlign: 'center', marginBottom: 20, fontStyle: 'italic', color: colors.textMuted }]}>
                {pendingDeletePassword.description}
              </Text>
            )}

            <TextInput
              style={[
                { width: '100%', borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginBottom: 20, borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}30` },
              ]}
              placeholder="Enter password"
              placeholderTextColor={colors.textMuted}
              value={deleteVerificationPassword}
              onChangeText={setDeleteVerificationPassword}
              secureTextEntry
              autoFocus
            />

            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={[{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border }]}
                onPress={() => {
                  setShowDeleteVerificationModal(false);
                  setPendingDeletePassword(null);
                  setDeleteVerificationPassword('');
                }}
              >
                <Text style={[{ fontWeight: '700', fontSize: 14, color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: colors.error }]}
                onPress={handleDeleteVerification}
              >
                <Text style={[{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Edit Password Verification Modal */}
      {showEditUnlockModal && pendingEditPassword && (
        <FilePasswordUnlockModal
          visible={showEditUnlockModal}
          targetName={pendingEditPassword.label}
          targetId={pendingEditPassword.id}
          targetType="file"
          filePasswordId={pendingEditPassword.id}
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
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={[{ width: '100%', maxWidth: 360, borderRadius: 24, padding: 24, backgroundColor: colors.surface, alignItems: 'center' }]}>
            <View style={[{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 }]} />
            
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[{ fontSize: 20, fontWeight: '800', marginBottom: 6, letterSpacing: -0.3, color: colors.text }]}>Edit File Password</Text>
              <Text style={[{ fontSize: 13, color: colors.textMuted, marginBottom: 20 }]}>Editing: {editingPassword.label}</Text>

              <Text style={[{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.text }]}>Password Label</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}30` }]}
                value={editLabel}
                onChangeText={setEditLabel}
                placeholder="e.g. Personal Vault Password"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.text, marginTop: 14 }]}>Description (Optional)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}30` }]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="What is this password used for?"
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <Text style={[{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.text, marginTop: 14 }]}>New Password (Optional)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}30` }]}
                value={editPassword}
                onChangeText={setEditPassword}
                placeholder="Enter a new password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showEditPassword}
              />
              <TouchableOpacity
                style={styles.showPasswordBtn}
                onPress={() => setShowEditPassword(!showEditPassword)}
              >
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{showEditPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>

              {editPassword.length > 0 && (() => {
                const strength = getPasswordStrength(editPassword);
                const barColor = strength === 'weak' ? colors.error : strength === 'medium' ? '#FBBF24' : '#34C759';
                const barWidth = strength === 'weak' ? '33%' : strength === 'medium' ? '66%' : '100%';
                const strengthLabel = strength === 'weak' ? 'Weak' : strength === 'medium' ? 'Medium' : 'Strong';
                return (
                  <View style={styles.strengthIndicator}>
                    <View style={[styles.strengthBar, { backgroundColor: barColor, width: barWidth }]} />
                    <Text style={[styles.strengthText, { color: barColor }]}>Password Strength: {strengthLabel}</Text>
                  </View>
                );
              })()}

              <Text style={[{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.text, marginTop: 14 }]}>Confirm New Password</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}30` }]}
                value={editConfirmPassword}
                onChangeText={setEditConfirmPassword}
                placeholder="Confirm your new password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showEditConfirmPassword}
              />
              <TouchableOpacity
                style={styles.showPasswordBtn}
                onPress={() => setShowEditConfirmPassword(!showEditConfirmPassword)}
              >
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{showEditConfirmPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>

              {editConfirmPassword.length > 0 && editPassword !== editConfirmPassword && (
                <Text style={[styles.errorText, { color: colors.error }]}>Passwords do not match</Text>
              )}

              <View style={{ flexDirection: 'row', gap: 12, width: '100%', marginTop: 16 }}>
                <TouchableOpacity
                  onPress={() => {
                    setShowEditModal(false);
                    setEditingPassword(null);
                    setEditLabel('');
                    setEditDescription('');
                    setEditPassword('');
                    setEditConfirmPassword('');
                  }}
                  style={[{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleEditConfirm}
                  style={[{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: colors.primary }]}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

function ValidationRule({ valid, text, colors }: { valid: boolean; text: string; colors: any }) {
  return (
    <View style={styles.validationRule}>
      <Text style={{ color: valid ? '#34C759' : colors.error, fontSize: 14 }}>{valid ? '✓' : '✗'}</Text>
      <Text style={[styles.validationText, { color: valid ? colors.textMuted : colors.error }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 110 },
  description: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  createCard: { padding: 16 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginTop: 6, fontSize: 14 },
  showPasswordBtn: { alignSelf: 'flex-end', padding: 8 },
  strengthIndicator: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 10 },
  strengthBar: { height: 4, borderRadius: 2, flex: 1 },
  strengthText: { fontSize: 12, fontWeight: '600' },
  validationRules: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,69,58,0.1)' },
  validationTitle: { fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  validationRule: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  validationText: { fontSize: 13, marginLeft: 8 },
  errorText: { fontSize: 12, marginTop: 8, fontWeight: '600' },
  createBtn: { marginTop: 16, paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  createBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginTop: 24, marginBottom: 12 },
  empty: { borderWidth: 1, borderRadius: 18, paddingVertical: 34, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 6, paddingHorizontal: 24 },
  passwordCard: { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 10 },
  passwordHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  passwordName: { fontSize: 15, fontWeight: '800' },
  passwordMeta: { fontSize: 12, marginTop: 4 },
  deleteBtn: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 14 },
  editBtn: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 14 },
});