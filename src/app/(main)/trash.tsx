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
  ListFilter,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AnimatedTabBar from '../../components/AnimatedTabBar';
import { TabRootHeader } from '../../components/TabRootHeader';
import { ViewModeMenu } from '../../components/ViewModeMenu';
import { Button } from '../../components/primitives/Button';
import { Card } from '../../components/primitives/Card';
import { Chip } from '../../components/primitives/Chip';
import { EmptyState } from '../../components/primitives/EmptyState';
import { getFileTypeMeta } from '../../components/primitives/FileTypeIcon';
import { GridTile } from '../../components/primitives/GridTile';
import { CategoryTint } from '../../constants/Colors';
import { Type } from '../../constants/typography';
import { useTheme } from '../../contexts/ThemeContext';
import { MIN_TOUCH_TARGET } from '../../utils/responsive';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';

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

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>('all');
  const [sort, setSort] = useState<SortKey>('date_desc');
  const [showFilters, setShowFilters] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
    Alert.alert('Permanently Shred File', `"${name}" will be destroyed forever.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Shred', style: 'destructive', onPress: () => permanentlyDeleteFile(id) },
    ]);
  }, [permanentlyDeleteFile]);

  const handleShredAll = useCallback(() => {
    if (filtered.length === 0) return;
    Alert.alert('Shred All Files?', `This will permanently delete all ${filtered.length} files.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Shred All',
        style: 'destructive',
        onPress: () => permanentlyDeleteFiles(filtered.map(f => f.id)),
      },
    ]);
  }, [filtered, permanentlyDeleteFiles]);

  // I-12: restoreFileFromTrash reports when a file's original folder no
  // longer exists (it lands in an unprotected auto-created "Restored Files"
  // folder instead) — warn the user rather than silently losing that context.
  const handleRestore = useCallback(async (fileId: string) => {
    const { landedInFallbackFolder } = await restoreFileFromTrash(fileId);
    if (landedInFallbackFolder) {
      Alert.alert(
        'Restored to "Restored Files"',
        'This file’s original folder no longer exists, so it was restored into the unprotected "Restored Files" folder instead of its original (possibly password/encryption-protected) location.'
      );
    }
  }, [restoreFileFromTrash]);

  const handleRestoreSelected = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const results = await Promise.all(selectedIds.map(id => restoreFileFromTrash(id)));
    setSelectedIds([]);
    setSelectionMode(false);
    if (results.some(r => r.landedInFallbackFolder)) {
      Alert.alert(
        'Some Files Restored to "Restored Files"',
        'One or more original folders no longer exist, so those files were restored into the unprotected "Restored Files" folder instead.'
      );
    }
  }, [selectedIds, restoreFileFromTrash, setSelectedIds]);

  const handleShredSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    Alert.alert('Shred Selected Files?', `This will permanently delete ${selectedIds.length} files.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Shred',
        style: 'destructive',
        onPress: () => permanentlyDeleteFiles(selectedIds),
      },
    ]);
  }, [selectedIds, permanentlyDeleteFiles]);

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

  const TrashRow = ({ item }: { item: TrashedFile }) => {
    const visual = getFileVisual(item);
    const isSelected = selectedIds.includes(item.id);
    const VisualIcon = visual.Icon;

    return (
      <Card
        onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
        onPress={() => { if (selectionMode) toggleSelection(item.id); }}
        accessibilityLabel={item.name}
        style={{
          marginBottom: space(3),
          borderColor: isSelected ? colors.primary : colors.borderLight,
          borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
        }}
      >
        <View style={[styles.rowTop, { gap: space(3) }]}>
          <View style={[styles.iconChip, { backgroundColor: `${visual.color}1F`, borderRadius: radius(4) }]}>
            <VisualIcon size={iconSize(20)} color={visual.color} strokeWidth={2} />
          </View>

          <View style={styles.rowInfo}>
            <Text style={[styles.rowName, { color: colors.text, fontSize: font(Type.body.size) }]} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={[styles.rowMetaRow, { gap: space(2) }]}>
              <Text style={[styles.rowMeta, { color: colors.textMuted, fontSize: font(Type.caption.size) }]} numberOfLines={1}>
                {formatDeletedAt(item.deletedAt!)}
              </Text>
              <View style={[styles.metaDot, { backgroundColor: colors.textMuted }]} />
              <Text style={[styles.rowMeta, { color: visual.color, fontSize: font(Type.caption.size), fontWeight: '700' }]} numberOfLines={1}>
                {visual.label}
              </Text>
            </View>
          </View>

          {selectionMode && (
            <View style={[styles.checkInner, { backgroundColor: isSelected ? colors.primary : 'transparent', borderColor: colors.primary, borderRadius: radius(2) }]}>
              {isSelected && <Text style={{ color: colors.onPrimary, fontSize: 11, fontWeight: '800' }}>✓</Text>}
            </View>
          )}
        </View>

        {!selectionMode && (
          <>
            <View style={[styles.rowDivider, { backgroundColor: colors.borderLight, marginTop: space(3), marginBottom: space(3) }]} />
            <View style={[styles.rowActions, { gap: space(2) }]}>
              <Button title="Restore" onPress={() => handleRestore(item.id)} icon={RotateCcw} variant="tertiary" size="sm" />
              <Button title="Delete" onPress={() => handleShred(item.id, item.name)} icon={Trash2} variant="danger" size="sm" />
            </View>
          </>
        )}
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
          contentContainerStyle={[styles.scrollBody, { paddingHorizontal: screenPadding, paddingTop: space(3), paddingBottom: bottomTabSpacing }]}
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
              clearButtonMode="while-editing"
              accessibilityLabel="Search deleted files"
            />
          </View>

          <View style={[styles.filterRow, { marginBottom: space(2) }]}>
            <Button title="Filters" onPress={toggleFilters} icon={ListFilter} variant="tertiary" size="sm" />
            <View style={styles.headerRightBlock}>
              {!selectionMode && filtered.length > 0 && (
                <Button title="Shred All" onPress={handleShredAll} variant="ghost" size="sm" />
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
              <Button
                title={filtered.every(f => selectedIds.includes(f.id)) ? 'Deselect All' : 'Select All'}
                onPress={() => {
                  const fileIds = filtered.map(f => f.id);
                  const allSelected = fileIds.every(id => selectedIds.includes(id));
                  if (allSelected) {
                    setSelectedIds([]);
                  } else {
                    setSelectedIds(fileIds);
                  }
                }}
                variant="ghost"
                size="sm"
              />
              <Button title="Restore" onPress={handleRestoreSelected} variant="secondary" size="sm" />
              <Button title="Shred" onPress={handleShredSelected} variant="danger" size="sm" />
              <Button title="Cancel" onPress={exitSelectionMode} variant="ghost" size="sm" />
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
                  const hasThumbnail = item.mimeType?.startsWith('image/') || item.mimeType?.startsWith('video/');
                  return (
                    <GridTile
                      key={item.id}
                      size={gridItemWidth}
                      name={item.name}
                      subtitle={visual.label}
                      subtitleColor={visual.color}
                      Icon={visual.Icon}
                      iconColor={visual.color}
                      thumbnailUri={hasThumbnail && item.localPath ? item.localPath : undefined}
                      selectable={selectionMode}
                      selected={isSelected}
                      onPress={() => { if (selectionMode) toggleSelection(item.id); }}
                      onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
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
                      <View style={{ marginTop: space(5), marginBottom: space(3) }}>
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

  selectionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' },

  sectionHeader: { fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },

  rowTop: { flexDirection: 'row', alignItems: 'center' },
  iconChip: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontWeight: '700', letterSpacing: -0.2, marginBottom: 4 },
  rowMetaRow: { flexDirection: 'row', alignItems: 'center' },
  rowMeta: { fontWeight: '500' },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, opacity: 0.6 },

  checkInner: { width: 22, height: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  rowDivider: { height: StyleSheet.hairlineWidth },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
