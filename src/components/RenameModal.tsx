import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export interface RenameModalProps {
  visible: boolean;
  onClose: () => void;
  item: {
    id: string;
    name: string;
    type: 'file' | 'folder';
  } | null;
  onRename: (newName: string) => void;
  title?: string;
}

export function RenameModal({ visible, onClose, item, onRename, title }: RenameModalProps) {
  const { colors, space, font, isTablet } = useTheme();
  const [renameText, setRenameText] = useState('');

  useEffect(() => {
    if (item) {
      setRenameText(item.name);
    }
  }, [item]);

  const handleRename = () => {
    if (renameText.trim()) {
      onRename(renameText.trim());
      setRenameText('');
      onClose();
    }
  };

  const handleCancel = () => {
    setRenameText('');
    onClose();
  };

  if (!item) return null;

  const modalTitle = title || (item.type === 'folder' ? 'Rename Vault' : 'Rename File');
  const placeholder = item.type === 'folder' ? 'Vault name' : 'File name';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.dashboardSurface ?? colors.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.dashboardText ?? colors.text }]} numberOfLines={1}>
              {modalTitle}
            </Text>
            <TouchableOpacity
              onPress={handleCancel}
              style={[styles.closeButton, { backgroundColor: colors.dashboardBg ?? colors.background }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={20} color={colors.dashboardText ?? colors.text} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* Current name display */}
          <View style={[styles.currentNameChip, { backgroundColor: colors.dashboardBg ?? colors.background }]}>
            <Text style={[styles.currentNameLabel, { color: colors.dashboardTextMuted ?? colors.textMuted }]}>
              Current: {item.name}
            </Text>
          </View>

          {/* Input */}
          <TextInput
            style={[
              styles.input,
              {
                borderColor: colors.dashboardBorder ?? colors.border,
                color: colors.dashboardText ?? colors.text,
                backgroundColor: colors.dashboardBg ?? colors.background,
              },
            ]}
            placeholder={placeholder}
            placeholderTextColor={colors.dashboardTextMuted ?? colors.textMuted}
            value={renameText}
            onChangeText={setRenameText}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleRename}
          />

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={handleCancel}
              style={[styles.button, styles.cancelButton, { borderColor: colors.dashboardBorder ?? colors.border }]}
            >
              <Text style={[styles.buttonText, { color: colors.dashboardText ?? colors.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRename}
              style={[styles.button, styles.confirmButton, { backgroundColor: colors.fabBg ?? colors.primary }]}
            >
              <Text style={[styles.buttonText, { color: colors.fabText ?? '#FFFFFF' }]}>
                Rename
              </Text>
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  currentNameChip: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  currentNameLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1.5,
  },
  confirmButton: {
    // backgroundColor from inline style
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});