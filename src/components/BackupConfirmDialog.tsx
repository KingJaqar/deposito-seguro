// File: src/components/BackupConfirmDialog.tsx
// Rebuilt on the Dialog primitive per §5. formatSize, passphraseMismatch,
// canConfirm, and handleConfirm (including its exact ordering — trim to
// undefined, clear both fields, onClose(), then onConfirm(value)) are carried
// across unchanged; the "blank passphrase means no key material" contract in
// the prop doc is preserved. Only JSX/StyleSheet is new — `colors.accent`
// becomes `colors.secondary`, and the two hand-rolled passphrase inputs
// collapse onto TextField's secureToggle.
import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle, CheckCircle, HardDrive, KeyRound } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';
import { Dialog } from './primitives/Dialog';
import { TextField } from './primitives/TextField';

export interface BackupConfirmDialogProps {
  visible: boolean;
  onClose: () => void;
  /** Passphrase is undefined if the user left it blank — the backup then carries no key material, matching the old behavior. */
  onConfirm: (passphrase: string | undefined) => void;
  folderLabel: string;
  estimatedSize?: number; // in bytes
  estimatedFileCount?: number;
  isLoading?: boolean;
}

export function BackupConfirmDialog({
  visible,
  onClose,
  onConfirm,
  folderLabel,
  estimatedSize,
  estimatedFileCount,
  isLoading = false,
}: BackupConfirmDialogProps) {
  const { colors, space, font, radius, iconSize } = useTheme();
  const detailIconSize = iconSize(34);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const passphraseMismatch = passphrase.length > 0 && passphrase !== confirmPassphrase;
  const canConfirm = !isLoading && !passphraseMismatch;

  const handleConfirm = () => {
    if (!canConfirm) return;
    const value = passphrase.trim() || undefined;
    setPassphrase('');
    setConfirmPassphrase('');
    onClose();
    onConfirm(value);
  };

  if (!visible) return null;

  return (
    <Dialog
      visible={visible}
      onRequestClose={onClose}
      icon={AlertTriangle}
      iconColor={colors.warning}
      title="Confirm Backup"
      message="A backup will be created in the selected folder. This may take a few minutes depending on vault size."
      actions={[
        { label: 'Cancel', onPress: onClose, variant: 'tertiary' },
        { label: 'Start Backup', onPress: handleConfirm, variant: 'primary', loading: isLoading, disabled: !canConfirm },
      ]}
    >
      <View style={{ width: '100%' }}>
        <View style={[styles.detailCard, { backgroundColor: colors.surfaceHover, borderColor: colors.borderLight, borderRadius: radius(4), padding: space(3), marginBottom: space(4), gap: space(3) }]}>
          <View style={[styles.detailRow, { gap: space(3) }]}>
            <View style={[styles.detailIcon, { width: detailIconSize, height: detailIconSize, backgroundColor: `${colors.secondary}1F`, borderRadius: radius(3) }]}>
              <HardDrive size={iconSize(18)} color={colors.secondary} strokeWidth={2} />
            </View>
            <View style={styles.detailText}>
              <Text style={[styles.detailLabel, { color: colors.textMuted, fontSize: font(Type.eyebrow.size) }]}>DESTINATION FOLDER</Text>
              <Text style={[styles.detailValue, { color: colors.text, fontSize: font(Type.label.size), fontFamily: 'monospace' }]} numberOfLines={2}>
                {folderLabel}
              </Text>
            </View>
          </View>

          {(estimatedSize || estimatedFileCount) && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
              <View style={[styles.detailRow, { gap: space(3) }]}>
                <View style={[styles.detailIcon, { width: detailIconSize, height: detailIconSize, backgroundColor: `${colors.success}1F`, borderRadius: radius(3) }]}>
                  <CheckCircle size={iconSize(18)} color={colors.success} strokeWidth={2} />
                </View>
                <View style={styles.detailText}>
                  <Text style={[styles.detailLabel, { color: colors.textMuted, fontSize: font(Type.eyebrow.size) }]}>ESTIMATED BACKUP SIZE</Text>
                  <Text style={[styles.detailValue, { color: colors.text, fontSize: font(Type.label.size) }]}>
                    {[
                      estimatedFileCount ? `${estimatedFileCount} files` : null,
                      estimatedSize ? formatSize(estimatedSize) : null,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>

        <View style={[styles.detailRow, { gap: space(3), marginBottom: space(3) }]}>
          <View style={[styles.detailIcon, { width: detailIconSize, height: detailIconSize, backgroundColor: `${colors.warning}1F`, borderRadius: radius(3) }]}>
            <KeyRound size={iconSize(18)} color={colors.warning} strokeWidth={2} />
          </View>
          <View style={styles.detailText}>
            <Text style={[styles.detailLabel, { color: colors.textMuted, fontSize: font(Type.eyebrow.size) }]}>BACKUP PASSPHRASE (OPTIONAL)</Text>
            <Text style={[styles.detailValue, { color: colors.textMuted, fontSize: font(Type.caption.size), fontWeight: '500' }]}>
              Set one to also back up your access/encryption keys, so protected content can be restored on another device.
            </Text>
          </View>
        </View>

        <TextField
          placeholder="Backup passphrase"
          value={passphrase}
          onChangeText={setPassphrase}
          secureToggle
          editable={!isLoading}
          accessibilityLabel="Backup passphrase"
        />
        {passphrase.length > 0 && (
          <TextField
            placeholder="Confirm passphrase"
            value={confirmPassphrase}
            onChangeText={setConfirmPassphrase}
            secureToggle
            editable={!isLoading}
            accessibilityLabel="Confirm backup passphrase"
            error={passphraseMismatch ? 'Passphrases do not match' : undefined}
          />
        )}
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  detailCard: { borderWidth: StyleSheet.hairlineWidth, width: '100%' },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start' },
  detailIcon: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  detailText: { flex: 1, flexShrink: 1 },
  detailLabel: { fontWeight: '700', letterSpacing: 0.6, marginBottom: 2 },
  detailValue: { fontWeight: '600', lineHeight: 18 },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
});
