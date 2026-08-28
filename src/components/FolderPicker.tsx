// File: src/components/FolderPicker.tsx
// Rebuilt on the Sheet primitive per §5 (scrollable list/search picker →
// Sheet, not Dialog). ALL filesystem logic is carried across byte-identical:
// getDefaultRootPath, loadDirectory's FileSystem.getInfoAsync /
// readDirectoryAsync walk and its isDirectory filter + localeCompare sort,
// handleItemPress, goBack's history/parent-path handling, and
// selectCurrentFolder. Only the JSX/StyleSheet is new — and every
// `colors.accent` deprecated alias is replaced with `colors.secondary`.
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { Folder, ChevronRight, Check, Home, FolderOpen } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';
import { Button } from './primitives/Button';
import { EmptyState } from './primitives/EmptyState';
import { Sheet } from './primitives/Sheet';

interface FolderPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}

interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

export function FolderPicker({ visible, onClose, onSelect, initialPath }: FolderPickerProps) {
  const { colors, space, font, radius, isTablet, iconSize, touchTarget } = useTheme();
  const pathBtnSize = iconSize(32);
  const itemIconSize = iconSize(36);
  const [currentPath, setCurrentPath] = useState<string>(initialPath || getDefaultRootPath());
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathHistory, setPathHistory] = useState<string[]>([]);

  const isRoot = currentPath === getDefaultRootPath();

  useEffect(() => {
    if (visible) {
      loadDirectory(currentPath);
    }
  }, [visible, currentPath]);

  function getDefaultRootPath(): string {
    return FileSystem.documentDirectory || '';
  }

  async function loadDirectory(path: string) {
    setLoading(true);
    setError(null);
    try {
      const dirInfo = await FileSystem.getInfoAsync(path);
      if (!dirInfo.exists) {
        throw new Error('Directory does not exist');
      }

      const contents = await FileSystem.readDirectoryAsync(path);
      const dirItems: DirectoryItem[] = [];

      for (const item of contents) {
        const itemPath = `${path}${item}/`;
        const itemInfo = await FileSystem.getInfoAsync(itemPath);
        if (itemInfo.exists && itemInfo.isDirectory) {
          dirItems.push({
            name: item,
            path: itemPath,
            isDirectory: true,
          });
        }
      }

      dirItems.sort((a, b) => a.name.localeCompare(b.name));
      setItems(dirItems);
    } catch (e: any) {
      setError(e.message || 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }

  function handleItemPress(item: DirectoryItem) {
    setPathHistory((prev: string[]) => [...prev, currentPath]);
    setCurrentPath(item.path);
  }

  function goBack() {
    if (pathHistory.length > 0) {
      const prevPath = pathHistory[pathHistory.length - 1];
      setPathHistory((prev: string[]) => prev.slice(0, -1));
      setCurrentPath(prevPath);
    } else if (!isRoot) {
      const parentPath = currentPath.split('/').slice(0, -2).join('/') + '/';
      setCurrentPath(parentPath || getDefaultRootPath());
    }
  }

  function selectCurrentFolder() {
    onSelect(currentPath);
    onClose();
  }

  if (!visible) return null;

  return (
    <Sheet visible={visible} onClose={onClose} title="Select Backup Folder">
      <View style={[styles.pathBar, { backgroundColor: colors.surfaceHover, borderRadius: radius(4), marginHorizontal: space(5), paddingHorizontal: space(3), paddingVertical: space(2), marginBottom: space(3), gap: space(2) }]}>
        <Pressable
          onPress={goBack}
          disabled={isRoot}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go to parent folder"
          accessibilityState={{ disabled: isRoot }}
          style={[styles.pathButton, { width: pathBtnSize, height: pathBtnSize }]}
        >
          <Home size={iconSize(18)} color={isRoot ? colors.textMuted : colors.primary} strokeWidth={2} />
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pathScroll}>
          <Text style={[styles.pathText, { color: colors.textSecondary, fontSize: font(Type.caption.size) }]}>
            {currentPath.replace(FileSystem.documentDirectory || '', '/ ').replace(/\/([^/]+)\/$/, '/$1/')}
          </Text>
        </ScrollView>
      </View>

      {error && (
        <View style={[styles.errorContainer, { backgroundColor: `${colors.error}14`, borderRadius: radius(4), marginHorizontal: space(5), paddingHorizontal: space(4), paddingVertical: space(3), marginBottom: space(3) }]}>
          <Text style={[styles.errorText, { color: colors.error, fontSize: font(Type.label.size) }]}>{error}</Text>
          <Button title="Retry" onPress={() => loadDirectory(currentPath)} variant="ghost" size="sm" />
        </View>
      )}

      <ScrollView style={{ maxHeight: isTablet ? 420 : 320 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={[styles.loadingContainer, { paddingVertical: space(12), gap: space(3) }]}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={{ color: colors.textMuted, fontSize: font(Type.body.size), fontWeight: '500' }}>Loading…</Text>
          </View>
        ) : items.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No folders in this location"
            message="Create a folder or navigate to a different location"
          />
        ) : (
          items.map((item: DirectoryItem, index: number) => (
            <Pressable
              key={`${item.path}-${index}`}
              onPress={() => handleItemPress(item)}
              accessibilityRole="button"
              accessibilityLabel={`Open folder ${item.name}`}
              android_ripple={{ color: `${colors.text}0F` }}
              style={({ pressed }) => [
                styles.item,
                {
                  borderBottomColor: colors.borderLight,
                  paddingHorizontal: space(5),
                  paddingVertical: space(3),
                  minHeight: touchTarget(),
                  backgroundColor: pressed ? colors.surfaceHover : 'transparent',
                },
              ]}
            >
              <View style={styles.itemContent}>
                <View style={[styles.itemIcon, { width: itemIconSize, height: itemIconSize, backgroundColor: `${colors.secondary}1F`, borderRadius: radius(3), marginRight: space(3) }]}>
                  <Folder size={iconSize(20)} color={colors.secondary} strokeWidth={2} />
                </View>
                <Text style={[styles.itemName, { color: colors.text, fontSize: font(Type.body.size) }]} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
              <ChevronRight size={iconSize(18)} color={colors.textMuted} strokeWidth={2} />
            </Pressable>
          ))
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: space(5), paddingTop: space(4), gap: space(2) }}>
        <Button
          title="Select This Folder"
          onPress={selectCurrentFolder}
          icon={Check}
          disabled={items.length === 0}
          style={{ width: '100%' }}
        />
        <Text style={[styles.footerHint, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>
          Navigate to a folder, then select it
        </Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pathBar: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  pathButton: { alignItems: 'center', justifyContent: 'center' },
  pathScroll: { flex: 1 },
  pathText: { fontFamily: 'monospace' },
  errorContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  errorText: { flex: 1, fontWeight: '600' },
  loadingContainer: { alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  itemContent: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  itemIcon: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  itemName: { fontWeight: '500', flexShrink: 1 },
  footerHint: { textAlign: 'center', fontWeight: '500' },
});
