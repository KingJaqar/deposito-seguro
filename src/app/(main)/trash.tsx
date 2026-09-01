// File: src/app/(main)/trash.tsx
// Rebuilt per plans/you-are-a-senior-majestic-swing.md §3/§7 Phase 4, then
// extended per plans/trash 3 segment feature plan.md Phase 3: a
// Files / Folders / Albums segmented control on top of the same screen, so
// deleted folders and albums (now real, restorable trash citizens as of
// Phase 1/2 of that plan — see vaultStore.ts's deleteFolder/
// restoreFolderFromTrash/shredFolder) are actually reachable and recoverable
// instead of only ever showing trashed files.
// Every Files-segment store hook and handler body is unchanged from before
// this phase (handleShred, handleRestore + its I-12 fallback-folder warning,
// toggleSelection, the filter/sort/group pipeline) — Folders/Albums are
// layered on top via their own parallel single-item handlers and by
// branching the shared bulk (Restore selected / Delete selected / Delete
// All) handlers on `segment`.
import {
  Box,
  CheckSquare,
  GalleryHorizontalEnd,
  ListFilter,
  RotateCcw,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AnimatedTabBar from '../../components/AnimatedTabBar';
import { TabRootHeader } from '../../components/TabRootHeader';
import { ViewModeMenu } from '../../components/ViewModeMenu';
import { SortMenu } from '../../components/SortMenu';
import { DestructiveConfirmModal, useConfirmDestructive } from '../../components/DestructiveConfirmModal';
import { Button } from '../../components/primitives/Button';
import { Card } from '../../components/primitives/Card';
import { Chip } from '../../components/primitives/Chip';
import { Dialog } from '../../components/primitives/Dialog';
import { EmptyState } from '../../components/primitives/EmptyState';
import { getFileTypeMeta } from '../../components/primitives/FileTypeIcon';
import { FileGridTile } from '../../components/primitives/FileTile';
import { GridTile } from '../../components/primitives/GridTile';
import { RootFolderIcon } from '../../components/primitives/RootFolderIcon';
import { SubfolderIcon } from '../../components/primitives/SubfolderIcon';
import { SegmentedControl } from '../../components/primitives/SegmentedControl';
import { TopToast, useTopToast, bulkOutcomeToast } from '../../components/primitives/TopToast';
import { CategoryTint } from '../../constants/Colors';
import { Type } from '../../constants/typography';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlbumCoverUri } from '../../hooks/useAlbumCoverUri';
import { MIN_TOUCH_TARGET } from '../../utils/responsive';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';
import { FolderMetadata } from '../../types';
import { getFolderPathLabel } from '../../utils/folderStats';
import { sortFiles, sortFolders, SortKey } from '../../utils/vaultSort';

const DEFAULT_SORT: SortKey = 'date_desc';

type TrashSegment = 'files' | 'folders' | 'albums';
type FileTypeFilter = 'all' | 'image' | 'video' | 'document' | 'audio' | 'other';

interface TrashedFile {
  id: string;
  name: string;
  isTrash: boolean;
  folderId?: string | null;
  mimeType?: string;
  size?: number;
  deletedAt?: number | string;
  [key: string]: any;
}

/** Enriched trashed folder/album — deletedAt always defined (defaults to 0), matching TrashedFile's own enrichment. */
interface TrashedFolderItem extends FolderMetadata {
  deletedAt: number;
}

const FILE_TYPE_MAP: Record<FileTypeFilter, string> = {
  all: 'All',
  image: 'Images',
  video: 'Videos',
  document: 'Documents',
  audio: 'Audio',
  other: 'Other',
};

const SEGMENT_OPTIONS: { value: TrashSegment; label: string }[] = [
  { value: 'files', label: 'Files' },
  { value: 'folders', label: 'Folders' },
  { value: 'albums', label: 'Albums' },
];

const SEGMENT_NOUN: Record<TrashSegment, string> = { files: 'file', folders: 'folder', albums: 'album' };
const SEGMENT_LABEL: Record<TrashSegment, string> = { files: 'Files', folders: 'Folders', albums: 'Albums' };

function detectType(name: string): FileTypeFilter {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'].includes(ext)) return 'document';
  if (['mp3', 'wav', 'aac', 'ogg', 'flac'].includes(ext)) return 'audio';
  return 'other';
}

