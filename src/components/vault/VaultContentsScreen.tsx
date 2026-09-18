// src/components/vault/VaultContentsScreen.tsx
// Extracted from src/app/(main)/folder/[id].tsx per plans/album implementation
// plan.md §2, Phase 2. This is that screen's body moved essentially verbatim
// (its former route param `id` is now the `containerId` prop, and `variant`
// discriminates folder vs. album behavior), with:
//  - the subfolder section, "Create Subfolder" button/Dialog/Sheet, and all
//    subfolder-only state/handlers gated behind `variant === 'folder'` in the
//    render tree (useFileSystemQuery already returns an empty matchedFolders
//    for any album id since nothing can ever have parentId === <albumId>, so
//    this is belt-and-suspenders)
//  - `folderMenuItems` omitting 'move' when the container itself is an album
//    (an album can never gain a parentId, so there's no valid move destination)
//  - metrics/empty-state copy branching by variant
// Phase 2 exercises the 'folder' variant only — the real `variant === 'album'`
// behavior (expo-image-picker import, date-grouped grid, no-subfolder UI,
// import-progress state) lands in Phase 3 (§2 album half, §2b) once the SDK 57
// expo-image-picker API shape has been checked per AGENTS.md.
// Phase 2a (§2a): the grid/list rendering below was converted from a
// ScrollView + flexWrap `View` (mounting every subfolder/file at once) to a
// single virtualized SectionList, shared by both variants — see
// `chunkIntoRows` and the `sections` memo below. Album-variant date-grouped
// sections (§2b) land in Phase 3 on top of this same mechanism; for now the
// album branch keeps Phase 2's single un-grouped "FILES" section.
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import {
  CheckCircle,
  CheckSquare,
  Clipboard as ClipboardIcon,
  Copy,
  FolderPlus,
  Key,
  Lock,
  MoreVertical,
  Plus,
  Scissors,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  SectionList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccessKeyPicker } from '../AccessKeyPicker';
import { AccessKeyRegistrationModal } from '../AccessKeyRegistrationModal';
import { AccessKeyUnlockModal } from '../AccessKeyUnlockModal';
import AnimatedTabBar from '../AnimatedTabBar';
import { ClipboardBar } from '../ClipboardBar';
import { DestructiveConfirmModal, useConfirmDestructive } from '../DestructiveConfirmModal';
import { VaultHeader } from '../VaultHeader';
import { ViewModeMenu } from '../ViewModeMenu';
import { SortMenu } from '../SortMenu';
import { Badge } from '../primitives/Badge';
import { Card } from '../primitives/Card';
import { Dialog } from '../primitives/Dialog';
import { EmptyState } from '../primitives/EmptyState';
import { getFileTypeMeta } from '../primitives/FileTypeIcon';
import { FileGridTile, FileListRow } from '../primitives/FileTile';
import { GridTile } from '../primitives/GridTile';
import { ListRow } from '../primitives/ListRow';
import { SectionHeaderToggle } from '../primitives/SectionHeaderToggle';
import { Sheet } from '../primitives/Sheet';
import { Snackbar, useSnackbar } from '../primitives/Snackbar';
import { TopToast, useTopToast, bulkOutcomeToast } from '../primitives/TopToast';
import { SubfolderIcon } from '../primitives/SubfolderIcon';
import { TextField } from '../primitives/TextField';
import { Text } from '../primitives/Text';
import { MAX_NAME_LENGTH, truncateDisplayName } from '../../constants/naming';
import { FontFamily, Type } from '../../constants/typography';
import { useRename } from '../../contexts/RenameContext';
import { useMove } from '../../contexts/MoveVaultContext';
import { useHydration } from '../../contexts/HydrationContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useFileSystemQuery } from '../../hooks/useFileSystemQuery';
import { SecureCrypto } from '../../security/crypto';
import { formatBytes } from '../../constants/storageLimits';
import { StorageService } from '../../services/storage';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore, StorageLimitExceededError, AlbumMediaOnlyError } from '../../store/vaultStore';
import { getFolderStatsMap, toMoveDestinations } from '../../utils/folderStats';
import { chunkIntoRows } from '../../utils/gridRows';
import { groupFilesByDate } from '../../utils/dateGroups';
import { sortFolders, sortFiles, SortKey } from '../../utils/vaultSort';
import { pickAndSetFolderThumbnail } from '../../utils/pickFolderThumbnail';

const DEFAULT_SORT: SortKey = 'name_asc';
import { MIN_TOUCH_TARGET } from '../../utils/responsive';

export interface VaultContentsScreenProps {
  variant: 'folder' | 'album';
  containerId: string | undefined;
}

