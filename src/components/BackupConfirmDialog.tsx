// File: src/components/BackupConfirmDialog.tsx
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { AlertTriangle, X, CheckCircle, HardDrive, Clock, AlertCircle, Info } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

export interface BackupConfirmDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  folderPath: string;
  estimatedSize?: number; // in bytes
  estimatedFileCount?: number;
  isLoading?: boolean;
}

export function BackupConfirmDialog({
  visible,
  onClose,
  onConfirm,
  folderPath,
  estimatedSize,
  estimatedFileCount,
  isLoading = false,
}: BackupConfirmDialogProps) {
  const { colors, space, font, isTablet } = useTheme();

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const getFolderName = (path: string) => {
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'Root';
  };

  if (!visible) return null;

  return (
    <Modal visible={true} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={[styles.container, { backgroundColor: colors.surface, width: isTablet ? '80%' : '90%', maxWidth: 400 }]}>
          <View style={[styles.header, { backgroundColor: `${colors.warning}15` }]}>
            <View style={styles.iconWrapper}>
              <AlertTriangle size={28} color={colors.warning} strokeWidth={2} />
            </View>
            <Text style={[styles.title, { color: colors.text, fontSize: font(20) }]}>Confirm Backup</Text>
          </View>

          <View style={styles.content}>
            <Text style={[styles.message, { color: colors.textMuted, fontSize: font(14), lineHeight: 20, textAlign: 'center' }]}>
              A backup will be created in the selected folder. This may take a few minutes depending on vault size.
            </Text>

            <View style={[styles.detailCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <View style={styles.detailRow}>
                <View style={[styles.detailIcon, { backgroundColor: `${colors.accent}15` }]}>
                  <HardDrive size={18} color={colors.accent} strokeWidth={2} />
                </View>
                <View style={styles.detailText}>
                  <Text style={[styles.detailLabel, { color: colors.textMuted, fontSize: font(11) }]}>Destination Folder</Text>
                  <Text style={[styles.detailValue, { color: colors.text, fontSize: font(14), fontFamily: 'monospace' }]} numberOfLines={2}>
                    {getFolderName(folderPath)}
                  </Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.detailRow}>
                <View style={[styles.detailIcon, { backgroundColor: `${colors.primary}15` }]}>
                  <Info size={18} color={colors.primary} strokeWidth={2} />
                </View>
                <View style={styles.detailText}>
                  <Text style={[styles.detailLabel, { color: colors.textMuted, fontSize: font(11) }]}>Full Path</Text>
                  <Text style={[styles.detailValue, { color: colors.textMuted, fontSize: font(12), fontFamily: 'monospace' }]} numberOfLines={2}>
                    {folderPath}
                  </Text>
                </View>
              </View>

              {(estimatedSize || estimatedFileCount) && (
                <>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <View style={styles.detailRow}>
                    <View style={[styles.detailIcon, { backgroundColor: `${colors.success}15` }]}>
                      <CheckCircle size={18} color={colors.success} strokeWidth={2} />
                    </View>
                    <View style={styles.detailText}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted, fontSize: font(11) }]}>Estimated Backup Size</Text>
                      <View style={styles.estimateRow}>
                        {estimatedFileCount && (
                          <View style={styles.estimateItem}>
                            <Text style={[styles.estimateValue, { color: colors.text, fontSize: font(14) }]}>{estimatedFileCount} files</Text>
                          </View>
                        )}
                        {estimatedSize && (
                          <View style={styles.estimateItem}>
                            <Text style={[styles.estimateValue, { color: colors.text, fontSize: font(14) }]}>{formatSize(estimatedSize)}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </>
              )}
            </View>

            <View style={[styles.note, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` }]}>
              <View style={styles.noteRow}>
                <Info size={14} color={colors.primary} strokeWidth={2} />
                <Text style={[styles.noteText, { color: colors.primary, fontSize: font(11) }]}>
                  Encryption keys are NOT included in backups. Files remain encrypted.
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.buttonRow, { gap: space(3) }]}>
            <TouchableOpacity
              style={[styles.cancelBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              onPress={onClose}
              disabled={isLoading}
              activeOpacity={isLoading ? 1 : 0.7}
            >
              <Text style={[styles.cancelText, { color: colors.text, fontSize: font(15) }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: isLoading ? 0.7 : 1,
                },
              ]}
              onPress={isLoading ? undefined : () => { onClose(); onConfirm(); }}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              {isLoading ? (
                <View style={styles.loadingBtnContent}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={[styles.confirmText, { fontSize: font(15), marginLeft: space(2) }]}>Creating...</Text>
                </View>
              ) : (
                <Text style={[styles.confirmText, { fontSize: font(15) }]}>Create Backup</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    padding: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(234,179,8,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.3,
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  message: {
    fontWeight: '500',
  },
  detailCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailText: {
    flex: 1,
    minWidth: 0,
  },
  detailLabel: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  detailValue: {
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  estimateRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 2,
  },
  estimateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  estimateValue: {
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  noteText: {
    fontWeight: '500',
    lineHeight: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 48,
  },
  cancelText: {
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 1.2,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 48,
  },
  confirmText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  loadingBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});