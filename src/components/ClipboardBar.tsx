import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useVaultStore } from '../store/vaultStore';
import { ClipboardCheck, ClipboardX, Trash2, Undo2 } from 'lucide-react-native';

interface ClipboardBarProps {
  onPaste: () => void;
  onUndo?: () => void;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  mutedColor?: string;
}

export function ClipboardBar({
  onPaste,
  onUndo,
  backgroundColor = '#FFFFFF',
  textColor = '#000000',
  accentColor = '#0A84FF',
  mutedColor = '#8E8E93',
}: ClipboardBarProps) {
  const clipboard = useVaultStore((s) => s.clipboard);
  const undoInfo = useVaultStore((s) => s.undoInfo);
  const clearClipboard = useVaultStore((s) => s.clearClipboard);
  const [showUndo, setShowUndo] = useState(false);

  useEffect(() => {
    if (undoInfo && clipboard?.mode === 'cut') {
      setShowUndo(true);
      const timer = setTimeout(() => setShowUndo(false), 5000);
      return () => clearTimeout(timer);
    } else {
      setShowUndo(false);
    }
  }, [undoInfo, clipboard?.mode]);

  if (!clipboard) return null;

  const folderCount = clipboard.folderIds.length;
  const fileCount = clipboard.fileIds.length;
  const label = folderCount > 0 && fileCount > 0
    ? `${folderCount} folder${folderCount !== 1 ? 's' : ''}, ${fileCount} file${fileCount !== 1 ? 's' : ''}`
    : folderCount > 0
      ? `${folderCount} folder${folderCount !== 1 ? 's' : ''}`
      : `${fileCount} file${fileCount !== 1 ? 's' : ''}`;

  return (
    <View style={[styles.bar, { backgroundColor }]}>
      <View style={styles.info}>
        <Text style={[styles.label, { color: textColor }]}>Copied: {label}</Text>
        {clipboard.mode === 'cut' && <Text style={[styles.mode, { color: mutedColor }]}> (Cut pending)</Text>}
      </View>
      <View style={styles.actions}>
        {showUndo && onUndo && (
          <TouchableOpacity onPress={onUndo} style={[styles.undoBtn, { backgroundColor: `${accentColor}20` }]}>
            <Undo2 size={16} color={accentColor} strokeWidth={2.5} />
            <Text style={[styles.undoText, { color: accentColor }]}>Undo</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onPaste} style={[styles.pasteBtn, { backgroundColor: accentColor }]}>
          <ClipboardCheck size={16} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={styles.pasteText}>Paste</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { clearClipboard(); }} style={styles.clearBtn}>
          <ClipboardX size={16} color="#FF453A" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 12,
    gap: 10,
  },
  info: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
  mode: {
    fontSize: 12,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  pasteText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  undoText: {
    fontWeight: '700',
    fontSize: 13,
  },
  clearBtn: {
    padding: 8,
    borderRadius: 10,
  },
});
