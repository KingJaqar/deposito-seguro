// src/components/MoveVaultModal.tsx
// Rebuilt on the Sheet primitive per §5 (scrollable list/search picker →
// Sheet, not Dialog). All 31 `colors.dashboardX ?? colors.X` fallback
// chains — the single largest concentration in the codebase — are replaced
// with real v2 schema names.
//
// Navigation model: tapping a folder row no longer moves the item
// immediately — it drills into that folder (pushes onto `path`), listing
// its direct subfolders, so the user can descend into nested destinations
// (root -> sub1 -> sub1-1 -> ...) before committing. A "Move Here" button
// appears once at least one level has been entered, opens a confirmation
// Dialog naming the source and the current location, and only on
// confirmation does the actual move (+ success toast, wired in
// MoveVaultModalWrapper) fire. The top-level "Root (Move to top level)"
// row is the one destination that still moves immediately (unchanged
// behavior) since it's not something you "open" and browse. Search, when
// active, flattens across all levels (ignores `path`) same as before, and
// selecting a search result descends into it and clears the query.
//
// Cycle safety: the `folders` prop already excludes the moved item itself
// (see toMoveDestinations() callers), so its descendants are structurally
// unreachable here — nothing in `folders` has a visible path down to them,
// since the only row that pointed at them (the item's own) was filtered
// out upstream. No extra circular-reference check is needed.
import { ChevronLeft, ChevronRight, Check, Folder, Lock, Search, Star, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';
import { formatFolderStatsLabel } from '../utils/folderStats';
import { Badge } from './primitives/Badge';
import { Dialog } from './primitives/Dialog';
import { EmptyState } from './primitives/EmptyState';
import { Button } from './primitives/Button';
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
    isFavorite: boolean;
    hasAccessKey: boolean;
    fileCount: number;
    totalSize: number;
  }[];
  onMove: (destinationFolderId: string | null) => void | Promise<void>;
}

interface PathEntry {
  id: string;
  name: string;
}

