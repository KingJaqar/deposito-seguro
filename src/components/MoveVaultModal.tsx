// src/components/MoveVaultModal.tsx
// Rebuilt on the Sheet primitive per §5 (scrollable list/search picker →
// Sheet, not Dialog). All selection logic carried across unchanged:
// availableFolders' self-exclusion filter, the searchQuery filter,
// getSubfolders, handleMove/resetState/handleCancel, and handleFolderPress's
// auto-move-on-select behavior. All 31 `colors.dashboardX ?? colors.X`
// fallback chains — the single largest concentration in the codebase — are
// replaced with real v2 schema names.
import { ChevronRight, Folder, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';
import { EmptyState } from './primitives/EmptyState';
import { Sheet } from './primitives/Sheet';

export interface MoveVaultModalProps {
  visible: boolean;
  onClose: () => void;
  item: {
    id: string;
    name: string;
    type: 'file' | 'folder';
  } | null;
  folders: {
    id: string;
    name: string;
    parentId?: string;
  }[];
  currentFolderId?: string;
  onMove: (destinationFolderId: string | null) => void;
}

export function MoveVaultModal({ visible, onClose, item, folders, currentFolderId, onMove }: MoveVaultModalProps) {
  const { colors, space, font, radius, isTablet, iconSize, touchTarget } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Filter out the item being moved if it's a folder
  const availableFolders = useMemo(() => {
    if (!item) return [];
    return folders.filter(f => {
      if (f.id === item.id && item.type === 'folder') return false;
      return true;
    });
  }, [folders, item]);

  // Search functionality
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return availableFolders;
    const query = searchQuery.toLowerCase().trim();
    return availableFolders.filter(f => f.name.toLowerCase().includes(query));
  }, [availableFolders, searchQuery]);

  const getSubfolders = (parentId: string) => {
    return filteredFolders.filter(f => f.parentId === parentId);
  };

  const handleMove = (folderId: string | null) => {
    if (item) {
      onMove(folderId);
      resetState();
    }
  };

  const resetState = () => {
    setSearchQuery('');
    setSelectedFolderId(null);
    onClose();
  };

  const handleCancel = () => {
    resetState();
  };

  const handleFolderPress = (folderId: string) => {
    setSelectedFolderId(folderId);
    // Auto-move when folder is selected
    handleMove(folderId);
  };

  if (!item) return null;

  const renderFolderRow = (
    folder: { id: string; name: string; parentId?: string },
    opts: { isSub?: boolean; hasSubfolders?: boolean } = {}
  ) => {
    const isSelected = selectedFolderId === folder.id;
    return (
      <Pressable
        key={folder.id}
        onPress={() => handleFolderPress(folder.id)}
        accessibilityRole="button"
        accessibilityLabel={`Move into ${folder.name}`}
        accessibilityState={{ selected: isSelected }}
        android_ripple={{ color: `${colors.text}0F` }}
        style={({ pressed }) => [
          styles.folderItem,
          {
            borderBottomColor: colors.borderLight,
            backgroundColor: isSelected ? `${colors.primary}14` : pressed ? colors.surfaceHover : 'transparent',
            paddingVertical: space(3),
            paddingHorizontal: space(5),
            gap: space(3),
            minHeight: touchTarget(),
          },
        ]}
      >
        <View style={[styles.folderIcon, { backgroundColor: `${colors.primary}1F`, borderRadius: radius(3), width: iconSize(opts.isSub ? 30 : 36), height: iconSize(opts.isSub ? 30 : 36) }]}>
          <Folder size={iconSize(opts.isSub ? 16 : 18)} color={colors.primary} strokeWidth={2} />
        </View>
        <Text
          style={[styles.folderName, { color: colors.text, fontSize: font(opts.isSub ? Type.label.size : Type.body.size) }]}
          numberOfLines={1}
        >
          {folder.name}
        </Text>
        {opts.hasSubfolders && <ChevronRight size={iconSize(18)} color={colors.textMuted} strokeWidth={2} />}
      </Pressable>
    );
  };

  return (
    <Sheet visible={visible} onClose={handleCancel} title={`Move ${item.type === 'folder' ? 'Vault' : 'File'}`}>
      <View style={{ paddingHorizontal: space(5) }}>
        <View style={[styles.itemInfo, { backgroundColor: colors.surfaceHover, borderRadius: radius(4), paddingHorizontal: space(3), paddingVertical: space(2), marginBottom: space(3), gap: space(2) }]}>
          <Text style={[styles.itemInfoLabel, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>Moving:</Text>
          <Text style={[styles.itemInfoName, { color: colors.text, fontSize: font(Type.label.size) }]} numberOfLines={1}>
            {item.name}
          </Text>
        </View>

        <View style={[styles.searchContainer, { backgroundColor: colors.surfaceHover, borderColor: colors.borderLight, borderRadius: radius(4), paddingHorizontal: space(3), marginBottom: space(3), gap: space(2), minHeight: touchTarget() }]}>
          <Search size={iconSize(16)} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: colors.text, fontSize: font(Type.body.size) }]}
            placeholder="Search folders…"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search folders"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <X size={iconSize(16)} color={colors.textMuted} strokeWidth={2.5} />
            </Pressable>
          )}
        </View>
      </View>

      <Pressable
        onPress={() => handleMove(null)}
        accessibilityRole="button"
        accessibilityLabel="Move to top level"
        accessibilityState={{ selected: selectedFolderId === null }}
        android_ripple={{ color: `${colors.text}0F` }}
        style={({ pressed }) => [
          styles.folderItem,
          {
            borderBottomColor: colors.borderLight,
            backgroundColor: selectedFolderId === null ? `${colors.primary}14` : pressed ? colors.surfaceHover : 'transparent',
            paddingVertical: space(3),
            paddingHorizontal: space(5),
            gap: space(3),
            minHeight: touchTarget(),
          },
        ]}
      >
        <View style={[styles.folderIcon, { backgroundColor: `${colors.secondary}1F`, borderRadius: radius(3), width: iconSize(36), height: iconSize(36) }]}>
          <Folder size={iconSize(18)} color={colors.secondary} strokeWidth={2} />
        </View>
        <Text style={[styles.folderName, { color: colors.text, fontSize: font(Type.body.size) }]}>
          Root (Move to top level)
        </Text>
      </Pressable>

      <ScrollView style={{ maxHeight: isTablet ? 360 : 280 }} showsVerticalScrollIndicator={false}>
        {filteredFolders.length === 0 ? (
          <EmptyState
            icon={Folder}
            title={searchQuery ? 'No folders match your search' : 'No folders available'}
          />
        ) : (
          filteredFolders.map((folder) => {
            const hasSubfolders = filteredFolders.some(f => f.parentId === folder.id);
            const isSelected = selectedFolderId === folder.id;

            return (
              <View key={folder.id}>
                {renderFolderRow(folder, { hasSubfolders })}
                {isSelected && hasSubfolders && (
                  <View style={[styles.subfolderContainer, { marginLeft: space(5), borderLeftColor: colors.borderLight }]}>
                    {getSubfolders(folder.id).map(subfolder => renderFolderRow(subfolder, { isSub: true }))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  itemInfo: { flexDirection: 'row', alignItems: 'center' },
  itemInfoLabel: { fontWeight: '500' },
  itemInfoName: { fontWeight: '600', flex: 1 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontWeight: '500', paddingVertical: 2 },
  folderItem: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  folderIcon: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  folderName: { fontWeight: '500', flex: 1 },
  subfolderContainer: { borderLeftWidth: 2 },
});