function formatDeletedAt(value: number | string): string {
  const d = new Date(value);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Compact one-line "deleted on" date+time for grid tiles — still date and
// time like formatDeletedAt, just without the year when it's the current
// year, so it fits under the name/type labels at small tile widths.
function formatDeletedAtShort(value: number | string): string {
  const d = new Date(value);
  const now = new Date();
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Trash 3-segment plan §4b: generalized from the old file-only groupByDate
 * so Files/Folders/Albums can all share the same "Today / Yesterday / This
 * Week / This Month / Older" bucketing, keyed by whatever `deletedAt` each
 * segment's items carry.
 */
function groupByDate<T extends { deletedAt?: number | string }>(items: T[]): { label: string; data: T[] }[] {
  const groups: Record<string, T[]> = {};
  const now = new Date();

  items.forEach(item => {
    const d = new Date(item.deletedAt ?? 0);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);

    let label: string;
    if (diffDays === 0) label = 'Today';
    else if (diffDays === 1) label = 'Yesterday';
    else if (diffDays < 7) label = 'This Week';
    else if (diffDays < 30) label = 'This Month';
    else label = 'Older';

    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  });

  const ORDER = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
  return ORDER.filter(l => groups[l]).map(l => ({ label: l, data: groups[l] }));
}

// Resolves the icon, tint color, and short label for a trashed file. Now
// delegates to the design system's shared getFileTypeMeta (§5) instead of
// re-implementing the same mimeType branching inline; the filename-extension
// document fallback is preserved so extension-only docs still get the doc
// treatment, matching the previous behavior exactly.
function getFileVisual(item: TrashedFile) {
  const mimeType: string = item.mimeType || '';
  const name: string = item.name || '';
  const meta = getFileTypeMeta(mimeType, name);

  if (meta.tag === 'other' && detectType(name) === 'document') {
    return { label: 'File', color: CategoryTint.docs, Icon: meta.Icon };
  }
  return {
    label: meta.tag === 'doc' || meta.tag === 'other' ? 'File' : meta.label,
    color: meta.color,
    Icon: meta.tag === 'other' ? Box : meta.Icon,
  };
}

/** Root-level trashed folder gets RootFolderIcon, a nested one gets SubfolderIcon — mirrors dashboard.tsx's own root/sub icon resolution. */
function folderVisualIcon(item: TrashedFolderItem) {
  return item.parentId ? SubfolderIcon : RootFolderIcon;
}

export default function TrashScreen() {
  const { colors, space, font, radius, screenPadding, bottomTabSpacing, iconSize } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const viewMode = useSettingsStore((s: any) => s.viewMode);
  const {
    files,
    folders,
    restoreFileFromTrash,
    restoreFilesFromTrash,
    restoreFolderFromTrash,
    restoreFoldersFromTrash,
    permanentlyDeleteFile,
    permanentlyDeleteFiles,
    shredFolder,
    shredMultipleFolders,
  } = useVaultStore();
  const { confirmState: delConfirm, confirm: confirmDestructive, close: closeDelConfirm } = useConfirmDestructive();
  const { topToastState, showTopToast } = useTopToast();

  const [segment, setSegment] = useState<TrashSegment>('files');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>('all');
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [showFilters, setShowFilters] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [restoreConfirm, setRestoreConfirm] = useState<{ visible: boolean; title: string; message: string; onConfirm: () => void }>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const closeRestoreConfirm = useCallback(() => {
    setRestoreConfirm(prev => ({ ...prev, visible: false }));
  }, []);

  const exitSelectionMode = useCallback(() => { setSelectionMode(false); setSelectedIds([]); }, []);

  const changeSegment = useCallback((next: TrashSegment) => {
    setSegment(next);
    exitSelectionMode();
  }, [exitSelectionMode]);

  const enrichedFiles: TrashedFile[] = useMemo(() => {
    return (files as TrashedFile[])
      .filter(f => f.isTrash)
      .map(f => ({
        ...f,
        deletedAt: f.deletedAt ?? 0,
      }));
  }, [files]);

  const filtered = useMemo(() => {
    let result = enrichedFiles;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(q));
    }

    if (typeFilter !== 'all') {
      result = result.filter(f => detectType(f.name) === typeFilter);
    }

    // dateField: 'deletedAt' — trash's date_* keys sort by deletion time,
    // not import time (Fix 1). size_*/type_* are now available here too,
    // previously unique to this screen's old 4-option sort.
    result = sortFiles(result, sort, { dateField: 'deletedAt' });

    return result;
  }, [enrichedFiles, search, typeFilter, sort]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  // Trash 3-segment plan §4b: Folders/Albums pipelines. Deliberately no
  // type-filter chip application (that row only makes sense for file mime
  // types — hidden entirely outside the Files segment, see below).
  const filteredFolders = useMemo(() => {
    let result: TrashedFolderItem[] = (folders as TrashedFolderItem[])
      .filter(f => f.isTrash && f.type !== 'album')
      .map(f => ({ ...f, deletedAt: f.deletedAt ?? 0 }));

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(q));
    }

    return sortFolders(result, sort, { dateField: 'deletedAt' });
  }, [folders, search, sort]);

  const filteredAlbums = useMemo(() => {
    let result: TrashedFolderItem[] = (folders as TrashedFolderItem[])
      .filter(f => f.isTrash && f.type === 'album')
      .map(f => ({ ...f, deletedAt: f.deletedAt ?? 0 }));

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(q));
    }

    return sortFolders(result, sort, { dateField: 'deletedAt' });
  }, [folders, search, sort]);

  const groupedFolders = useMemo(() => groupByDate(filteredFolders), [filteredFolders]);
  const groupedAlbums = useMemo(() => groupByDate(filteredAlbums), [filteredAlbums]);

  // The segment's own visible list — drives count text, select-all, "Delete
  // All", and the empty state, the same way `filtered` alone used to.
  const activeList: (TrashedFile | TrashedFolderItem)[] =
    segment === 'files' ? filtered : segment === 'folders' ? filteredFolders : filteredAlbums;
  const activeGrouped = segment === 'files' ? grouped : segment === 'folders' ? groupedFolders : groupedAlbums;
  const isFolderSegment = segment === 'folders' || segment === 'albums';

  const handleShred = useCallback((id: string, name: string) => {
    confirmDestructive(
      'Permanently Delete File',
      `"${name}" will be destroyed forever.`,
      async () => {
        try {
          await permanentlyDeleteFile(id);
          showTopToast(`${name} deleted permanently`);
        } catch {
          showTopToast(`Failed to delete ${name} permanently`, 'error');
        }
      },
      'Delete'
    );
  }, [confirmDestructive, permanentlyDeleteFile, showTopToast]);

  // Trash 3-segment plan §4d: Folders/Albums single-item permanent delete —
  // same confirm-modal pattern as handleShred, through the cascade-fixed
  // shredFolder (§2b).
  const handleShredFolder = useCallback((id: string, name: string, isAlbum: boolean) => {
    confirmDestructive(
      `Permanently Delete ${isAlbum ? 'Album' : 'Folder'}`,
      `"${name}" and everything inside it will be destroyed forever.`,
      async () => {
        try {
          await shredFolder(id);
          showTopToast(`${name} deleted permanently`);
        } catch {
          showTopToast(`Failed to delete ${name} permanently`, 'error');
        }
      },
      'Delete'
    );
  }, [confirmDestructive, shredFolder, showTopToast]);

  // "Delete All" — now segment-aware: acts on whichever list is currently
  // visible (respecting search), matching the Files segment's pre-existing
  // "delete everything currently shown" behavior.
  const handleDeleteAllVisible = useCallback(() => {
    if (activeList.length === 0) return;
    const count = activeList.length;
    const noun = SEGMENT_NOUN[segment];
    confirmDestructive(
      `Delete All ${SEGMENT_LABEL[segment]}?`,
      `This will permanently delete all ${count} ${noun}${count !== 1 ? 's' : ''}${isFolderSegment ? ' and everything inside them' : ''}.`,
      async () => {
        try {
          if (segment === 'files') {
            await permanentlyDeleteFiles(filtered.map(f => f.id));
          } else {
            await shredMultipleFolders(activeList.map(f => f.id));
          }
          showTopToast(`${count} ${noun}${count !== 1 ? 's' : ''} deleted permanently`);
        } catch {
          showTopToast(`Failed to delete ${count} ${noun}${count !== 1 ? 's' : ''} permanently`, 'error');
        }
      },
      'Delete All'
    );
  }, [activeList, segment, isFolderSegment, filtered, confirmDestructive, permanentlyDeleteFiles, shredMultipleFolders, showTopToast]);

  // I-12: restoreFileFromTrash reports when a file's original folder no
  // longer exists (it lands in an unprotected auto-created "Restored Files"
  // folder instead) — warn the user rather than silently losing that context.
  const handleRestore = useCallback((fileId: string, name: string) => {
    setRestoreConfirm({
      visible: true,
      title: 'Restore File',
      message: `"${name}" will be moved back to its original location.`,
      onConfirm: async () => {
        try {
          const { landedInFallbackFolder, folderId, filePreservedAccessKey } = await restoreFileFromTrash(fileId);
          // Read folders fresh off the store rather than this callback's
          // captured closure — a fallback "Restored Files" folder can have
          // just been created by the restore above, and the closure's
          // `folders` won't include it until the next render.
          const freshFolders = useVaultStore.getState().folders;
          const locationLabel = getFolderPathLabel(folderId, freshFolders);
          // Every other entry point into a locked folder (dashboard's
          // handleVaultPress, favorites'/search's handleFolderNavigate)
          // gates navigation behind the access-key unlock modal first —
          // jumping straight there from this toast would bypass that lock,
          // so only make the toast tappable when the destination isn't
          // access-key protected.
          const destinationFolder = folderId ? freshFolders.find(f => f.id === folderId) : undefined;
          const isLocked = !!(destinationFolder?.hasAccessKey || destinationFolder?.accessKeyId);
          showTopToast(
            `${name} restored in `,
            'success',
            // folderId branch is a real drill-down (push, keeps trash beneath
            // for back); the no-folderId branch lands on the dashboard tab
            // root, so it uses replace like every other tab-root jump (see
            // AnimatedTabBar.tsx) instead of stacking a dashboard instance on
            // top of trash each time a restored-file toast is tapped.
            isLocked ? undefined : () => (folderId
              ? router.push({ pathname: '/(main)/folder/[id]', params: { id: folderId } })
              : router.replace('/(main)/dashboard')),
            locationLabel
          );
          if (landedInFallbackFolder) {
            // I-12: hasAccessKey/accessKeyId (the file's own, or one
            // snapshotted from the original folder by deleteFolder) survive
            // this restore even though the destination folder doesn't
            // require unlocking — say so accurately instead of implying the
            // file is now fully exposed.
            // Bug fix (post-plan review): §2d gives the fallback folder a
            // freshly *dated* name (e.g. "Restored Files – Aug 31, 2026,
            // 3:52:04 PM"), not the literal fixed name "Restored Files" this
            // alert used to hardcode — which read as flatly wrong right next
            // to the toast above showing the real name via `locationLabel`.
            // Interpolate the actual destination name instead of quoting a
            // name that no longer exists.
            Alert.alert(
              `Restored to "${destinationFolder?.name ?? 'a new folder'}"`,
              filePreservedAccessKey
                ? `This file's original folder no longer exists, so it was restored into the "${destinationFolder?.name ?? 'new'}" folder, which anyone can browse into. The file itself is still password-protected, so its contents stay locked.`
                : `This file's original folder no longer exists, so it was restored into the unprotected "${destinationFolder?.name ?? 'new'}" folder instead of its original (possibly password/encryption-protected) location.`
            );
          }
        } catch {
          showTopToast(`Failed to restore ${name}`, 'error');
        }
      },
    });
  }, [restoreFileFromTrash, showTopToast]);

  // Trash 3-segment plan §4d: Folders/Albums single-item restore — same
  // Dialog, through restoreFolderFromTrash (§2c), with a generic (not
  // file-specific "still password-protected") fallback-folder warning per
  // the plan's own wording call.
  const handleRestoreFolder = useCallback((folderId: string, name: string, isAlbum: boolean) => {
    setRestoreConfirm({
      visible: true,
      title: isAlbum ? 'Restore Album' : 'Restore Folder',
      message: `"${name}" will be moved back to its original location.`,
      onConfirm: async () => {
        try {
          const { landedInFallbackFolder, parentId } = await restoreFolderFromTrash(folderId);
          const freshFolders = useVaultStore.getState().folders;
          const locationLabel = getFolderPathLabel(parentId, freshFolders);
          const destinationFolder = parentId ? freshFolders.find(f => f.id === parentId) : undefined;
          const isLocked = !!(destinationFolder?.hasAccessKey || destinationFolder?.accessKeyId);
          showTopToast(
            `${name} restored in `,
            'success',
            isLocked ? undefined : () => (parentId
              ? router.push({ pathname: '/(main)/folder/[id]', params: { id: parentId } })
              : router.replace('/(main)/dashboard')),
            locationLabel
          );
          if (landedInFallbackFolder) {
            // Bug fix (post-plan review): same fix as handleRestore above —
            // interpolate the real dated fallback-folder name instead of
            // quoting the stale literal "Restored Files".
            Alert.alert(
              `Restored to "${destinationFolder?.name ?? 'a new folder'}"`,
              `This ${isAlbum ? 'album' : 'folder'}'s original location no longer exists, so it was restored into a new "${destinationFolder?.name ?? 'folder'}" instead.`
            );
          }
        } catch {
          showTopToast(`Failed to restore ${name}`, 'error');
        }
      },
    });
  }, [restoreFolderFromTrash, showTopToast]);

  // Trash 3-segment plan §4d: bulk restore now branches on `segment` —
  // Files uses the batched restoreFilesFromTrash (one shared fallback
  // folder for the whole selection, applied in a single commitVaultState)
  // instead of the old Promise.allSettled(selectedIds.map(restoreFileFromTrash))
  // loop; Folders/Albums use the equivalent restoreFoldersFromTrash.
  const handleRestoreSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    const noun = SEGMENT_NOUN[segment];
    setRestoreConfirm({
      visible: true,
      title: `Restore ${SEGMENT_LABEL[segment]}`,
      message: `${count} ${noun}${count === 1 ? '' : 's'} will be moved back to their original location.`,
      onConfirm: async () => {
        try {
          if (segment === 'files') {
            const results = await restoreFilesFromTrash(selectedIds);
            setSelectedIds([]);
            setSelectionMode(false);
            const { message, tone } = bulkOutcomeToast(results.length, count, 'file', 'restored', 'restore');
            showTopToast(message, tone);
            const landedInFallback = results.filter(r => r.landedInFallbackFolder);
            if (landedInFallback.length > 0) {
              const allPreserved = landedInFallback.every(r => r.filePreservedAccessKey);
              // Bug fix (post-plan review): restoreFilesFromTrash shares ONE
              // dated fallback folder across the whole batch, so every
              // landed-in-fallback result carries the same folderId — look
              // its real name up instead of quoting the stale literal
              // "Restored Files".
              const fallbackName = useVaultStore.getState().folders.find(f => f.id === landedInFallback[0].folderId)?.name ?? 'a new folder';
              Alert.alert(
                `Some Files Restored to "${fallbackName}"`,
                allPreserved
                  ? `One or more original folders no longer exist, so those files were restored into the "${fallbackName}" folder, which anyone can browse into. Those files are still password-protected, so their contents stay locked.`
                  : `One or more original folders no longer exist, so those files were restored into the unprotected "${fallbackName}" folder instead.`
              );
            }
          } else {
            const results = await restoreFoldersFromTrash(selectedIds);
            setSelectedIds([]);
            setSelectionMode(false);
            const { message, tone } = bulkOutcomeToast(results.length, count, noun, 'restored', 'restore');
            showTopToast(message, tone);
            const landedInFolderFallback = results.find(r => r.landedInFallbackFolder);
            if (landedInFolderFallback) {
              // Bug fix (post-plan review): same shared-fallback-folder name
              // lookup as the Files branch above, instead of quoting the
              // stale literal "Restored Files".
              const fallbackName = useVaultStore.getState().folders.find(f => f.id === landedInFolderFallback.parentId)?.name ?? 'a new folder';
              Alert.alert(
                `Some ${SEGMENT_LABEL[segment]} Restored to "${fallbackName}"`,
                `One or more original locations no longer exist, so some ${noun}s were restored into a new "${fallbackName}" folder instead.`
              );
            }
          }
        } catch {
          showTopToast(`Failed to restore ${noun}s`, 'error');
          setSelectedIds([]);
          setSelectionMode(false);
        }
      },
    });
  }, [selectedIds, segment, restoreFilesFromTrash, restoreFoldersFromTrash, showTopToast]);

  const handleShredSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    const noun = SEGMENT_NOUN[segment];
    confirmDestructive(
      `Delete Selected ${SEGMENT_LABEL[segment]}?`,
      `This will permanently delete ${count} ${noun}${count !== 1 ? 's' : ''}${isFolderSegment ? ' and everything inside them' : ''}.`,
      async () => {
        try {
          if (segment === 'files') {
            await permanentlyDeleteFiles(selectedIds);
          } else {
            await shredMultipleFolders(selectedIds);
          }
          showTopToast(`${count} ${noun}${count !== 1 ? 's' : ''} deleted permanently`);
        } catch {
          showTopToast(`Failed to delete ${count} ${noun}${count !== 1 ? 's' : ''} permanently`, 'error');
        }
      },
      'Delete'
    );
  }, [selectedIds, segment, isFolderSegment, confirmDestructive, permanentlyDeleteFiles, shredMultipleFolders, showTopToast]);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleFilters = () => {
    setShowFilters(!showFilters);
  };

  const getGridColumns = (mode: string) => {
    if (mode === 'list') return 1;
    if (mode === 'small-icons') return 5;
    if (mode === 'medium-icons') return 3;
    return 2;
  };
  const getGridItemWidth = (mode: string) => {
    const cols = getGridColumns(mode);
    // Google Photos-style dense grid: a hairline-scale gutter instead of a
    // full card gap (see GridTile, which also drops the Card border/shadow).
    const gap = space(1);
    return (screenWidth - screenPadding * 2 - gap * (cols - 1)) / cols;
  };
  const isGridMode = viewMode !== 'list';
  const gridItemWidth = getGridItemWidth(viewMode);

  const categoryTintFor = (k: FileTypeFilter) =>
    k === 'all' ? colors.primary
      : k === 'image' ? CategoryTint.images
        : k === 'video' ? CategoryTint.videos
          : k === 'document' ? CategoryTint.docs
            : k === 'audio' ? CategoryTint.audio
              : CategoryTint.other;

  // Compact single-line row: icon + name/meta + a pair of icon-only actions,
  // no divider or full-width labeled buttons — keeps each entry to one
  // touch-target-tall band instead of a tall card.
  const TrashRow = ({ item }: { item: TrashedFile }) => {
    const visual = getFileVisual(item);
    const isSelected = selectedIds.includes(item.id);
    const VisualIcon = visual.Icon;

    return (
      <Card
        onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
        onPress={() => { if (selectionMode) toggleSelection(item.id); }}
        accessibilityLabel={item.name}
        style={[
          styles.rowCard,
          {
            marginBottom: space(2),
            padding: space(3),
            borderRadius: radius(6),
            backgroundColor: isSelected ? `${colors.primary}14` : colors.surfaceElevated,
            borderColor: colors.borderLight,
            borderWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        <View style={[styles.rowTop, { gap: space(3) }]}>
          {selectionMode && (
            <Pressable
              onPress={() => toggleSelection(item.id)}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`Select ${item.name}`}
            >
              {isSelected ? (
                <CheckSquare size={iconSize(22)} color={colors.primary} strokeWidth={2} />
              ) : (
                <Square size={iconSize(22)} color={colors.textMuted} strokeWidth={2} />
              )}
            </Pressable>
          )}

          <View style={[styles.iconChip, { backgroundColor: `${visual.color}1F`, borderRadius: radius(3) }]}>
            <VisualIcon size={iconSize(17)} color={visual.color} strokeWidth={2} />
          </View>

          <View style={styles.rowInfo}>
            <Text style={[styles.rowName, { color: colors.text, fontSize: font(Type.body.size) }]} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={[styles.rowMetaRow, { gap: space(2) }]}>
              <Text style={[styles.rowMeta, { color: visual.color, fontSize: font(Type.caption.size), fontWeight: '700' }]} numberOfLines={1}>
                {visual.label}
              </Text>
              <View style={[styles.metaDot, { backgroundColor: colors.textMuted }]} />
              <Text style={[styles.rowMeta, { color: colors.textMuted, fontSize: font(Type.caption.size) }]} numberOfLines={1}>
                {formatDeletedAt(item.deletedAt!)}
              </Text>
            </View>
          </View>

          {!selectionMode && (
            <View style={[styles.rowActions, { gap: space(2) }]}>
              <Pressable
                onPress={() => handleRestore(item.id, item.name)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Restore ${item.name}`}
                style={({ pressed }) => [
                  styles.iconAction,
                  {
                    width: iconSize(30),
                    height: iconSize(30),
                    borderRadius: radius(3),
                    backgroundColor: colors.surfaceHover,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <RotateCcw size={iconSize(15)} color={colors.text} strokeWidth={2.25} />
              </Pressable>
              <Pressable
                onPress={() => handleShred(item.id, item.name)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.name}`}
                style={({ pressed }) => [
                  styles.iconAction,
                  {
                    width: iconSize(30),
                    height: iconSize(30),
                    borderRadius: radius(3),
                    backgroundColor: `${colors.error}1F`,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Trash2 size={iconSize(15)} color={colors.error} strokeWidth={2.25} />
              </Pressable>
            </View>
          )}
        </View>
      </Card>
    );
  };

  // Trash 3-segment plan §4c: list-mode row for Folders/Albums — visually
  // identical to TrashRow (icon chip + name + meta row + Restore/Delete icon
  // actions), just sourcing its icon from the folder-type resolution and its
  // meta line from formatDeletedAt + (Folders only) a path caption showing
  // where the item used to live.
  const FolderTrashRow = ({ item, isAlbum }: { item: TrashedFolderItem; isAlbum: boolean }) => {
    const isSelected = selectedIds.includes(item.id);
    const VisualIcon = isAlbum ? GalleryHorizontalEnd : folderVisualIcon(item);
    const pathCaption = isAlbum ? undefined : getFolderPathLabel(item.parentId, folders);

    return (
      <Card
        onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
        onPress={() => { if (selectionMode) toggleSelection(item.id); }}
        accessibilityLabel={item.name}
        style={[
          styles.rowCard,
          {
            marginBottom: space(2),
            padding: space(3),
            borderRadius: radius(6),
            backgroundColor: isSelected ? `${colors.primary}14` : colors.surfaceElevated,
            borderColor: colors.borderLight,
            borderWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        <View style={[styles.rowTop, { gap: space(3) }]}>
          {selectionMode && (
            <Pressable
              onPress={() => toggleSelection(item.id)}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`Select ${item.name}`}
            >
              {isSelected ? (
                <CheckSquare size={iconSize(22)} color={colors.primary} strokeWidth={2} />
              ) : (
                <Square size={iconSize(22)} color={colors.textMuted} strokeWidth={2} />
              )}
            </Pressable>
          )}

          <View style={[styles.iconChip, { backgroundColor: `${colors.primary}1F`, borderRadius: radius(3) }]}>
            <VisualIcon size={iconSize(17)} color={colors.primary} strokeWidth={2} />
          </View>

          <View style={styles.rowInfo}>
            <Text style={[styles.rowName, { color: colors.text, fontSize: font(Type.body.size) }]} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={[styles.rowMetaRow, { gap: space(2) }]}>
              <Text style={[styles.rowMeta, { color: colors.textMuted, fontSize: font(Type.caption.size) }]} numberOfLines={1}>
                {formatDeletedAt(item.deletedAt)}
              </Text>
              {!!pathCaption && (
                <>
                  <View style={[styles.metaDot, { backgroundColor: colors.textMuted }]} />
                  <Text style={[styles.rowMeta, { color: colors.textMuted, fontSize: font(Type.caption.size) }]} numberOfLines={1}>
                    {pathCaption}
                  </Text>
                </>
              )}
            </View>
          </View>

          {!selectionMode && (
            <View style={[styles.rowActions, { gap: space(2) }]}>
              <Pressable
                onPress={() => handleRestoreFolder(item.id, item.name, isAlbum)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Restore ${item.name}`}
                style={({ pressed }) => [
                  styles.iconAction,
                  {
                    width: iconSize(30),
                    height: iconSize(30),
                    borderRadius: radius(3),
                    backgroundColor: colors.surfaceHover,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <RotateCcw size={iconSize(15)} color={colors.text} strokeWidth={2.25} />
              </Pressable>
              <Pressable
                onPress={() => handleShredFolder(item.id, item.name, isAlbum)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.name}`}
                style={({ pressed }) => [
                  styles.iconAction,
                  {
                    width: iconSize(30),
                    height: iconSize(30),
                    borderRadius: radius(3),
                    backgroundColor: `${colors.error}1F`,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Trash2 size={iconSize(15)} color={colors.error} strokeWidth={2.25} />
              </Pressable>
            </View>
          )}
        </View>
      </Card>
    );
  };

  // Trash 3-segment plan §4c: grid tile for a trashed plain folder — a
  // user-picked customThumbnailPath (custom thumbnail plan) still renders
  // here same as everywhere else; falls back to the root/sub icon otherwise.
  const FolderGridTile = ({ item }: { item: TrashedFolderItem }) => {
    const isSelected = selectedIds.includes(item.id);
    const VisualIcon = folderVisualIcon(item);
    return (
      <GridTile
        size={gridItemWidth}
        name={item.name}
        caption={formatDeletedAtShort(item.deletedAt)}
        thumbnailUri={item.customThumbnailPath}
        Icon={VisualIcon}
        iconColor={colors.primary}
        selectable={selectionMode}
        selected={isSelected}
        onPress={() => { if (selectionMode) toggleSelection(item.id); }}
        onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
        onRestorePress={() => handleRestoreFolder(item.id, item.name, false)}
        onDeletePress={() => handleShredFolder(item.id, item.name, false)}
      />
    );
  };

  // Trash 3-segment plan §4c: grid tile for a trashed album — real cover
  // thumbnail via useAlbumCoverUri(albumId, includeTrash: true), since the
  // default (non-Trash) call would always resolve undefined for an album
  // whose own files were just cascade-trashed along with it (see
  // useAlbumCoverUri.ts). Split into its own component because the hook
  // must be called unconditionally per item, not from inside a shared
  // conditional branch.
  const AlbumGridTile = ({ item }: { item: TrashedFolderItem }) => {
    const isSelected = selectedIds.includes(item.id);
    // A user-picked customThumbnailPath (custom thumbnail plan) always wins
    // over the auto-derived cover, same precedence as every other album
    // tile in the app (FileTile.tsx's own AlbumGridTile/AlbumListRow).
    const autoThumbnailUri = useAlbumCoverUri(item.id, true);
    return (
      <GridTile
        size={gridItemWidth}
        name={item.name}
        caption={formatDeletedAtShort(item.deletedAt)}
        Icon={GalleryHorizontalEnd}
        iconColor={colors.primary}
        thumbnailUri={item.customThumbnailPath || autoThumbnailUri}
        selectable={selectionMode}
        selected={isSelected}
        onPress={() => { if (selectionMode) toggleSelection(item.id); }}
        onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
        onRestorePress={() => handleRestoreFolder(item.id, item.name, true)}
        onDeletePress={() => handleShredFolder(item.id, item.name, true)}
      />
    );
  };

  type ListItem =
    | { type: 'section'; label: string }
    | { type: 'file'; file: TrashedFile }
    | { type: 'folder'; folder: TrashedFolderItem };

  const listData: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];
    if (segment === 'files') {
      grouped.forEach(g => {
        items.push({ type: 'section', label: g.label });
        g.data.forEach(f => items.push({ type: 'file', file: f }));
      });
    } else {
      activeGrouped.forEach(g => {
        items.push({ type: 'section', label: g.label });
        (g.data as TrashedFolderItem[]).forEach(f => items.push({ type: 'folder', folder: f }));
      });
    }
    return items;
  }, [segment, grouped, activeGrouped]);

  const searchPlaceholder = segment === 'files'
    ? 'Search deleted files…'
    : segment === 'folders'
      ? 'Search deleted folders…'
      : 'Search deleted albums…';

  const emptyTitle = segment === 'files' ? 'Trash is empty' : segment === 'folders' ? 'No deleted folders' : 'No deleted albums';
  const emptyMessage = segment === 'files'
    ? 'Files you delete will appear here.'
    : segment === 'folders'
      ? 'Folders you delete will appear here.'
      : 'Albums you delete will appear here.';

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      <TabRootHeader
        title="Trash"
        tagline="Deleted items"
        rightSlot={
          <View style={styles.headerControls}>
            <SortMenu value={sort} onChange={setSort} defaultKey={DEFAULT_SORT} />
            <ViewModeMenu />
          </View>
        }
      />

      <View style={styles.flex1}>
        <ScrollView
          contentContainerStyle={[styles.scrollBody, { paddingHorizontal: screenPadding, paddingTop: space(2), paddingBottom: bottomTabSpacing }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ marginBottom: space(3) }}>
            <SegmentedControl
              options={SEGMENT_OPTIONS}
              value={segment}
              onChange={changeSegment}
              accessibilityLabel="Trash segment"
            />
          </View>

          <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.borderLight, borderRadius: radius(5), paddingHorizontal: space(4), marginBottom: space(4), gap: space(2), minHeight: MIN_TOUCH_TARGET }]}>
            <Search size={iconSize(18)} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text, fontSize: font(Type.body.size) }]}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              accessibilityLabel={searchPlaceholder}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                <X size={iconSize(16)} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.filterRow, { marginBottom: space(2) }]}>
            {segment === 'files' ? (
              <Button title="Filters" onPress={toggleFilters} icon={ListFilter} variant="tertiary" size="sm" />
            ) : (
              <View />
            )}
            <View style={styles.headerRightBlock}>
              {!selectionMode && activeList.length > 0 && (
                <Button title="Delete All" onPress={handleDeleteAllVisible} variant="ghost" size="sm" />
              )}
              {!selectionMode && (
                <Text style={[styles.countText, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>
                  {activeList.length} {SEGMENT_NOUN[segment]}{activeList.length === 1 ? '' : 's'}
                </Text>
              )}
            </View>
          </View>

          {segment === 'files' && showFilters && (
            <View style={{ marginTop: space(2), marginBottom: space(2) }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2), paddingVertical: space(2) }}>
                {(Object.keys(FILE_TYPE_MAP) as FileTypeFilter[]).map(k => (
                  <Chip
                    key={k}
                    label={FILE_TYPE_MAP[k]}
                    selected={typeFilter === k}
                    onPress={() => setTypeFilter(k)}
                    color={categoryTintFor(k)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {selectionMode && (
            <View style={[styles.selectionBar, { gap: space(2), paddingBottom: space(3) }]}>
              <Pressable
                onPress={() => {
                  const ids = activeList.map(f => f.id);
                  const allSelected = ids.every(id => selectedIds.includes(id));
                  setSelectedIds(allSelected ? [] : ids);
                }}
                style={[styles.iconActionPill, { backgroundColor: colors.surfaceHover }]}
                accessibilityRole="button"
                accessibilityLabel="Select all"
              >
                <CheckSquare size={iconSize(18)} color={colors.text} strokeWidth={2.5} />
              </Pressable>

              {selectedIds.length > 0 && (
                <>
                  <Text style={[styles.selectionCount, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>
                    {selectedIds.length} selected
                  </Text>
                  <Pressable
                    onPress={handleRestoreSelected}
                    style={[styles.iconActionPill, { backgroundColor: colors.surfaceHover }]}
                    accessibilityRole="button"
                    accessibilityLabel="Restore selected"
                  >
                    <RotateCcw size={iconSize(18)} color={colors.text} strokeWidth={2.5} />
                  </Pressable>
                  <Pressable
                    onPress={handleShredSelected}
                    style={[styles.iconActionPill, { backgroundColor: `${colors.error}18` }]}
                    accessibilityRole="button"
                    accessibilityLabel="Delete selected"
                  >
                    <Trash2 size={iconSize(18)} color={colors.error} strokeWidth={2.5} />
                  </Pressable>
                </>
              )}

              <Pressable onPress={exitSelectionMode} style={styles.textBtn} accessibilityRole="button" accessibilityLabel="Cancel selection">
                <Text style={{ color: colors.textMuted, fontSize: font(Type.label.size), fontWeight: '700' }}>Cancel</Text>
              </Pressable>
            </View>
          )}

          {activeList.length === 0 && !search && (
            <EmptyState icon={Trash2} title={emptyTitle} message={emptyMessage} />
          )}

          {activeList.length === 0 && !!search && (
            <EmptyState icon={Search} title="No results found" message="Try a different search term" />
          )}

          {activeList.length > 0 && (
            isGridMode ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(1) }}>
                {segment === 'files' && filtered.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  const visual = getFileVisual(item);
                  return (
                    <FileGridTile
                      key={item.id}
                      file={item}
                      size={gridItemWidth}
                      name={item.name}
                      subtitle={visual.label}
                      subtitleColor={visual.color}
                      caption={formatDeletedAtShort(item.deletedAt!)}
                      Icon={visual.Icon}
                      iconColor={visual.color}
                      selectable={selectionMode}
                      selected={isSelected}
                      onPress={() => { if (selectionMode) toggleSelection(item.id); }}
                      onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
                      onRestorePress={() => handleRestore(item.id, item.name)}
                      onDeletePress={() => handleShred(item.id, item.name)}
                    />
                  );
                })}
                {segment === 'folders' && filteredFolders.map((item) => (
                  <FolderGridTile key={item.id} item={item} />
                ))}
                {segment === 'albums' && filteredAlbums.map((item) => (
                  <AlbumGridTile key={item.id} item={item} />
                ))}
              </View>
            ) : (
              <FlatList
                data={listData}
                keyExtractor={(item) =>
                  item.type === 'section' ? `section-${item.label}` : item.type === 'file' ? item.file.id : item.folder.id
                }
                nestedScrollEnabled
                scrollEnabled={false}
                contentContainerStyle={{ paddingBottom: space(8) }}
                renderItem={({ item }) => {
                  if (item.type === 'section') {
                    return (
                      <View style={{ marginTop: space(3), marginBottom: space(2) }}>
                        <Text style={[styles.sectionHeader, { color: colors.textMuted, fontSize: font(Type.eyebrow.size) }]}>
                          {item.label}
                        </Text>
                      </View>
                    );
                  }
                  if (item.type === 'file') {
                    return <TrashRow item={item.file} />;
                  }
                  return <FolderTrashRow item={item.folder} isAlbum={segment === 'albums'} />;
                }}
              />
            )
          )}
        </ScrollView>
      </View>

      <AnimatedTabBar />

      <DestructiveConfirmModal state={delConfirm} onClose={closeDelConfirm} />
      <TopToast state={topToastState} />

      <Dialog
        visible={restoreConfirm.visible}
        onRequestClose={closeRestoreConfirm}
        icon={RotateCcw}
        iconColor={colors.primary}
        title={restoreConfirm.title}
        message={restoreConfirm.message}
        actions={[
          { label: 'Cancel', onPress: closeRestoreConfirm, variant: 'tertiary' },
          {
            label: 'Restore',
            variant: 'primary',
            onPress: () => {
              closeRestoreConfirm();
              restoreConfirm.onConfirm();
            },
          },
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  scrollBody: {},
  headerControls: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  searchBar: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontWeight: '500' },

  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerRightBlock: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countText: { fontWeight: '500' },

  // Matches search.tsx's renderSelectionToolbar exactly: a row of circular
  // icon pills plus a plain "Cancel" text link, instead of the old row of
  // full-width labeled Restore/Shred/Select All/Cancel buttons.
  selectionBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  // Phase 5 (§6 MIN_TOUCH_TARGET audit) sizing, same as search.tsx's pill.
  iconActionPill: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  textBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  selectionCount: { fontWeight: '600' },

  sectionHeader: { fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },

  rowCard: { shadowOpacity: 0, elevation: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  iconChip: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontWeight: '700', letterSpacing: -0.2, marginBottom: 2 },
  rowMetaRow: { flexDirection: 'row', alignItems: 'center' },
  rowMeta: { fontWeight: '500' },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, opacity: 0.6 },

  rowActions: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  iconAction: { alignItems: 'center', justifyContent: 'center' },
});
