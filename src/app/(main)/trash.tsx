// File: src/app/(main)/trash.tsx
import {
  Box,
  FileText,
  Image as ImageIcon,
  ListFilter,
  Moon,
  Music,
  RotateCcw,
  Search,
  Smartphone,
  Sun,
  Trash2,
  Video,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import AnimatedTabBar from '../../components/AnimatedTabBar';
import { CategoryTint } from '../../constants/Colors';
import { useTheme } from '../../contexts/ThemeContext';
import { useVaultStore } from '../../store/vaultStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCREEN_PADDING = 20;

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

// Resolves the icon, tint color, and short label for a trashed file. Reads the
// real mimeType (falling back to filename extension) so the icon chip always
// reflects the file's actual type — matching the same detection used on the
// dashboard's category tiles for visual consistency across the app.
function getFileVisual(item: TrashedFile) {
  const mimeType: string = item.mimeType || '';
  const name: string = item.name || '';

  const isApp =
    mimeType === 'application/vnd.android.package-archive' ||
    mimeType === 'application/x-msdownload' ||
    name.endsWith('.apk') || name.endsWith('.exe') || name.endsWith('.dmg');

  if (isApp) return { label: 'App', color: CategoryTint.apps, Icon: Smartphone };
  if (mimeType.startsWith('image/')) return { label: 'Image', color: CategoryTint.images, Icon: ImageIcon };
  if (mimeType.startsWith('video/')) return { label: 'Video', color: CategoryTint.videos, Icon: Video };
  if (mimeType.startsWith('audio/')) return { label: 'Audio', color: CategoryTint.audio, Icon: Music };

  const isDoc =
    mimeType.includes('pdf') || mimeType.includes('document') ||
    mimeType.includes('text') || mimeType.includes('sheet') ||
    detectType(name) === 'document';
  if (isDoc) return { label: 'File', color: CategoryTint.docs, Icon: FileText };

  return { label: 'File', color: CategoryTint.other, Icon: Box };
}

export default function TrashScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { files, restoreFileFromTrash, permanentlyDeleteFile, permanentlyDeleteFiles } = useVaultStore();

  const dash = {
    bg: colors.dashboardBg ?? colors.background,
    surface: colors.dashboardSurface ?? colors.surface,
    surfaceHover: colors.dashboardSurfaceHover ?? colors.surfaceElevated,
    accent: colors.dashboardAccent ?? colors.accent,
    text: colors.dashboardText ?? colors.text,
    textMuted: colors.dashboardTextMuted ?? colors.textMuted,
    border: colors.dashboardBorder ?? colors.border,
    fabBg: colors.fabBg ?? colors.primary,
    fabText: colors.fabText ?? '#FFFFFF',
  };

  // Card-row specific tokens. These intentionally sit a touch darker/lighter
  // than `dash.surface` (independent of the dashboard tokens above) so the
  // trash list reads as its own distinct surface, matching the target design
  // without altering any other screen that consumes `dash.surface`.
  const card = {
    bg: isDark ? '#18181B' : '#FFFFFF',
    divider: isDark ? 'rgba(245, 239, 224, 0.08)' : 'rgba(15, 23, 42, 0.08)',
    restoreBg: isDark ? '#202030' : '#E9E8FB',
    restoreText: isDark ? '#7C82E8' : '#5152D6',
    deleteBg: isDark ? '#2C1E20' : '#FBE6E5',
    deleteText: isDark ? '#E4786F' : '#D6433A',
  };

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>('all');
  const [sort, setSort] = useState<SortKey>('date_desc');
  const [showFilters, setShowFilters] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [targetItem, setTargetItem] = useState<any>(null);
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

  const handleRestoreSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    selectedIds.forEach(id => restoreFileFromTrash(id));
    setSelectedIds([]);
    setSelectionMode(false);
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

  const TrashRow = ({ item }: { item: TrashedFile }) => {
    const visual = getFileVisual(item);
    const isSelected = selectedIds.includes(item.id);
    const VisualIcon = visual.Icon;

    return (
      <Pressable
        onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
        onPress={() => {
          if (selectionMode) toggleSelection(item.id);
        }}
        style={[
          styles.row,
          {
            backgroundColor: card.bg,
            borderColor: isSelected ? dash.accent : 'transparent',
            borderWidth: 2,
          },
        ]}
      >
        <View style={styles.rowTop}>
          <View style={[styles.iconChip, { backgroundColor: `${visual.color}20` }]}>
            <VisualIcon size={20} color={visual.color} strokeWidth={2} />
          </View>

          <View style={styles.rowInfo}>
            <Text style={[styles.rowName, { color: dash.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.rowMetaRow}>
              <Text style={[styles.rowMeta, { color: dash.textMuted }]} numberOfLines={1}>
                {formatDeletedAt(item.deletedAt!)}
              </Text>
              <View style={[styles.metaDot, { backgroundColor: dash.textMuted }]} />
              <Text style={[styles.rowMeta, { color: visual.color, fontWeight: '700' }]} numberOfLines={1}>
                {visual.label}
              </Text>
            </View>
          </View>

          {selectionMode && (
            <View style={styles.checkBox}>
              <View style={[styles.checkInner, { backgroundColor: isSelected ? dash.accent : 'transparent', borderColor: dash.accent }]}>
                {isSelected && <Text style={{ color: dash.fabText, fontSize: 10, fontWeight: '700' }}>✓</Text>}
              </View>
            </View>
          )}
        </View>

        {!selectionMode && (
          <>
            <View style={[styles.rowDivider, { backgroundColor: card.divider }]} />
            <View style={styles.rowActions}>
              <TouchableOpacity
                onPress={() => restoreFileFromTrash(item.id)}
                activeOpacity={0.8}
                style={[styles.pillBtn, { backgroundColor: card.restoreBg }]}
              >
                <RotateCcw size={14} color={card.restoreText} strokeWidth={2.4} />
                <Text style={[styles.pillBtnText, { color: card.restoreText }]}>Restore</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleShred(item.id, item.name)}
                activeOpacity={0.8}
                style={[styles.pillBtn, { backgroundColor: card.deleteBg }]}
              >
                <Trash2 size={14} color={card.deleteText} strokeWidth={2.4} />
                <Text style={[styles.pillBtnText, { color: card.deleteText }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </Pressable>
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
    <View style={[styles.root, { backgroundColor: dash.bg }]}>
      <View style={[styles.headerRow, { backgroundColor: dash.bg }]}>
        <View style={styles.headerTextBlock}>
          <Text style={[styles.headerTitle, { color: dash.text }]} numberOfLines={1}>Trash</Text>
          <Text style={[styles.headerTagline, { color: dash.textMuted }]} numberOfLines={1}>Deleted files</Text>
        </View>
        <Pressable
          onPress={toggleTheme}
          style={[styles.themeToggle, { backgroundColor: dash.surfaceHover }]}
          accessibilityRole="button"
          accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun size={18} color={dash.text} /> : <Moon size={18} color={dash.text} />}
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollBody}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.searchBar, { backgroundColor: card.bg }]}>
            <Search size={18} color={dash.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: dash.text }]}
              placeholder="Search deleted files..."
              placeholderTextColor={dash.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ color: dash.textMuted, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Filters Row */}
          <View style={styles.filterRow}>
            <TouchableOpacity
              onPress={toggleFilters}
              style={[styles.filterToggleBtn, { backgroundColor: card.bg }]}
            >
              <ListFilter size={14} color={dash.textMuted} strokeWidth={2.2} />
              <Text style={[styles.filterToggleText, { color: dash.textMuted }]}>Filters</Text>
            </TouchableOpacity>
            <View style={styles.headerRightBlock}>
              {!selectionMode && filtered.length > 0 && (
                <TouchableOpacity onPress={handleShredAll}>
                  <Text style={[styles.shredAllText, { color: card.deleteText }]}>Shred All</Text>
                </TouchableOpacity>
              )}
              {!selectionMode && (
                <Text style={[styles.countText, { color: dash.textMuted }]}>
                  {filtered.length} {filtered.length === 1 ? 'file' : 'files'}
                </Text>
              )}
            </View>
          </View>

          {showFilters && (
            <View style={styles.filterPanel}>
              <View style={styles.categorySection}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                  {(Object.keys(FILE_TYPE_MAP) as FileTypeFilter[]).map(k => {
                    const isActive = typeFilter === k;
                    const tint = k === 'all' ? colors.primary : k === 'image' ? CategoryTint.images : k === 'video' ? CategoryTint.videos : k === 'document' ? CategoryTint.docs : k === 'audio' ? CategoryTint.audio : CategoryTint.other;
                    return (
                      <TouchableOpacity
                        key={k}
                        onPress={() => setTypeFilter(k)}
                        activeOpacity={0.75}
                      >
                        <View style={[
                          styles.categoryPill,
                          {
                            backgroundColor: isActive ? card.bg : `${tint}12`,
                            borderColor: isActive ? dash.textMuted : `${tint}35`,
                            borderWidth: isActive ? 1.5 : 1,
                          },
                        ]}>
                          <View style={[styles.categoryDot, { backgroundColor: tint }]} />
                          <Text style={[
                            styles.categoryPillLabel,
                            { color: isActive ? dash.text : tint, fontWeight: isActive ? '700' : '500' }
                          ]}>
                            {FILE_TYPE_MAP[k]}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.categorySection}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                  {([
                    ['date_desc', 'Newest'],
                    ['date_asc', 'Oldest'],
                    ['name_asc', 'A → Z'],
                    ['name_desc', 'Z → A'],
                  ] as [SortKey, string][]).map(([k, label]) => {
                    const isActive = sort === k;
                    return (
                      <TouchableOpacity
                        key={k}
                        onPress={() => setSort(k)}
                        activeOpacity={0.75}
                      >
                        <View style={[
                          styles.categoryPill,
                          {
                            backgroundColor: isActive ? card.bg : `${colors.primary}12`,
                            borderColor: isActive ? dash.textMuted : `${colors.primary}35`,
                            borderWidth: isActive ? 1.5 : 1,
                          },
                        ]}>
                          <View style={[styles.categoryDot, { backgroundColor: colors.primary }]} />
                          <Text style={[
                            styles.categoryPillLabel,
                            { color: isActive ? dash.text : colors.primary, fontWeight: isActive ? '700' : '500' }
                          ]}>
                            {label}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          )}

          {selectionMode && (
            <View style={styles.selectionBar}>
              <TouchableOpacity onPress={() => {
                const fileIds = filtered.map(f => f.id);
                const allSelected = fileIds.every(id => selectedIds.includes(id));
                if (allSelected) {
                  setSelectedIds([]);
                } else {
                  setSelectedIds(fileIds);
                }
              }} style={styles.textBtn}>
                <Text style={{ color: dash.accent, fontSize: 13, fontWeight: '700' }}>
                  {filtered.every(f => selectedIds.includes(f.id)) ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRestoreSelected} style={styles.textBtn}>
                <Text style={{ color: colors.success, fontSize: 13, fontWeight: '700' }}>Restore</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShredSelected} style={styles.textBtnDanger}>
                <Text style={{ color: colors.error, fontSize: 13, fontWeight: '700' }}>Shred</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={exitSelectionMode} style={styles.cancelBtn}>
                <Text style={{ color: dash.textMuted, fontSize: 13, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {filtered.length === 0 && !search && (
            <View style={[styles.emptyCard, { backgroundColor: card.bg }]}>
              <Trash2 size={32} color={dash.textMuted} strokeWidth={1.5} style={{ marginBottom: 10, opacity: 0.6 }} />
              <Text style={[styles.emptyTitle, { color: dash.text }]}>Trash is empty</Text>
              <Text style={[styles.emptyText, { color: dash.textMuted }]}>Files you delete will appear here.</Text>
            </View>
          )}

          {filtered.length === 0 && search && (
            <View style={[styles.emptyCard, { backgroundColor: card.bg }]}>
              <Search size={32} color={dash.textMuted} strokeWidth={1.5} style={{ marginBottom: 10, opacity: 0.4 }} />
              <Text style={[styles.emptyTitle, { color: dash.text }]}>No results found</Text>
              <Text style={[styles.emptyText, { color: dash.textMuted }]}>Try a different search term</Text>
            </View>
          )}

          {filtered.length > 0 && (
            <FlatList
              data={listData}
              keyExtractor={(item) =>
                item.type === 'section' ? `section-${item.label}` : item.file.id
              }
              scrollEnabled={false}
              contentContainerStyle={{ paddingBottom: 140 }}
              renderItem={({ item }) => {
                if (item.type === 'section') {
                  return (
                    <View style={styles.sectionHeaderWrapper}>
                      <Text style={[styles.sectionHeader, { color: dash.textMuted }]}>
                        {item.label}
                      </Text>
                    </View>
                  );
                }

                return <TrashRow item={item.file} />;
              }}
            />
          )}
        </ScrollView>
      </View>

      <AnimatedTabBar />

      {showFileMenu && targetItem && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowFileMenu(false)}>
          <TouchableOpacity style={modalS.overlay} onPress={() => setShowFileMenu(false)} activeOpacity={1}>
            <View style={[styles.actionSheet, { backgroundColor: card.bg }]}>
              <View style={[modalS.handle, { backgroundColor: dash.border }]} />
              <Text style={[styles.actionSheetTitle, { color: dash.text }]}>{targetItem.name}</Text>
              {[
                { action: 'restore', label: 'Restore', color: dash.accent },
                { action: 'shred', label: 'Shred Permanently', color: colors.error },
              ].map(item => (
                <TouchableOpacity
                  key={item.action}
                  style={[styles.actionSheetItem, { borderBottomColor: dash.border }]}
                  onPress={() => {
                    setShowFileMenu(false);
                    if (item.action === 'restore') {
                      restoreFileFromTrash(targetItem.id);
                    } else {
                      handleShred(targetItem.id, targetItem.name);
                    }
                  }}
                >
                  <Text style={[styles.actionSheetLabel, { color: item.color }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 50,
    paddingBottom: 16,
  },
  headerTextBlock: { flex: 1, marginRight: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  headerTagline: { fontSize: 13, fontWeight: '500', marginTop: 4 },
  themeToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollBody: { paddingHorizontal: SCREEN_PADDING, paddingTop: 8 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },

  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  filterToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  filterToggleText: { fontSize: 13, fontWeight: '600' },
  headerRightBlock: { alignItems: 'flex-end', gap: 2 },
  shredAllText: { fontSize: 13, fontWeight: '700' },

  filterPanel: { marginTop: 10, marginBottom: 4 },

  categorySection: { paddingVertical: 4, marginBottom: 8 },
  categoryScroll: { paddingHorizontal: 4, gap: 8 },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 5,
  },
  categoryDot: { width: 6, height: 6, borderRadius: 3 },
  categoryPillLabel: { fontSize: 12 },

  countText: { fontSize: 12, fontWeight: '500' },
  selectionBar: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12 },
  textBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  textBtnDanger: { paddingHorizontal: 4, paddingVertical: 4 },
  cancelBtn: { paddingHorizontal: 4, paddingVertical: 4 },

  sectionHeaderWrapper: { marginTop: 18, marginBottom: 10 },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    opacity: 0.6,
  },

  row: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    marginBottom: 12,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconChip: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, marginBottom: 5 },
  rowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowMeta: { fontSize: 12, fontWeight: '500' },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, opacity: 0.6 },

  checkBox: { marginLeft: 4 },
  checkInner: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },

  rowDivider: { height: 1, marginTop: 14, marginBottom: 12 },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  pillBtnText: { fontSize: 13, fontWeight: '700' },

  emptyCard: { borderRadius: 20, alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  emptyText: { fontSize: 13, textAlign: 'center', marginBottom: 10 },

  actionSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: 36 },
  actionSheetTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 12, marginBottom: 4 },
  actionSheetItem: { paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  actionSheetLabel: { fontSize: 15, fontWeight: '500' },
});

const modalS = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
});
