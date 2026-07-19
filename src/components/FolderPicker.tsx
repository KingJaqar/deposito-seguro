// File: src/components/FolderPicker.tsx
import { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, SafeAreaView } from 'react-native';
import { Folder, ChevronRight, X, Check, Home, FolderOpen } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

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
  const { colors, space, font, isTablet } = useTheme();
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
    <Modal visible={visible} transparent animationType="fade">
      <SafeAreaView style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.surface, width: isTablet ? '80%' : '100%', maxWidth: 500 }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.headerButton}>
              <X size={24} color={colors.text} strokeWidth={2} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, { color: colors.text, fontSize: font(18) }]}>Select Backup Folder</Text>
            </View>
            <TouchableOpacity onPress={selectCurrentFolder} style={[styles.headerButton, { opacity: items.length > 0 ? 1 : 0.5 }]} disabled={items.length === 0}>
              <Check size={24} color={colors.accent} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <View style={[styles.pathBar, { backgroundColor: colors.surfaceElevated }]}>
            <TouchableOpacity onPress={goBack} disabled={isRoot} style={styles.pathButton}>
              <Home size={18} color={isRoot ? colors.textMuted : colors.text} strokeWidth={2} />
            </TouchableOpacity>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pathScroll}>
              <Text style={[styles.pathText, { color: colors.text, fontSize: font(12) }]}>
                {currentPath.replace(FileSystem.documentDirectory || '', '📁 ').replace(/\/([^/]+)\/$/, '/$1/')}
              </Text>
            </ScrollView>
          </View>

          {error && (
            <View style={[styles.errorContainer, { backgroundColor: `${colors.error}15` }]}>
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              <TouchableOpacity onPress={() => loadDirectory(currentPath)} style={styles.retryButton}>
                <Text style={[styles.retryText, { color: colors.error }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={colors.accent} size="large" />
                <Text style={[styles.loadingText, { color: colors.textMuted, marginTop: space(2) }]}>Loading...</Text>
              </View>
            ) : items.length === 0 ? (
              <View style={styles.emptyContainer}>
                <FolderOpen size={48} color={colors.textMuted} strokeWidth={1.5} />
                <Text style={[styles.emptyText, { color: colors.textMuted, marginTop: space(2), fontSize: font(14) }]}>No folders in this location</Text>
                <Text style={[styles.emptyHint, { color: colors.textMuted, fontSize: font(12) }]}>Create a folder or navigate to a different location</Text>
              </View>
            ) : (
              items.map((item: DirectoryItem, index: number) => (
                <TouchableOpacity
                  key={`${item.path}-${index}`}
                  onPress={() => handleItemPress(item)}
                  style={[styles.item, { borderBottomColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  <View style={styles.itemContent}>
                    <View style={[styles.itemIcon, { backgroundColor: `${colors.accent}15` }]}>
                      <Folder size={22} color={colors.accent} strokeWidth={2} />
                    </View>
                    <Text style={[styles.itemName, { color: colors.text, fontSize: font(15) }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                  <ChevronRight size={20} color={colors.textMuted} strokeWidth={2} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Text style={[styles.footerHint, { color: colors.textMuted, fontSize: font(12) }]}>
              Navigate to a folder and tap the checkmark to select it
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  container: {
    borderRadius: 24,
    overflow: 'hidden',
    maxHeight: '90%',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontWeight: '700',
  },
  pathBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 48,
  },
  pathButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  pathScroll: {
    flex: 1,
  },
  pathText: {
    fontFamily: 'monospace',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  errorText: {
    flex: 1,
    fontWeight: '500',
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  retryText: {
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyHint: {
    textAlign: 'center',
    marginTop: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemName: {
    fontWeight: '500',
    flexShrink: 1,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  footerHint: {
    textAlign: 'center',
  },
});