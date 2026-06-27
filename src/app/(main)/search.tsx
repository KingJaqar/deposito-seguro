// File: src/app/(main)/search.tsx
import { router } from 'expo-router';
import { Moon, Search, Sun } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AnimatedTabBar from '../../components/AnimatedTabBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useVaultStore } from '../../store/vaultStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCREEN_PADDING = 24;
const VAULT_GAP = 16;
const SEARCH_TILE_WIDTH = (SCREEN_WIDTH - SCREEN_PADDING * 2 - VAULT_GAP) / 2;

const CATEGORY_FILTERS = [
  { label: 'All', tint: '#A78BFA' },
  { label: 'Root Folders', tint: '#60A5FA' },
  { label: 'Subfolders', tint: '#34D399' },
  { label: 'Images', tint: '#34D399' },
  { label: 'Videos', tint: '#FF6B6B' },
  { label: 'Documents', tint: '#60A5FA' },
  { label: 'Audio', tint: '#FBBF24' },
  { label: 'Apps', tint: '#F472B6' },
  { label: 'Other', tint: '#94A3B8' },
  { label: 'Favorites', tint: '#FBBF24' },
];

export default function SearchScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { files, folders, toggleFavorite, softDeleteFile, shredFile, assignFileEncryptionKey, hydrateVault } = useVaultStore();

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

  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [targetItem, setTargetItem] = useState<any>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameText, setRenameText] = useState('');

  useEffect(() => { hydrateVault(); }, [hydrateVault]);

  const allFiles = files.filter(f => !f.isTrash);
  const allFolders = folders.filter((f: any) => !f.isTrash);

  const searchedFiles = allFiles.filter(f => {
    if (!query.trim()) return true;
    return f.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  const searchedFolders = allFolders.filter(f => {
    if (!query.trim()) return true;
    return f.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  const filteredFiles = searchedFiles.filter(f => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Root Folders') return false;
    if (activeFilter === 'Subfolders') return false;
    if (activeFilter === 'Images') return f.mimeType?.startsWith('image/');
    if (activeFilter === 'Videos') return f.mimeType?.startsWith('video/');
    if (activeFilter === 'Audio') return f.mimeType?.startsWith('audio/');
    if (activeFilter === 'Documents') return (
      !f.mimeType?.startsWith('image/') && !f.mimeType?.startsWith('video/') && !f.mimeType?.startsWith('audio/') &&
      (f.mimeType?.includes('pdf') || f.mimeType?.includes('document') || f.mimeType?.includes('text') || f.mimeType?.includes('sheet'))
    );
    if (activeFilter === 'Apps') return (
      f.name?.endsWith('.apk') || f.name?.endsWith('.exe') || f.name?.endsWith('.dmg') ||
      f.mimeType === 'application/vnd.android.package-archive' || f.mimeType === 'application/x-msdownload'
    );
    if (activeFilter === 'Favorites') return f.isFavorite;
    if (activeFilter === 'Other') return (
      !f.mimeType?.startsWith('image/') && !f.mimeType?.startsWith('video/') && !f.mimeType?.startsWith('audio/') &&
      !f.mimeType?.includes('pdf') && !f.mimeType?.includes('document') && !f.mimeType?.includes('text') && !f.mimeType?.includes('sheet') &&
      !f.name?.endsWith('.apk') && !f.name?.endsWith('.exe') && !f.name?.endsWith('.dmg')
    );
    return true;
  });

  const filteredFolders = searchedFolders.filter(f => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Root Folders') return !f.parentId;
    if (activeFilter === 'Subfolders') return !!f.parentId;
    if (activeFilter === 'Favorites') return f.isFavorite;
    return true;
  });

  const getFileType = (mimeType: string, name?: string) => {
    if (mimeType?.startsWith('image/')) return { label: 'Image', color: '#A78BFA', icon: '🖼' };
    if (mimeType?.startsWith('video/')) return { label: 'Video', color: '#FF6B6B', icon: '▶' };
    if (mimeType?.startsWith('audio/')) return { label: 'Audio', color: '#FBBF24', icon: '♪' };
    if (name?.endsWith('.apk') || name?.endsWith('.exe')) return { label: 'App', color: '#F472B6', icon: '📱' };
    return { label: 'File', color: '#60A5FA', icon: '📄' };
  };

  const totalResults = filteredFolders.length + filteredFiles.length;
  const showResults = query.trim().length > 0 || filteredFolders.length > 0 || filteredFiles.length > 0;

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const exitSelectionMode = () => { setSelectionMode(false); setSelectedIds([]); };

  const handleFileNavigate = (file: any) => {
    if (file.mimeType?.startsWith('image/')) {
      router.push({ pathname: '/(main)/viewer/image', params: { fileId: file.id } });
    } else if (file.mimeType?.startsWith('video/')) {
      router.push({ pathname: '/(main)/viewer/video', params: { fileId: file.id } });
    } else {
      router.push({ pathname: '/(main)/viewer/document', params: { fileId: file.id } });
    }
  };

  const handleFileAction = (file: any, action: string) => {
    setShowFileMenu(false);
    switch (action) {
      case 'favorite': toggleFavorite(file.id); break;
      case 'delete': softDeleteFile(file.id); break;
      case 'shred':
        Alert.alert('Confirm Shred', 'Permanently delete this file?',
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Shred', style: 'destructive', onPress: () => shredFile(file.id) }]
        ); break;
    }
  };

  const handleFolderAction = (folder: any, action: string) => {
    setShowFolderMenu(false);
    switch (action) {
      case 'open': router.push({ pathname: '/(main)/folder/[id]', params: { id: folder.id } }); break;
      case 'delete': softDeleteFile(folder.id); break;
      case 'shred':
        Alert.alert('Confirm Shred', 'Permanently delete this folder?',
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Shred', style: 'destructive', onPress: () => shredFile(folder.id) }]
        ); break;
    }
  };

  const SearchTile = ({ item, index, type }: { item: any; index: number; type: 'folder' | 'file' }) => {
    const isSelected = selectedIds.includes(item.id);
    const ft = type === 'file' ? getFileType(item.mimeType, item.name) : null;
    const accentColor = ['#A78BFA', '#60A5FA', '#34D399', '#FB7185', '#FBBF24', '#F472B6'][index % 6];

    return (
      <Pressable
        onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
        onPress={() => {
          if (selectionMode) toggleSelection(item.id);
          else if (type === 'folder') router.push({ pathname: '/(main)/folder/[id]', params: { id: item.id } });
          else handleFileNavigate(item);
        }}
        style={({ pressed }) => [
          styles.vaultTile,
          {
            backgroundColor: dash.surface,
            borderColor: isSelected ? dash.accent : 'transparent',
            borderWidth: 2,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <View style={styles.vaultTopRow}>
          <View style={[styles.vaultIconChip, { backgroundColor: `${accentColor}26` }]}>
            {type === 'folder' ? (
              <Text style={{ fontSize: 20 }}>📁</Text>
            ) : (
              <Text style={{ fontSize: 20 }}>{ft?.icon || '📄'}</Text>
            )}
          </View>
          {selectionMode ? (
            <View style={styles.checkBox}>
              <View style={[styles.checkInner, { backgroundColor: isSelected ? dash.accent : 'transparent', borderColor: dash.accent }]}>
                {isSelected && <Text style={{ color: dash.fabText, fontSize: 10, fontWeight: '700' }}>✓</Text>}
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => { setTargetItem(item); setShowFolderMenu(type === 'folder' ? true : false); setShowFileMenu(type === 'file' ? true : false); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Text style={{ color: dash.textMuted, fontSize: 22, fontWeight: '600' }}>•••</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.vaultBottomBlock}>
          <Text style={[styles.vaultName, { color: dash.text }]} numberOfLines={1}>
            {item.name}
            {item.isEncrypted && item.encryptionKeyId ? ' 🔒' : ''}
          </Text>
          <View style={styles.vaultMetaRow}>
            <Text style={[styles.vaultMeta, { color: dash.textMuted }]}>
              {type === 'folder' ? 'Folder' : `${(item.size / 1024).toFixed(1)} KB`}
            </Text>
            {type === 'file' && ft && (
              <Text style={[styles.vaultMeta, { color: ft.color }]}>{ft.label}</Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: dash.bg }]}>
      <View style={[styles.headerRow, { backgroundColor: dash.bg }]}>
        <View style={styles.headerTextBlock}>
          <Text style={[styles.headerTitle, { color: dash.text }]} numberOfLines={1}>Search</Text>
          <Text style={[styles.headerTagline, { color: dash.textMuted }]} numberOfLines={1}>Find files & folders</Text>
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

      <ScrollView
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.searchBar, { backgroundColor: dash.surface }]}>
          <Search size={18} color={dash.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: dash.text }]}
            placeholder="Search files & folders..."
            placeholderTextColor={dash.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: dash.textMuted, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.categorySection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
            {CATEGORY_FILTERS.map(f => {
              const isActive = activeFilter === f.label;
              return (
                <TouchableOpacity
                  key={f.label}
                  onPress={() => setActiveFilter(f.label)}
                  activeOpacity={0.75}
                >
                  <View style={[
                    styles.categoryPill,
                    {
                      backgroundColor: isActive ? dash.surface : `${f.tint}12`,
                      borderColor: isActive ? dash.textMuted : `${f.tint}35`,
                      borderWidth: isActive ? 1.5 : 1,
                    },
                  ]}>
                    <View style={[styles.categoryDot, { backgroundColor: f.tint }]} />
                    <Text style={[
                      styles.categoryPillLabel,
                      { color: isActive ? dash.text : f.tint, fontWeight: isActive ? '700' : '500' }
                    ]}>
                      {f.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {showResults && (
          <View style={styles.resultsHeader}>
            <Text style={[{ color: dash.textMuted, fontSize: 13 }]}>
              <Text style={{ fontWeight: '600', color: dash.text }}>{totalResults}</Text>{' '}
              {totalResults === 1 ? 'result' : 'results'} found
            </Text>
          </View>
        )}

        {!showResults && (
          <View style={[styles.emptyCard, { backgroundColor: dash.surface }]}>
            <Text style={{ fontSize: 36, marginBottom: 10 }}>🔍</Text>
            <Text style={[styles.emptyTitle, { color: dash.text }]}>Search Your Vault</Text>
            <Text style={[styles.emptyText, { color: dash.textMuted }]}>Type a file name or keyword to find files and folders.</Text>
          </View>
        )}

        {showResults && filteredFolders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: dash.text }]}>Folders</Text>
              {selectionMode ? (
                <View style={styles.sectionActions}>
                  <TouchableOpacity onPress={() => {
                    const folderIds = filteredFolders.map(f => f.id);
                    const allSelected = folderIds.every(id => selectedIds.includes(id));
                    if (allSelected) {
                      setSelectedIds(prev => prev.filter(id => !folderIds.includes(id)));
                    } else {
                      setSelectedIds(prev => [...prev, ...folderIds.filter(id => !prev.includes(id))]);
                    }
                  }} style={styles.textBtn}>
                    <Text style={{ color: dash.accent, fontSize: 13, fontWeight: '700' }}>
                      {filteredFolders.every(f => selectedIds.includes(f.id)) ? 'Deselect All' : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={exitSelectionMode} style={styles.cancelBtn}>
                    <Text style={{ color: dash.textMuted, fontSize: 13, fontWeight: '700' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
            <View style={styles.vaultGrid}>
              {filteredFolders.map((item, index) => (
                <SearchTile key={item.id} item={item} index={index} type="folder" />
              ))}
            </View>
          </View>
        )}

        {showResults && filteredFiles.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: dash.text }]}>Files</Text>
              {selectionMode ? (
                <View style={styles.sectionActions}>
                  <TouchableOpacity onPress={() => {
                    const fileIds = filteredFiles.map(f => f.id);
                    const allSelected = fileIds.every(id => selectedIds.includes(id));
                    if (allSelected) {
                      setSelectedIds(prev => prev.filter(id => !fileIds.includes(id)));
                    } else {
                      setSelectedIds(prev => [...prev, ...fileIds.filter(id => !prev.includes(id))]);
                    }
                  }} style={styles.textBtn}>
                    <Text style={{ color: dash.accent, fontSize: 13, fontWeight: '700' }}>
                      {filteredFiles.every(f => selectedIds.includes(f.id)) ? 'Deselect All' : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    if (selectedIds.length === 0) return;
                    Alert.alert('Delete Selected', `Move ${selectedIds.length} items to trash?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => {
                        selectedIds.forEach(id => softDeleteFile(id));
                        exitSelectionMode();
                      }}
                    ]);
                  }} style={styles.textBtnDanger}>
                    <Text style={{ color: colors.error, fontSize: 13, fontWeight: '700' }}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={exitSelectionMode} style={styles.cancelBtn}>
                    <Text style={{ color: dash.textMuted, fontSize: 13, fontWeight: '700' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={[styles.seeAll, { color: dash.textMuted }]}>{filteredFiles.length} files</Text>
              )}
            </View>
            <View style={styles.vaultGrid}>
              {filteredFiles.map((item, index) => (
                <SearchTile key={item.id} item={item} index={index} type="file" />
              ))}
            </View>
          </View>
        )}

        {showResults && totalResults === 0 && (
          <View style={[styles.emptyCard, { backgroundColor: dash.surface }]}>
            <Text style={{ fontSize: 38, marginBottom: 10, opacity: 0.3 }}>🔍</Text>
            <Text style={[styles.emptyTitle, { color: dash.text }]}>No results found</Text>
            <Text style={[styles.emptyText, { color: dash.textMuted }]}>Try a different search term</Text>
          </View>
        )}

        <View style={{ height: 140 }} />
      </ScrollView>

      <AnimatedTabBar />

      {showFileMenu && targetItem && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowFileMenu(false)}>
          <TouchableOpacity style={modalS.overlay} onPress={() => setShowFileMenu(false)} activeOpacity={1}>
            <View style={[styles.actionSheet, { backgroundColor: dash.surface }]}>
              <View style={[modalS.handle, { backgroundColor: dash.border }]} />
              <Text style={[styles.actionSheetTitle, { color: dash.text }]}>{targetItem.name}</Text>
              {[
                { action: 'favorite', label: targetItem.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: '#FBBF24' },
                { action: 'delete', label: 'Move to Trash', color: colors.error },
                { action: 'shred', label: 'Shred Permanently', color: colors.error },
              ].map(item => (
                <TouchableOpacity key={item.action} style={[styles.actionSheetItem, { borderBottomColor: dash.border }]} onPress={() => handleFileAction(targetItem, item.action)}>
                  <Text style={[styles.actionSheetLabel, { color: item.color }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {showFolderMenu && targetItem && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowFolderMenu(false)}>
          <TouchableOpacity style={modalS.overlay} onPress={() => setShowFolderMenu(false)} activeOpacity={1}>
            <View style={[styles.actionSheet, { backgroundColor: dash.surface }]}>
              <View style={[modalS.handle, { backgroundColor: dash.border }]} />
              <Text style={[styles.actionSheetTitle, { color: dash.text }]}>{targetItem.name}</Text>
              {[
                { action: 'open', label: 'Open Folder', color: dash.accent },
                { action: 'delete', label: 'Move to Trash', color: colors.error },
                { action: 'shred', label: 'Shred Permanently', color: colors.error },
              ].map(item => (
                <TouchableOpacity key={item.action} style={[styles.actionSheetItem, { borderBottomColor: dash.border }]} onPress={() => handleFolderAction(targetItem, item.action)}>
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
  headerTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  headerTagline: { fontSize: 13, fontWeight: '500', marginTop: 4 },
  themeToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollBody: { paddingHorizontal: SCREEN_PADDING, paddingTop: 8, paddingBottom: 140 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },

  categorySection: { paddingVertical: 8, marginBottom: 8 },
  categoryScroll: { paddingHorizontal: 4, gap: 8 },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 6,
  },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryPillLabel: { fontSize: 13 },

  resultsHeader: { paddingVertical: 8, marginBottom: 8 },

  section: { marginBottom: 32 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  seeAll: { fontSize: 13, fontWeight: '600' },
  sectionActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  textBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  textBtnDanger: { paddingHorizontal: 4, paddingVertical: 4 },
  cancelBtn: { paddingHorizontal: 4, paddingVertical: 4 },

  vaultGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: VAULT_GAP },
  vaultTile: { borderRadius: 24, padding: 18, minHeight: 150, justifyContent: 'space-between' },
  vaultTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  vaultIconChip: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  vaultBottomBlock: { marginTop: 14 },
  vaultName: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, marginBottom: 6 },
  vaultMetaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  vaultMeta: { fontSize: 12, fontWeight: '600' },
  checkBox: { marginLeft: 4 },
  checkInner: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },

  emptyCard: { borderRadius: 24, alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  emptyText: { fontSize: 14, textAlign: 'center', marginBottom: 12 },

  actionSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: 36 },
  actionSheetTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 12, marginBottom: 4 },
  actionSheetItem: { paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  actionSheetLabel: { fontSize: 15, fontWeight: '500' },
});

const modalS = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
});
