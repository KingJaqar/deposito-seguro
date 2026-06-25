// File: src/app/(main)/trash.tsx
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  Layout,
  useAnimatedStyle,
} from 'react-native-reanimated';
import AnimatedTabBar from '../../components/AnimatedTabBar';
import { VaultHeader } from '../../components/VaultHeader';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useVaultStore } from '../../store/vaultStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc';
type FileTypeFilter = 'all' | 'image' | 'video' | 'document' | 'audio' | 'other';

interface TrashedFile {
  id: string;
  name: string;
  isTrash: boolean;
  folderId?: string | null;
  type?: string;
  size?: number;
  deletedAt?: string; // ISO string — generated if missing
  [key: string]: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FILE_TYPE_LABELS: Record<FileTypeFilter, string> = {
  all: 'All',
  image: '🖼 Images',
  video: '🎬 Videos',
  document: '📄 Docs',
  audio: '🎵 Audio',
  other: '📦 Other',
};

function detectType(name: string): FileTypeFilter {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'].includes(ext)) return 'document';
  if (['mp3', 'wav', 'aac', 'ogg', 'flac'].includes(ext)) return 'audio';
  return 'other';
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDeletedAt(iso: string): string {
  const d = new Date(iso);
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

// ─── Filter Chip ──────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: any;
}) {
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: active ? 1.02 : 1 }] }));

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Animated.View
        style={[
          chipStyles.chip,
          animStyle,
          {
            backgroundColor: active
              ? colors.primary
              : 'rgba(255,255,255,0.06)',
            borderColor: active ? colors.primary : 'rgba(255,255,255,0.1)',
          },
        ]}
      >
        <Text
          style={[
            chipStyles.chipText,
            { color: active ? '#fff' : 'rgba(255,255,255,0.5)' },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
});

// ─── File Card ────────────────────────────────────────────────────────────────

