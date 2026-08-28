// src/components/ClipboardBar.tsx
// Rebuilt per §5/§7 Phase 4 — full JSX/StyleSheet teardown. Store reads
// (clipboard, undoInfo, clearClipboard), the showUndo condition, and the
// label pluralization logic are unchanged; the prop interface is preserved
// so every calling screen passes exactly what it passes today.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ClipboardCheck, ClipboardX, Undo2 } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';
import { useVaultStore } from '../store/vaultStore';

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
  const { colors, space, font, radius, iconSize, touchTarget } = useTheme();
  const actionBtnHeight = touchTarget() - 8;
  const clipboard = useVaultStore((s) => s.clipboard);
  const undoInfo = useVaultStore((s) => s.undoInfo);
  const clearClipboard = useVaultStore((s) => s.clearClipboard);
  const showUndo = undoInfo && clipboard?.mode === 'cut';

  const resolvedBg = backgroundColor ?? colors.surface;
  const resolvedText = textColor ?? colors.text;
  const resolvedAccent = accentColor ?? colors.primary;
  const resolvedMuted = mutedColor ?? colors.textMuted;

  if (!clipboard) return null;

  const folderCount = clipboard.folderIds.length;
  const fileCount = clipboard.fileIds.length;
  const label = folderCount > 0 && fileCount > 0
    ? `${folderCount} folder${folderCount !== 1 ? 's' : ''}, ${fileCount} file${fileCount !== 1 ? 's' : ''}`
    : folderCount > 0
      ? `${folderCount} folder${folderCount !== 1 ? 's' : ''}`
      : `${fileCount} file${fileCount !== 1 ? 's' : ''}`;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: resolvedBg,
          borderColor: colors.borderLight,
          borderRadius: radius(5),
          paddingHorizontal: space(4),
          paddingVertical: space(3),
          marginBottom: space(3),
          gap: space(2),
        },
      ]}
    >
      <View style={styles.info}>
        <Text style={[styles.label, { color: resolvedText, fontSize: font(Type.label.size) }]} numberOfLines={1}>
          Copied: {label}
        </Text>
        {clipboard.mode === 'cut' && (
          <Text style={[styles.mode, { color: resolvedMuted, fontSize: font(Type.caption.size) }]} numberOfLines={1}>
            {' '}(Cut pending)
          </Text>
        )}
      </View>
      <View style={[styles.actions, { gap: space(2) }]}>
        {showUndo && onUndo && (
          <Pressable
            onPress={onUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo cut"
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: `${resolvedAccent}1F`, borderRadius: radius(4), paddingHorizontal: space(3), gap: space(1), minHeight: actionBtnHeight, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Undo2 size={iconSize(16)} color={resolvedAccent} strokeWidth={2.5} />
            <Text style={[styles.actionText, { color: resolvedAccent, fontSize: font(Type.label.size) }]}>Undo</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onPaste}
          accessibilityRole="button"
          accessibilityLabel="Paste"
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: resolvedAccent, borderRadius: radius(4), paddingHorizontal: space(4), gap: space(1), minHeight: actionBtnHeight, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <ClipboardCheck size={iconSize(16)} color={colors.onPrimary} strokeWidth={2.5} />
          <Text style={[styles.actionText, { color: colors.onPrimary, fontSize: font(Type.label.size) }]}>Paste</Text>
        </Pressable>
        <Pressable
          onPress={() => { clearClipboard(); }}
          accessibilityRole="button"
          accessibilityLabel="Clear clipboard"
          style={({ pressed }) => [
            styles.clearBtn,
            { borderRadius: radius(4), minHeight: actionBtnHeight, minWidth: actionBtnHeight, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <ClipboardX size={iconSize(16)} color={colors.error} strokeWidth={2.5} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
  },
  info: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  label: { fontWeight: '700', flexShrink: 1 },
  mode: { fontWeight: '600', flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontWeight: '700' },
  clearBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
