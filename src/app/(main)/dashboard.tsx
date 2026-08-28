// src/app/(main)/dashboard.tsx
// Rebuilt per plans/you-are-a-senior-majestic-swing.md §3/§7 Phase 4.
// Every store hook, handler body, and prop into a logic-bearing component is
// unchanged; only JSX/StyleSheet is new. Notable per-plan changes:
//  - TabRootHeader + Card/ProgressBar/EmptyState/Fab/ListRow/Dialog/Sheet primitives
//  - all colors.dashboardX/accent deprecated aliases replaced with v2 names
//  - single-OK-button paste/export/key-assign confirmations → Snackbar (§3)
//  - local wrapAtLength copy replaced by the shared utility
//  - the dead `pms` StyleSheet block (orphaned pre-redesign) removed
//  - SafeAreaView migrated to react-native-safe-area-context with explicit edges
import { router } from 'expo-router';
import {
  Box,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  HardDrive,
  Image as ImageIcon,
  Key,
  Lock,
  Music,
  Plus,
  Scissors,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  Vault,
  Video,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccessKeyPicker } from '../../components/AccessKeyPicker';
import { AccessKeyUnlockModal } from '../../components/AccessKeyUnlockModal';
import { AccessKeyRegistrationModal } from '../../components/AccessKeyRegistrationModal';
import AnimatedTabBar from '../../components/AnimatedTabBar';
import { ClipboardBar } from '../../components/ClipboardBar';
import { DestructiveConfirmModal, useConfirmDestructive } from '../../components/DestructiveConfirmModal';
import { TabRootHeader } from '../../components/TabRootHeader';
import { ViewModeMenu } from '../../components/ViewModeMenu';
import { Badge } from '../../components/primitives/Badge';
import { Card } from '../../components/primitives/Card';
import { Dialog } from '../../components/primitives/Dialog';
import { EmptyState } from '../../components/primitives/EmptyState';
import { Fab } from '../../components/primitives/Fab';
import { GridTile } from '../../components/primitives/GridTile';
import { ListRow } from '../../components/primitives/ListRow';
import { ProgressBar } from '../../components/primitives/ProgressBar';
import { RootFolderIcon } from '../../components/primitives/RootFolderIcon';
import { SectionHeaderToggle, CollapsibleSection } from '../../components/primitives/SectionHeaderToggle';
import { Sheet } from '../../components/primitives/Sheet';
import { Snackbar, useSnackbar } from '../../components/primitives/Snackbar';
import { TopToast, useTopToast } from '../../components/primitives/TopToast';
import { SubfolderIcon } from '../../components/primitives/SubfolderIcon';
import { TextField } from '../../components/primitives/TextField';
import { MAX_NAME_LENGTH } from '../../constants/naming';
import { CategoryTint } from '../../constants/Colors';
import { Type } from '../../constants/typography';
import { useRename } from '../../contexts/RenameContext';
import { useMove } from '../../contexts/MoveVaultContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';
import { StorageService } from '../../services/storage';
import { getFolderStatsMap, formatFolderStatsLabel, toMoveDestinations } from '../../utils/folderStats';
import { MIN_TOUCH_TARGET } from '../../utils/responsive';