export function MoveVaultModal({ visible, onClose, item, folders, onMove }: MoveVaultModalProps) {
  const { colors, space, font, radius, isTablet, iconSize, touchTarget } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [path, setPath] = useState<PathEntry[]>([]);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [moving, setMoving] = useState(false);

  // Filter out the item being moved if it's a folder
  const availableFolders = useMemo(() => {
    if (!item) return [];
    return folders.filter(f => {
      if (f.id === item.id && item.type === 'folder') return false;
      return true;
    });
  }, [folders, item]);

  const currentParentId = path.length > 0 ? path[path.length - 1].id : undefined;
  const currentLocationName = path.length > 0 ? path[path.length - 1].name : null;
  const isSearching = searchQuery.trim().length > 0;

  // Search flattens across every level; otherwise show only the current
  // level's direct children so the list reflects where the user has
  // navigated to.
  const filteredFolders = useMemo(() => {
    if (isSearching) {
      const query = searchQuery.toLowerCase().trim();
      return availableFolders.filter(f => f.name.toLowerCase().includes(query));
    }
    return availableFolders.filter(f => f.parentId === currentParentId);
  }, [availableFolders, searchQuery, isSearching, currentParentId]);

  const resetState = () => {
    setSearchQuery('');
    setPath([]);
    setConfirmVisible(false);
    setMoving(false);
    onClose();
  };

  // The Sheet's own dismiss (swipe-down, Android back, the header X) shares
  // this instead of jumping straight to a full cancel: mid-navigation that
  // would silently discard everything the user just drilled into, where the
  // in-sheet back chevron only steps up one level. Backing out level-by-level
  // via any of these now behaves the same way; only dismissing from the top
  // level actually closes the modal.
  const handleDismiss = () => {
    if (moving) return;
    if (path.length > 0) {
      setPath(prev => prev.slice(0, -1));
      return;
    }
    resetState();
  };

  const handleMove = async (folderId: string | null) => {
    if (!item || moving) return;
    setMoving(true);
    try {
      await onMove(folderId);
    } finally {
      resetState();
    }
  };

  const handleFolderPress = (folder: PathEntry) => {
    if (moving) return;
    setSearchQuery('');
    setPath(prev => [...prev, folder]);
  };

  const handleBack = () => {
    if (moving) return;
    setPath(prev => prev.slice(0, -1));
  };

  const handleMoveHerePress = () => {
    setConfirmVisible(true);
  };

  const confirmMoveHere = () => {
    if (currentParentId) handleMove(currentParentId);
  };

  if (!item) return null;

  const renderFolderRow = (
    folder: { id: string; name: string; parentId?: string; isFavorite: boolean; hasAccessKey: boolean; fileCount: number; totalSize: number }
  ) => {
    const isRoot = !folder.parentId;
    const statsLabel = formatFolderStatsLabel({ count: folder.fileCount, size: folder.totalSize });
    return (
      <Pressable
        key={folder.id}
        onPress={() => handleFolderPress({ id: folder.id, name: folder.name })}
        disabled={moving}
        accessibilityRole="button"
        accessibilityLabel={`Open ${folder.name}, ${isRoot ? 'root folder' : 'subfolder'}, ${statsLabel}`}
        android_ripple={{ color: `${colors.text}0F` }}
        style={({ pressed }) => [
          styles.folderItem,
          {
            borderBottomColor: colors.borderLight,
            backgroundColor: pressed ? colors.surfaceHover : 'transparent',
            opacity: moving ? 0.5 : 1,
            paddingVertical: space(3),
            paddingHorizontal: space(5),
            gap: space(3),
            minHeight: touchTarget(),
          },
        ]}
      >
        <View style={[styles.folderIcon, { backgroundColor: `${colors.primary}1F`, borderRadius: radius(3), width: iconSize(36), height: iconSize(36) }]}>
          <Folder size={iconSize(18)} color={colors.primary} strokeWidth={2} />
        </View>
        <View style={styles.folderTextCol}>
          <Text
            style={[styles.folderName, { color: colors.text, fontSize: font(Type.body.size) }]}
            numberOfLines={1}
          >
            {folder.name}
          </Text>
          <Text
            style={[styles.folderSubtitle, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}
            numberOfLines={1}
          >
            {isRoot ? 'Root Folder' : 'Subfolder'} · {statsLabel}
          </Text>
        </View>
        <View style={[styles.trailing, { gap: space(2) }]}>
          {folder.isFavorite && <Badge icon={Star} color={colors.warning} size={18} />}
          {folder.hasAccessKey && <Badge icon={Lock} color={colors.primary} size={18} />}
          <ChevronRight size={iconSize(18)} color={colors.textMuted} strokeWidth={2} />
        </View>
      </Pressable>
    );
  };

  return (
    <>
      <Sheet visible={visible} onClose={handleDismiss} closeOnSwipeDown={!moving} title={`Move ${item.type === 'folder' ? 'Vault' : 'File'}`}>
        <View style={{ paddingHorizontal: space(5) }}>
          <View style={[styles.itemInfo, { backgroundColor: colors.surfaceHover, borderRadius: radius(4), paddingHorizontal: space(3), paddingVertical: space(2), marginBottom: space(3), gap: space(2) }]}>
            <Text style={[styles.itemInfoLabel, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>Moving:</Text>
            <Text style={[styles.itemInfoName, { color: colors.text, fontSize: font(Type.label.size) }]} numberOfLines={1}>
              {item.name}
            </Text>
          </View>

          {path.length > 0 && (
            <>
              <View style={[styles.breadcrumb, { gap: space(2), marginBottom: space(3) }]}>
                <Pressable
                  onPress={handleBack}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Go back to previous folder"
                  style={({ pressed }) => [styles.backBtn, { backgroundColor: colors.surfaceHover, borderRadius: radius(3), opacity: pressed ? 0.7 : 1 }]}
                >
                  <ChevronLeft size={iconSize(18)} color={colors.text} strokeWidth={2.5} />
                </Pressable>
                <Text style={[styles.breadcrumbText, { color: colors.text, fontSize: font(Type.label.size) }]} numberOfLines={1}>
                  {currentLocationName}
                </Text>
              </View>

              <Button
                title="Move Here"
                icon={Check}
                onPress={handleMoveHerePress}
                variant="primary"
                disabled={moving}
                style={{ marginBottom: space(3) }}
                accessibilityLabel={`Move ${item.name} here, into ${currentLocationName}`}
              />
            </>
          )}

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

        {/* Root is only a valid destination for folders — files always need a
            real containing folder (FileMetadata.folderId is non-optional),
            so this option isn't offered for a file move at all rather than
            silently accepting a selection that can never actually apply. */}
        {path.length === 0 && !isSearching && item.type === 'folder' && (
          <Pressable
            onPress={() => handleMove(null)}
            disabled={moving}
            accessibilityRole="button"
            accessibilityLabel="Move to top level"
            android_ripple={{ color: `${colors.text}0F` }}
            style={({ pressed }) => [
              styles.folderItem,
              {
                borderBottomColor: colors.borderLight,
                backgroundColor: pressed ? colors.surfaceHover : 'transparent',
                opacity: moving ? 0.5 : 1,
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
        )}

        <ScrollView style={{ maxHeight: isTablet ? 360 : 280 }} showsVerticalScrollIndicator={false}>
          {filteredFolders.length === 0 ? (
            <EmptyState
              icon={Folder}
              title={isSearching ? 'No folders match your search' : (path.length > 0 ? 'No subfolders here' : 'No folders available')}
              message={!isSearching && path.length > 0 ? `Tap "Move Here" above to place it in ${currentLocationName}.` : undefined}
            />
          ) : (
            filteredFolders.map((folder) => renderFolderRow(folder))
          )}
        </ScrollView>
      </Sheet>

      <Dialog
        visible={confirmVisible}
        onRequestClose={() => { if (!moving) setConfirmVisible(false); }}
        dismissOnBackdropPress={!moving}
        title="Move Here?"
        message={`Move "${item.name}" to "${currentLocationName}"?`}
        actions={[
          { label: 'Cancel', variant: 'tertiary', onPress: () => setConfirmVisible(false), disabled: moving },
          { label: 'Move Here', variant: 'primary', onPress: confirmMoveHere, loading: moving, disabled: moving },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  itemInfo: { flexDirection: 'row', alignItems: 'center' },
  itemInfoLabel: { fontWeight: '500' },
  itemInfoName: { fontWeight: '600', flex: 1 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  breadcrumbText: { fontWeight: '700', flexShrink: 1 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontWeight: '500', paddingVertical: 2 },
  folderItem: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  folderIcon: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  folderTextCol: { flex: 1, flexShrink: 1 },
  folderName: { fontWeight: '500' },
  folderSubtitle: { fontWeight: '500', marginTop: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
});
