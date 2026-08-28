// src/components/RenameModal.tsx
// Rebuilt on the Dialog primitive per §5 (short-form content → Dialog).
// handleRename/handleCancel bodies and the `key={item.id}` remount behavior
// that seeds the input from item.name are unchanged; every deprecated
// colors.dashboardX alias is gone, replaced by real v2 schema names.
import { useState } from 'react';
import { Pencil } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';
import { Dialog } from './primitives/Dialog';
import { TextField } from './primitives/TextField';
import { MAX_NAME_LENGTH } from '../constants/naming';

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

function RenameModalContent({ visible, item, onClose, onRename, title }: {
  visible: boolean;
  item: { id: string; name: string; type: 'file' | 'folder' };
  onClose: () => void;
  onRename: (newName: string) => void;
  title?: string;
}) {
  const { colors, space, font, radius } = useTheme();
  const [renameText, setRenameText] = useState(item.name);

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

  const modalTitle = title || (item.type === 'folder' ? 'Rename Vault' : 'Rename File');
  const placeholder = item.type === 'folder' ? 'Vault name' : 'File name';

  return (
    <Dialog
      visible={visible}
      onRequestClose={handleCancel}
      icon={Pencil}
      title={modalTitle}
      actions={[
        { label: 'Cancel', onPress: handleCancel, variant: 'tertiary' },
        { label: 'Rename', onPress: handleRename, variant: 'primary', disabled: !renameText.trim() },
      ]}
    >
      <View style={{ width: '100%' }}>
        <View
          style={[
            styles.currentNameChip,
            { backgroundColor: colors.surfaceHover, borderRadius: radius(3), paddingHorizontal: space(3), paddingVertical: space(2), marginBottom: space(4) },
          ]}
        >
          <Text style={[styles.currentNameLabel, { color: colors.textMuted, fontSize: font(Type.caption.size) }]} numberOfLines={2}>
            Current: {item.name}
          </Text>
        </View>

        <TextField
          placeholder={placeholder}
          value={renameText}
          onChangeText={setRenameText}
          autoFocus
          maxLength={MAX_NAME_LENGTH}
          returnKeyType="done"
          onSubmitEditing={handleRename}
          accessibilityLabel={placeholder}
          helper={`${renameText.length}/${MAX_NAME_LENGTH}`}
        />
      </View>
    </Dialog>
  );
}

export function RenameModal({ visible, onClose, item, onRename, title }: RenameModalProps) {
  if (!item) return null;

  return (
    <RenameModalContent
      key={item.id}
      visible={visible}
      item={item}
      onClose={onClose}
      onRename={onRename}
      title={title}
    />
  );
}

const styles = StyleSheet.create({
  currentNameChip: { alignSelf: 'stretch' },
  currentNameLabel: { fontWeight: '500' },
});