function TrashFileCard({
  item,
  colors,
  onRestore,
  onShred,
}: {
  item: TrashedFile;
  colors: any;
  onRestore: () => void;
  onShred: () => void;
}) {
  const fileType = detectType(item.name);
  const typeIcons: Record<FileTypeFilter, string> = {
    all: '📁', image: '🖼️', video: '🎬', document: '📄', audio: '🎵', other: '📦',
  };

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(16)}
      exiting={FadeOutUp.duration(200)}
      layout={Layout.springify()}
    >
      <View
        style={[
          cardStyles.card,
          {
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderColor: 'rgba(255,255,255,0.07)',
          },
        ]}
      >
        {/* Icon + Info */}
        <View style={cardStyles.row}>
          <View style={[cardStyles.iconBox, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
            <Text style={cardStyles.iconText}>{typeIcons[fileType]}</Text>
          </View>
          <View style={cardStyles.info}>
            <Text style={[cardStyles.fileName, { color: colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.folderId && (
              <Text style={[cardStyles.folder, { color: colors.primary }]}>
                📂 {item.folderId}
              </Text>
            )}
            <Text style={[cardStyles.deletedAt, { color: 'rgba(255,255,255,0.35)' }]}>
              🗓 {formatDeletedAt(item.deletedAt!)}
              {item.size ? `  ·  ${formatFileSize(item.size)}` : ''}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={cardStyles.actions}>
          <TouchableOpacity style={[cardStyles.btn, { backgroundColor: 'rgba(255,255,255,0.07)' }]} onPress={onRestore}>
            <Text style={[cardStyles.btnText, { color: colors.primary }]}>↩ Restore</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[cardStyles.btn, { backgroundColor: 'rgba(255,80,80,0.15)' }]} onPress={onShred}>
            <Text style={[cardStyles.btnText, { color: '#ff5f5f' }]}>🗑 Shred</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconText: { fontSize: 20 },
  info: { flex: 1 },
  fileName: { fontSize: 15, fontWeight: '600', marginBottom: 3 },
  folder: { fontSize: 11, fontWeight: '500', marginBottom: 3 },
  deletedAt: { fontSize: 11 },
  actions: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: { fontSize: 13, fontWeight: '700' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TrashScreen() {
  const colors = useThemeColors();
  const { files, restoreFileFromTrash, permanentlyDeleteFile, permanentlyDeleteFiles } = useVaultStore();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>('all');
  const [folderFilter, setFolderFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('date_desc');
  const [showFilters, setShowFilters] = useState(false);

  // Enrich files with auto-generated deletedAt if missing
  const enrichedFiles: TrashedFile[] = useMemo(() => {
    return (files as TrashedFile[])
      .filter(f => f.isTrash)
      .map(f => ({
        ...f,
        deletedAt: f.deletedAt ?? new Date(0).toISOString(),
      }));
  }, [files]);

  // Unique folders in trash
  const trashedFolders = useMemo(() => {
    const ids = [...new Set(enrichedFiles.map(f => f.folderId).filter(Boolean))] as string[];
    return ids;
  }, [enrichedFiles]);

  // Filter + sort
  const filtered = useMemo(() => {
    let result = enrichedFiles;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(q));
    }

    if (typeFilter !== 'all') {
      result = result.filter(f => detectType(f.name) === typeFilter);
    }

    if (folderFilter !== 'all') {
      result = result.filter(f =>
        folderFilter === '__root__' ? !f.folderId : f.folderId === folderFilter
      );
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
  }, [enrichedFiles, search, typeFilter, folderFilter, sort]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const handleShred = useCallback((id: string, name: string) => {
    if (Platform.OS === 'web') {
      if (confirm(`Permanently shred "${name}"? This cannot be undone.`)) {
        permanentlyDeleteFile(id);
      }
    } else {
      Alert.alert('Permanently Shred File', `"${name}" will be destroyed forever.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Shred', style: 'destructive', onPress: () => permanentlyDeleteFile(id) },
      ]);
    }
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

  const filterBarStyle = useAnimatedStyle(() => ({
    height: showFilters ? 160 : 0,
    overflow: 'hidden',
  }));

  const toggleFilters = () => {
    setShowFilters(!showFilters);
  };

  // Flat list data: section headers + items
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
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Trash" showBack />

      {/* ── Search Bar ── */}
      <View style={[styles.searchWrap, { borderColor: 'rgba(255,255,255,0.09)' }]}>
        <View style={[styles.searchBox, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search deleted files…"
            placeholderTextColor="rgba(255,255,255,0.3)"
            style={[styles.searchInput, { color: colors.text }]}
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.filterToggle,
            {
              backgroundColor: showFilters
                ? colors.primary
                : 'rgba(255,255,255,0.06)',
            },
          ]}
          onPress={toggleFilters}
        >
          <Text style={styles.filterToggleText}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* ── Expandable Filter Panel ── */}
      <Animated.View style={filterBarStyle}>
        <View style={styles.filterPanel}>
          {/* File type */}
          <Text style={[styles.filterLabel, { color: 'rgba(255,255,255,0.4)' }]}>
            FILE TYPE
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {(Object.keys(FILE_TYPE_LABELS) as FileTypeFilter[]).map(k => (
              <FilterChip
                key={k}
                label={FILE_TYPE_LABELS[k]}
                active={typeFilter === k}
                onPress={() => setTypeFilter(k)}
                colors={colors}
              />
            ))}
          </ScrollView>

          {/* Folder */}
          <Text style={[styles.filterLabel, { color: 'rgba(255,255,255,0.4)' }]}>
            FOLDER
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            <FilterChip label="📂 All" active={folderFilter === 'all'} onPress={() => setFolderFilter('all')} colors={colors} />
            <FilterChip label="🏠 Root" active={folderFilter === '__root__'} onPress={() => setFolderFilter('__root__')} colors={colors} />
            {trashedFolders.map(fid => (
              <FilterChip key={fid} label={`📁 ${fid}`} active={folderFilter === fid} onPress={() => setFolderFilter(fid)} colors={colors} />
            ))}
          </ScrollView>

          {/* Sort */}
          <Text style={[styles.filterLabel, { color: 'rgba(255,255,255,0.4)' }]}>SORT</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {([
              ['date_desc', '🕐 Newest'],
              ['date_asc', '🕐 Oldest'],
              ['name_asc', 'A → Z'],
              ['name_desc', 'Z → A'],
            ] as [SortKey, string][]).map(([k, label]) => (
              <FilterChip key={k} label={label} active={sort === k} onPress={() => setSort(k)} colors={colors} />
            ))}
          </ScrollView>
        </View>
      </Animated.View>

      {/* ── Toolbar ── */}
      <View style={styles.toolbar}>
        <Text style={[styles.countText, { color: 'rgba(255,255,255,0.4)' }]}>
          {filtered.length} {filtered.length === 1 ? 'file' : 'files'}
        </Text>
        {filtered.length > 0 && (
          <TouchableOpacity onPress={handleShredAll}>
            <Text style={[styles.shredAllText, { color: '#ff5f5f' }]}>Shred All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── List ── */}
      <FlatList
        data={listData}
        keyExtractor={(item, index) =>
          item.type === 'section' ? `section-${item.label}` : item.file.id
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          if (item.type === 'section') {
            return (
              <Text style={[styles.sectionHeader, { color: 'rgba(255,255,255,0.35)' }]}>
                {item.label}
              </Text>
            );
          }

          return (
            <TrashFileCard
              item={item.file}
              colors={colors}
              onRestore={() => restoreFileFromTrash(item.file.id)}
              onShred={() => handleShred(item.file.id, item.file.name)}
            />
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🗑️</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Trash is empty</Text>
            <Text style={[styles.emptySubtitle, { color: 'rgba(255,255,255,0.3)' }]}>
              {search ? 'No results match your search.' : 'Files you delete will appear here.'}
            </Text>
          </View>
        }
      />

      <AnimatedTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  clearBtn: { fontSize: 13, color: 'rgba(255,255,255,0.3)', paddingLeft: 4 },
  filterToggle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterToggleText: { fontSize: 18 },

  filterPanel: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  countText: { fontSize: 12, fontWeight: '500' },
  shredAllText: { fontSize: 12, fontWeight: '700' },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 10,
  },

  emptyWrap: {
    alignItems: 'center',
    marginTop: 80,
    paddingHorizontal: 40,
  },
  emptyEmoji: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
