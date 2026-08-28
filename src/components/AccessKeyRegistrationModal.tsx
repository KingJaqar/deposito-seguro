// src/components/AccessKeyRegistrationModal.tsx
// Rebuilt on the Sheet primitive to match the reference design: left-aligned
// title + close button, a plain breadcrumb (no chip), full-bleed dividers
// between sections, a 4-segment strength meter with an inline hint instead
// of a checklist, and capsule-shaped footer buttons. handleConfirm is
// carried across BYTE-IDENTICAL — the 20-key limit check, the label-required
// and accessKeyExists uniqueness checks, validatePassword(), the
// confirm-match check, the createAccessKey() call and its null guard, and
// the full bulk/file/folder assignment fan-out with its exact Alert.alert
// copy. isFormValid and the strength derivation are unchanged.
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Files, FileText, Folder } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';
import { Sheet } from './primitives/Sheet';
import { TextField } from './primitives/TextField';
import { Button } from './primitives/Button';
import { useSettingsStore } from '../store/settingsStore';
import { getPasswordStrength, getPasswordValidationMessages, validatePassword } from '../utils/accessKeyValidation';

const MIN_PASSWORD_LENGTH = 4;
const STRENGTH_SEGMENTS = 4;

export interface AccessKeyRegistrationTarget {
  id: string;
  name: string;
  type: 'file' | 'folder' | 'bulk';
}

interface AccessKeyRegistrationModalProps {
  visible: boolean;
  target: AccessKeyRegistrationTarget | null;
  selectedItemIds: string[];
  itemTypes: Record<string, 'file' | 'folder'>;
  onClose: () => void;
  onSuccess: (createdKeyId: string, createdKeyLabel: string) => void;
  assignFolderAccessKey: (folderId: string, passwordId: string) => Promise<void>;
  assignFileAccessKey: (fileId: string, passwordId: string) => Promise<void>;
}

