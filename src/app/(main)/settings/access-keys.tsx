// src/app/(main)/settings/access-keys.tsx
// Rebuilt per plans/you-are-a-senior-majestic-swing.md §3/§7 Phase 4.
// Every store hook and handler body (create/edit/delete access key, the
// delete-verification lockout flow via useLockoutStore, the edit-unlock gate
// via AccessKeyUnlockModal) is unchanged; only JSX/StyleSheet is new. Notable
// per-plan changes:
//  - VaultHeader (newly adopted — this screen hand-rolled an inline
//    `customHeader` + `headerPaddingTop` before, per §2/§5)
//  - TextField.secureToggle replaces the 4 duplicated eye-icon blocks in this
//    file (password/confirm × create/edit forms) — see §3's screen row
//  - ProgressBar (with its Weak/Medium/Strong label, never color-only per §6)
//    replaces the local strength-bar markup
//  - the create form is a Card, the edit form is a Sheet (longer, multi-field
//    content — the scrollable-picker shape §5 reserves Sheet for), and the
//    delete-verification prompt is a Dialog (short confirmation + one field)
//  - `AnimatedCard` was imported here but never actually rendered anywhere in
//    the pre-redesign file (verified: zero `<AnimatedCard` usages) — dropping
//    that dead import makes this screen's rewrite the last real disposition
//    of `AnimatedCard.tsx` (§5/§7 Phase 4: deleted alongside this rewrite)
//  - Alert.alert is kept for every error/validation/lockout message and for
//    the info-button's read-only detail popup; this screen isn't one of the
//    four (dashboard/favorites/search/folder) the plan moves onto Snackbar
//  - the screen-enter fade goes through the shared useScreenEnterAnimation()
//    hook (§4) instead of a hand-rolled copy — see folder/[id].tsx
import {
  Info,
  Key,
  Lock,
  ShieldCheck,
  Trash2,
} from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { AccessKeyUnlockModal } from '../../../components/AccessKeyUnlockModal';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { VaultHeader } from '../../../components/VaultHeader';
import { Button } from '../../../components/primitives/Button';
import { Card } from '../../../components/primitives/Card';
import { Dialog } from '../../../components/primitives/Dialog';
import { EmptyState } from '../../../components/primitives/EmptyState';
import { ProgressBar } from '../../../components/primitives/ProgressBar';
import { Sheet } from '../../../components/primitives/Sheet';
import { TextField } from '../../../components/primitives/TextField';
import { Type } from '../../../constants/typography';
import { useTheme } from '../../../contexts/ThemeContext';
import { useScreenEnterAnimation } from '../../../hooks/useScreenEnterAnimation';
import { LOCKOUT_DURATION_MS, MAX_PASSWORD_ATTEMPTS, useLockoutStore } from '../../../store/lockoutStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { AccessKeyMetadata } from '../../../types';
import { getPasswordStrength, validatePassword } from '../../../utils/accessKeyValidation';

const STRENGTH_PROGRESS: Record<string, number> = { weak: 0.33, medium: 0.66, strong: 1 };
const STRENGTH_LABEL: Record<string, string> = { weak: 'Weak', medium: 'Medium', strong: 'Strong' };