export default function DashboardScreen() {
  const { colors, space, font, radius, screenPadding, bottomTabSpacing, isTablet, responsiveSize, iconSize } = useTheme();
  const { width } = useWindowDimensions();
  const {
    storageLimitBytes,
  } = useSettingsStore();
  const viewMode = useSettingsStore((s) => s.viewMode);
  const {
    folders, files, clipboard,
    createFolder, hydrateVault, renameFolder, moveFolder,
    deleteFolder, shredFolder,
    shredMultipleFolders, exportFolderFiles, toggleFolderFavorite,
    assignFolderAccessKey, removeFolderAccessKey,
    copyToClipboard, cutToClipboard, pasteFromClipboard, undoLastCut,
    duplicateFolder,
  } = useVaultStore();
  const { accessKeys } = useSettingsStore();
  const { openRenameModal, setOnRename } = useRename();
  const { openMoveModal, setOnMove } = useMove();

  // The disguise name is only for the outside (home-screen launcher icon/label);
  // once inside the vault, always show the real app name.
  const displayName = 'Deposito Seguro';

  const { confirmState: delConfirm, confirm: confirmDestructive, close: closeDelConfirm } = useConfirmDestructive();
  const { snackbarState, showSnackbar } = useSnackbar();
  const { topToastState, showTopToast } = useTopToast();

  type DashboardSectionKey = 'categories' | 'vaults';
  const [collapsedSections, setCollapsedSections] = useState<Set<DashboardSectionKey>>(new Set());
  const toggleSectionCollapse = (key: DashboardSectionKey) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [targetFolder, setTargetFolder] = useState<any>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [showPasswordPicker, setShowPasswordPicker] = useState(false);
  const [keyPickerTarget, setKeyPickerTarget] = useState<{ type: 'folder' | 'bulk'; id: string; name: string } | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<{ type: 'folder'; id: string; name: string; accessKeyId: string; onUnlock: () => void } | null>(null);
  const [pendingPasswordRemoval, setPendingPasswordRemoval] = useState<{ type: 'folder'; id: string; name: string; accessKeyId: string } | null>(null);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [keyCreateTarget, setKeyCreateTarget] = useState<{ id: string; name: string } | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => { hydrateVault(); }, [hydrateVault]);

  const activeFiles = useMemo(() => files.filter(f => !f.isTrash), [files]);

  // I-13 remediation (plans/deposito-seguro-audit-report.md §11): real
  // on-disk vault usage + real device free space, via StorageService's
  // (now-real, see src/services/storage.ts) getStorageQuotaInfo(). Falls
  // back to the sum of file-metadata sizes while the async read is in
  // flight (first render) so the card isn't blank/zero momentarily.
  const [deviceQuota, setDeviceQuota] = useState<{ used: number; free: number } | null>(null);
  const [categoryCanScrollLeft, setCategoryCanScrollLeft] = useState(false);
  const [categoryCanScrollRight, setCategoryCanScrollRight] = useState(false);
  const categoryScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    let mounted = true;
    StorageService.getStorageQuotaInfo()
      .then((quota) => { if (mounted) setDeviceQuota(quota); })
      .catch(() => {});
    return () => { mounted = false; };
  }, [activeFiles.length]);

  const totalBytes = deviceQuota ? deviceQuota.used : activeFiles.reduce((sum, f) => sum + f.size, 0);
  const totalGB = totalBytes / (1024 * 1024 * 1024);
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
  const displayStorageValue = totalGB >= 1 ? totalGB.toFixed(1) : totalMB;
  const displayStorageUnit = totalGB >= 1 ? 'GB' : 'MB';
  const deviceTotalGB = deviceQuota ? (deviceQuota.used + deviceQuota.free) / (1024 * 1024 * 1024) : null;
  // Storage-limit feature: once a cap is set (Settings → Storage), the
  // dashboard's progress bar tracks usage against THAT instead of raw device
  // capacity — a 128GB phone with a 4GB vault cap should show "near full" at
  // 3.8GB used, not 3% of the whole disk.
  const limitGB = storageLimitBytes !== null ? storageLimitBytes / (1024 * 1024 * 1024) : null;
  const storageDenominatorGB = limitGB ?? deviceTotalGB;
  const percentUsed = storageDenominatorGB ? Math.min(100, Math.round((totalGB / storageDenominatorGB) * 100)) : 0;
  const isOverStorageLimit = storageLimitBytes !== null && totalBytes > storageLimitBytes;
  const isNearStorageLimit = storageLimitBytes !== null && !isOverStorageLimit && percentUsed >= 90;
  const storageBarColor = isOverStorageLimit ? colors.error : isNearStorageLimit ? colors.warning : colors.primary;

  const imageCount = useMemo(() => activeFiles.filter(f => f.mimeType?.startsWith('image/')).length, [activeFiles]);
  const videoCount = useMemo(() => activeFiles.filter(f => f.mimeType?.startsWith('video/')).length, [activeFiles]);
  const audioCount = useMemo(() => activeFiles.filter(f => f.mimeType?.startsWith('audio/')).length, [activeFiles]);
  const appCount = useMemo(() => activeFiles.filter(f =>
    f.mimeType === 'application/vnd.android.package-archive' ||
    f.mimeType === 'application/x-msdownload' ||
    f.name?.endsWith('.apk') || f.name?.endsWith('.exe') || f.name?.endsWith('.dmg')
  ).length, [activeFiles]);
  const docCount = useMemo(() => activeFiles.filter(f =>
    !f.mimeType?.startsWith('image/') &&
    !f.mimeType?.startsWith('video/') &&
    !f.mimeType?.startsWith('audio/') &&
    !f.name?.endsWith('.apk') && !f.name?.endsWith('.exe') && !f.name?.endsWith('.dmg') &&
    (f.mimeType?.includes('pdf') || f.mimeType?.includes('document') || f.mimeType?.includes('text') || f.mimeType?.includes('sheet'))
  ).length, [activeFiles]);
  const otherCount = useMemo(() => activeFiles.length - imageCount - videoCount - audioCount - appCount - docCount, [activeFiles, imageCount, videoCount, audioCount, appCount, docCount]);

  const categoryData = useMemo(() => [
    { key: 'images', label: 'Images', count: imageCount, color: CategoryTint.images, Icon: ImageIcon },
    { key: 'videos', label: 'Videos', count: videoCount, color: CategoryTint.videos, Icon: Video },
    { key: 'docs', label: 'Docs', count: docCount, color: CategoryTint.docs, Icon: FileText },
    { key: 'audio', label: 'Audio', count: audioCount, color: CategoryTint.audio, Icon: Music },
    { key: 'apps', label: 'Apps', count: appCount, color: CategoryTint.apps, Icon: Smartphone },
    { key: 'other', label: 'Other', count: otherCount, color: CategoryTint.other, Icon: Box },
  ], [imageCount, videoCount, audioCount, appCount, docCount, otherCount]);

  const toggleFolderSelection = useCallback((folderId: string) => {
    setSelectedFolderIds(prev => prev.includes(folderId) ? prev.filter(id => id !== folderId) : [...prev, folderId]);
  }, []);

  const handleVaultPress = useCallback((folder: any) => {
    if (selectionMode) {
      toggleFolderSelection(folder.id);
      return;
    }
    if (folder.hasAccessKey && folder.accessKeyId) {
      setUnlockTarget({
        type: 'folder',
        id: folder.id,
        name: folder.name,
        accessKeyId: folder.accessKeyId,
        onUnlock: () => {
          setShowUnlockModal(false);
          setUnlockTarget(null);
          router.push({ pathname: '/(main)/folder/[id]', params: { id: folder.id } });
        }
      });
      setShowUnlockModal(true);
    } else {
      router.push({ pathname: '/(main)/folder/[id]', params: { id: folder.id } });
    }
  }, [selectionMode, toggleFolderSelection, setUnlockTarget, setShowUnlockModal]);

  const rootFolders = useMemo(() => folders.filter(f => !f.parentId), [folders]);
  const subFolders = useMemo(() => folders.filter(f => !!f.parentId), [folders]);

  const folderStatsMap = useMemo(() => getFolderStatsMap(files), [files]);

  const handleCreateFolder = async (name: string) => {
    const finalName = name.trim() || 'New Folder';
    try {
      await createFolder(finalName, colors.primary, 'folder', false);
      showTopToast(`${finalName} created`);
    } catch {
      showTopToast(`Failed to create ${finalName}`, 'error');
    }
  };

  const handleDirectoryProvisioning = () => {
    if (Platform.OS === 'web') {
      const name = window.prompt('Folder name:');
      if (name !== null) handleCreateFolder(name);
    } else {
      setShowFolderModal(true);
    }
  };

  const confirmFolderCreation = () => {
    handleCreateFolder(folderName);
    setShowFolderModal(false);
    setFolderName('');
  };

  const handleOpenKeyModal = (targetId: string, targetName: string) => {
    if (accessKeys.length >= 20) {
      Alert.alert('Access Key Limit', 'You can only create up to 20 access keys.');
      return;
    }
    setKeyCreateTarget({ id: targetId, name: targetName });
    setShowCreateKeyModal(true);
  };

  const handleFolderAction = (folder: any, action: string) => {
    setShowFolderMenu(false);
    switch (action) {
      case 'rename':
        setTargetFolder(folder);
        openRenameModal({ id: folder.id, name: folder.name, type: 'folder' });
        setOnRename((newName: string) => {
          renameFolder(folder.id, newName.trim());
        });
        break;
      case 'move':
        setTargetFolder(folder);
        setOnMove((destinationFolderId: string | null) => {
          moveFolder(folder.id, destinationFolderId ?? undefined);
        });
        openMoveModal(
          { id: folder.id, name: folder.name, type: 'folder' },
          toMoveDestinations(folders.filter(f => f.id !== folder.id), folderStatsMap)
        );
        break;
      case 'export':
        exportFolderFiles(folder.id).then(paths => {
          if (paths.length > 0) showSnackbar(`Exported ${paths.length} files`);
          else showSnackbar('This vault has no files to export.', 'error');
        }).catch(() => Alert.alert('Export Failed', 'Something went wrong while exporting.'));
        break;
       case 'delete':
         confirmDestructive(
           'Move to Trash',
           `Move "${folder.name}" into retention trash?`,
           async () => {
             try {
               await deleteFolder(folder.id);
               showTopToast(`${folder.name} has been moved to trash`);
             } catch {
               showTopToast(`Failed to move ${folder.name} to trash`, 'error');
             }
           }
         );
         break;
       case 'shred':
         confirmDestructive(
           'Permanently Delete',
           `Delete "${folder.name}" and all its contents permanently?`,
           async () => {
             try {
               await shredFolder(folder.id);
               showTopToast(`${folder.name} deleted permanently`);
             } catch {
               showTopToast(`Failed to delete ${folder.name} permanently`, 'error');
             }
           },
           'Delete Permanently'
         );
         break;
       case 'register-key':
        handleOpenKeyModal(folder.id, folder.name);
        break;
       case 'assign-key':
         if (accessKeys.length === 0) {
           Alert.alert('No Access Keys', 'Create an access key in Settings first.');
         } else {
           setKeyPickerTarget({ type: 'folder', id: folder.id, name: folder.name });
           setShowPasswordPicker(true);
         }
         break;
      case 'remove-key':
        if (folder.accessKeyId) {
          setPendingPasswordRemoval({
            type: 'folder',
            id: folder.id,
            name: folder.name,
            accessKeyId: folder.accessKeyId
          });
          setShowUnlockModal(true);
        }
        break;
      case 'favorite': {
        const markingFavorite = !folder.isFavorite;
        toggleFolderFavorite?.(folder.id)
          .then(() => { if (markingFavorite) showTopToast(`${folder.name} marked as favorite`); })
          .catch(() => { if (markingFavorite) showTopToast(`Failed to mark ${folder.name} as favorite`, 'error'); });
        break;
      }
      case 'duplicate':
        duplicateFolder(folder.id);
        break;
      case 'paste':
        if (clipboard) {
          pasteFromClipboard(folder.id).then((result) => {
            if (result.pastedFiles > 0 || result.pastedFolders > 0) {
              showSnackbar(`${result.pastedFolders} folder${result.pastedFolders !== 1 ? 's' : ''}, ${result.pastedFiles} file${result.pastedFiles !== 1 ? 's' : ''} pasted.`);
            }
          }).catch(() => Alert.alert('Paste Failed', 'Could not paste items.'));
        }
        break;
    }
  };

  const handleSelectAllFolders = () => {
    const allIds = folders.map(f => f.id);
    setSelectedFolderIds(selectedFolderIds.length === allIds.length ? [] : allIds);
  };

  const handleBulkShredFolders = () => {
    if (selectedFolderIds.length === 0) return;
    const count = selectedFolderIds.length;
    confirmDestructive(
      'Permanently Delete',
      `Delete ${count} folders and all their contents permanently?`,
      async () => {
        try {
          await shredMultipleFolders(selectedFolderIds);
          showTopToast(`${count} vault${count !== 1 ? 's' : ''} deleted permanently`);
        } catch {
          showTopToast(`Failed to delete ${count} vault${count !== 1 ? 's' : ''} permanently`, 'error');
        }
      },
      'Delete Permanently'
    );
  };

  const handleDeleteAllFolders = () => {
    if (folders.length === 0) return;
    const count = folders.length;
    confirmDestructive(
      'Permanently Delete All Vaults',
      `Permanently delete all ${count} vaults and their contents? This cannot be undone.`,
      async () => {
        try {
          await shredMultipleFolders(folders.map(f => f.id));
          showTopToast(`${count} vault${count !== 1 ? 's' : ''} deleted permanently`);
        } catch {
          showTopToast(`Failed to delete ${count} vault${count !== 1 ? 's' : ''} permanently`, 'error');
        }
      },
      'Delete All'
    );
  };

  const handleBulkAssignExistingKey = () => {
    if (selectedFolderIds.length === 0) return;
    setKeyPickerTarget({ type: 'bulk', id: 'bulk', name: 'selected vaults' });
    setShowPasswordPicker(true);
  };

  const handleBulkCreateAndAssignKey = () => {
    if (selectedFolderIds.length === 0) return;
    setKeyCreateTarget({ id: 'bulk', name: `${selectedFolderIds.length} selected vaults` });
    setShowCreateKeyModal(true);
  };

  const handleBulkCopy = () => {
    if (selectedFolderIds.length === 0) return;
    copyToClipboard(selectedFolderIds, [], null);
    exitSelectionMode();
  };

  const handleBulkCut = () => {
    if (selectedFolderIds.length === 0) return;
    cutToClipboard(selectedFolderIds, [], null);
    exitSelectionMode();
  };

  const handlePasteToRoot = async () => {
    if (!clipboard) return;
    try {
      const result = await pasteFromClipboard('');
      if (result.pastedFiles === 0 && result.pastedFolders === 0) return;
      showSnackbar(`${result.pastedFolders} folder${result.pastedFolders !== 1 ? 's' : ''}, ${result.pastedFiles} file${result.pastedFiles !== 1 ? 's' : ''} pasted.`);
    } catch {
      Alert.alert('Paste Failed', 'Could not paste items.');
    }
  };

  const exitSelectionMode = () => { setSelectionMode(false); setSelectedFolderIds([]); };

  const categoryGap = space(3);
  const categoryItemWidth = responsiveSize(84, 92, 100);
  const categoryScrollState = useRef({ x: 0, contentWidth: 0, layoutWidth: 0 });
  const updateCategoryScrollability = () => {
    const { x, contentWidth, layoutWidth } = categoryScrollState.current;
    setCategoryCanScrollLeft(x > 4);
    setCategoryCanScrollRight(x + layoutWidth < contentWidth - 4);
  };
  const handleCategoryScroll = (e: any) => {
    categoryScrollState.current.x = e.nativeEvent.contentOffset.x;
    updateCategoryScrollability();
  };
  const handleCategoryContentSizeChange = (contentWidth: number) => {
    categoryScrollState.current.contentWidth = contentWidth;
    updateCategoryScrollability();
  };
  const handleCategoryLayout = (e: any) => {
    categoryScrollState.current.layoutWidth = e.nativeEvent.layout.width;
    updateCategoryScrollability();
  };
  const scrollCategoriesBy = (dx: number) => {
    const nextX = Math.max(0, categoryScrollState.current.x + dx);
    categoryScrollRef.current?.scrollTo({ x: nextX, animated: true });
  };
  // Google Photos-style dense grid: a hairline-scale gutter instead of a
  // full card gap, so tiles read as one packed grid rather than a row of
  // spaced-out cards (see GridTile, which also drops the Card border/shadow).
  const vaultGap = space(1);

  const getVaultColumns = useCallback((mode: string) => {
    const w = width - screenPadding * 2;
    if (mode === 'list') return 1;
    if (mode === 'small-icons') return 5;
    if (mode === 'medium-icons') return 3;
    if (mode === 'large-icons') return 2;
    if (w > 900 || isTablet) return 4;
    return 2;
  }, [width, screenPadding, isTablet]);

  const getVaultItemWidth = useCallback((mode: string) => {
    const cols = getVaultColumns(mode);
    return Math.max(60, (width - screenPadding * 2 - vaultGap * (cols - 1)) / cols);
  }, [width, screenPadding, vaultGap, getVaultColumns]);

  const renderVaultGrid = (list: any[], isRoot: boolean) => {
    const itemWidth = getVaultItemWidth(viewMode);
    const isListMode = viewMode === 'list';
    const FolderIcon = isRoot ? RootFolderIcon : SubfolderIcon;

    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: vaultGap }}>
        {list.map((item) => {
          const statsLabel = formatFolderStatsLabel(folderStatsMap[item.id]);
          const isSelected = selectedFolderIds.includes(item.id);
          const isLocked = !!(item.hasAccessKey || item.accessKeyId);

          if (isListMode) {
            return (
              <View key={item.id} style={{ width: itemWidth }}>
                <ListRow
                  title={item.name}
                  subtitle={statsLabel}
                  allowMultilineTitle
                  leading={<FolderIcon size={iconSize(22)} color={colors.primary} strokeWidth={2.2} />}
                  trailingBadges={
                    <>
                      {isLocked && <Badge icon={Lock} color={colors.primary} size={20} />}
                      {item.isFavorite && <Badge icon={ShieldCheck} color={colors.warning} size={20} />}
                    </>
                  }
                  onPress={() => handleVaultPress(item)}
                  onLongPress={() => { setSelectionMode(true); setSelectedFolderIds([item.id]); }}
                  selectable={selectionMode}
                  selected={isSelected}
                  onToggleSelect={() => handleVaultPress(item)}
                  onOverflowPress={selectionMode ? undefined : () => { setTargetFolder(item); setShowFolderMenu(true); }}
                />
              </View>
            );
          }

          return (
            <GridTile
              key={item.id}
              size={itemWidth}
              name={item.name}
              subtitle={statsLabel}
              Icon={FolderIcon}
              iconColor={colors.primary}
              selectable={selectionMode}
              selected={isSelected}
              onPress={() => handleVaultPress(item)}
              onLongPress={() => { setSelectionMode(true); setSelectedFolderIds([item.id]); }}
              onMenuPress={() => { setTargetFolder(item); setShowFolderMenu(true); }}
              badges={
                (isLocked || item.isFavorite) && (
                  <>
                    {isLocked && <Badge icon={Lock} color={colors.primary} size={18} />}
                    {item.isFavorite && <Badge icon={ShieldCheck} color={colors.warning} size={18} />}
                  </>
                )
              }
            />
          );
        })}
      </View>
    );
  };

  const folderMenuItems = useMemo(() => {
    if (!targetFolder) return [];
    const hasPassword = targetFolder.hasAccessKey || targetFolder.accessKeyId;
    const hasClipboard = !!clipboard;
    const baseItems = [
      { action: 'rename', label: 'Rename', color: colors.text },
      { action: 'move', label: 'Move', color: colors.text },
      { action: 'export', label: 'Export', color: colors.text },
      { action: 'duplicate', label: 'Duplicate', color: colors.text },
      { action: 'favorite', label: targetFolder.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: colors.warning },
      { action: 'delete', label: 'Move to Trash', color: colors.error },
      { action: 'shred', label: 'Delete Permanently', color: colors.error },
    ];
    if (hasClipboard) {
      baseItems.splice(3, 0, { action: 'paste', label: 'Paste Here', color: colors.secondary });
    }
    if (hasPassword) {
      baseItems.splice(3, 0, { action: 'remove-key', label: 'Remove Assigned Access Key', color: colors.error });
    } else {
      baseItems.splice(3, 0,
        { action: 'register-key', label: 'Assign and Create Access Key', color: colors.secondary },
        { action: 'assign-key', label: 'Assign Existing Access Key', color: colors.secondary }
      );
    }
    return baseItems;
  }, [targetFolder, clipboard, colors]);

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      <TabRootHeader title={displayName} tagline="Your secure storage vault" rightSlot={<ViewModeMenu />} />

      <ScrollView
        ref={scrollViewRef}
        style={styles.flex1}
        contentContainerStyle={[styles.scrollBody, { paddingHorizontal: screenPadding, paddingBottom: bottomTabSpacing + responsiveSize(90, 100, 110) }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.push('/(main)/search')} accessibilityRole="button" accessibilityLabel="Search files and vaults">
          <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.borderLight, borderRadius: radius(5), paddingHorizontal: space(4), marginBottom: space(4), gap: space(2), minHeight: MIN_TOUCH_TARGET }]}>
            <Search size={iconSize(18)} color={colors.textMuted} />
            <Text style={[styles.searchPlaceholder, { color: colors.textMuted, fontSize: font(Type.body.size) }]}>Search files, vaults…</Text>
          </View>
        </Pressable>

        <ClipboardBar
          onPaste={handlePasteToRoot}
          onUndo={undoLastCut}
          backgroundColor={colors.surface}
          textColor={colors.text}
          accentColor={colors.secondary}
          mutedColor={colors.textMuted}
        />

        <Card onPress={() => router.push('/(main)/settings/storage')} accessibilityLabel="Vault storage details" style={{ marginBottom: space(6) }}>
          <View style={[styles.storageTopRow, { marginBottom: space(3) }]}>
            <View style={[styles.rowCenter, { gap: space(2) }]}>
              <HardDrive size={iconSize(18)} color={colors.primary} />
              <Text style={[styles.storageLabel, { color: colors.textSecondary, fontSize: font(Type.label.size) }]}>
                {limitGB !== null ? 'Vault Storage (capped)' : 'Vault Storage'}
              </Text>
            </View>
            <View style={[styles.usedPill, { backgroundColor: isOverStorageLimit ? `${colors.error}1F` : colors.surfaceHover, borderRadius: radius(10), paddingHorizontal: space(3), paddingVertical: space(1) }]}>
              <Text style={[styles.usedPillText, { color: isOverStorageLimit ? colors.error : colors.textSecondary, fontSize: font(Type.caption.size) }]}>
                {isOverStorageLimit ? 'Over Limit' : `${percentUsed}% Used`}
              </Text>
            </View>
          </View>

          <View style={[styles.storageValueRow, { marginBottom: space(4) }]}>
            <Text style={[styles.storageValue, { color: colors.text, fontSize: font(Type.display.size) }]}>{displayStorageValue}</Text>
            <Text style={[styles.storageUnit, { color: colors.textSecondary, fontSize: font(Type.subtitle.size) }]}> {displayStorageUnit}</Text>
          </View>

          <ProgressBar progress={percentUsed / 100} color={storageBarColor} showPercentage={false} />
          <View style={[styles.progressLabelsRow, { marginTop: space(2) }]}>
            <Text style={[styles.progressLabel, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>0 GB</Text>
            <Text style={[styles.progressLabel, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>
              {storageDenominatorGB !== null ? `${storageDenominatorGB.toFixed(limitGB !== null ? 1 : 0)} GB${limitGB !== null ? ' limit' : ''}` : '…'}
            </Text>
          </View>
        </Card>

        <View style={{ marginBottom: space(6) }}>
          <View style={[styles.sectionHeader, { marginBottom: space(3) }]}>
            <SectionHeaderToggle title="Categories" expanded={!collapsedSections.has('categories')} onToggle={() => toggleSectionCollapse('categories')} />
            <TouchableOpacity onPress={() => router.push('/(main)/search')} accessibilityRole="button" accessibilityLabel="See all categories">
              <Text style={[styles.seeAll, { color: colors.primary, fontSize: font(Type.label.size) }]}>See all</Text>
            </TouchableOpacity>
          </View>
          <CollapsibleSection expanded={!collapsedSections.has('categories')}>
          <View style={styles.categoryScrollWrap}>
            {categoryCanScrollLeft && (
              <TouchableOpacity
                onPress={() => scrollCategoriesBy(-categoryItemWidth * 2)}
                accessibilityRole="button"
                accessibilityLabel="Scroll categories left"
                style={[styles.categoryChevron, styles.categoryChevronLeft, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <ChevronLeft size={iconSize(18)} color={colors.text} strokeWidth={2.5} />
              </TouchableOpacity>
            )}
            <ScrollView
              ref={categoryScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={handleCategoryScroll}
              onContentSizeChange={handleCategoryContentSizeChange}
              onLayout={handleCategoryLayout}
              scrollEventThrottle={16}
              contentContainerStyle={{ gap: categoryGap }}
            >
              {categoryData.map((item) => {
                const filterLabel = item.key === 'docs' ? 'Documents' : item.label;
                const Icon = item.Icon;
                return (
                  <Card
                    key={item.key}
                    onPress={() => router.push({ pathname: '/(main)/search', params: { filter: filterLabel } })}
                    accessibilityLabel={`${item.label}, ${item.count} files`}
                    style={{ width: categoryItemWidth, alignItems: 'center', paddingVertical: space(4), paddingHorizontal: space(2) }}
                  >
                    <View style={[styles.categoryIconChip, { backgroundColor: `${item.color}1F`, marginBottom: space(2), width: responsiveSize(40, 48, 52), height: responsiveSize(40, 48, 52), borderRadius: radius(4) }]}>
                      <Icon size={responsiveSize(20, 22, 24)} color={item.color} strokeWidth={2.2} />
                    </View>
                    <Text style={[styles.categoryLabel, { color: colors.text, fontSize: font(Type.label.size) }]} numberOfLines={1}>{item.label}</Text>
                    <Text style={[styles.categoryCount, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>{item.count} files</Text>
                  </Card>
                );
              })}
            </ScrollView>
            {categoryCanScrollRight && (
              <TouchableOpacity
                onPress={() => scrollCategoriesBy(categoryItemWidth * 2)}
                accessibilityRole="button"
                accessibilityLabel="Scroll categories right"
                style={[styles.categoryChevron, styles.categoryChevronRight, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <ChevronRight size={iconSize(18)} color={colors.text} strokeWidth={2.5} />
              </TouchableOpacity>
            )}
          </View>
          </CollapsibleSection>
        </View>

        <View style={{ marginBottom: space(6) }}>
          <View style={[styles.sectionHeader, { marginBottom: space(3) }]}>
            <SectionHeaderToggle title="My Vaults" expanded={!collapsedSections.has('vaults')} onToggle={() => toggleSectionCollapse('vaults')} />
            {selectionMode ? (
              <View style={[styles.sectionActions, { gap: space(2) }]}>
                <TouchableOpacity onPress={handleSelectAllFolders} style={styles.iconActionPill} accessibilityRole="button" accessibilityLabel="Select all vaults">
                  <CheckSquare size={iconSize(18)} color={colors.text} strokeWidth={2.5} />
                </TouchableOpacity>
                {selectedFolderIds.length > 0 && (
                  <>
                    <TouchableOpacity onPress={handleBulkCopy} style={styles.iconActionPill} accessibilityRole="button" accessibilityLabel="Copy selected vaults">
                      <Copy size={iconSize(18)} color={colors.text} strokeWidth={2.5} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleBulkCut} style={styles.iconActionPill} accessibilityRole="button" accessibilityLabel="Cut selected vaults">
                      <Scissors size={iconSize(18)} color={colors.text} strokeWidth={2.5} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleBulkShredFolders} style={[styles.iconActionPill, { backgroundColor: `${colors.error}18` }]} accessibilityRole="button" accessibilityLabel="Delete selected vaults">
                      <Trash2 size={iconSize(18)} color={colors.error} strokeWidth={2.5} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleBulkAssignExistingKey} style={styles.iconActionPill} accessibilityRole="button" accessibilityLabel="Assign existing access key">
                      <Key size={iconSize(18)} color={colors.secondary} strokeWidth={2.5} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleBulkCreateAndAssignKey} style={styles.iconActionPill} accessibilityRole="button" accessibilityLabel="Create and assign access key">
                      <ShieldCheck size={iconSize(18)} color={colors.secondary} strokeWidth={2.5} />
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity onPress={handleDeleteAllFolders} style={styles.textBtn} accessibilityRole="button" accessibilityLabel="Delete all vaults">
                  <Text style={{ color: colors.error, fontSize: font(Type.label.size), fontWeight: '700' }}>Delete All</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={exitSelectionMode} style={styles.textBtn} accessibilityRole="button" accessibilityLabel="Cancel selection">
                  <Text style={{ color: colors.textMuted, fontSize: font(Type.label.size), fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => router.push('/(main)/search')} accessibilityRole="button" accessibilityLabel="See all vaults">
                <Text style={[styles.seeAll, { color: colors.primary, fontSize: font(Type.label.size) }]}>See all</Text>
              </TouchableOpacity>
            )}
          </View>

          <CollapsibleSection expanded={!collapsedSections.has('vaults')}>
          {(
            folders.length === 0 ? (
              <EmptyState
                icon={Vault}
                title="No Vaults Yet"
                message="Create your first secure vault to get started"
                actionLabel="Create First Vault"
                onAction={handleDirectoryProvisioning}
              />
            ) : (
              <View>
                {rootFolders.length > 0 && (
                  <View style={{ marginBottom: space(5) }}>
                    <Text style={[styles.vaultSectionLabel, { color: colors.textMuted, marginBottom: space(2) }]}>ROOT VAULTS</Text>
                    {renderVaultGrid(rootFolders, true)}
                  </View>
                )}
                {subFolders.length > 0 && (
                  <View style={{ marginBottom: space(5) }}>
                    <Text style={[styles.vaultSectionLabel, { color: colors.textMuted, marginBottom: space(2) }]}>SUBFOLDERS</Text>
                    {renderVaultGrid(subFolders, false)}
                  </View>
                )}
              </View>
            )
          )}
          </CollapsibleSection>
        </View>

        <View style={{ height: 140 }} />
      </ScrollView>

      <Fab
        icon={Plus}
        onPress={handleDirectoryProvisioning}
        size={responsiveSize(56, 64, 72)}
        accessibilityLabel="Create new vault"
        style={{ position: 'absolute', bottom: bottomTabSpacing + responsiveSize(16, 20, 24), right: screenPadding }}
      />

      <DestructiveConfirmModal state={delConfirm} onClose={closeDelConfirm} />

      <AnimatedTabBar />

      <Snackbar state={snackbarState} bottomOffset={bottomTabSpacing} />
      <TopToast state={topToastState} />

      <Dialog
        visible={showFolderModal}
        onRequestClose={() => setShowFolderModal(false)}
        icon={Folder}
        title="New Vault"
        actions={[
          { label: 'Cancel', onPress: () => setShowFolderModal(false), variant: 'tertiary' },
          { label: 'Create', onPress: confirmFolderCreation, variant: 'primary' },
        ]}
      >
        <View style={{ width: '100%', marginTop: 8 }}>
          <TextField
            placeholder="Vault name"
            value={folderName}
            onChangeText={setFolderName}
            autoFocus
            maxLength={MAX_NAME_LENGTH}
            accessibilityLabel="Vault name"
            helper={`${folderName.length}/${MAX_NAME_LENGTH}`}
          />
        </View>
      </Dialog>

      <Sheet visible={showFolderMenu && !!targetFolder} onClose={() => setShowFolderMenu(false)} title={targetFolder?.name}>
        {folderMenuItems.map((item) => (
          <TouchableOpacity
            key={item.action}
            style={[styles.actionSheetItem, { borderBottomColor: colors.borderLight, paddingHorizontal: space(5), paddingVertical: space(4) }]}
            onPress={() => handleFolderAction(targetFolder, item.action)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Text style={[styles.actionSheetLabel, { color: item.color, fontSize: font(Type.body.size) }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </Sheet>

      <AccessKeyPicker
        visible={showPasswordPicker}
        onClose={() => { setShowPasswordPicker(false); setKeyPickerTarget(null); }}
        onSelectPassword={async (passwordId: string) => {
          if (!keyPickerTarget) return;
          const keyLabel = accessKeys.find(k => k.id === passwordId)?.label ?? 'Access key';
          if (keyPickerTarget.type === 'bulk') {
            const count = selectedFolderIds.length;
            let succeeded = 0;
            for (const folderId of selectedFolderIds) {
              try { await assignFolderAccessKey(folderId, passwordId); succeeded++; } catch { /* counted via count - succeeded */ }
            }
            if (succeeded === 0) {
              showTopToast(`Failed to assign ${keyLabel}`, 'error');
            } else if (succeeded === count) {
              showTopToast(`${keyLabel} has been assigned to ${count} vaults`);
            } else {
              showTopToast(`${keyLabel} has been assigned to ${succeeded} of ${count} vaults`);
            }
          } else {
            try {
              await assignFolderAccessKey(keyPickerTarget.id, passwordId);
              showTopToast(`${keyLabel} has been assigned to ${keyPickerTarget.name}`);
            } catch {
              showTopToast(`Failed to assign ${keyLabel}`, 'error');
            }
          }
          setShowPasswordPicker(false);
          setKeyPickerTarget(null);
        }}
      />

      {/* Access Key Unlock Modal */}
      {(unlockTarget || pendingPasswordRemoval) && (
        <AccessKeyUnlockModal
          visible={showUnlockModal}
          targetName={unlockTarget?.name ?? pendingPasswordRemoval?.name ?? ''}
          targetId={unlockTarget?.id ?? pendingPasswordRemoval?.id ?? ''}
          targetType={unlockTarget?.type ?? pendingPasswordRemoval?.type ?? 'folder'}
          accessKeyId={unlockTarget?.accessKeyId ?? pendingPasswordRemoval?.accessKeyId ?? ''}
          mode="unlock"
          onClose={() => {
            setShowUnlockModal(false);
            setUnlockTarget(null);
            setPendingPasswordRemoval(null);
          }}
          onUnlock={() => {
            if (pendingPasswordRemoval) {
              removeFolderAccessKey(pendingPasswordRemoval.id);
              showSnackbar('The access key has been removed from this folder.');
              setPendingPasswordRemoval(null);
            } else if (unlockTarget) {
              unlockTarget.onUnlock();
            }
            setShowUnlockModal(false);
            setUnlockTarget(null);
          }}
        />
      )}

      <AccessKeyRegistrationModal
        visible={showCreateKeyModal}
        target={keyCreateTarget ? { ...keyCreateTarget, type: keyCreateTarget.id === 'bulk' ? 'bulk' : 'folder' } : null}
        selectedItemIds={selectedFolderIds}
        itemTypes={Object.fromEntries(selectedFolderIds.map(id => [id, 'folder']))}
        onClose={() => { setShowCreateKeyModal(false); setKeyCreateTarget(null); }}
        onSuccess={(_id, label, assignedCount, totalCount) => {
          // "created and assigned" rather than just "assigned" — this flow
          // both creates the key and assigns it in one step, and the plain
          // access-keys.tsx create form is the only other place "created"
          // ever appears, so dropping it here would make this the one path
          // where a brand-new key's creation never gets confirmed at all.
          if (assignedCount !== undefined && totalCount !== undefined) {
            showTopToast(assignedCount === totalCount
              ? `${label} created and assigned to ${totalCount} vault${totalCount !== 1 ? 's' : ''}`
              : `${label} created and assigned to ${assignedCount} of ${totalCount} vaults`);
          } else {
            showTopToast(`${label} created and assigned to ${keyCreateTarget?.name ?? 'selected vaults'}`);
          }
          setShowCreateKeyModal(false);
          setKeyCreateTarget(null);
        }}
        onError={(message) => showTopToast(message, 'error')}
        assignFolderAccessKey={assignFolderAccessKey}
        assignFileAccessKey={() => Promise.resolve()}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  scrollBody: { paddingTop: 12 },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchPlaceholder: { fontWeight: '500' },

  storageTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  storageLabel: { fontWeight: '600' },
  usedPill: {},
  usedPillText: { fontWeight: '700' },
  storageValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  storageValue: { fontWeight: '800', letterSpacing: -0.5 },
  storageUnit: { fontWeight: '700' },
  progressLabelsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontWeight: '500' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
  seeAll: { fontWeight: '600' },
  sectionActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  // Phase 5 (§6 MIN_TOUCH_TARGET audit): was 36x36 with no hitSlop, under the
  // 44dp floor. Sized to match folder/[id].tsx's already-compliant version of
  // this same bulk-action-pill pattern rather than compensating with hitSlop,
  // since these sit in a wrapping row where a larger visual target is fine.
  iconActionPill: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  textBtn: { paddingHorizontal: 8, paddingVertical: 8 },

  vaultSectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },

  categoryScrollWrap: { position: 'relative', justifyContent: 'center' },
  categoryChevron: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  categoryChevronLeft: { left: -4 },
  categoryChevronRight: { right: -4 },
  categoryIconChip: { alignItems: 'center', justifyContent: 'center' },
  categoryLabel: { fontWeight: '700', marginBottom: 2 },
  categoryCount: { fontWeight: '600' },

  vaultIconChip: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  actionSheetItem: { borderBottomWidth: StyleSheet.hairlineWidth },
  actionSheetLabel: { fontWeight: '500' },
});