export function AccessKeyRegistrationModal({
  visible,
  target,
  selectedItemIds,
  itemTypes,
  onClose,
  onSuccess,
  assignFolderAccessKey,
  assignFileAccessKey,
}: AccessKeyRegistrationModalProps) {
  const { colors, space, font, radius, iconSize, touchTarget } = useTheme();
  const { accessKeys, createAccessKey, accessKeyExists } = useSettingsStore();
  const footerBtnHeight = touchTarget(56);

  const [newPasswordLabel, setNewPasswordLabel] = useState('');
  const [newPasswordDescription, setNewPasswordDescription] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const confirmPasswordRef = useRef<TextInput>(null);

  const passwordStrength = getPasswordStrength(newPassword);
  const newStrengthColor =
    passwordStrength === 'weak' ? colors.error : passwordStrength === 'medium' ? colors.warning : colors.success;
  const newStrengthLabel =
    passwordStrength === 'weak' ? 'Weak' : passwordStrength === 'medium' ? 'Medium' : 'Strong';
  const newStrengthProgress =
    passwordStrength === 'weak' ? 0.33 : passwordStrength === 'medium' ? 0.66 : 1;
  const litSegments = newPassword.length === 0 ? 0 : Math.max(1, Math.round(newStrengthProgress * STRENGTH_SEGMENTS));

  const resetForm = () => {
    setNewPasswordLabel('');
    setNewPasswordDescription('');
    setNewPassword('');
    setNewConfirmPassword('');
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleConfirm = async () => {
    if (!target || isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (accessKeys.length >= 20) {
        Alert.alert('Access Key Limit', 'You can only create up to 20 access keys.');
        return;
      }

      if (!newPasswordLabel.trim()) {
        Alert.alert('Password Label Required', 'Give this access key a recognizable name.');
        return;
      }

      if (accessKeyExists(newPasswordLabel)) {
        Alert.alert('Password Label Already Used', 'Access key labels must be unique.');
        return;
      }

      const validation = validatePassword(newPassword);
      if (!validation.valid) {
        Alert.alert('Password Does Not Meet Requirements', validation.message);
        return;
      }

      if (newPassword !== newConfirmPassword) {
        Alert.alert('Passwords Do Not Match', 'Please confirm your password correctly.');
        return;
      }

      const fp = await createAccessKey(newPasswordLabel, newPassword, newPasswordDescription);
      if (!fp) {
        Alert.alert('Access Key Limit', 'You can only create up to 20 access keys.');
        return;
      }

      if (target.type === 'bulk') {
        for (const itemId of selectedItemIds) {
          const itemType = itemTypes[itemId];
          if (itemType === 'folder') {
            await assignFolderAccessKey(itemId, fp.id);
          } else if (itemType === 'file') {
            await assignFileAccessKey(itemId, fp.id);
          }
        }
        Alert.alert(
          'Access Key Created & Assigned',
          `${fp.label} has been created and assigned to ${selectedItemIds.length} items.`
        );
      } else if (target.type === 'file') {
        await assignFileAccessKey(target.id, fp.id);
        Alert.alert(
          'Access Key Created & Assigned',
          `${fp.label} has been created and assigned to ${target.name}.`
        );
      } else {
        await assignFolderAccessKey(target.id, fp.id);
        Alert.alert(
          'Access Key Created & Assigned',
          `${fp.label} has been created and assigned to ${target.name}.`
        );
      }

      resetForm();
      onSuccess(fp.id, fp.label);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visible || !target) return null;

  const isFormValid =
    newPasswordLabel.trim().length > 0 &&
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    newConfirmPassword.length > 0 &&
    newPassword === newConfirmPassword;

  const displayTargetName =
    target.name.length > 30 ? target.name.slice(0, 27) + '...' : target.name;

  const targetIcon = target.type === 'folder' ? Folder : target.type === 'bulk' ? Files : FileText;
  const targetLabel =
    target.type === 'bulk'
      ? `${selectedItemIds.length} item${selectedItemIds.length === 1 ? '' : 's'} · Bulk assign`
      : `${target.type === 'folder' ? 'Folder' : 'File'} · ${displayTargetName}`;
  const TargetIcon = targetIcon;

  const firstUnmetRule = getPasswordValidationMessages(newPassword).messages.find((m) => !m.valid);
  const passwordHint =
    newPassword.length === 0 ? '8+ chars' : firstUnmetRule ? firstUnmetRule.text : `${newStrengthLabel} password`;
  const passwordHintColor =
    newPassword.length === 0 ? colors.textMuted : firstUnmetRule ? colors.textMuted : colors.success;

  return (
    <Sheet visible={visible} onClose={handleClose} title="New Access Key">
      <View style={{ paddingHorizontal: space(5) }}>
        <View style={[styles.breadcrumbRow, { gap: space(2), marginBottom: space(4) }]}>
          <TargetIcon size={iconSize(14)} color={colors.textMuted} strokeWidth={2} />
          <Text style={[styles.breadcrumbText, { color: colors.textMuted, fontSize: font(Type.caption.size) }]} numberOfLines={1} ellipsizeMode="tail">
            {targetLabel}
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

      <View style={{ paddingHorizontal: space(5), paddingTop: space(4) }}>
        <TextField
          label="Key label"
          placeholder="e.g. Personal Vault"
          value={newPasswordLabel}
          onChangeText={setNewPasswordLabel}
          autoFocus
          editable={!isSubmitting}
        />

        <View style={[styles.labelRow, { marginBottom: space(2) }]}>
          <Text style={[styles.fieldLabel, { fontSize: font(Type.label.size), color: colors.textSecondary }]}>
            Description
          </Text>
          <Text style={[styles.optionalTag, { fontSize: font(Type.caption.size), color: colors.textMuted }]}>
            Optional
          </Text>
        </View>
        <TextField
          placeholder="What is this for?"
          value={newPasswordDescription}
          onChangeText={setNewPasswordDescription}
          editable={!isSubmitting}
        />
      </View>

      <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

      <View style={{ paddingHorizontal: space(5), paddingTop: space(4) }}>
        <TextField
          label="Password"
          placeholder="Enter a strong password"
          value={newPassword}
          onChangeText={(text) => setNewPassword(text)}
          secureToggle
          returnKeyType="next"
          onSubmitEditing={() => confirmPasswordRef.current?.focus()}
          editable={!isSubmitting}
        />

        <View style={[styles.strengthRow, { marginTop: -space(2), marginBottom: space(4), gap: space(3) }]}>
          <View style={[styles.strengthSegments, { gap: space(1) }]}>
            {Array.from({ length: STRENGTH_SEGMENTS }).map((_, idx) => (
              <View
                key={idx}
                style={[
                  styles.strengthSegment,
                  {
                    borderRadius: radius(1),
                    backgroundColor: idx < litSegments ? newStrengthColor : colors.borderLight,
                  },
                ]}
              />
            ))}
          </View>
          <Text style={[styles.strengthHint, { color: passwordHintColor, fontSize: font(Type.caption.size) }]} numberOfLines={1}>
            {passwordHint}
          </Text>
        </View>

        <TextField
          label="Confirm password"
          placeholder="Re-enter password"
          value={newConfirmPassword}
          onChangeText={setNewConfirmPassword}
          secureToggle
          returnKeyType="done"
          onSubmitEditing={handleConfirm}
          editable={!isSubmitting}
          helper={
            newConfirmPassword.length > 0
              ? (newPassword === newConfirmPassword ? '✓ Passwords match' : '✗ Passwords do not match')
              : undefined
          }
        />
      </View>

      <View style={[styles.divider, { backgroundColor: colors.borderLight, marginTop: space(2) }]} />

      <View style={[styles.footerRow, { paddingHorizontal: space(5), paddingTop: space(4), gap: space(3) }]}>
        <Button
          title="Cancel"
          onPress={handleClose}
          variant="tertiary"
          style={{ height: footerBtnHeight, flex: 1, borderRadius: radius(20) }}
        />
        <Button
          title="Create key"
          onPress={handleConfirm}
          variant="primary"
          loading={isSubmitting}
          disabled={!isFormValid}
          style={{ height: footerBtnHeight, flex: 2, borderRadius: radius(20) }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  breadcrumbRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  breadcrumbText: { flexShrink: 1, fontWeight: '600' },
  divider: { width: '100%', height: StyleSheet.hairlineWidth },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontWeight: '600' },
  optionalTag: { fontWeight: '500' },
  strengthRow: { flexDirection: 'row', alignItems: 'center' },
  strengthSegments: { flex: 1, flexDirection: 'row' },
  strengthSegment: { flex: 1, height: 4 },
  strengthHint: { fontWeight: '600' },
  footerRow: { flexDirection: 'row', width: '100%' },
});
