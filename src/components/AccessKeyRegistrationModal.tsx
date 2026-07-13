import { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Eye, EyeOff, FileText, Key, Lock, ShieldCheck, X } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useSettingsStore } from '../store/settingsStore';
import { getPasswordStrength, getPasswordValidationMessages, validatePassword } from '../utils/accessKeyValidation';

const MIN_PASSWORD_LENGTH = 4;

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
  const { colors, space, font } = useTheme();
  const { accessKeys, createAccessKey, accessKeyExists } = useSettingsStore();

  const dash = {
    surface: colors.dashboardSurface ?? colors.surface,
    text: colors.dashboardText ?? colors.text,
    textMuted: colors.dashboardTextMuted ?? colors.textMuted,
    bg: colors.dashboardBg ?? colors.background,
    border: colors.dashboardBorder ?? colors.border,
    fabBg: colors.fabBg ?? colors.primary,
    fabText: colors.fabText ?? '#FFFFFF',
    error: colors.error,
  };

  const s = space;
  const f = font;

  const [newPasswordLabel, setNewPasswordLabel] = useState('');
  const [newPasswordDescription, setNewPasswordDescription] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewConfirmPassword, setShowNewConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const confirmPasswordRef = useRef<TextInput>(null);

  const passwordStrength = getPasswordStrength(newPassword);
  const newStrengthColor =
    passwordStrength === 'weak' ? dash.error : passwordStrength === 'medium' ? '#FBBF24' : '#34C759';
  const newStrengthLabel =
    passwordStrength === 'weak' ? 'Weak' : passwordStrength === 'medium' ? 'Medium' : 'Strong';
  const newStrengthWidth =
    passwordStrength === 'weak' ? '33%' : passwordStrength === 'medium' ? '66%' : '100%';

  const resetForm = () => {
    setNewPasswordLabel('');
    setNewPasswordDescription('');
    setNewPassword('');
    setNewConfirmPassword('');
    setShowNewPassword(false);
    setShowNewConfirmPassword(false);
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
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <View style={[modalS.card, { backgroundColor: dash.surface, width: '90%', maxWidth: 400, maxHeight: '80%' }]}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={modalS.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[modalS.title, { color: dash.text }]}>Access Key Registration</Text>

              <View style={[modalS.targetRow, { backgroundColor: dash.bg, paddingHorizontal: s(3), paddingVertical: s(2), borderRadius: s(3), marginBottom: s(4), width: '100%' }]}>
                <FileText size={16} color={dash.textMuted} strokeWidth={2} />
                <Text style={[modalS.targetChipText, { color: dash.textMuted, flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">
                  for {displayTargetName}
                </Text>
              </View>

              <View style={{ marginBottom: s(4) }}>
                <Text style={[modalS.label, { color: dash.text, marginBottom: s(1) }]}>Password Label</Text>
                <TextInput
                  style={[modalS.input, { backgroundColor: dash.bg, color: dash.text }]}
                  placeholder="e.g. Personal Vault Password"
                  placeholderTextColor={dash.textMuted}
                  value={newPasswordLabel}
                  onChangeText={setNewPasswordLabel}
                  autoFocus
                />
              </View>

              <View style={{ marginBottom: s(7) }}>
                <View style={[modalS.labelRow, { marginBottom: s(1) }]}>
                  <Text style={[modalS.label, { color: dash.text }]}>Description</Text>
                  <View style={[modalS.optionalBadge, { backgroundColor: dash.bg, borderColor: dash.border, borderWidth: 1, paddingHorizontal: s(2), paddingVertical: 2, borderRadius: s(2) }]}>
                    <Text style={[modalS.optionalBadgeText, { color: dash.textMuted }]}>optional</Text>
                  </View>
                </View>
                <TextInput
                  style={[modalS.input, { backgroundColor: dash.bg, color: dash.text, minHeight: 100, textAlignVertical: 'top' }]}
                  placeholder="What is this password used for?"
                  placeholderTextColor={dash.textMuted}
                  value={newPasswordDescription}
                  onChangeText={setNewPasswordDescription}
                  multiline
                />
              </View>

              <View style={[modalS.sectionDivider, { backgroundColor: 'transparent', marginVertical: s(7) }]}>
                <View style={[modalS.dividerLine, { backgroundColor: dash.border, flex: 1, height: StyleSheet.hairlineWidth }]} />
                <Text style={[modalS.sectionLabel, { color: dash.textMuted, marginHorizontal: s(4) }]}>SECURITY</Text>
                <View style={[modalS.dividerLine, { backgroundColor: dash.border, flex: 1, height: StyleSheet.hairlineWidth }]} />
              </View>

              <View style={{ marginBottom: s(5) }}>
                <View style={[modalS.labelRow, { marginBottom: s(2) }]}>
                  <Key size={13} color={dash.textMuted} strokeWidth={2} />
                  <Text style={[modalS.inputLabel, { color: dash.textMuted }]}> CREATE PASSWORD</Text>
                </View>

                <View style={{ position: 'relative', width: '100%' }}>
                  <TextInput
                    style={[modalS.input, { backgroundColor: dash.bg, color: dash.text, paddingRight: 50 }]}
                    placeholder="Enter a strong password"
                    placeholderTextColor={dash.textMuted}
                    value={newPassword}
                    onChangeText={(text) => setNewPassword(text)}
                    secureTextEntry={!showNewPassword}
                    returnKeyType="next"
                    onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                  />
                  <TouchableOpacity
                    style={[modalS.eyeButton, { position: 'absolute', right: s(3), top: '50%', marginTop: -12, padding: s(1) }]}
                    onPress={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <EyeOff size={18} color={dash.textMuted} strokeWidth={2} />
                    ) : (
                      <Eye size={18} color={dash.textMuted} strokeWidth={2} />
                    )}
                  </TouchableOpacity>
                </View>

                {newPassword.length > 0 && (
                  <View style={{ marginTop: s(2), gap: s(1) }}>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: dash.border, overflow: 'hidden' }}>
                      <View style={{ height: '100%', borderRadius: 2, backgroundColor: newStrengthColor, width: newStrengthWidth }} />
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: newStrengthColor, textTransform: 'capitalize' }}>
                      {newStrengthLabel} password
                    </Text>
                  </View>
                )}

                {newPassword.length > 0 && (
                  <View style={[modalS.validationBox, { backgroundColor: 'rgba(255,69,58,0.06)', borderWidth: 1, borderColor: 'rgba(255,69,58,0.12)', marginTop: s(2), padding: s(3), borderRadius: s(3) }]}>
                    <Text style={[modalS.validationTitle, { color: dash.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: s(2) }]}>
                      Password Requirements
                    </Text>
                    {getPasswordValidationMessages(newPassword).messages.map((msg, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                        <Text style={[{ color: msg.valid ? '#34C759' : dash.error, fontSize: 12, marginRight: s(2), fontWeight: '700', width: s(4), textAlign: 'center' }]}>
                          {msg.valid ? '✓' : '✗'}
                        </Text>
                        <Text style={[{ color: msg.valid ? dash.textMuted : dash.error, fontSize: 12, fontWeight: '500' }]}>
                          {msg.text}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={{ marginBottom: s(5) }}>
                <View style={[modalS.labelRow, { marginBottom: s(2) }]}>
                  <Key size={13} color={dash.textMuted} strokeWidth={2} />
                  <Text style={[modalS.inputLabel, { color: dash.textMuted }]}> CONFIRM PASSWORD</Text>
                </View>

                <View style={{ position: 'relative', width: '100%' }}>
                  <TextInput
                    ref={confirmPasswordRef}
                    style={[modalS.input, { backgroundColor: dash.bg, color: dash.text, paddingRight: 50 }]}
                    placeholder="Confirm your password"
                    placeholderTextColor={dash.textMuted}
                    value={newConfirmPassword}
                    onChangeText={(text) => setNewConfirmPassword(text)}
                    secureTextEntry={!showNewConfirmPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleConfirm}
                  />
                  <TouchableOpacity
                    style={[modalS.eyeButton, { position: 'absolute', right: s(3), top: '50%', marginTop: -12, padding: s(1) }]}
                    onPress={() => setShowNewConfirmPassword(!showNewConfirmPassword)}
                  >
                    {showNewConfirmPassword ? (
                      <EyeOff size={18} color={dash.textMuted} strokeWidth={2} />
                    ) : (
                      <Eye size={18} color={dash.textMuted} strokeWidth={2} />
                    )}
                  </TouchableOpacity>
                </View>

                {newConfirmPassword.length > 0 && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: newPassword === newConfirmPassword ? '#34C759' : dash.error,
                      marginTop: 8,
                      fontWeight: '600',
                    }}
                  >
                    {newPassword === newConfirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </Text>
                )}
              </View>

              <View style={[modalS.actions, { flexDirection: 'row', gap: s(3), marginTop: s(8) }]}>
                <TouchableOpacity
                  onPress={handleClose}
                  disabled={isSubmitting}
                  style={[
                    modalS.cancelBtn,
                    { backgroundColor: dash.bg, paddingVertical: s(3), borderRadius: s(3), alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s(2), flex: 1 },
                  ]}
                >
                  <X size={18} color={dash.text} strokeWidth={2.5} />
                  <Text style={[modalS.cancelText, { color: dash.text, fontSize: f(13), fontWeight: '700' }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirm}
                  disabled={!isFormValid || isSubmitting}
                  style={[
                    modalS.primaryBtn,
                    {
                      backgroundColor: '#000000',
                      paddingVertical: s(3),
                      borderRadius: s(3),
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: s(2),
                      flex: 1.2,
                      opacity: isFormValid ? 1 : 0.6,
                    },
                  ]}
                >
                  <ShieldCheck size={18} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={[modalS.primaryText, { color: '#FFFFFF', fontSize: f(13), fontWeight: '600' }]}>
                    Create Password
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalS = StyleSheet.create({
  scrollContent: { width: '100%', alignItems: 'stretch' },
  card: { borderRadius: 24, alignItems: 'center', padding: 20, overflow: 'hidden' }, // Added overflow hidden
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 16 },
  targetRow: { width: '100%', flexDirection: 'row', alignItems: 'center' },
  targetChipText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  optionalBadge: { borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 },
  optionalBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  input: { width: '100%', maxWidth: '100%', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, minHeight: 48 }, // Added maxWidth 100%
  eyeButton: { padding: 4 },
  inputLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  sectionDivider: { flexDirection: 'row', alignItems: 'center' },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  validationBox: {},
  validationTitle: {},
  validationItem: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  validationIcon: { fontSize: 12, marginRight: 8, fontWeight: '700', width: 20, textAlign: 'center' },
  validationText: { fontSize: 12, fontWeight: '500' },
  strengthRow: { flexDirection: 'row', alignItems: 'center' },
  strengthBar: { height: 4, borderRadius: 2, flex: 1, overflow: 'hidden' },
  strengthFill: { height: '100%', borderRadius: 2 },
  strengthText: { fontSize: 11, fontWeight: '600' },
  actions: {},
  cancelBtn: {},
  cancelText: { fontSize: 15, fontWeight: '700' },
  primaryBtn: {},
  primaryText: { fontSize: 15, fontWeight: '700' },
});