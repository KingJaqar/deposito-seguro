// src/app/(main)/favorites.tsx
// Rebuilt per plans/you-are-a-senior-majestic-swing.md §3/§7 Phase 4.
// Every store hook and handler body (bulk copy/cut/delete, key assign/remove,
// rename/move via RenameContext/MoveVaultContext, paste, export, personal
// favorites-folder creation) is unchanged; only JSX/StyleSheet is new.
// Notable per-plan changes:
//  - TabRootHeader + Card/Chip/EmptyState/ListRow/Sheet/Snackbar/Dialog primitives
//  - the `dash` alias object and its colors.dashboardX/accent fallback chains are gone
//  - getFileType's classification/icon logic now goes through the shared
//    getFileTypeMeta (§5 split seam) instead of the old getFileType.tsx import
//  - single-OK-button paste/export/key-assign/-remove confirmations → Snackbar (§3);
//    Access Key Limit / No Access Keys / Export Failed / Paste Failed stay Alert (errors)
//  - the local wrapAtLength copy replaced by the shared utility
//  - the duplicated AccessKeyPicker/AccessKeyUnlockModal render blocks (present
//    twice, verbatim, in the pre-redesign file) collapsed to one each
//  - SafeAreaView migrated to react-native-safe-area-context with explicit edges
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import {
  CheckSquare,
  Copy,
  FolderPlus,
  Key,
  Lock,
  Scissors,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccessKeyPicker } from '../../components/AccessKeyPicker';
import { AccessKeyRegistrationModal } from '../../components/AccessKeyRegistrationModal';
import { AccessKeyUnlockModal } from '../../components/AccessKeyUnlockModal';
import AnimatedTabBar from '../../components/AnimatedTabBar';
import { ClipboardBar } from '../../components/ClipboardBar';
import { DestructiveConfirmModal, useConfirmDestructive } from '../../components/DestructiveConfirmModal';
import { TabRootHeader } from '../../components/TabRootHeader';
import { ViewModeMenu } from '../../components/ViewModeMenu';
import { Badge } from '../../components/primitives/Badge';
import { Chip } from '../../components/primitives/Chip';
import { Dialog } from '../../components/primitives/Dialog';
import { EmptyState } from '../../components/primitives/EmptyState';
import { getFileTypeMeta } from '../../components/primitives/FileTypeIcon';
import { GridTile } from '../../components/primitives/GridTile';
import { ListRow } from '../../components/primitives/ListRow';
import { RootFolderIcon } from '../../components/primitives/RootFolderIcon';
import { SectionHeaderToggle, CollapsibleSection } from '../../components/primitives/SectionHeaderToggle';
import { Sheet } from '../../components/primitives/Sheet';
import { SubfolderIcon } from '../../components/primitives/SubfolderIcon';
import { Snackbar, useSnackbar } from '../../components/primitives/Snackbar';
import { TextField } from '../../components/primitives/TextField';
import { CategoryTint } from '../../constants/Colors';
import { Type } from '../../constants/typography';
import { useRename } from '../../contexts/RenameContext';
import { useMove } from '../../contexts/MoveVaultContext';
import { useTheme } from '../../contexts/ThemeContext';
import { MIN_TOUCH_TARGET } from '../../utils/responsive';
import { getFolderStatsMap, formatFolderStatsLabel } from '../../utils/folderStats';
import { buildVaultSections, VaultSectionData, VaultSectionKey, CategoryFilter } from '../../utils/vaultSections';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';

// Favorites screen is already entirely favorites-scoped, so the "Favorites"
// chip/section from search.tsx is dropped and these plain titles double as
// the favorites-flavored ones (everything shown here is a favorite already).
const SECTION_TITLES: Record<Exclude<VaultSectionKey, 'favorites'>, string> = {
  folders: 'Favorite Folders',
  files: 'Favorite Files',
  rootFolders: 'Root Folders',
  subFolders: 'Subfolders',
  images: 'Images',
  videos: 'Videos',
  documents: 'Documents',
  audio: 'Audio',
  apps: 'Apps',
  other: 'Other',
};

