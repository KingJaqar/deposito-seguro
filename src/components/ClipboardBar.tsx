import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useVaultStore } from '../store/vaultStore';
import { ClipboardCheck, ClipboardX, Undo2 } from 'lucide-react-native';

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
  backgroundColor,
  textColor,
  accentColor,
  mutedColor,
}: ClipboardBarProps) {
  const { colors, space, font } = useTheme();
  const clipboard = useVaultStore((s) => s.clipboard);
  const undoInfo = useVaultStore((s) => s.undoInfo);
  const clearClipboard = useVaultStore((s) => s.clearClipboard);
  const [showUndo, setShowUndo] = useState(false);

  const resolvedBg = backgroundColor ?? colors.surface;
  const resolvedText = textColor ?? colors.text;
  const resolvedAccent = accentColor ?? colors.primary;
  const resolvedMuted = mutedColor ?? colors.textMuted;

  const barStyle = useMemo(() => ({
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(5),
    paddingVertical: space(3),
    borderRadius: 14,
    marginBottom: 12,
    gap: 10,
  } as ViewStyle), [space]);

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
    <View style={[barStyle, { backgroundColor: resolvedBg }]}>
      <View style={styles.info}>
        <Text style={[styles.label, { color: resolvedText }]} numberOfLines={1}>
          Copied: {label}
        </Text>
        {clipboard.mode === 'cut' && (
          <Text style={[styles.mode, { color: resolvedMuted }]} numberOfLines={1}>
            {' '}(Cut pending)
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        {showUndo && onUndo && (
          <TouchableOpacity onPress={onUndo} style={[styles.undoBtn, { backgroundColor: `${resolvedAccent}20` }]} accessibilityRole="button" accessibilityLabel="Undo cut">
            <Undo2 size={16} color={resolvedAccent} strokeWidth={2.5} />
            <Text style={[styles.undoText, { color: resolvedAccent }]}>Undo</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onPaste} style={[styles.pasteBtn, { backgroundColor: resolvedAccent }]} accessibilityRole="button" accessibilityLabel="Paste">
          <ClipboardCheck size={16} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={styles.pasteText}>Paste</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { clearClipboard(); }} style={styles.clearBtn} accessibilityRole="button" accessibilityLabel="Clear clipboard">
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
    gap: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  mode: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 36,
    minWidth: 36,
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
    minHeight: 36,
    minWidth: 36,
  },
  undoText: {
    fontWeight: '700',
    fontSize: 13,
  },
  clearBtn: {
    padding: 8,
    borderRadius: 10,
    minHeight: 36,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