export function VaultContentsScreen({ variant, containerId: id }: VaultContentsScreenProps) {
  const { colors, space, font, radius, screenPadding, bottomTabSpacing, responsiveSize, gridColumns, gridItemWidth , iconSize } = useTheme();
  const viewMode = useSettingsStore((s: any) => s.viewMode);

  const {
    folders, files, importFile, deleteFolder, softDeleteFile, createFolder, renameFolder,
    shredFolder, renameFile, moveFileToFolder,
    exportFileToDevice, exportFolderFiles, moveFolder, shredFile,
    toggleFolderFavorite, toggleFavorite,
    assignFolderAccessKey, assignFileAccessKey, removeFolderAccessKey, removeFileAccessKey,
    clipboard, undoLastCut,
    copyToClipboard, cutToClipboard, pasteFromClipboard,
    duplicateFile, duplicateFolder, addFileToAlbum,
    setFolderThumbnail, clearFolderThumbnail,
  } = useVaultStore();

  const folderStatsMap = useMemo(() => getFolderStatsMap(files), [files]);
  // "Add to Album…" (§7, Phase 6) destinations — every root-level album in
  // the vault, regardless of which screen/folder this file is being viewed
  // from.
  const albums = useMemo(() => folders.filter(f => f.type === 'album' && !f.isTrash), [folders]);

  const { accessKeys } = useSettingsStore();
  const { matchedFiles, matchedFolders } = useFileSystemQuery(id);
  const { openRenameModal, setOnRename } = useRename();
  const { openMoveModal, setOnMove } = useMove();
  const { confirmState: delConfirm, confirm: confirmDestructive, close: closeDelConfirm } = useConfirmDestructive();
  const { snackbarState, showSnackbar } = useSnackbar();
  const { topToastState, showTopToast } = useTopToast();
  const { vaultReady } = useHydration();

  const isAlbum = variant === 'album';

  // 'subfolders'/'files' for the folder variant; `date:<label>` (one per
  // groupFilesByDate bucket, §2b) for the album variant — broadened from
  // the folder-only union so the same collapse mechanism covers both.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSectionCollapse = (key: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showSubfolderMenu, setShowSubfolderMenu] = useState(false);
  const [targetFile, setTargetFile] = useState<any>(null);
  const [targetSubfolder, setTargetSubfolder] = useState<any>(null);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [search, setSearch] = useState('');

  const folderRecord = folders.find(f => f.id === id);
  const folderName = folderRecord ? folderRecord.name : (isAlbum ? 'Album' : 'Vault Root');

  useWindowDimensions(); // subscribe to width/height changes so the grid recomputes on rotation
  // Google Photos-style dense grid: a hairline-scale gutter instead of a
  // full card gap (see GridTile, which also drops the Card border/shadow).
  const gridGap = space(1);
  const isGridMode = viewMode !== 'list';
  // Fixed column counts per view mode, matching dashboard/favorites/search/
  // trash's own getVaultColumns — ThemeContext's gridColumns() applies a
  // width-based floor (minItemWidth) that silently collapsed "small icons"
  // from its advertised 5 columns down to 4 on common phone widths, making
  // it look identical to "medium icons" here while every other screen still
  // rendered the full 5.
  const gridColumnsCount = viewMode === 'small-icons' ? 5 : viewMode === 'medium-icons' ? 3 : viewMode === 'large-icons' ? 2 : gridColumns(viewMode);
  const gridItemWidthValue = gridItemWidth(gridColumnsCount, gridGap, screenPadding);

  const totalSizeKB = useMemo(() => matchedFiles.reduce((acc, f) => acc + (f.size || 0), 0) / 1024, [matchedFiles]);
  const passwordProtectedCount = useMemo(() => matchedFiles.filter(f => f.hasAccessKey).length, [matchedFiles]);
  // Album-only split of the aggregate file count into its two possible media
  // kinds — an album can only ever hold photos/videos (AlbumMediaOnlyError),
  // so "Photos"/"Videos" is a strictly more useful breakdown than "Files".
  const photoCount = useMemo(() => matchedFiles.filter(f => f.mimeType?.startsWith('image/')).length, [matchedFiles]);
  const videoCount = useMemo(() => matchedFiles.filter(f => f.mimeType?.startsWith('video/')).length, [matchedFiles]);

  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT);

  const searchQuery = search.trim().toLowerCase();
  // isAlbum-guarded (Fix 4): the album variant's displayedFiles also feeds
  // groupFilesByDate below, which re-sorts by date internally regardless of
  // input order — sorting here first would be wasted work and would drift
  // from "leave the album branch untouched". No sort control is shown for
  // albums either (rightSlot below), so sortKey never changes there anyway.
  const displayedFolders = useMemo(() => {
    const filtered = searchQuery ? matchedFolders.filter(f => f.name.toLowerCase().includes(searchQuery)) : matchedFolders;
    return isAlbum ? filtered : sortFolders(filtered, sortKey);
  }, [matchedFolders, searchQuery, isAlbum, sortKey]);
  const displayedFiles = useMemo(() => {
    const filtered = searchQuery ? matchedFiles.filter(f => f.name.toLowerCase().includes(searchQuery)) : matchedFiles;
    return isAlbum ? filtered : sortFiles(filtered, sortKey);
  }, [matchedFiles, searchQuery, isAlbum, sortKey]);
  const isSearching = searchQuery.length > 0;
  const hasNoSearchResults = isSearching && displayedFolders.length === 0 && displayedFiles.length === 0;

  const [showPasswordPicker, setShowPasswordPicker] = useState(false);
  const [passwordPickerTarget, setPasswordPickerTarget] = useState<{ type: 'file' | 'folder' | 'bulk'; id: string; name: string } | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string; accessKeyId: string; onUnlock: () => void } | null>(null);
  const [pendingPasswordRemoval, setPendingPasswordRemoval] = useState<{ type: 'file' | 'folder'; id: string; name: string; accessKeyId: string } | null>(null);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [keyCreateTarget, setKeyCreateTarget] = useState<{ id: string; name: string; targetType: 'file' | 'folder' | 'bulk' } | null>(null);
  const [importingName, setImportingName] = useState<string | null>(null);
  const [importedName, setImportedName] = useState<string | null>(null);
  // Album-only import state (§2/Phase 3) — distinct from the folder
  // variant's single-file importingName/importedName above because a
  // multi-select photo/video import needs "N of M" progress and a
  // succeeded/failed rollup rather than one name. Both variants' state
  // coexist here; each is only ever set by its own variant's import path.
  const [importingProgress, setImportingProgress] = useState<{ current: number; total: number } | null>(null);
  // `lastSucceededName` is only ever surfaced when succeeded === 1 && failed
  // === 0 (see importedSummary Dialog below) — a single clean import reads
  // "sunset.jpg imported" rather than the less useful "1 imported".
  const [importedSummary, setImportedSummary] = useState<{ succeeded: number; failed: number; lastSucceededName?: string } | null>(null);

  const sanitizeFilename = (name: string): string => name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_');

  // expo-image-picker's returned assets[] cannot be trusted to carry
  // fileName/mimeType (§2, self-review pass 3) — fall back to a
  // extension→mimeType guess (image/video only, since that's the only
  // content an album can hold) rather than passing undefined/a generic
  // octet-stream through to the album-media-only guard, which keys off
  // exactly this value.
  const IMAGE_EXT_MIME: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp',
  };
  const VIDEO_EXT_MIME: Record<string, string> = {
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', avi: 'video/x-msvideo',
    '3gp': 'video/3gpp', webm: 'video/webm', mkv: 'video/x-matroska',
  };
  const mimeTypeFromAsset = (uri: string, assetType?: string | null): string => {
    const ext = uri.split('.').pop()?.toLowerCase().split('?')[0] ?? '';
    if (IMAGE_EXT_MIME[ext]) return IMAGE_EXT_MIME[ext];
    if (VIDEO_EXT_MIME[ext]) return VIDEO_EXT_MIME[ext];
    // Extension unrecognized (or missing) — fall back to the asset's own
    // coarse type, still media-only rather than octet-stream.
    return assetType === 'video' ? 'video/mp4' : 'image/jpeg';
  };

  const executeAlbumImport = async () => {
    if (!id || !vaultReady) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo Access Needed', 'Photo access is required to add media to an album — enable it in Settings.');
      return;
    }
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) return;
    const assets = pickerResult.assets;
    setImportingProgress({ current: 0, total: assets.length });
    // Same resume-mid-frame issue as the folder variant's picker below —
    // returning from the OS media picker needs a committed render pass
    // before the "Importing 1 of N…" Dialog actually paints.
    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => requestAnimationFrame(resolve));
    let succeeded = 0;
    let failed = 0;
    let lastSucceededName: string | undefined;
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      setImportingProgress({ current: i + 1, total: assets.length });
      const safeName = asset.fileName && asset.fileName.trim().length > 0
        ? sanitizeFilename(asset.fileName)
        : `${SecureCrypto.generateUUID()}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;
      const mimeType = asset.mimeType && asset.mimeType.trim().length > 0
        ? asset.mimeType
        : mimeTypeFromAsset(asset.uri, asset.type);
      try {
        if (Platform.OS === 'web') {
          const tempName = `${SecureCrypto.generateUUID()}_${safeName}`;
          await StorageService.storeWebFile(asset.uri, tempName);
        }
        await importFile(asset.uri, id, safeName, mimeType, asset.fileSize || 0, false);
        succeeded++;
        lastSucceededName = safeName;
      } catch (e) {
        failed++;
        // AlbumMediaOnlyError/StorageLimitExceededError are expected,
        // per-asset outcomes folded into the failed tally below rather
        // than logged as unexpected errors.
        if (!(e instanceof AlbumMediaOnlyError) && !(e instanceof StorageLimitExceededError)) {
          console.error(e);
        }
      }
    }
    setImportingProgress(null);
    setImportedSummary({ succeeded, failed, lastSucceededName });
  };

  const executeImportPayload = async () => {
    if (!id || !vaultReady) return;
    if (isAlbum) {
      try {
        await executeAlbumImport();
      } catch (e) {
        setImportingProgress(null);
        console.error(e);
        Alert.alert('Processing Failure', 'Could not import selected media.');
      }
      return;
    }
    try {
      // Android document providers may return a transient content:// URI.
      // Copying it to the app cache before import makes the subsequent
      // sandbox copy reliable in an EAS APK (and is the documented
      // expo-document-picker + expo-file-system interop path).
      const pickerResult = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
      if (pickerResult.canceled || !pickerResult.assets) return;
      const asset = pickerResult.assets[0];
      const safeName = sanitizeFilename(asset.name);
      setImportingName(safeName);
      // Returning from the OS document picker leaves RN mid-resume (bridge
      // still catching up from backgrounding), and importFile's first await
      // is real file I/O rather than a guaranteed yield — without this the
      // loading Dialog's state update gets coalesced with that work and
      // never actually paints before the import finishes. Two frame yields
      // give React a committed render pass before the heavy work starts.
      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (Platform.OS === 'web') {
        const tempName = `${SecureCrypto.generateUUID()}_${safeName}`;
        await StorageService.storeWebFile(asset.uri, tempName);
        await importFile(asset.uri, id, safeName, asset.mimeType || 'application/octet-stream', asset.size || 0, false);
      } else {
        await importFile(asset.uri, id, safeName, asset.mimeType || 'application/octet-stream', asset.size || 0, false);
      }
      setImportingName(null);
      setImportedName(safeName);
    } catch (e) {
      setImportingName(null);
      if (e instanceof StorageLimitExceededError) {
        Alert.alert(
          'Storage Limit Reached',
          `This vault is capped at ${formatBytes(e.limitBytes)}. It's currently using ${formatBytes(e.usedBytes)}, and this file needs ${formatBytes(e.incomingBytes)} more. Raise the limit in Settings → Storage, or free up space first.`
        );
        return;
      }
      console.error(e);
      Alert.alert('Processing Failure', 'Could not index selected payload.');
    }
  };

  const exitSelectionMode = () => { setSelectionMode(false); setSelectedFileIds([]); setSelectedFolderIds([]); };
  const toggleFileSelection = (fileId: string) => setSelectedFileIds(prev => prev.includes(fileId) ? prev.filter(i => i !== fileId) : [...prev, fileId]);
  const toggleFolderSelection = (folderId: string) => setSelectedFolderIds(prev => prev.includes(folderId) ? prev.filter(i => i !== folderId) : [...prev, folderId]);

  const handleCreateFolder = async (name: string) => {
    if (!id) return;
    const finalName = name.trim() || 'New Folder';
    try {
      await createFolder(finalName, colors.primary, 'folder', false, id);
      showTopToast(`${finalName} created`);
    } catch {
      showTopToast(`Failed to create ${finalName}`, 'error');
    }
  };

  const handleCreateNestedFolder = () => {
    if (!id) return;
    setShowCreateFolderModal(true);
  };

  const confirmCreateFolder = () => {
    if (!id) return;
    handleCreateFolder(newFolderName);
    setShowCreateFolderModal(false);
    setNewFolderName('');
  };

  const handleBulkSoftDelete = () => {
    const totalSelected = selectedFileIds.length + selectedFolderIds.length;
    if (totalSelected === 0) { Alert.alert('Selection Empty', 'Select elements first before executing wipe commands.'); return; }
    confirmDestructive(
      'Move to Trash',
      `Move ${totalSelected} elements into retention trash?`,
      async () => {
        let succeeded = 0;
        for (const fileId of selectedFileIds) {
          try { await softDeleteFile(fileId); succeeded++; } catch { /* counted via total - succeeded */ }
        }
        for (const folderId of selectedFolderIds) {
          try { await deleteFolder(folderId); succeeded++; } catch { /* counted via total - succeeded */ }
        }
        const { message, tone } = bulkOutcomeToast(succeeded, totalSelected, 'item', 'moved to trash', 'move to trash');
        showTopToast(message, tone);
        exitSelectionMode();
      },
      'Move to Trash'
    );
  };

  const handleDeleteAll = () => {
    const totalItems = matchedFiles.length + matchedFolders.length;
    if (totalItems === 0) { Alert.alert('Folder Empty', 'There are no items to delete.'); return; }
    confirmDestructive(
      'Delete Everything',
      `Move ALL items into retention trash? This will permanently delete all items.`,
      async () => {
        let succeeded = 0;
        for (const file of matchedFiles) {
          try { await softDeleteFile(file.id); succeeded++; } catch { /* counted via total - succeeded */ }
        }
        for (const folder of matchedFolders) {
          try { await deleteFolder(folder.id); succeeded++; } catch { /* counted via total - succeeded */ }
        }
        const { message, tone } = bulkOutcomeToast(succeeded, totalItems, 'item', 'moved to trash', 'move to trash');
        showTopToast(message, tone);
        exitSelectionMode();
      },
      'Delete All'
    );
  };

  const handleSelectAll = () => {
    const allFileIds = matchedFiles.map(f => f.id);
    const allFolderIds = matchedFolders.map(f => f.id);
    const allSelected = allFileIds.every(id => selectedFileIds.includes(id)) && allFolderIds.every(id => selectedFolderIds.includes(id));
    if (allSelected) {
      exitSelectionMode();
    } else {
      setSelectedFileIds(allFileIds);
      setSelectedFolderIds(allFolderIds);
      setSelectionMode(true);
    }
  };

  const handleBulkAssignExistingKey = () => {
    const totalSelected = selectedFileIds.length + selectedFolderIds.length;
    if (totalSelected === 0) { Alert.alert('Selection Empty', 'Select elements first before assigning a key.'); return; }
    setPasswordPickerTarget({ type: 'bulk', id: 'bulk', name: 'selected items' });
    setShowPasswordPicker(true);
  };

  const handleBulkCreateAndAssignKey = () => {
    const totalSelected = selectedFileIds.length + selectedFolderIds.length;
    if (totalSelected === 0) { Alert.alert('Selection Empty', 'Select elements first before creating a key.'); return; }
    setKeyCreateTarget({ id: 'bulk', name: `${totalSelected} selected items`, targetType: 'bulk' });
    setShowCreateKeyModal(true);
  };

  const handleBulkCopy = () => {
    const totalSelected = selectedFileIds.length + selectedFolderIds.length;
    if (totalSelected === 0) { Alert.alert('Selection Empty', 'Select elements first before copying.'); return; }
    copyToClipboard(selectedFolderIds, selectedFileIds, id as string);
    exitSelectionMode();
  };

  const handleBulkCut = () => {
    const totalSelected = selectedFileIds.length + selectedFolderIds.length;
    if (totalSelected === 0) { Alert.alert('Selection Empty', 'Select elements first before cutting.'); return; }
    cutToClipboard(selectedFolderIds, selectedFileIds, id as string);
    exitSelectionMode();
  };

  const handleFileItemPress = (file: any) => {
    if (selectionMode) { toggleFileSelection(file.id); return; }
    const go = () => {
      if (file.mimeType?.startsWith('image/')) router.push({ pathname: '/(main)/viewer/image', params: { fileId: file.id } });
      else if (file.mimeType?.startsWith('video/')) router.push({ pathname: '/(main)/viewer/video', params: { fileId: file.id } });
      else router.push({ pathname: '/(main)/viewer/document', params: { fileId: file.id } });
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

  const handleFolderItemNavigate = (folder: any) => {
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

  const handleOpenKeyModal = (targetId: string, targetName: string, targetType: 'file' | 'folder') => {
    if (accessKeys.length >= 20) { Alert.alert('Access Key Limit', 'You can only create up to 20 access keys.'); return; }
    setKeyCreateTarget({ id: targetId, name: targetName, targetType });
    setShowCreateKeyModal(true);
  };

  const handleFileAction = (action: string) => {
    setShowFileMenu(false);
    if (!targetFile) return;
    switch (action) {
      case 'rename':
        openRenameModal({ id: targetFile.id, name: targetFile.name, type: 'file' });
        setOnRename((newName: string) => { renameFile(targetFile.id, newName.trim()); setTargetFile(null); });
        break;
      case 'move':
        setOnMove((destinationFolderId: string | null) => {
          if (destinationFolderId !== null) moveFileToFolder(targetFile.id, destinationFolderId);
        });
        openMoveModal(
          { id: targetFile.id, name: targetFile.name, type: 'file', folderId: id },
          toMoveDestinations(folders.filter(f => f.id !== targetFile.folderId && f.type !== 'album' && !f.isTrash), folderStatsMap)
        );
        break;
      case 'add-to-album': {
        // Reuses the exact "pick a destination folder" Move modal (plan §7)
        // — album list only, current containing folder (if it's itself an
        // album) excluded since the file's already there. mode:
        // 'add-to-album' is what makes MoveVaultModal/Wrapper render
        // add/copy copy instead of move copy (see MoveVaultContext.tsx).
        const destinationAlbums = albums.filter(a => a.id !== targetFile.folderId);
        setOnMove((albumId: string | null) => {
          if (albumId) return addFileToAlbum(targetFile.id, albumId);
        });
        openMoveModal(
          { id: targetFile.id, name: targetFile.name, type: 'file', folderId: id, mode: 'add-to-album' },
          toMoveDestinations(destinationAlbums, folderStatsMap)
        );
        break;
      }
      case 'export':
        exportFileToDevice(targetFile.id).then(path => { if (path) Sharing.shareAsync(path); });
        break;
      case 'delete': {
        const name = targetFile.name;
        confirmDestructive('Move to Trash', `Move "${name}" into retention trash?`, async () => {
          try {
            await softDeleteFile(targetFile.id);
            showTopToast(`${name} has been moved to trash`);
          } catch {
            showTopToast(`Failed to move ${name} to trash`, 'error');
          }
        });
        break;
      }
      case 'shred': {
        const name = targetFile.name;
        confirmDestructive('Permanently Delete', `Delete "${name}" permanently?`, async () => {
          try {
            await shredFile(targetFile.id);
            showTopToast(`${name} deleted permanently`);
          } catch {
            showTopToast(`Failed to delete ${name} permanently`, 'error');
          }
        }, 'Delete Permanently');
        break;
      }
      case 'favorite': {
        const name = targetFile.name;
        const markingFavorite = !targetFile.isFavorite;
        toggleFavorite(targetFile.id)
          .then(() => { if (markingFavorite) showTopToast(`${name} marked as favorite`); })
          .catch(() => { if (markingFavorite) showTopToast(`Failed to mark ${name} as favorite`, 'error'); });
        break;
      }
      case 'create-password': handleOpenKeyModal(targetFile.id, targetFile.name, 'file'); break;
      case 'assign-password':
        if (accessKeys.length === 0) Alert.alert('No Access Keys', 'Create a access key in Settings first.');
        else { setPasswordPickerTarget({ type: 'file', id: targetFile.id, name: targetFile.name }); setShowPasswordPicker(true); }
        break;
      case 'remove-password':
        setPendingPasswordRemoval({ type: 'file', id: targetFile.id, name: targetFile.name, accessKeyId: targetFile.accessKeyId });
        setShowUnlockModal(true);
        break;
      case 'copy': copyToClipboard([], [targetFile.id], id!); break;
      case 'cut': cutToClipboard([], [targetFile.id], id!); break;
      case 'duplicate': duplicateFile(targetFile.id); break;
    }
  };

  const handlePaste = async () => {
    if (!clipboard || !id) return;
    try {
      const result = await pasteFromClipboard(id as string);
      if (result.pastedFiles === 0 && result.pastedFolders === 0) return;
      showSnackbar(`${result.pastedFolders} folder${result.pastedFolders !== 1 ? 's' : ''}, ${result.pastedFiles} file${result.pastedFiles !== 1 ? 's' : ''} pasted.`);
    } catch {
      Alert.alert('Paste Failed', 'Could not paste items.');
    }
  };

  const handleSubfolderAction = (action: string) => {
    setShowSubfolderMenu(false);
    if (!targetSubfolder) return;
    const subfolder = targetSubfolder;
    switch (action) {
      case 'rename':
        openRenameModal({ id: subfolder.id, name: subfolder.name, type: 'folder' });
        setOnRename((newName: string) => { renameFolder(subfolder.id, newName.trim()); setTargetSubfolder(null); });
        break;
      case 'move':
        setOnMove((destinationFolderId: string | null) => {
          moveFolder(subfolder.id, destinationFolderId ?? undefined);
        });
        openMoveModal(
          { id: subfolder.id, name: subfolder.name, type: 'folder' },
          toMoveDestinations(folders.filter(f => f.id !== subfolder.id && f.type !== 'album' && !f.isTrash), folderStatsMap)
        );
        break;
      case 'export':
        exportFolderFiles(subfolder.id).then((paths: string[]) => {
          if (paths.length > 0) showSnackbar(`Exported ${paths.length} files`);
          else showSnackbar('This vault has no files to export.', 'error');
        }).catch(() => Alert.alert('Export Failed', 'Something went wrong while exporting.'));
        break;
      case 'copy': copyToClipboard([subfolder.id], [], id as string); break;
      case 'cut': cutToClipboard([subfolder.id], [], id as string); break;
      case 'duplicate': duplicateFolder(subfolder.id); break;
      case 'change-thumbnail':
        pickAndSetFolderThumbnail(subfolder.id, setFolderThumbnail).then((result) => {
          if (result === 'set') showTopToast(`${subfolder.name} thumbnail updated`);
          else if (result === 'permission-denied') Alert.alert('Photo Access Needed', 'Photo access is required to choose a thumbnail — enable it in Settings.');
          else if (result === 'error') Alert.alert('Couldn’t Set Thumbnail', 'Something went wrong while processing that image.');
          // 'canceled' → no-op, matches every other cancel-a-picker path in this app
        });
        break;
      case 'remove-thumbnail':
        clearFolderThumbnail(subfolder.id).then(() => showTopToast(`${subfolder.name} thumbnail removed`));
        break;
      case 'create-password': handleOpenKeyModal(subfolder.id, subfolder.name, 'folder'); break;
      case 'assign-password':
        if (accessKeys.length === 0) Alert.alert('No Access Keys', 'Create a access key in Settings first.');
        else { setPasswordPickerTarget({ type: 'folder', id: subfolder.id, name: subfolder.name }); setShowPasswordPicker(true); }
        break;
      case 'remove-password':
        if (subfolder.accessKeyId) {
          setPendingPasswordRemoval({ type: 'folder', id: subfolder.id, name: subfolder.name, accessKeyId: subfolder.accessKeyId });
          setShowUnlockModal(true);
        }
        break;
      case 'favorite': {
        const markingFavorite = !subfolder.isFavorite;
        toggleFolderFavorite(subfolder.id)
          .then(() => { if (markingFavorite) showTopToast(`${subfolder.name} marked as favorite`); })
          .catch(() => { if (markingFavorite) showTopToast(`Failed to mark ${subfolder.name} as favorite`, 'error'); });
        break;
      }
      case 'delete':
        confirmDestructive('Move to Trash', `Move "${subfolder.name}" into retention trash?`, async () => {
          try {
            await deleteFolder(subfolder.id);
            showTopToast(`${subfolder.name} has been moved to trash`);
          } catch {
            showTopToast(`Failed to move ${subfolder.name} to trash`, 'error');
          }
        });
        break;
      case 'shred':
        confirmDestructive('Permanently Delete', `Delete "${subfolder.name}" and all its contents permanently?`, async () => {
          try {
            await shredFolder(subfolder.id);
            showTopToast(`${subfolder.name} deleted permanently`);
          } catch {
            showTopToast(`Failed to delete ${subfolder.name} permanently`, 'error');
          }
        }, 'Delete Permanently');
        break;
    }
  };

  const handleFolderAction = (action: string) => {
    setShowFolderMenu(false);
    if (!folderRecord) return;
    switch (action) {
      case 'rename':
        openRenameModal({ id: folderRecord.id, name: folderRecord.name, type: 'folder' });
        setOnRename((newName: string) => { renameFolder(folderRecord.id, newName.trim()); });
        break;
      case 'move':
        setOnMove((destinationFolderId: string | null) => {
          moveFolder(folderRecord.id, destinationFolderId ?? undefined);
        });
        openMoveModal(
          { id: folderRecord.id, name: folderRecord.name, type: 'folder' },
          toMoveDestinations(folders.filter(f => f.id !== folderRecord.id && f.type !== 'album' && !f.isTrash), folderStatsMap)
        );
        break;
      case 'export':
        exportFolderFiles(folderRecord.id).then((paths: string[]) => {
          if (paths.length > 0) showSnackbar(`Exported ${paths.length} files`);
          else showSnackbar('This vault has no files to export.', 'error');
        }).catch(() => Alert.alert('Export Failed', 'Something went wrong while exporting.'));
        break;
      case 'copy': copyToClipboard([folderRecord.id], [], id as string); break;
      case 'cut': cutToClipboard([folderRecord.id], [], id as string); break;
      case 'duplicate': duplicateFolder(folderRecord.id); break;
      case 'change-thumbnail':
        pickAndSetFolderThumbnail(folderRecord.id, setFolderThumbnail).then((result) => {
          if (result === 'set') showTopToast(`${folderRecord.name} thumbnail updated`);
          else if (result === 'permission-denied') Alert.alert('Photo Access Needed', 'Photo access is required to choose a thumbnail — enable it in Settings.');
          else if (result === 'error') Alert.alert('Couldn’t Set Thumbnail', 'Something went wrong while processing that image.');
          // 'canceled' → no-op, matches every other cancel-a-picker path in this app
        });
        break;
      case 'remove-thumbnail':
        clearFolderThumbnail(folderRecord.id).then(() => showTopToast(`${folderRecord.name} thumbnail removed`));
        break;
      case 'create-password': handleOpenKeyModal(folderRecord.id, folderRecord.name, 'folder'); break;
      case 'assign-password':
        if (accessKeys.length === 0) Alert.alert('No Access Keys', 'Create a access key in Settings first.');
        else { setPasswordPickerTarget({ type: 'folder', id: folderRecord.id, name: folderRecord.name }); setShowPasswordPicker(true); }
        break;
      case 'remove-password':
        if (folderRecord.accessKeyId) {
          setPendingPasswordRemoval({ type: 'folder', id: folderRecord.id, name: folderRecord.name, accessKeyId: folderRecord.accessKeyId });
          setShowUnlockModal(true);
        }
        break;
      case 'favorite': {
        const markingFavorite = !folderRecord.isFavorite;
        toggleFolderFavorite(folderRecord.id)
          .then(() => { if (markingFavorite) showTopToast(`${folderRecord.name} marked as favorite`); })
          .catch(() => { if (markingFavorite) showTopToast(`Failed to mark ${folderRecord.name} as favorite`, 'error'); });
        break;
      }
      case 'paste': if (clipboard) handlePaste(); break;
      case 'delete':
        confirmDestructive('Move to Trash', `Move "${folderRecord.name}" into retention trash?`, async () => {
          try {
            await deleteFolder(folderRecord.id);
            showTopToast(`${folderRecord.name} has been moved to trash`);
          } catch {
            showTopToast(`Failed to move ${folderRecord.name} to trash`, 'error');
          }
        }, 'Move to Trash');
        break;
      case 'shred':
        confirmDestructive('Permanently Delete', `Delete "${folderRecord.name}" and all its contents permanently?`, async () => {
          try {
            await shredFolder(folderRecord.id);
            showTopToast(`${folderRecord.name} deleted permanently`);
          } catch {
            showTopToast(`Failed to delete ${folderRecord.name} permanently`, 'error');
          }
        }, 'Delete Permanently');
        break;
    }
  };

  const fileMenuItems = useMemo(() => {
    if (!targetFile) return [];
    const hasPassword = targetFile.hasAccessKey && targetFile.accessKeyId;
    // "Add to Album…" (plan §7, Phase 6): media-only (it would only ever
    // fail via the store's own album-media-only guard otherwise, so hiding
    // it for a non-media file avoids a dead-end action) and only shown when
    // there's at least one *other* album to add into — a lone album
    // browsing its own contents shouldn't offer to add a file to itself.
    const isMediaFile = !!targetFile.mimeType && (targetFile.mimeType.startsWith('image/') || targetFile.mimeType.startsWith('video/'));
    const hasAlbumDestination = albums.some(a => a.id !== targetFile.folderId);
    return [
      { action: 'rename', label: 'Rename', color: colors.text },
      { action: 'move', label: 'Move to…', color: colors.text },
      isMediaFile && hasAlbumDestination ? { action: 'add-to-album', label: 'Add to Album…', color: colors.secondary } : null,
      { action: 'export', label: 'Export / Save to Device', color: colors.text },
      { action: 'copy', label: 'Copy', color: colors.secondary },
      { action: 'cut', label: 'Cut', color: colors.secondary },
      { action: 'duplicate', label: 'Duplicate', color: colors.text },
      hasPassword ? { action: 'remove-password', label: 'Remove Assigned Access Key', color: colors.error } : null,
      !hasPassword ? { action: 'create-password', label: 'Assign and Create Access Key', color: colors.secondary } : null,
      !hasPassword ? { action: 'assign-password', label: 'Assign Existing Access Key', color: colors.secondary } : null,
      { action: 'favorite', label: targetFile.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: colors.warning },
      { action: 'delete', label: 'Move to Trash', color: colors.error },
      { action: 'shred', label: 'Delete Permanently', color: colors.error },
    ].filter(Boolean) as { action: string; label: string; color: string }[];
  }, [targetFile, colors, albums]);

  // Not memoized (unlike its file/subfolder siblings above/below): the
  // React Compiler flags `folderRecord` here as "may be mutated later" and
  // skips optimizing this component when a manual useMemo wraps it — a
  // known compiler false-positive on values derived via .find() over a
  // store array, not a real bug. The array built below is a handful of
  // static-shaped objects, cheap enough that recomputing it every render
  // (rather than fighting the compiler's memoization heuristic) is the
  // simpler, equally-correct choice.
  const folderMenuItems = (() => {
    if (!folderRecord) return [];
    const hasPassword = folderRecord.hasAccessKey && folderRecord.accessKeyId;
    const hasClipboard = !!clipboard;
    // An album can never gain a parentId, so there's no valid move
    // destination for it — omit 'move' from its own menu (§2). The other
    // half of this fix (excluding albums as a move *destination* for
    // anything else) is dashboard/favorites/search's own toMoveDestinations
    // call sites, per §3/§4.
    const isThisAlbum = folderRecord.type === 'album';
    return [
      { action: 'rename', label: 'Rename', color: colors.text },
      !isThisAlbum ? { action: 'move', label: 'Move', color: colors.text } : null,
      { action: 'export', label: 'Export', color: colors.text },
      { action: 'duplicate', label: 'Duplicate', color: colors.text },
      { action: 'change-thumbnail', label: folderRecord.customThumbnailPath ? 'Change Thumbnail' : 'Set Thumbnail', color: colors.text },
      folderRecord.customThumbnailPath ? { action: 'remove-thumbnail', label: 'Remove Thumbnail', color: colors.error } : null,
      hasClipboard ? { action: 'paste', label: 'Paste Here', color: colors.secondary } : null,
      hasPassword ? { action: 'remove-password', label: 'Remove Assigned Access Key', color: colors.error } : null,
      !hasPassword ? { action: 'create-password', label: 'Assign and Create Access Key', color: colors.secondary } : null,
      !hasPassword ? { action: 'assign-password', label: 'Assign Existing Access Key', color: colors.secondary } : null,
      { action: 'favorite', label: folderRecord.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: colors.warning },
      { action: 'delete', label: 'Move to Trash', color: colors.error },
      { action: 'shred', label: 'Delete Permanently', color: colors.error },
    ].filter(Boolean) as { action: string; label: string; color: string }[];
  })();

  const subfolderMenuItems = useMemo(() => {
    if (!targetSubfolder) return [];
    const hasPassword = targetSubfolder.hasAccessKey && targetSubfolder.accessKeyId;
    return [
      { action: 'rename', label: 'Rename', color: colors.text },
      { action: 'move', label: 'Move', color: colors.text },
      { action: 'export', label: 'Export', color: colors.text },
      { action: 'copy', label: 'Copy', color: colors.secondary },
      { action: 'cut', label: 'Cut', color: colors.secondary },
      { action: 'duplicate', label: 'Duplicate', color: colors.text },
      { action: 'change-thumbnail', label: targetSubfolder.customThumbnailPath ? 'Change Thumbnail' : 'Set Thumbnail', color: colors.text },
      targetSubfolder.customThumbnailPath ? { action: 'remove-thumbnail', label: 'Remove Thumbnail', color: colors.error } : null,
      hasPassword ? { action: 'remove-password', label: 'Remove Assigned Access Key', color: colors.error } : null,
      !hasPassword ? { action: 'create-password', label: 'Assign and Create Access Key', color: colors.secondary } : null,
      !hasPassword ? { action: 'assign-password', label: 'Assign Existing Access Key', color: colors.secondary } : null,
      { action: 'favorite', label: targetSubfolder.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: colors.warning },
      { action: 'delete', label: 'Move to Trash', color: colors.error },
      { action: 'shred', label: 'Delete Permanently', color: colors.error },
    ].filter(Boolean) as { action: string; label: string; color: string }[];
  }, [targetSubfolder, colors]);

  const metrics = isAlbum
    ? [
        { label: 'Photos', value: String(photoCount) },
        { label: 'Videos', value: String(videoCount) },
        { label: 'KB Size', value: totalSizeKB.toFixed(0) },
        { label: 'Protected', value: String(passwordProtectedCount) },
      ]
    : [
        { label: 'Files', value: String(matchedFiles.length) },
        { label: 'KB Size', value: totalSizeKB.toFixed(0) },
        { label: 'Protected', value: String(passwordProtectedCount) },
        { label: 'Subfolders', value: String(matchedFolders.length) },
      ];

  // --- §2a virtualized grid: row-chunked SectionList -----------------------
  // Replaces the old ScrollView + flexWrap `View` grid (every item mounted
  // at once) with one SectionList shared by both variants. Each row is one
  // list item ({ id, kind, entries }) so a big subfolder/file list is
  // windowed instead of fully mounted — matters most for an album, whose
  // whole purpose is a dense, potentially large photo/video grid.
  type GridRow = { id: string; kind: 'folders' | 'files'; entries: any[] };
  type GridSection = { key: string; title: string; kind: 'folders' | 'files'; data: GridRow[] };

  const toRowData = (kind: GridRow['kind'], keyPrefix: string, rows: any[][]): GridRow[] =>
    rows.map((entries, idx) => ({ id: `${keyPrefix}-${idx}`, kind, entries }));

  const subfoldersCollapsed = collapsedSections.has('subfolders');
  const filesCollapsed = collapsedSections.has('files');

  // §2b date grouping only applies once there's something to group — an
  // empty/all-filtered-out result is handled by gridEmptyState below
  // instead of an empty date section.
  const dateGroups = useMemo(
    () => (isAlbum && !hasNoSearchResults ? groupFilesByDate(displayedFiles) : []),
    [isAlbum, hasNoSearchResults, displayedFiles]
  );

  const sections = useMemo<GridSection[]>(() => {
    const list: GridSection[] = [];
    if (isAlbum) {
      for (const group of dateGroups) {
        const key = `date:${group.label}`;
        list.push({
          key,
          title: group.label.toUpperCase(),
          kind: 'files',
          data: collapsedSections.has(key) ? [] : toRowData('files', key, chunkIntoRows(group.files, gridColumnsCount)),
        });
      }
      return list;
    }
    if (displayedFolders.length > 0) {
      list.push({
        key: 'subfolders',
        title: 'SUBFOLDERS',
        kind: 'folders',
        data: subfoldersCollapsed ? [] : toRowData('folders', 'subfolders', chunkIntoRows(displayedFolders, gridColumnsCount)),
      });
    }
    if (!hasNoSearchResults) {
      list.push({
        key: 'files',
        title: 'FILES',
        kind: 'files',
        data: filesCollapsed ? [] : toRowData('files', 'files', chunkIntoRows(displayedFiles, gridColumnsCount)),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAlbum, dateGroups, displayedFolders, displayedFiles, hasNoSearchResults, subfoldersCollapsed, filesCollapsed, collapsedSections, gridColumnsCount]);

  const renderSubfolderTile = (folder: any) => {
    const isSelected = selectedFolderIds.includes(folder.id);
    const isLocked = !!(folder.hasAccessKey && folder.accessKeyId);
    if (isGridMode) {
      const isCutPending = clipboard?.mode === 'cut' && clipboard.folderIds.includes(folder.id);
      return (
        <GridTile
          key={folder.id}
          size={gridItemWidthValue}
          name={folder.name}
          thumbnailUri={folder.customThumbnailPath}
          Icon={SubfolderIcon}
          iconColor={colors.primary}
          selectable={selectionMode}
          selected={isSelected}
          dimmed={isCutPending}
          onPress={() => { if (selectionMode) toggleFolderSelection(folder.id); else handleFolderItemNavigate(folder); }}
          onLongPress={() => { setSelectionMode(true); setSelectedFolderIds([folder.id]); }}
          onMenuPress={() => { setTargetSubfolder(folder); setShowSubfolderMenu(true); }}
          badges={
            (isLocked || folder.isFavorite) && (
              <>
                {isLocked && <Badge icon={Lock} color={colors.primary} size={18} />}
                {folder.isFavorite && <Badge icon={Star} color={colors.warning} size={18} />}
              </>
            )
          }
        />
      );
    }
    return (
      <ListRow
        key={folder.id}
        title={folder.name}
        subtitle="Directory Folder"
        thumbnailUri={folder.customThumbnailPath}
        leading={<SubfolderIcon size={iconSize(22)} color={colors.primary} />}
        trailingBadges={
          <>
            {isLocked && <Badge icon={Lock} color={colors.primary} size={18} />}
            {folder.isFavorite && <Badge icon={Star} color={colors.warning} size={18} />}
          </>
        }
        onPress={() => handleFolderItemNavigate(folder)}
        onLongPress={() => { setSelectionMode(true); setSelectedFolderIds([folder.id]); }}
        selectable={selectionMode}
        selected={isSelected}
        onToggleSelect={() => toggleFolderSelection(folder.id)}
        onOverflowPress={() => { setTargetSubfolder(folder); setShowSubfolderMenu(true); }}
        allowMultilineTitle
      />
    );
  };

  const renderFileTile = (file: any) => {
    const isSelected = selectedFileIds.includes(file.id);
    const meta = getFileTypeMeta(file.mimeType ?? '', file.name);
    const FileIcon = meta.Icon;
    if (isGridMode) {
      const isCutPending = clipboard?.mode === 'cut' && clipboard.fileIds.includes(file.id);
      return (
        <FileGridTile
          key={file.id}
          file={file}
          size={gridItemWidthValue}
          name={file.name}
          Icon={FileIcon}
          iconColor={meta.color}
          isVideo={!!file.mimeType?.startsWith('video/')}
          selectable={selectionMode}
          selected={isSelected}
          dimmed={isCutPending}
          hideName={isAlbum}
          onPress={() => { if (selectionMode) toggleFileSelection(file.id); else handleFileItemPress(file); }}
          onLongPress={() => { setSelectionMode(true); setSelectedFileIds([file.id]); }}
          onMenuPress={() => { setTargetFile(file); setShowFileMenu(true); }}
          badges={
            (!!(file.hasAccessKey && file.accessKeyId) || file.isFavorite) && (
              <>
                {file.hasAccessKey && file.accessKeyId && <Badge icon={Lock} color={colors.primary} size={18} />}
                {file.isFavorite && <Badge icon={Star} color={colors.warning} size={18} />}
              </>
            )
          }
        />
      );
    }
    return (
      <FileListRow
        key={file.id}
        file={file}
        title={file.name}
        subtitle={`${(file.size / 1024).toFixed(1)} KB · ${meta.label}`}
        leading={<FileIcon size={iconSize(22)} color={meta.color} strokeWidth={2} />}
        trailingBadges={
          <>
            {file.hasAccessKey && file.accessKeyId && <Badge icon={Lock} color={colors.primary} size={18} />}
            {file.isFavorite && <Badge icon={Star} color={colors.warning} size={18} />}
          </>
        }
        onPress={() => handleFileItemPress(file)}
        onLongPress={() => { setSelectionMode(true); setSelectedFileIds([file.id]); }}
        selectable={selectionMode}
        selected={isSelected}
        onToggleSelect={() => toggleFileSelection(file.id)}
        onOverflowPress={() => { setTargetFile(file); setShowFileMenu(true); }}
        allowMultilineTitle
      />
    );
  };

  const renderGridRow = ({ item }: { item: GridRow }) => {
    const renderTile = item.kind === 'folders' ? renderSubfolderTile : renderFileTile;
    return (
      <View style={[styles.gridRow, { gap: gridGap }]}>
        {item.entries.map((entry) => (
          <View key={entry.id} style={isGridMode ? undefined : styles.rowItemFill}>
            {renderTile(entry)}
          </View>
        ))}
      </View>
    );
  };

  const renderGridSectionHeader = ({ section }: { section: GridSection }) => (
    <View style={{ backgroundColor: colors.background, paddingBottom: space(3) }}>
      <SectionHeaderToggle
        variant="eyebrow"
        title={section.title}
        expanded={!collapsedSections.has(section.key)}
        onToggle={() => toggleSectionCollapse(section.key)}
      />
    </View>
  );

  const renderGridSectionFooter = ({ section }: { section: GridSection }) => {
    // Album date-group sections are only ever pushed non-empty (§2b) — a
    // fully-empty album pushes zero sections at all and falls through to
    // gridEmptyState (screen-level) below instead of an empty footer here.
    if (isAlbum) return null;
    // The old CollapsibleSection's collapse hid both the grid *and* its
    // empty state together — mirror that here by rendering nothing at all
    // while collapsed, rather than showing an empty state under a
    // collapsed, content-free header.
    if (section.key !== 'files' || filesCollapsed || isSearching || displayedFiles.length > 0) return null;
    return (
      <EmptyState
        icon={FolderPlus}
        title="This directory workspace is empty"
        message="Add files or create subfolders to get started"
      />
    );
  };

  const albumEmpty = isAlbum && !isSearching && displayedFiles.length === 0;
  const gridEmptyState = hasNoSearchResults ? (
    <EmptyState icon={Search} title="No results found" message="Try a different search term" />
  ) : albumEmpty ? (
    <EmptyState icon={FolderPlus} title="No photos or videos yet" message="Import photos and videos to get started" />
  ) : null;

  const gridListHeader = (
    <View>
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.borderLight, borderRadius: radius(5), paddingHorizontal: space(4), marginBottom: space(4), gap: space(2), minHeight: MIN_TOUCH_TARGET }]}>
        <Search size={iconSize(18)} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text, fontFamily: FontFamily.medium, fontSize: font(Type.body.size) }]}
          placeholder={isAlbum ? 'Search photos & videos…' : 'Search files & folders…'}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          accessibilityLabel={isAlbum ? 'Search photos and videos' : 'Search files and folders'}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <X size={iconSize(16)} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>

      <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: space(5) }}>
        {metrics.map((m, i, arr) => (
          <View key={m.label} style={styles.metricRow}>
            <View style={styles.metricItem}>
              <Text style={[styles.metricValue, { color: colors.text, fontSize: font(Type.subtitle.size) }]}>{m.value}</Text>
              <Text style={[styles.metricLabel, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>{m.label}</Text>
            </View>
            {i < arr.length - 1 && <View style={[styles.metricDivider, { backgroundColor: colors.borderLight }]} />}
          </View>
        ))}
      </Card>

      <ClipboardBar
        onPaste={handlePaste}
        onUndo={undoLastCut}
        backgroundColor={colors.surface}
        textColor={colors.text}
        accentColor={colors.secondary}
        mutedColor={colors.textMuted}
      />

      <View style={[styles.actionRow, { gap: space(2), marginBottom: space(6) }]}>
        {!selectionMode ? (
          <>
            <TouchableOpacity
              onPress={executeImportPayload}
              disabled={!vaultReady}
              style={[styles.addFileButton, { backgroundColor: colors.primary, borderRadius: radius(10), paddingVertical: space(3), paddingHorizontal: space(5), gap: space(1), opacity: vaultReady ? 1 : 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel={isAlbum ? 'Add photos and videos' : 'Add file'}
            >
              <Plus size={iconSize(16)} color={colors.onPrimary} strokeWidth={2.5} />
              <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: font(Type.label.size) }}>{isAlbum ? 'Add Media' : 'Add File'}</Text>
            </TouchableOpacity>
            {!isAlbum && (
              <TouchableOpacity
                onPress={handleCreateNestedFolder}
                style={[styles.addFileButton, { backgroundColor: colors.surfaceHover, borderRadius: radius(10), paddingVertical: space(3), paddingHorizontal: space(5), gap: space(1) }]}
                accessibilityRole="button"
                accessibilityLabel="Create subfolder"
              >
                <Image
                  source={require('../../../assets/icons/operation_icons/create_subfolder_icon.png')}
                  style={{ width: iconSize(16), height: iconSize(16), tintColor: colors.text }}
                  resizeMode="contain"
                />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: font(Type.label.size) }}>Create Subfolder</Text>
              </TouchableOpacity>
            )}
            {!!clipboard && (
              <TouchableOpacity
                onPress={handlePaste}
                style={[styles.iconActionPill, { backgroundColor: colors.primary }]}
                accessibilityRole="button"
                accessibilityLabel="Paste here"
              >
                <ClipboardIcon size={responsiveSize(16, 18, 20)} color={colors.onPrimary} strokeWidth={2} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setSelectionMode(true)}
              style={[styles.addFileButton, { backgroundColor: colors.surfaceHover, borderRadius: radius(10), paddingVertical: space(3), paddingHorizontal: space(5), gap: space(1) }]}
              accessibilityRole="button"
              accessibilityLabel="Select items"
            >
              <Image
                source={require('../../../assets/icons/operation_icons/select_icon.png')}
                style={{ width: iconSize(16), height: iconSize(16), tintColor: colors.primary }}
                resizeMode="contain"
              />
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: font(Type.label.size) }}>Select</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={handleSelectAll} style={[styles.iconActionPill, { backgroundColor: colors.surfaceHover }]} accessibilityRole="button" accessibilityLabel="Select all">
              <CheckSquare size={iconSize(18)} color={colors.text} strokeWidth={2.5} />
            </TouchableOpacity>
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
            <TouchableOpacity onPress={handleDeleteAll} style={[styles.deleteAllButton, { backgroundColor: colors.error, borderRadius: radius(10), paddingVertical: space(3), paddingHorizontal: space(4) }]} accessibilityRole="button" accessibilityLabel="Delete all">
              <Text style={{ color: colors.onPrimary, fontWeight: '800', fontSize: font(Type.label.size) }}>Delete All</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={exitSelectionMode} style={[styles.outlinedSelectButton, { borderColor: colors.borderLight, borderRadius: radius(10), paddingVertical: space(3), paddingHorizontal: space(4) }]} accessibilityRole="button" accessibilityLabel="Exit selection">
              <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: font(Type.label.size) }}>Exit</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
  // --- end §2a virtualized grid setup --------------------------------------

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader
        title={truncateDisplayName(folderName)}
        showBack
        rightButton={
          <View style={styles.headerRightRow}>
            {!isAlbum && <SortMenu value={sortKey} onChange={setSortKey} defaultKey={DEFAULT_SORT} />}
            <ViewModeMenu />
            <TouchableOpacity
              onPress={() => setShowFolderMenu(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Vault actions"
              style={[styles.headerIconBtn, { marginLeft: space(2) }]}
            >
              <MoreVertical size={iconSize(18)} color={colors.textSecondary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        }
      />

      {/*
       * This list stays visible across native picker activity. Keeping the
       * persistent content out of a Reanimated opacity wrapper avoids an
       * Android resume reset making the folder appear blank after import.
       */}
      <SectionList<GridRow, GridSection>
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderGridRow}
        renderSectionHeader={renderGridSectionHeader}
        renderSectionFooter={renderGridSectionFooter}
        ItemSeparatorComponent={isGridMode ? () => <View style={{ height: gridGap }} /> : undefined}
        SectionSeparatorComponent={() => <View style={{ height: space(6) }} />}
        ListHeaderComponent={gridListHeader}
        ListEmptyComponent={gridEmptyState}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.scrollBody, { paddingHorizontal: screenPadding, paddingTop: space(4), paddingBottom: bottomTabSpacing + space(6) }]}
        showsVerticalScrollIndicator={false}
      />

      <DestructiveConfirmModal state={delConfirm} onClose={closeDelConfirm} />

      <AnimatedTabBar />

      <Snackbar state={snackbarState} bottomOffset={bottomTabSpacing} />
      <TopToast state={topToastState} />

      {!isAlbum && (
        <Dialog
          visible={showCreateFolderModal}
          onRequestClose={() => { setShowCreateFolderModal(false); setNewFolderName(''); }}
          icon={FolderPlus}
          title="Create Subfolder"
          actions={[
            { label: 'Cancel', onPress: () => { setShowCreateFolderModal(false); setNewFolderName(''); }, variant: 'tertiary' },
            { label: 'Create', onPress: confirmCreateFolder, variant: 'primary' },
          ]}
        >
          <View style={{ width: '100%' }}>
            <TextField
              placeholder="Folder name"
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
              maxLength={MAX_NAME_LENGTH}
              accessibilityLabel="Folder name"
              helper={`${newFolderName.length}/${MAX_NAME_LENGTH}`}
            />
          </View>
        </Dialog>
      )}

      <Dialog
        visible={!!importingName}
        onRequestClose={() => {}}
        dismissOnBackdropPress={false}
        title={`Importing ${importingName ?? ''}`}
      >
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: space(2) }} />
      </Dialog>

      <Dialog
        visible={!!importedName}
        onRequestClose={() => setImportedName(null)}
        icon={CheckCircle}
        iconColor={colors.success}
        title={`${importedName ?? ''} imported`}
        actions={[{ label: 'OK', onPress: () => setImportedName(null), variant: 'primary' }]}
      />

      <Dialog
        visible={!!importingProgress}
        onRequestClose={() => {}}
        dismissOnBackdropPress={false}
        title={importingProgress ? `Importing ${importingProgress.current} of ${importingProgress.total}…` : ''}
      >
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: space(2) }} />
      </Dialog>

      <Dialog
        visible={!!importedSummary}
        onRequestClose={() => setImportedSummary(null)}
        icon={CheckCircle}
        iconColor={colors.success}
        title={importedSummary
          ? importedSummary.failed > 0
            ? `${importedSummary.succeeded} imported, ${importedSummary.failed} skipped (not a photo or video)`
            : importedSummary.succeeded === 1 && importedSummary.lastSucceededName
              ? `${importedSummary.lastSucceededName} imported`
              : `${importedSummary.succeeded} imported`
          : ''}
        actions={[{ label: 'OK', onPress: () => setImportedSummary(null), variant: 'primary' }]}
      />

      <Sheet visible={showFileMenu && !!targetFile} onClose={() => setShowFileMenu(false)} title={targetFile?.name || 'File Actions'}>
        {fileMenuItems.map((item) => (
          <TouchableOpacity
            key={item.action}
            style={[styles.actionSheetItem, { borderBottomColor: colors.borderLight, paddingHorizontal: space(5), paddingVertical: space(4) }]}
            onPress={() => handleFileAction(item.action)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Text style={[styles.actionSheetLabel, { color: item.color, fontSize: font(Type.body.size) }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </Sheet>

      <Sheet visible={showFolderMenu && !!folderRecord} onClose={() => setShowFolderMenu(false)} title={folderRecord?.name}>
        {folderMenuItems.map((item) => (
          <TouchableOpacity
            key={item.action}
            style={[styles.actionSheetItem, { borderBottomColor: colors.borderLight, paddingHorizontal: space(5), paddingVertical: space(4) }]}
            onPress={() => handleFolderAction(item.action)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Text style={[styles.actionSheetLabel, { color: item.color, fontSize: font(Type.body.size) }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </Sheet>

      {!isAlbum && (
        <Sheet visible={showSubfolderMenu && !!targetSubfolder} onClose={() => setShowSubfolderMenu(false)} title={targetSubfolder?.name}>
          {subfolderMenuItems.map((item) => (
            <TouchableOpacity
              key={item.action}
              style={[styles.actionSheetItem, { borderBottomColor: colors.borderLight, paddingHorizontal: space(5), paddingVertical: space(4) }]}
              onPress={() => handleSubfolderAction(item.action)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Text style={[styles.actionSheetLabel, { color: item.color, fontSize: font(Type.body.size) }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </Sheet>
      )}

      <AccessKeyPicker
        visible={showPasswordPicker}
        onClose={() => { setShowPasswordPicker(false); setPasswordPickerTarget(null); }}
        onSelectPassword={async (passwordId) => {
          if (passwordPickerTarget) {
            const keyLabel = accessKeys.find(k => k.id === passwordId)?.label ?? 'Access key';
            if (passwordPickerTarget.type === 'bulk') {
              const count = selectedFileIds.length + selectedFolderIds.length;
              let succeeded = 0;
              for (const fileId of selectedFileIds) {
                try { await assignFileAccessKey(fileId, passwordId); succeeded++; } catch { /* counted via count - succeeded */ }
              }
              for (const folderId of selectedFolderIds) {
                try { await assignFolderAccessKey(folderId, passwordId); succeeded++; } catch { /* counted via count - succeeded */ }
              }
              if (succeeded === 0) {
                showTopToast(`Failed to assign ${keyLabel}`, 'error');
              } else if (succeeded === count) {
                showTopToast(`${keyLabel} has been assigned to ${count} items`);
              } else {
                showTopToast(`${keyLabel} has been assigned to ${succeeded} of ${count} items`);
              }
            } else {
              try {
                if (passwordPickerTarget.type === 'file') {
                  await assignFileAccessKey(passwordPickerTarget.id, passwordId);
                } else {
                  await assignFolderAccessKey(passwordPickerTarget.id, passwordId);
                }
                showTopToast(`${keyLabel} has been assigned to ${passwordPickerTarget.name}`);
              } catch {
                showTopToast(`Failed to assign ${keyLabel}`, 'error');
              }
            }
          }
          setShowPasswordPicker(false);
          setPasswordPickerTarget(null);
        }}
      />

      <AccessKeyRegistrationModal
        visible={showCreateKeyModal}
        target={keyCreateTarget ? { id: keyCreateTarget.id, name: keyCreateTarget.name, type: keyCreateTarget.targetType } : null}
        selectedItemIds={keyCreateTarget?.targetType === 'bulk' ? [...selectedFileIds, ...selectedFolderIds] : [keyCreateTarget?.id ?? '']}
        itemTypes={{ ...Object.fromEntries(selectedFileIds.map(id => [id, 'file'])), ...Object.fromEntries(selectedFolderIds.map(id => [id, 'folder'])) }}
        onClose={() => { setShowCreateKeyModal(false); setKeyCreateTarget(null); }}
        onSuccess={(_id, label, assignedCount, totalCount) => {
          // "created and assigned" — see dashboard.tsx's identical wiring
          // for why this flow says both instead of just "assigned".
          if (assignedCount !== undefined && totalCount !== undefined) {
            showTopToast(assignedCount === totalCount
              ? `${label} created and assigned to ${totalCount} item${totalCount !== 1 ? 's' : ''}`
              : `${label} created and assigned to ${assignedCount} of ${totalCount} items`);
          } else {
            showTopToast(`${label} created and assigned to ${keyCreateTarget?.name ?? 'selected items'}`);
          }
          setShowCreateKeyModal(false);
          setKeyCreateTarget(null);
        }}
        onError={(message) => showTopToast(message, 'error')}
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
  scrollBody: {},
  gridRow: { flexDirection: 'row' },
  rowItemFill: { flex: 1 },

  headerRightRow: { flexDirection: 'row', alignItems: 'center' },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  searchBar: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontWeight: '500' },

  metricRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  metricItem: { alignItems: 'center', flex: 1 },
  metricValue: { fontWeight: '800' },
  metricLabel: { fontWeight: '500', marginTop: 2 },
  metricDivider: { width: StyleSheet.hairlineWidth, height: 28 },

  actionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  addFileButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  iconActionPill: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  outlinedSelectButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  deleteAllButton: { alignItems: 'center', justifyContent: 'center' },

  actionSheetItem: { borderBottomWidth: StyleSheet.hairlineWidth },
  actionSheetLabel: { fontWeight: '500' },
});