export default function FavoritesScreen() {
  const { colors, space, font, radius, isTablet, screenPadding, bottomTabSpacing , iconSize } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const viewMode = useSettingsStore((s) => s.viewMode);
  const {
    files, folders, clipboard,
    toggleFavorite, softDeleteFile, createPersonalFavoritesFolder, deleteFolder, shredFile, shredFolder,
    assignFileAccessKey, removeFileAccessKey,
    assignFolderAccessKey, removeFolderAccessKey,
    copyToClipboard, cutToClipboard, pasteFromClipboard, undoLastCut,
    duplicateFile, duplicateFolder,
    renameFile, renameFolder, moveFileToFolder, moveFolder,
    exportFileToDevice, exportFolderFiles,
  } = useVaultStore();
  const { accessKeys } = useSettingsStore();
  const { openRenameModal, setOnRename } = useRename();
  const { openMoveModal, setOnMove } = useMove();
  const { confirmState: delConfirm, confirm: confirmDestructive, close: closeDelConfirm } = useConfirmDestructive();
  const { snackbarState, showSnackbar } = useSnackbar();

  const [activeFilter, setActiveFilter] = useState('All');
  const [collapsedSections, setCollapsedSections] = useState<Set<VaultSectionKey>>(new Set());
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [targetItem, setTargetItem] = useState<any>(null);
  const [showCreateFavFolder, setShowCreateFavFolder] = useState(false);
  const [newFavFolderName, setNewFavFolderName] = useState('');
  const [keyPickerTarget, setKeyPickerTarget] = useState<{ id: string; name: string; type: 'file' | 'folder' | 'bulk' } | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string; accessKeyId: string; onUnlock: () => void } | null>(null);
  const [pendingPasswordRemoval, setPendingPasswordRemoval] = useState<{ type: 'file' | 'folder'; id: string; name: string; accessKeyId: string } | null>(null);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [keyCreateTarget, setKeyCreateTarget] = useState<{ id: string; name: string; targetType: 'file' | 'folder' | 'bulk' } | null>(null);

  const favoriteFiles = files.filter(f => f.isFavorite && !f.isTrash);
  const favoriteFolders = folders.filter(f => f.isFavorite);

  const searchedFiles = favoriteFiles.filter(f => {
    if (!debouncedQuery.trim()) return true;
    return f.name.toLowerCase().includes(debouncedQuery.trim().toLowerCase());
  });
  const searchedFolders = favoriteFolders.filter(f => {
    if (!debouncedQuery.trim()) return true;
    return f.name.toLowerCase().includes(debouncedQuery.trim().toLowerCase());
  });

  // contentFiles: the un-searched, non-trash file list — a folder "contains"
  // a given type regardless of whether the folder's own name matched the
  // query, or whether the contained file itself happens to be favorited.
  const contentFiles = useMemo(() => files.filter(f => !f.isTrash), [files]);

  const sections = useMemo(() => buildVaultSections({
    activeFilter: activeFilter as CategoryFilter,
    folders: searchedFolders,
    files: searchedFiles,
    contentFiles,
    includeFavoritesExtras: false,
  }), [activeFilter, searchedFolders, searchedFiles, contentFiles]);

  const sectionByKey = (key: VaultSectionKey) => sections.find(s => s.key === key);
  // "Matched" total mirrors the filter's own files/folders sections, not the
  // type-breakdown re-slices under "All" (those overlap with it).
  const totalCount = (sectionByKey('folders')?.folders?.length ?? 0) + (sectionByKey('files')?.files?.length ?? 0);

  const folderStatsMap = useMemo(() => getFolderStatsMap(files), [files]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const CATEGORY_FILTERS = useMemo(() => [
    { label: 'All', color: colors.primary },
    { label: 'Images', color: CategoryTint.images },
    { label: 'Videos', color: CategoryTint.videos },
    { label: 'Documents', color: CategoryTint.docs },
    { label: 'Audio', color: CategoryTint.audio },
    { label: 'Apps', color: CategoryTint.apps },
    { label: 'Other', color: CategoryTint.other },
  ], [colors]);

  // Google Photos-style dense grid: a hairline-scale gutter instead of a
  // full card gap (see GridTile, which also drops the Card border/shadow).
  const gap = space(1);
  const getGridColumns = (mode: string) => {
    if (mode === 'list') return 1;
    if (mode === 'small-icons') return 5;
    if (mode === 'medium-icons') return 3;
    if (mode === 'large-icons') return 2;
    if (screenWidth > 900 || isTablet) return 4;
    return 2;
  };
  const isGridMode = viewMode !== 'list';
  const gridColumnsCount = getGridColumns(viewMode);
  const gridItemWidth = Math.max(60, (screenWidth - screenPadding * 2 - gap * (gridColumnsCount - 1)) / gridColumnsCount);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const exitSelectionMode = () => { setSelectionMode(false); setSelectedIds([]); };

  const toggleSectionCollapse = (key: VaultSectionKey) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleBulkCopy = () => {
    const selFolderIds = selectedIds.filter(id => favoriteFolders.some(f => f.id === id));
    const selFileIds = selectedIds.filter(id => favoriteFiles.some(f => f.id === id));
    copyToClipboard(selFolderIds, selFileIds, null);
    exitSelectionMode();
  };

  const handleBulkCut = () => {
    const selFolderIds = selectedIds.filter(id => favoriteFolders.some(f => f.id === id));
    const selFileIds = selectedIds.filter(id => favoriteFiles.some(f => f.id === id));
    cutToClipboard(selFolderIds, selFileIds, null);
    exitSelectionMode();
  };

  const handleBulkSoftDelete = () => {
    if (selectedIds.length === 0) return;
    confirmDestructive(
      'Move to Trash',
      `Move ${selectedIds.length} items into retention trash?`,
      async () => {
        for (const id of selectedIds) {
          const file = favoriteFiles.find(f => f.id === id);
          const folder = favoriteFolders.find(f => f.id === id);
          if (file) await softDeleteFile(id);
          else if (folder) await deleteFolder(id);
        }
        exitSelectionMode();
      },
      'Move to Trash'
    );
  };

  const handleBulkAssignExistingKey = () => {
    if (selectedIds.length === 0) return;
    setKeyPickerTarget({ id: 'bulk', name: 'selected items', type: 'bulk' });
  };

  const handleBulkCreateAndAssignKey = () => {
    if (selectedIds.length === 0) return;
    setKeyCreateTarget({ id: 'bulk', name: `${selectedIds.length} selected items`, targetType: 'bulk' });
    setShowCreateKeyModal(true);
  };

  const handleDeleteAll = () => {
    // Matches the current filter's own files/folders sections, not the
    // type-breakdown re-slices under "All" (those overlap with it).
    const matchedFiles = sectionByKey('files')?.files ?? [];
    const matchedFolders = sectionByKey('folders')?.folders ?? [];
    const totalItems = matchedFiles.length + matchedFolders.length;
    if (totalItems === 0) return;
    confirmDestructive(
      'Delete Everything',
      `Move ALL ${totalItems} items into retention trash?`,
      async () => {
        for (const file of matchedFiles) await softDeleteFile(file.id);
        for (const folder of matchedFolders) await deleteFolder(folder.id);
        exitSelectionMode();
      },
      'Delete All'
    );
  };

  const handleFileNavigate = (file: any) => {
    const go = () => {
      if (file.mimeType?.startsWith('image/')) {
        router.push({ pathname: '/(main)/viewer/image', params: { fileId: file.id } });
      } else if (file.mimeType?.startsWith('video/')) {
        router.push({ pathname: '/(main)/viewer/video', params: { fileId: file.id } });
      } else {
        router.push({ pathname: '/(main)/viewer/document', params: { fileId: file.id } });
      }
    };
    if (file.hasAccessKey && file.accessKeyId) {
      setUnlockTarget({
        type: 'file',
        id: file.id,
        name: file.name,
        accessKeyId: file.accessKeyId,
        onUnlock: () => { setShowUnlockModal(false); setUnlockTarget(null); go(); },
      });
      setShowUnlockModal(true);
      return;
    }
    go();
  };

  const handleOpenKeyModal = (targetId: string, targetName: string, targetType: 'file' | 'folder') => {
    if (accessKeys.length >= 20) {
      Alert.alert('Access Key Limit', 'You can only create up to 20 access keys.');
      return;
    }
    setKeyCreateTarget({ id: targetId, name: targetName, targetType });
    setShowCreateKeyModal(true);
  };

  const handleFileAction = (file: any, action: string) => {
    setShowFileMenu(false);
    switch (action) {
      case 'rename':
        openRenameModal({ id: file.id, name: file.name, type: 'file' });
        setOnRename((newName: string) => { renameFile(file.id, newName.trim()); });
        break;
      case 'move':
        setOnMove((destinationFolderId: string | null) => {
          if (destinationFolderId !== null) moveFileToFolder(file.id, destinationFolderId);
        });
        openMoveModal(
          { id: file.id, name: file.name, type: 'file' },
          folders.filter(f => f.id !== file.folderId).map(f => ({ id: f.id, name: f.name, parentId: f.parentId })),
          file.folderId
        );
        break;
      case 'export':
        exportFileToDevice(file.id).then((path: string | null) => {
          if (path) Sharing.shareAsync(path);
        });
        break;
      case 'favorite': toggleFavorite(file.id); break;
      case 'copy': copyToClipboard([], [file.id], null); break;
      case 'cut': cutToClipboard([], [file.id], null); break;
      case 'duplicate': duplicateFile(file.id); break;
      case 'delete':
        confirmDestructive('Move to Trash', `Move "${file.name}" into retention trash?`, () => softDeleteFile(file.id));
        break;
      case 'shred':
        confirmDestructive('Permanently Shred', `Permanently shred "${file.name}"?`, () => shredFile(file.id), 'Shred Permanently');
        break;
      case 'register-key': handleOpenKeyModal(file.id, file.name, 'file'); break;
      case 'assign-key':
        if (accessKeys.length === 0) Alert.alert('No Access Keys', 'Create an access key in Settings first.');
        else setKeyPickerTarget({ id: file.id, name: file.name, type: 'file' });
        break;
      case 'remove-key':
        setPendingPasswordRemoval({ type: 'file', id: file.id, name: file.name, accessKeyId: file.accessKeyId });
        setShowUnlockModal(true);
        break;
    }
  };

  const handleFolderNavigate = (folder: any) => {
    const go = () => router.push({ pathname: '/(main)/folder/[id]', params: { id: folder.id } });
    if (folder.hasAccessKey && folder.accessKeyId) {
      setUnlockTarget({
        type: 'folder',
        id: folder.id,
        name: folder.name,
        accessKeyId: folder.accessKeyId,
        onUnlock: () => { setShowUnlockModal(false); setUnlockTarget(null); go(); },
      });
      setShowUnlockModal(true);
    } else {
      go();
    }
  };

  const handleFolderAction = (folder: any, action: string) => {
    setShowFolderMenu(false);
    switch (action) {
      case 'rename':
        openRenameModal({ id: folder.id, name: folder.name, type: 'folder' });
        setOnRename((newName: string) => { renameFolder(folder.id, newName.trim()); });
        break;
      case 'move':
        setOnMove((destinationFolderId: string | null) => {
          if (destinationFolderId !== null) moveFolder(folder.id, destinationFolderId);
        });
        openMoveModal(
          { id: folder.id, name: folder.name, type: 'folder' },
          folders.filter(f => f.id !== folder.id).map(f => ({ id: f.id, name: f.name, parentId: f.parentId })),
          folder.parentId
        );
        break;
      case 'export':
        exportFolderFiles(folder.id).then((paths: string[]) => {
          if (paths.length > 0) showSnackbar(`Exported ${paths.length} files`);
          else showSnackbar('This vault has no files to export.', 'error');
        }).catch(() => Alert.alert('Export Failed', 'Something went wrong while exporting.'));
        break;
      case 'favorite': toggleFavorite(folder.id); break;
      case 'open': handleFolderNavigate(folder); break;
      case 'copy': copyToClipboard([folder.id], [], null); break;
      case 'cut': cutToClipboard([folder.id], [], null); break;
      case 'duplicate': duplicateFolder(folder.id); break;
      case 'paste':
        if (clipboard) {
          pasteFromClipboard(folder.id).then((result) => {
            if (result.pastedFiles === 0 && result.pastedFolders === 0) return;
            showSnackbar(`${result.pastedFolders} folder${result.pastedFolders !== 1 ? 's' : ''}, ${result.pastedFiles} file${result.pastedFiles !== 1 ? 's' : ''} pasted.`);
          }).catch(() => Alert.alert('Paste Failed', 'Could not paste items.'));
        }
        break;
      case 'delete':
        confirmDestructive('Move to Trash', `Move "${folder.name}" into retention trash?`, () => deleteFolder(folder.id));
        break;
      case 'shred':
        confirmDestructive('Permanently Shred', `Shred "${folder.name}" and all its contents permanently?`, () => shredFolder(folder.id), 'Shred Permanently');
        break;
      case 'register-key': handleOpenKeyModal(folder.id, folder.name, 'folder'); break;
      case 'assign-key':
        if (accessKeys.length === 0) Alert.alert('No Access Keys', 'Create an access key in Settings first.');
        else setKeyPickerTarget({ id: folder.id, name: folder.name, type: 'folder' });
        break;
      case 'remove-key':
        setPendingPasswordRemoval({ type: 'folder', id: folder.id, name: folder.name, accessKeyId: folder.accessKeyId });
        setShowUnlockModal(true);
        break;
    }
  };

  const createPersonalFolder = () => {
    if (newFavFolderName.trim() && createPersonalFavoritesFolder) {
      createPersonalFavoritesFolder(newFavFolderName.trim());
    }
    setShowCreateFavFolder(false);
    setNewFavFolderName('');
  };

  const handlePasteToFolder = async () => {
    if (!clipboard) return;
    try {
      const result = await pasteFromClipboard('');
      if (result.pastedFiles === 0 && result.pastedFolders === 0) return;
      showSnackbar(`${result.pastedFolders} folder${result.pastedFolders !== 1 ? 's' : ''}, ${result.pastedFiles} file${result.pastedFiles !== 1 ? 's' : ''} pasted.`);
    } catch {
      Alert.alert('Paste Failed', 'Could not paste items.');
    }
  };

  const fileMenuItems = useMemo(() => {
    if (!targetItem) return [];
    const hasPassword = targetItem.hasAccessKey && targetItem.accessKeyId;
    const baseItems = [
      { action: 'rename', label: 'Rename', color: colors.text },
      { action: 'move', label: 'Move to…', color: colors.text },
      { action: 'export', label: 'Export / Save to Device', color: colors.text },
      { action: 'copy', label: 'Copy', color: colors.secondary },
      { action: 'cut', label: 'Cut', color: colors.secondary },
      { action: 'duplicate', label: 'Duplicate', color: colors.text },
      hasPassword
        ? { action: 'remove-key', label: 'Remove Assigned Access Key', color: colors.error }
        : null,
      !hasPassword ? { action: 'register-key', label: 'Assign and Create Access Key', color: colors.secondary } : null,
      !hasPassword ? { action: 'assign-key', label: 'Assign Existing Access Key', color: colors.secondary } : null,
      { action: 'favorite', label: targetItem.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: colors.warning },
      { action: 'delete', label: 'Move to Trash', color: colors.error },
      { action: 'shred', label: 'Shred Permanently', color: colors.error },
    ].filter(Boolean) as { action: string; label: string; color: string }[];
    return baseItems;
  }, [targetItem, colors]);

  const folderMenuItems = useMemo(() => {
    if (!targetItem) return [];
    const hasPassword = targetItem.hasAccessKey && targetItem.accessKeyId;
    const hasClipboard = !!clipboard;
    const baseItems = [
      { action: 'rename', label: 'Rename', color: colors.text },
      { action: 'move', label: 'Move', color: colors.text },
      { action: 'export', label: 'Export', color: colors.text },
      { action: 'duplicate', label: 'Duplicate', color: colors.text },
      hasClipboard ? { action: 'paste', label: 'Paste Here', color: colors.secondary } : null,
      hasPassword
        ? { action: 'remove-key', label: 'Remove Assigned Access Key', color: colors.error }
        : null,
      !hasPassword ? { action: 'register-key', label: 'Assign and Create Access Key', color: colors.secondary } : null,
      !hasPassword ? { action: 'assign-key', label: 'Assign Existing Access Key', color: colors.secondary } : null,
      { action: 'favorite', label: targetItem.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: colors.warning },
      { action: 'delete', label: 'Move to Trash', color: colors.error },
      { action: 'shred', label: 'Shred Permanently', color: colors.error },
    ].filter(Boolean) as { action: string; label: string; color: string }[];
    return baseItems;
  }, [targetItem, clipboard, colors]);

  const renderSelectionToolbar = (allIdsInSection: string[]) => (
    <View style={[styles.sectionActions, { gap: space(2) }]}>
      <TouchableOpacity
        onPress={() => {
          const allSelected = allIdsInSection.every(id => selectedIds.includes(id));
          setSelectedIds(prev => allSelected ? prev.filter(id => !allIdsInSection.includes(id)) : [...prev, ...allIdsInSection.filter(id => !prev.includes(id))]);
        }}
        style={[styles.iconActionPill, { backgroundColor: colors.surfaceHover }]}
        accessibilityRole="button"
        accessibilityLabel="Select all in section"
      >
        <CheckSquare size={iconSize(18)} color={colors.text} strokeWidth={2.5} />
      </TouchableOpacity>
      {selectedIds.length > 0 && (
        <>
          <TouchableOpacity onPress={handleBulkCopy} style={[styles.iconActionPill, { backgroundColor: colors.surfaceHover }]} accessibilityRole="button" accessibilityLabel="Copy selected">
            <Copy size={iconSize(18)} color={colors.text} strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBulkCut} style={[styles.iconActionPill, { backgroundColor: colors.surfaceHover }]} accessibilityRole="button" accessibilityLabel="Cut selected">
            <Scissors size={iconSize(18)} color={colors.text} strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBulkSoftDelete} style={[styles.iconActionPill, { backgroundColor: `${colors.error}18` }]} accessibilityRole="button" accessibilityLabel="Move selected to trash">
            <Trash2 size={iconSize(18)} color={colors.error} strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBulkAssignExistingKey} style={[styles.iconActionPill, { backgroundColor: colors.surfaceHover }]} accessibilityRole="button" accessibilityLabel="Assign existing access key">
            <Key size={iconSize(18)} color={colors.secondary} strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBulkCreateAndAssignKey} style={[styles.iconActionPill, { backgroundColor: colors.surfaceHover }]} accessibilityRole="button" accessibilityLabel="Create and assign access key">
            <ShieldCheck size={iconSize(18)} color={colors.secondary} strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDeleteAll} style={[styles.iconActionPill, { backgroundColor: `${colors.error}18` }]} accessibilityRole="button" accessibilityLabel="Delete all">
            <Trash2 size={iconSize(18)} color={colors.error} strokeWidth={2.5} />
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity onPress={exitSelectionMode} style={styles.textBtn} accessibilityRole="button" accessibilityLabel="Cancel selection">
        <Text style={{ color: colors.textMuted, fontSize: font(Type.label.size), fontWeight: '700' }}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  // Shared by every folder-carrying section (Favorite Folders, Root Folders,
  // Subfolders, and the Folders slot of each type-breakdown section) — each
  // passes a differently-filtered slice of folders through the same grid/list
  // rendering, with a Root Folder/Subfolder label indicator folded into the
  // subtitle.
  const renderFolderList = (list: any[]) => {
    if (isGridMode) {
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
          {list.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const isLocked = !!(item.hasAccessKey && item.accessKeyId);
            const isRoot = !item.parentId;
            return (
              <GridTile
                key={item.id}
                size={gridItemWidth}
                name={item.name}
                subtitle={`${isRoot ? 'Root Folder' : 'Subfolder'} · ${formatFolderStatsLabel(folderStatsMap[item.id])}`}
                Icon={isRoot ? RootFolderIcon : SubfolderIcon}
                iconColor={colors.primary}
                selectable={selectionMode}
                selected={isSelected}
                onPress={() => { if (selectionMode) toggleSelection(item.id); else handleFolderNavigate(item); }}
                onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
                onMenuPress={() => { setTargetItem(item); setShowFolderMenu(true); }}
                badges={
                  (isLocked || item.isFavorite) && (
                    <>
                      {isLocked && <Badge icon={Lock} color={colors.primary} size={18} />}
                      {item.isFavorite && <Badge icon={Star} color={colors.warning} size={18} />}
                    </>
                  )
                }
              />
            );
          })}
        </View>
      );
    }

    return (
      <>
        {list.map((item) => {
          const isSelected = selectedIds.includes(item.id);
          const isLocked = !!(item.hasAccessKey && item.accessKeyId);
          const isRoot = !item.parentId;
          return (
            <ListRow
              key={item.id}
              title={item.name}
              subtitle={`${isRoot ? 'Root Folder' : 'Subfolder'} · ${formatFolderStatsLabel(folderStatsMap[item.id])}`}
              leading={isRoot ? (
                <RootFolderIcon size={iconSize(22)} color={colors.primary} />
              ) : (
                <SubfolderIcon size={iconSize(22)} color={colors.primary} />
              )}
              trailingBadges={
                <>
                  {isLocked && <Badge icon={Lock} color={colors.primary} size={18} />}
                  {item.isFavorite && <Badge icon={Star} color={colors.warning} size={18} />}
                </>
              }
              onPress={() => handleFolderNavigate(item)}
              onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
              selectable={selectionMode}
              selected={isSelected}
              onToggleSelect={() => toggleSelection(item.id)}
              onOverflowPress={() => { setTargetItem(item); setShowFolderMenu(true); }}
              allowMultilineTitle
            />
          );
        })}
      </>
    );
  };

  // Shared by the "Favorite Files" section and every type-breakdown section
  // (Images, Videos, Documents, Audio, Apps, Other) — each passes a
  // differently-filtered slice of favorite files through the same grid/list
  // rendering.
  const renderFileList = (list: any[]) => {
    if (isGridMode) {
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
          {list.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const meta = getFileTypeMeta(item.mimeType ?? '', item.name);
            const hasThumbnail = item.mimeType?.startsWith('image/') || item.mimeType?.startsWith('video/');
            const FileIcon = meta.Icon;
            return (
              <GridTile
                key={item.id}
                size={gridItemWidth}
                name={item.name}
                Icon={FileIcon}
                iconColor={meta.color}
                thumbnailUri={hasThumbnail && item.localPath ? item.localPath : undefined}
                selectable={selectionMode}
                selected={isSelected}
                onPress={() => { if (selectionMode) toggleSelection(item.id); else handleFileNavigate(item); }}
                onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
                onMenuPress={() => { setTargetItem(item); setShowFileMenu(true); }}
                badges={
                  (!!(item.hasAccessKey && item.accessKeyId) || item.isFavorite) && (
                    <>
                      {item.hasAccessKey && item.accessKeyId && <Badge icon={Lock} color={colors.primary} size={18} />}
                      {item.isFavorite && <Badge icon={Star} color={colors.warning} size={18} />}
                    </>
                  )
                }
              />
            );
          })}
        </View>
      );
    }

    return (
      <>
        {list.map((item) => {
          const isSelected = selectedIds.includes(item.id);
          const meta = getFileTypeMeta(item.mimeType ?? '', item.name);
          const FileIcon = meta.Icon;
          return (
            <ListRow
              key={item.id}
              title={item.name}
              subtitle={`${(item.size / 1024).toFixed(1)} KB · ${meta.label}`}
              thumbnailUri={(item.mimeType?.startsWith('image/') || item.mimeType?.startsWith('video/')) && item.localPath ? item.localPath : undefined}
              leading={<FileIcon size={iconSize(22)} color={meta.color} strokeWidth={2} />}
              trailingBadges={
                <>
                  {item.hasAccessKey && item.accessKeyId && <Badge icon={Lock} color={colors.primary} size={18} />}
                  {item.isFavorite && <Badge icon={Star} color={colors.warning} size={18} />}
                </>
              }
              onPress={() => handleFileNavigate(item)}
              onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
              selectable={selectionMode}
              selected={isSelected}
              onToggleSelect={() => toggleSelection(item.id)}
              onOverflowPress={() => { setTargetItem(item); setShowFileMenu(true); }}
              allowMultilineTitle
            />
          );
        })}
      </>
    );
  };

  // Renders one result section; only sections with content are shown (a
  // separate "nothing at all" empty state covers the fully-empty case).
  const renderSection = (section: VaultSectionData) => {
    const sectionFolders = section.folders ?? [];
    const sectionFiles = section.files ?? [];
    if (sectionFolders.length === 0 && sectionFiles.length === 0) return null;
    const allIds = [...sectionFolders.map(f => f.id), ...sectionFiles.map(f => f.id)];
    const countLabel = section.files && !section.folders
      ? `${sectionFiles.length} file${sectionFiles.length === 1 ? '' : 's'}`
      : undefined;
    const expanded = !collapsedSections.has(section.key);
    return (
      <View key={section.key} style={{ marginBottom: space(6) }}>
        <View style={[styles.sectionHeader, { marginBottom: space(3) }]}>
          <SectionHeaderToggle
            title={SECTION_TITLES[section.key as Exclude<VaultSectionKey, 'favorites'>]}
            expanded={expanded}
            onToggle={() => toggleSectionCollapse(section.key)}
          />
          {selectionMode ? renderSelectionToolbar(allIds) : countLabel && (
            <Text style={[styles.seeAll, { color: colors.textMuted, fontSize: font(Type.label.size) }]}>{countLabel}</Text>
          )}
        </View>
        <CollapsibleSection expanded={expanded}>
          {sectionFolders.length > 0 && renderFolderList(sectionFolders)}
          {sectionFiles.length > 0 && renderFileList(sectionFiles)}
        </CollapsibleSection>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      <TabRootHeader title="Favorites" tagline="Your starred items" rightSlot={<ViewModeMenu />} />

      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingHorizontal: screenPadding, paddingBottom: bottomTabSpacing + space(8) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.borderLight, borderRadius: radius(5), paddingHorizontal: space(4), marginBottom: space(4), gap: space(2), minHeight: MIN_TOUCH_TARGET }]}>
          <Search size={iconSize(18)} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text, fontSize: font(Type.body.size) }]}
            placeholder="Search files & folders…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            accessibilityLabel="Search favorites"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <X size={iconSize(16)} color={colors.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>

        <ClipboardBar
          onPaste={handlePasteToFolder}
          onUndo={undoLastCut}
          backgroundColor={colors.surface}
          textColor={colors.text}
          accentColor={colors.secondary}
          mutedColor={colors.textMuted}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.categoryScroll, { gap: space(2), marginBottom: space(3) }]}>
          {CATEGORY_FILTERS.map((f) => (
            <Chip key={f.label} label={f.label} selected={activeFilter === f.label} onPress={() => setActiveFilter(f.label)} color={f.color} />
          ))}
        </ScrollView>

        <Text style={[styles.resultsText, { color: colors.textMuted, fontSize: font(Type.caption.size), marginBottom: space(3) }]}>
          <Text style={{ fontWeight: '700', color: colors.text }}>{totalCount}</Text> {totalCount === 1 ? 'item' : 'items'} found
        </Text>

        {sections.map(renderSection)}

        {totalCount === 0 && (
          <EmptyState icon={Star} title="No Favorites Yet" message="Long-press any file or folder and star it to see it here." />
        )}
      </ScrollView>

      <DestructiveConfirmModal state={delConfirm} onClose={closeDelConfirm} />

      <AnimatedTabBar />

      <Snackbar state={snackbarState} bottomOffset={bottomTabSpacing} />

      <Dialog
        visible={showCreateFavFolder}
        onRequestClose={() => setShowCreateFavFolder(false)}
        icon={FolderPlus}
        title="New Favorites Folder"
        actions={[
          { label: 'Cancel', onPress: () => setShowCreateFavFolder(false), variant: 'tertiary' },
          { label: 'Create', onPress: createPersonalFolder, variant: 'primary' },
        ]}
      >
        <View style={{ width: '100%' }}>
          <TextField placeholder="Folder name" value={newFavFolderName} onChangeText={setNewFavFolderName} autoFocus accessibilityLabel="Folder name" />
        </View>
      </Dialog>

      <Sheet visible={showFileMenu && !!targetItem} onClose={() => setShowFileMenu(false)} title={targetItem?.name}>
        {fileMenuItems.map((item) => (
          <TouchableOpacity
            key={item.action}
            style={[styles.actionSheetItem, { borderBottomColor: colors.borderLight, paddingHorizontal: space(5), paddingVertical: space(4) }]}
            onPress={() => handleFileAction(targetItem, item.action)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Text style={[styles.actionSheetLabel, { color: item.color, fontSize: font(Type.body.size) }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </Sheet>

      <Sheet visible={showFolderMenu && !!targetItem} onClose={() => setShowFolderMenu(false)} title={targetItem?.name}>
        {folderMenuItems.map((item) => (
          <TouchableOpacity
            key={item.action}
            style={[styles.actionSheetItem, { borderBottomColor: colors.borderLight, paddingHorizontal: space(5), paddingVertical: space(4) }]}
            onPress={() => handleFolderAction(targetItem, item.action)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Text style={[styles.actionSheetLabel, { color: item.color, fontSize: font(Type.body.size) }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </Sheet>

      <AccessKeyPicker
        visible={!!keyPickerTarget}
        onClose={() => setKeyPickerTarget(null)}
        onSelectPassword={async (passwordId: string) => {
          if (!keyPickerTarget) return;
          if (keyPickerTarget.type === 'bulk') {
            for (const id of selectedIds) {
              const file = favoriteFiles.find(f => f.id === id);
              const folder = favoriteFolders.find(f => f.id === id);
              if (file) await assignFileAccessKey(id, passwordId);
              else if (folder) await assignFolderAccessKey(id, passwordId);
            }
            showSnackbar(`Access key has been assigned to ${selectedIds.length} items.`);
          } else if (keyPickerTarget.type === 'file') {
            await assignFileAccessKey(keyPickerTarget.id, passwordId);
            showSnackbar('The selected access key is now registered.');
          } else {
            await assignFolderAccessKey(keyPickerTarget.id, passwordId);
            showSnackbar('The selected access key is now registered.');
          }
          setKeyPickerTarget(null);
        }}
      />

      <AccessKeyRegistrationModal
        visible={showCreateKeyModal}
        target={keyCreateTarget ? { id: keyCreateTarget.id, name: keyCreateTarget.name, type: keyCreateTarget.targetType } : null}
        selectedItemIds={keyCreateTarget?.targetType === 'bulk' ? selectedIds : [keyCreateTarget?.id ?? '']}
        itemTypes={{
          ...Object.fromEntries(favoriteFiles.filter(f => selectedIds.includes(f.id)).map(f => [f.id, 'file'])),
          ...Object.fromEntries(favoriteFolders.filter(f => selectedIds.includes(f.id)).map(f => [f.id, 'folder'])),
        }}
        onClose={() => { setShowCreateKeyModal(false); setKeyCreateTarget(null); }}
        onSuccess={() => { setShowCreateKeyModal(false); setKeyCreateTarget(null); }}
        assignFolderAccessKey={assignFolderAccessKey}
        assignFileAccessKey={assignFileAccessKey}
      />

      {(unlockTarget || pendingPasswordRemoval) && (
        <AccessKeyUnlockModal
          visible={showUnlockModal}
          targetName={unlockTarget?.name ?? pendingPasswordRemoval?.name ?? ''}
          targetId={unlockTarget?.id ?? pendingPasswordRemoval?.id ?? ''}
          targetType={unlockTarget?.type ?? pendingPasswordRemoval?.type ?? 'file'}
          accessKeyId={unlockTarget?.accessKeyId ?? pendingPasswordRemoval?.accessKeyId ?? ''}
          mode="unlock"
          onClose={() => {
            setShowUnlockModal(false);
            setUnlockTarget(null);
            setPendingPasswordRemoval(null);
          }}
          onUnlock={() => {
            if (pendingPasswordRemoval) {
              if (pendingPasswordRemoval.type === 'file') removeFileAccessKey(pendingPasswordRemoval.id);
              else removeFolderAccessKey(pendingPasswordRemoval.id);
              showSnackbar('The access key has been removed from this item.');
              setPendingPasswordRemoval(null);
            } else if (unlockTarget) {
              unlockTarget.onUnlock();
            }
            setShowUnlockModal(false);
            setUnlockTarget(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollBody: { paddingTop: 12 },

  searchBar: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontWeight: '500' },

  categoryScroll: { paddingVertical: 2 },
  resultsText: { fontWeight: '500' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
  seeAll: { fontWeight: '600' },
  sectionActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  // Phase 5 (§6 MIN_TOUCH_TARGET audit): was 36x36 with no hitSlop, under the
  // 44dp floor. Sized to match folder/[id].tsx's already-compliant version of
  // this same bulk-action-pill pattern.
  iconActionPill: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  textBtn: { paddingHorizontal: 8, paddingVertical: 8 },

  actionSheetItem: { borderBottomWidth: StyleSheet.hairlineWidth },
  actionSheetLabel: { fontWeight: '500' },
});
