// File: src/app/(main)/trash.tsx
// Rebuilt per plans/you-are-a-senior-majestic-swing.md §3/§7 Phase 4.
// Every store hook and handler body is unchanged (handleShred, handleShredAll,
// handleRestore + its I-12 fallback-folder warning, handleRestoreSelected,
// handleShredSelected, toggleSelection, the filter/sort/group pipeline).
// Notable per-plan changes:
//  - TabRootHeader + Card/Chip/ListRow/EmptyState/Sheet primitives
//  - the `dash` alias object and its 8 colors.dashboardX chains are gone
//  - the local getFileVisual duplicate of getFileType's classification logic
//    (§5 "resolves trash.tsx's separate inline duplicate") now delegates to
//    the shared getFileTypeMeta; only the extension-based `detectType`
//    fallback for documents is kept, since the type FILTER still needs it
//  - hardcoded '#5162FF'/'#7C82E8'/'#DC2626' etc. replaced with real tokens
//  - SafeAreaView added with explicit edges (the old root was a bare View
//    with a hardcoded paddingTop: 50)
import {
  Box,
  CheckSquare,
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
import { DestructiveConfirmModal, useConfirmDestructive } from '../../components/DestructiveConfirmModal';
import { Button } from '../../components/primitives/Button';
import { Card } from '../../components/primitives/Card';
import { Chip } from '../../components/primitives/Chip';
import { Dialog } from '../../components/primitives/Dialog';
import { EmptyState } from '../../components/primitives/EmptyState';
import { getFileTypeMeta } from '../../components/primitives/FileTypeIcon';
import { FileGridTile } from '../../components/primitives/FileTile';
import { TopToast, useTopToast, bulkOutcomeToast } from '../../components/primitives/TopToast';
import { CategoryTint } from '../../constants/Colors';
import { Type } from '../../constants/typography';
import { useTheme } from '../../contexts/ThemeContext';
import { MIN_TOUCH_TARGET } from '../../utils/responsive';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';
import { getFolderPathLabel } from '../../utils/folderStats';

type SortKey = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc';
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

const FILE_TYPE_MAP: Record<FileTypeFilter, string> = {
  all: 'All',
  image: 'Images',
  video: 'Videos',
  document: 'Documents',
  audio: 'Audio',
  other: 'Other',
};

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

function groupByDate(files: TrashedFile[]): { label: string; data: TrashedFile[] }[] {
  const groups: Record<string, TrashedFile[]> = {};
  const now = new Date();

  files.forEach(f => {
    const d = new Date(f.deletedAt!);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);

    let label: string;
    if (diffDays === 0) label = 'Today';
    else if (diffDays === 1) label = 'Yesterday';
    else if (diffDays < 7) label = 'This Week';
    else if (diffDays < 30) label = 'This Month';
    else label = 'Older';

    if (!groups[label]) groups[label] = [];
    groups[label].push(f);
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

export default function TrashScreen() {
  const { colors, space, font, radius, screenPadding, bottomTabSpacing , iconSize } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const viewMode = useSettingsStore((s: any) => s.viewMode);
  const { files, restoreFileFromTrash, permanentlyDeleteFile, permanentlyDeleteFiles } = useVaultStore();
  const { confirmState: delConfirm, confirm: confirmDestructive, close: closeDelConfirm } = useConfirmDestructive();
  const { topToastState, showTopToast } = useTopToast();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>('all');
  const [sort, setSort] = useState<SortKey>('date_desc');
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

    result = [...result].sort((a, b) => {
      switch (sort) {
        case 'date_desc': return new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime();
        case 'date_asc': return new Date(a.deletedAt!).getTime() - new Date(b.deletedAt!).getTime();
        case 'name_asc': return a.name.localeCompare(b.name);
        case 'name_desc': return b.name.localeCompare(a.name);
      }
    });

    return result;
  }, [enrichedFiles, search, typeFilter, sort]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

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

  const handleShredAll = useCallback(() => {
    if (filtered.length === 0) return;
    const count = filtered.length;
    confirmDestructive(
      'Delete All Files?',
      `This will permanently delete all ${count} files.`,
      async () => {
        try {
          await permanentlyDeleteFiles(filtered.map(f => f.id));
          showTopToast(`${count} file${count !== 1 ? 's' : ''} deleted permanently`);
        } catch {
          showTopToast(`Failed to delete ${count} file${count !== 1 ? 's' : ''} permanently`, 'error');
        }
      },
      'Delete All'
    );
  }, [filtered, confirmDestructive, permanentlyDeleteFiles, showTopToast]);

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
            isLocked ? undefined : () => router.push(folderId ? { pathname: '/(main)/folder/[id]', params: { id: folderId } } : '/(main)/dashboard'),
            locationLabel
          );
          if (landedInFallbackFolder) {
            // I-12: hasAccessKey/accessKeyId (the file's own, or one
            // snapshotted from the original folder by deleteFolder) survive
            // this restore even though the destination folder doesn't
            // require unlocking — say so accurately instead of implying the
            // file is now fully exposed.
            Alert.alert(
              'Restored to "Restored Files"',
              filePreservedAccessKey
                ? 'This file’s original folder no longer exists, so it was restored into the "Restored Files" folder, which anyone can browse into. The file itself is still password-protected, so its contents stay locked.'
                : 'This file’s original folder no longer exists, so it was restored into the unprotected "Restored Files" folder instead of its original (possibly password/encryption-protected) location.'
            );
          }
        } catch {
          showTopToast(`Failed to restore ${name}`, 'error');
        }
      },
    });
  }, [restoreFileFromTrash, showTopToast]);

  const handleRestoreSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    setRestoreConfirm({
      visible: true,
      title: 'Restore Files',
      message: `${count} file${count === 1 ? '' : 's'} will be moved back to their original location.`,
      onConfirm: async () => {
        // allSettled rather than all: with Promise.all, one rejection loses
        // track of every other restore that already succeeded (they're
        // fire-and-forget once the promise races on), so the toast could
        // report total failure when most of the batch actually landed fine.
        const results = await Promise.allSettled(selectedIds.map(id => restoreFileFromTrash(id)));
        setSelectedIds([]);
        setSelectionMode(false);
        const fulfilled = results.filter((r): r is PromiseFulfilledResult<{ landedInFallbackFolder: boolean; folderId?: string; filePreservedAccessKey: boolean }> => r.status === 'fulfilled');
        const { message, tone } = bulkOutcomeToast(fulfilled.length, count, 'file', 'restored', 'restore');
        showTopToast(message, tone);
        const landedInFallback = fulfilled.filter(r => r.value.landedInFallbackFolder);
        if (landedInFallback.length > 0) {
          // I-12: same accuracy fix as the single-file toast above — only
          // claim full exposure for the files that actually lost their lock.
          const allPreserved = landedInFallback.every(r => r.value.filePreservedAccessKey);
          Alert.alert(
            'Some Files Restored to "Restored Files"',
            allPreserved
              ? 'One or more original folders no longer exist, so those files were restored into the "Restored Files" folder, which anyone can browse into. Those files are still password-protected, so their contents stay locked.'
              : 'One or more original folders no longer exist, so those files were restored into the unprotected "Restored Files" folder instead.'
          );
        }
      },
    });
  }, [selectedIds, restoreFileFromTrash, setSelectedIds, showTopToast]);

  const handleShredSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    confirmDestructive(
      'Delete Selected Files?',
      `This will permanently delete ${count} files.`,
      async () => {
        try {
          await permanentlyDeleteFiles(selectedIds);
          showTopToast(`${count} file${count !== 1 ? 's' : ''} deleted permanently`);
        } catch {
          showTopToast(`Failed to delete ${count} file${count !== 1 ? 's' : ''} permanently`, 'error');
        }
      },
      'Delete'
    );
  }, [selectedIds, confirmDestructive, permanentlyDeleteFiles, showTopToast]);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const exitSelectionMode = () => { setSelectionMode(false); setSelectedIds([]); };

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

  type ListItem =
    | { type: 'section'; label: string }
    | { type: 'file'; file: TrashedFile };

  const listData: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];
    grouped.forEach(g => {
      items.push({ type: 'section', label: g.label });
      g.data.forEach(f => items.push({ type: 'file', file: f }));
    });
    return items;
  }, [grouped]);

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      <TabRootHeader title="Trash" tagline="Deleted files" rightSlot={<ViewModeMenu />} />

      <View style={styles.flex1}>
        <ScrollView
          contentContainerStyle={[styles.scrollBody, { paddingHorizontal: screenPadding, paddingTop: space(2), paddingBottom: bottomTabSpacing }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.borderLight, borderRadius: radius(5), paddingHorizontal: space(4), marginBottom: space(4), gap: space(2), minHeight: MIN_TOUCH_TARGET }]}>
            <Search size={iconSize(18)} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text, fontSize: font(Type.body.size) }]}
              placeholder="Search deleted files…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              accessibilityLabel="Search deleted files"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                <X size={iconSize(16)} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.filterRow, { marginBottom: space(2) }]}>
            <Button title="Filters" onPress={toggleFilters} icon={ListFilter} variant="tertiary" size="sm" />
            <View style={styles.headerRightBlock}>
              {!selectionMode && filtered.length > 0 && (
                <Button title="Delete All" onPress={handleShredAll} variant="ghost" size="sm" />
              )}
              {!selectionMode && (
                <Text style={[styles.countText, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>
                  {filtered.length} {filtered.length === 1 ? 'file' : 'files'}
                </Text>
              )}
            </View>
          </View>

          {showFilters && (
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

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2), paddingVertical: space(2) }}>
                {([
                  ['date_desc', 'Newest'],
                  ['date_asc', 'Oldest'],
                  ['name_asc', 'A → Z'],
                  ['name_desc', 'Z → A'],
                ] as [SortKey, string][]).map(([k, label]) => (
                  <Chip key={k} label={label} selected={sort === k} onPress={() => setSort(k)} />
                ))}
              </ScrollView>
            </View>
          )}

          {selectionMode && (
            <View style={[styles.selectionBar, { gap: space(2), paddingBottom: space(3) }]}>
              <Pressable
                onPress={() => {
                  const fileIds = filtered.map(f => f.id);
                  const allSelected = fileIds.every(id => selectedIds.includes(id));
                  setSelectedIds(allSelected ? [] : fileIds);
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

          {filtered.length === 0 && !search && (
            <EmptyState icon={Trash2} title="Trash is empty" message="Files you delete will appear here." />
          )}

          {filtered.length === 0 && search && (
            <EmptyState icon={Search} title="No results found" message="Try a different search term" />
          )}

          {filtered.length > 0 && (
            isGridMode ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(1) }}>
                {filtered.map((item) => {
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
              </View>
            ) : (
              <FlatList
                data={listData}
                keyExtractor={(item) =>
                  item.type === 'section' ? `section-${item.label}` : item.file.id
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
                  return <TrashRow item={item.file} />;
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