export default function AccessKeysScreen() {
  const { colors, space, font, screenPadding, bottomTabSpacing , iconSize } = useTheme();
  const { accessKeys, createAccessKey, accessKeyExists, deleteAccessKey, updateAccessKey } = useSettingsStore();
  const { recordFailedAttempt, resetAttempts, isLockedOut, getRemainingLockoutTime } = useLockoutStore();

  const screenAnimatedStyle = useScreenEnterAnimation();

  const [passwordLabel, setPasswordLabel] = useState('');
  const [passwordDescription, setPasswordDescription] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const strength = getPasswordStrength(password);
  const strengthColor = strength === 'weak' ? colors.error : strength === 'medium' ? colors.warning : colors.secondary;

  const [editingPassword, setEditingPassword] = useState<AccessKeyMetadata | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [pendingEditPassword, setPendingEditPassword] = useState<AccessKeyMetadata | null>(null);
  const [showEditUnlockModal, setShowEditUnlockModal] = useState(false);

  const [pendingDeletePassword, setPendingDeletePassword] = useState<AccessKeyMetadata | null>(null);
  const [deleteVerificationPassword, setDeleteVerificationPassword] = useState('');
  const [showDeleteVerificationModal, setShowDeleteVerificationModal] = useState(false);

  const editStrength = getPasswordStrength(editPassword);
  const editStrengthColor = editStrength === 'weak' ? colors.error : editStrength === 'medium' ? colors.warning : colors.secondary;

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
      const { remaining, isLockedOut: nowLockedOut } = recordFailedAttempt(lockoutKey);
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
        Alert.alert('Incorrect Password', `Password does not match. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`, [{ text: 'OK' }]);
      }
    }
  };

  const handleCreatePassword = async () => {
    if (accessKeys.length >= 20) { Alert.alert('Access Key Limit', 'You can only create up to 20 access keys.'); return; }
    if (!passwordLabel.trim()) { Alert.alert('Password Label Required', 'Give this access key a recognizable name.'); return; }
    if (accessKeyExists(passwordLabel)) { Alert.alert('Password Label Already Used', 'Access key labels must be unique.'); return; }

    const validation = validatePassword(password);
    if (!validation.valid) { Alert.alert('Password Does Not Meet Requirements', validation.message); return; }
    if (password !== confirmPassword) { Alert.alert('Passwords Do Not Match', 'Please confirm your password correctly.'); return; }

    const fp = await createAccessKey(passwordLabel, password, passwordDescription);
    if (!fp) { Alert.alert('Access Key Limit', 'You can only create up to 20 access keys.'); return; }

    setPasswordLabel('');
    setPasswordDescription('');
    setPassword('');
    setConfirmPassword('');
    Alert.alert('Access Key Created', `${fp.label} is ready to assign.`);
  };

  const handleEditConfirm = async () => {
    if (!editingPassword) return;
    if (!editLabel.trim()) { Alert.alert('Password Label Required', 'Give this access key a recognizable name.'); return; }
    if (accessKeyExists(editLabel) && editLabel !== editingPassword.label) { Alert.alert('Password Label Already Used', 'Access key labels must be unique.'); return; }

    if (editPassword) {
      const validation = validatePassword(editPassword);
      if (!validation.valid) { Alert.alert('Password Does Not Meet Requirements', validation.message); return; }
      if (editPassword !== editConfirmPassword) { Alert.alert('Passwords Do Not Match', 'Please confirm your password correctly.'); return; }
    }

    const options: { label?: string; description?: string; password?: string } = { label: editLabel, description: editDescription };
    if (editPassword) options.password = editPassword;

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
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Access Keys" showBack />

      <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingHorizontal: screenPadding, paddingTop: space(4), paddingBottom: bottomTabSpacing + space(6) }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.description, { color: colors.textMuted, fontSize: font(Type.caption.size), marginBottom: space(4) }]}>
            Create up to <Text style={{ color: colors.text, fontWeight: '800' }}>20 passwords</Text> to protect your folders and files. Stored securely and must meet strength requirements.
          </Text>

          <Card style={{ marginBottom: space(6) }}>
            <TextField label="Password Label" value={passwordLabel} onChangeText={setPasswordLabel} placeholder="e.g. Personal Vault Password" accessibilityLabel="Password label" />
            <TextField label="Description (optional)" value={passwordDescription} onChangeText={setPasswordDescription} placeholder="What is this password used for?" multiline accessibilityLabel="Description" />

            <View style={[styles.sectionDivider, { marginVertical: space(5), gap: space(2) }]}>
              <View style={[styles.dividerLine, { backgroundColor: colors.borderLight }]} />
              <Text style={[styles.sectionDividerText, { color: colors.textMuted, fontSize: font(Type.eyebrow.size) }]}>SECURITY</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.borderLight }]} />
            </View>

            <TextField label="Create a Password" value={password} onChangeText={setPassword} placeholder="Enter a strong password" secureToggle accessibilityLabel="New password" />
            {password.length > 0 && (
              <View style={{ marginTop: -space(2), marginBottom: space(4) }}>
                <ProgressBar progress={STRENGTH_PROGRESS[strength]} color={strengthColor} label={STRENGTH_LABEL[strength]} showPercentage={false} height={4} />
              </View>
            )}

            <TextField
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your password"
              secureToggle
              error={confirmPassword.length > 0 && password !== confirmPassword ? 'Passwords do not match' : undefined}
              accessibilityLabel="Confirm password"
            />

            <Button
              title={accessKeys.length >= 20 ? 'Limit Reached' : 'Create Access Key'}
              onPress={handleCreatePassword}
              disabled={accessKeys.length >= 20}
              icon={ShieldCheck}
              style={{ marginTop: space(2) }}
            />
          </Card>

          <View style={[styles.sectionHeader, { marginBottom: space(3) }]}>
            <View style={styles.sectionHeaderLeft}>
              <Key size={iconSize(16)} color={colors.text} strokeWidth={2} />
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font(Type.label.size), marginLeft: space(1) }]}>Existing Access Keys</Text>
            </View>
            <View style={[styles.counterBadge, { backgroundColor: colors.surfaceHover, borderColor: colors.borderLight, borderRadius: 10, paddingHorizontal: space(3) }]}>
              <Text style={[styles.counterText, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>{accessKeys.length} / 20</Text>
            </View>
          </View>

          {accessKeys.length === 0 ? (
            <EmptyState icon={Lock} title="No passwords yet" message="Create a password to assign it to folders or files." />
          ) : (
            accessKeys.map((fp: AccessKeyMetadata) => (
              <Card key={fp.id} style={{ marginBottom: space(3) }}>
                <View style={styles.passwordRow}>
                  <View style={styles.passwordLeft}>
                    <View style={[styles.keyIconBox, { backgroundColor: colors.surfaceHover, marginRight: space(3) }]}>
                      <Key size={iconSize(20)} color={colors.textSecondary} strokeWidth={2} />
                    </View>
                    <View style={styles.passwordTextCol}>
                      <Text style={[styles.passwordName, { color: colors.text, fontSize: font(Type.body.size) }]} numberOfLines={1}>{fp.label}</Text>
                      <Text style={[styles.passwordMeta, { color: colors.textMuted, fontSize: font(Type.caption.size) }]} numberOfLines={1}>{fp.description || 'No description'}</Text>
                    </View>
                  </View>
                  <View style={[styles.passwordActions, { gap: space(2) }]}>
                    <Button
                      title="Edit"
                      size="sm"
                      variant="tertiary"
                      onPress={() => { setPendingEditPassword(fp); setShowEditUnlockModal(true); }}
                    />
                    <Button
                      title="Delete"
                      size="sm"
                      variant="danger"
                      icon={Trash2}
                      onPress={() => { setPendingDeletePassword(fp); setDeleteVerificationPassword(''); setShowDeleteVerificationModal(true); }}
                    />
                    <TouchableOpacity
                      onPress={() => Alert.alert(fp.label, `Created: ${new Date(fp.createdAt).toLocaleDateString()}\n${fp.description || 'No description provided'}`, [{ text: 'OK' }])}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Details for ${fp.label}`}
                      style={[styles.infoBtn, { backgroundColor: colors.surfaceHover, borderColor: colors.borderLight }]}
                    >
                      <Info size={iconSize(16)} color={colors.textSecondary} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            ))
          )}
        </ScrollView>
      </Animated.View>

      <AnimatedTabBar />

      <Dialog
        visible={showDeleteVerificationModal && !!pendingDeletePassword}
        onRequestClose={() => { setShowDeleteVerificationModal(false); setPendingDeletePassword(null); setDeleteVerificationPassword(''); }}
        icon={Lock}
        iconColor={colors.error}
        title="Verify to Delete"
        message={`Enter the password to confirm deletion of "${pendingDeletePassword?.label}"${pendingDeletePassword?.description ? `\n${pendingDeletePassword.description}` : ''}`}
        actions={[
          { label: 'Cancel', onPress: () => { setShowDeleteVerificationModal(false); setPendingDeletePassword(null); setDeleteVerificationPassword(''); }, variant: 'tertiary' },
          { label: 'Delete', onPress: handleDeleteVerification, variant: 'danger' },
        ]}
      >
        <View style={{ width: '100%' }}>
          <TextField placeholder="Enter password" value={deleteVerificationPassword} onChangeText={setDeleteVerificationPassword} secureTextEntry autoFocus accessibilityLabel="Password" />
        </View>
      </Dialog>

      {showEditUnlockModal && pendingEditPassword && (
        <AccessKeyUnlockModal
          visible={showEditUnlockModal}
          targetName={pendingEditPassword.label}
          targetId={pendingEditPassword.id}
          targetType="file"
          accessKeyId={pendingEditPassword.id}
          onClose={() => { setShowEditUnlockModal(false); setPendingEditPassword(null); }}
          onUnlock={() => {
            const target = pendingEditPassword;
            setShowEditUnlockModal(false);
            setEditingPassword(target);
            setPendingEditPassword(null);
            setEditLabel(target.label);
            setEditDescription(target.description || '');
            setEditPassword('');
            setEditConfirmPassword('');
            setShowEditModal(true);
          }}
        />
      )}

      <Sheet visible={showEditModal && !!editingPassword} onClose={() => { setShowEditModal(false); setEditingPassword(null); }} title="Edit Access Key">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space(5) }} keyboardShouldPersistTaps="handled">
          <Text style={[styles.editSubtitle, { color: colors.textMuted, fontSize: font(Type.caption.size), marginBottom: space(4) }]}>Editing: {editingPassword?.label}</Text>

          <TextField label="Password Label" value={editLabel} onChangeText={setEditLabel} placeholder="e.g. Personal Vault Password" accessibilityLabel="Password label" />
          <TextField label="Description (optional)" value={editDescription} onChangeText={setEditDescription} placeholder="What is this password used for?" multiline accessibilityLabel="Description" />
          <TextField label="New Password (optional)" value={editPassword} onChangeText={setEditPassword} placeholder="Enter a new password" secureToggle accessibilityLabel="New password" />
          {editPassword.length > 0 && (
            <View style={{ marginTop: -space(2), marginBottom: space(4) }}>
              <ProgressBar progress={STRENGTH_PROGRESS[editStrength]} color={editStrengthColor} label={STRENGTH_LABEL[editStrength]} showPercentage={false} height={4} />
            </View>
          )}
          <TextField
            label="Confirm New Password"
            value={editConfirmPassword}
            onChangeText={setEditConfirmPassword}
            placeholder="Confirm your new password"
            secureToggle
            error={editConfirmPassword.length > 0 && editPassword !== editConfirmPassword ? 'Passwords do not match' : undefined}
            accessibilityLabel="Confirm new password"
          />

          <View style={[styles.editButtonRow, { gap: space(3), marginBottom: space(5) }]}>
            <Button
              title="Cancel"
              variant="tertiary"
              style={{ flex: 1 }}
              onPress={() => {
                setShowEditModal(false);
                setEditingPassword(null);
                setEditLabel('');
                setEditDescription('');
                setEditPassword('');
                setEditConfirmPassword('');
              }}
            />
            <Button title="Save Changes" style={{ flex: 1 }} onPress={handleEditConfirm} />
          </View>
        </ScrollView>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  content: {},
  description: { lineHeight: 18 },

  sectionDivider: { flexDirection: 'row', alignItems: 'center' },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  sectionDividerText: { fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { fontWeight: '800' },
  counterBadge: { borderWidth: StyleSheet.hairlineWidth, paddingVertical: 2 },
  counterText: { fontWeight: '700' },

  passwordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  passwordLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  keyIconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  passwordTextCol: { flex: 1, minWidth: 0 },
  passwordName: { fontWeight: '700' },
  passwordMeta: { fontWeight: '500', marginTop: 2 },
  passwordActions: { flexDirection: 'row', alignItems: 'center' },
  infoBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },

  editSubtitle: { textAlign: 'center' },
  editButtonRow: { flexDirection: 'row' },
});
