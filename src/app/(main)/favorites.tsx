// File: src/app/(main)/favorites.tsx
import { router } from 'expo-router';
import { CheckSquare, Copy, Eye, EyeOff, FileText, Folder, Key, Lock, Scissors, Search, ShieldCheck, Star, Trash2, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { Alert, Dimensions, Modal, Pressable, Image as RNImage, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AccessKeyPicker } from '../../components/AccessKeyPicker';
import { AccessKeyRegistrationModal } from '../../components/AccessKeyRegistrationModal';
import { AccessKeyUnlockModal } from '../../components/AccessKeyUnlockModal';
import AnimatedTabBar from '../../components/AnimatedTabBar';
import { ClipboardBar } from '../../components/ClipboardBar';
import { DestructiveConfirmModal, useConfirmDestructive } from '../../components/DestructiveConfirmModal';
import { ViewModeMenu } from '../../components/ViewModeMenu';
import { useRename } from '../../contexts/RenameContext';
import { useMove } from '../../contexts/MoveVaultContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';
import { getFileType } from '../../utils/getFileType';

const wrapAtLength = (text: string, maxLength = 60): string[] => {
  if (!text) return [];
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += maxLength) {
    lines.push(text.slice(i, i + maxLength));
  }
  return lines;
};

const SCREEN_PADDING = 24;

export default function FavoritesScreen() {
  const { colors, space, font, radius, isTablet, screenPadding, bottomTabSpacing, headerPaddingTop } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const viewMode = useSettingsStore((s) => s.viewMode);
  const {
    files, folders, clipboard,
    toggleFavorite, softDeleteFile, createPersonalFavoritesFolder, deleteFolder, shredFile, shredFolder,
    assignFileAccessKey, removeFileAccessKey,
    assignFolderAccessKey, removeFolderAccessKey,
    copyToClipboard, cutToClipboard, pasteFromClipboard, clearClipboard, undoLastCut,
    duplicateFile, duplicateFolder,
    renameFile, renameFolder, moveFileToFolder, moveFolder,
  } = useVaultStore();
  const { accessKeys, createAccessKey, accessKeyExists } = useSettingsStore();
  const { openRenameModal, setOnRename } = useRename();
  const { openMoveModal, setOnMove } = useMove();

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

  const [activeFilter, setActiveFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [targetItem, setTargetItem] = useState<any>(null);
  const [showCreateFavFolder, setShowCreateFavFolder] = useState(false);
  const [newFavFolderName, setNewFavFolderName] = useState('');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [keyPickerTarget, setKeyPickerTarget] = useState<{ id: string; name: string; type: 'file' | 'folder' | 'bulk' } | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string; accessKeyId: string; onUnlock: () => void } | null>(null);
  const [pendingPasswordRemoval, setPendingPasswordRemoval] = useState<{ type: 'file' | 'folder'; id: string; name: string; accessKeyId: string } | null>(null);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [keyCreateTarget, setKeyCreateTarget] = useState<{ id: string; name: string; targetType: 'file' | 'folder' | 'bulk' } | null>(null);
  const { confirmState: delConfirm, confirm: confirmDestructive, close: closeDelConfirm } = useConfirmDestructive();

  const favoriteFiles = files.filter(f => f.isFavorite && !f.isTrash);
  const favoriteFolders = folders.filter(f => f.isFavorite);
  const personalFavFolders = folders.filter(f => f.isPersonalFavoritesFolder);


  const searchedFiles = favoriteFiles.filter(f => {
    if (!debouncedQuery.trim()) return true;
    return f.name.toLowerCase().includes(debouncedQuery.trim().toLowerCase());
  });

  const searchedFolders = favoriteFolders.filter(f => {
    if (!debouncedQuery.trim()) return true;
    return f.name.toLowerCase().includes(debouncedQuery.trim().toLowerCase());
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

  const totalCount = filteredFiles.length + filteredFolders.length;
  const showResults = debouncedQuery.trim().length > 0 || filteredFolders.length > 0 || filteredFiles.length > 0;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const SCREEN_WIDTH = screenWidth;
  const getGridColumns = (mode: string) => {
    if (mode === 'list') return 1;
    if (mode === 'small-icons') return 5;
    if (mode === 'medium-icons') return 3;
    return 2;
  };
  const getGridItemWidth = (mode: string) => {
    const cols = getGridColumns(mode);
    const gap = 12;
    return (SCREEN_WIDTH - SCREEN_PADDING * 2 - gap * (cols - 1)) / cols;
  };
  const isGridMode = viewMode !== 'list';
  const gridColumns = getGridColumns(viewMode);
  const gridItemWidth = getGridItemWidth(viewMode);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const exitSelectionMode = () => { setSelectionMode(false); setSelectedIds([]); };

  const handleBulkCopy = () => {
    const selFolderIds = selectedIds.filter(id => filteredFolders.some(f => f.id === id));
    const selFileIds = selectedIds.filter(id => filteredFiles.some(f => f.id === id));
    copyToClipboard(selFolderIds, selFileIds, null);
    exitSelectionMode();
  };

  const handleBulkCut = () => {
    const selFolderIds = selectedIds.filter(id => filteredFolders.some(f => f.id === id));
    const selFileIds = selectedIds.filter(id => filteredFiles.some(f => f.id === id));
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
          const file = filteredFiles.find(f => f.id === id);
          const folder = filteredFolders.find(f => f.id === id);
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
    const totalItems = filteredFiles.length + filteredFolders.length;
    if (totalItems === 0) return;
    confirmDestructive(
      'Delete Everything',
      `Move ALL ${totalItems} items into retention trash?`,
      async () => {
        for (const file of filteredFiles) await softDeleteFile(file.id);
        for (const folder of filteredFolders) await deleteFolder(folder.id);
        exitSelectionMode();
      },
      'Delete All'
    );
  };

  const handleFileNavigate = (file: any) => {
    if (file.hasAccessKey && file.accessKeyId) {
      setUnlockTarget({
        type: 'file',
        id: file.id,
        name: file.name,
        accessKeyId: file.accessKeyId,
        onUnlock: () => {
          setShowUnlockModal(false);
          setUnlockTarget(null);
          if (file.mimeType?.startsWith('image/')) {
            router.push({ pathname: '/(main)/viewer/image', params: { fileId: file.id } });
          } else if (file.mimeType?.startsWith('video/')) {
            router.push({ pathname: '/(main)/viewer/video', params: { fileId: file.id } });
          } else {
            router.push({ pathname: '/(main)/viewer/document', params: { fileId: file.id } });
          }
        }
      });
      setShowUnlockModal(true);
      return;
    }
    if (file.mimeType?.startsWith('image/')) {
      router.push({ pathname: '/(main)/viewer/image', params: { fileId: file.id } });
    } else if (file.mimeType?.startsWith('video/')) {
      router.push({ pathname: '/(main)/viewer/video', params: { fileId: file.id } });
    } else {
      router.push({ pathname: '/(main)/viewer/document', params: { fileId: file.id } });
    }
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
        setOnRename((newName: string) => {
          if (file.mimeType?.startsWith('image/') || file.mimeType?.startsWith('video/') || file.mimeType?.includes('pdf') || file.mimeType?.includes('document') || file.mimeType?.includes('text')) {
            renameFile(file.id, newName.trim());
          } else {
            renameFile(file.id, newName.trim());
          }
        });
        break;
      case 'move':
        setOnMove((destinationFolderId: string | null) => {
          if (destinationFolderId !== null) {
            moveFileToFolder(file.id, destinationFolderId);
          }
        });
        openMoveModal(
          { id: file.id, name: file.name, type: 'file' },
          folders.filter(f => f.id !== file.folderId).map(f => ({ id: f.id, name: f.name, parentId: f.parentId })),
          file.folderId
        );
        break;
      case 'export': Alert.alert('Export', 'Export functionality available from the file viewer.'); break;
      case 'favorite': toggleFavorite(file.id); break;
      case 'copy':
        copyToClipboard([], [file.id], null);
        break;
      case 'cut':
        cutToClipboard([], [file.id], null);
        break;
      case 'duplicate':
        duplicateFile(file.id);
        break;
      case 'delete':
        confirmDestructive(
          'Move to Trash',
          `Move "${file.name}" into retention trash?`,
          () => softDeleteFile(file.id)
        );
        break;
      case 'shred':
        confirmDestructive(
          'Permanently Shred',
          `Permanently shred "${file.name}"?`,
          () => shredFile(file.id),
          'Shred Permanently'
        );
        break;
      case 'register-key': handleOpenKeyModal(file.id, file.name, 'file'); break;
      case 'assign-key': if (accessKeys.length === 0) { Alert.alert('No Access Keys', 'Create an access key in Settings first.'); } else { setKeyPickerTarget({ id: file.id, name: file.name, type: 'file' }); } break;
      case 'remove-key':
        setPendingPasswordRemoval({
          type: 'file',
          id: file.id,
          name: file.name,
          accessKeyId: file.accessKeyId
        });
        setShowUnlockModal(true);
        break;
    }
  };

  const handleFolderNavigate = (folder: any) => {
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
  };

  const handleFolderAction = (folder: any, action: string) => {
    setShowFolderMenu(false);
    switch (action) {
      case 'rename':
        openRenameModal({ id: folder.id, name: folder.name, type: 'folder' });
        setOnRename((newName: string) => {
          renameFolder(folder.id, newName.trim());
        });
        break;
      case 'move':
        setOnMove((destinationFolderId: string | null) => {
          if (destinationFolderId !== null) {
            moveFolder(folder.id, destinationFolderId);
          }
        });
        openMoveModal(
          { id: folder.id, name: folder.name, type: 'folder' },
          folders.filter(f => f.id !== folder.id).map(f => ({ id: f.id, name: f.name, parentId: f.parentId })),
          folder.parentId
        );
        break;
      case 'export': Alert.alert('Export', 'Export functionality available from the folder view.'); break;
      case 'favorite': toggleFavorite(folder.id); break;
      case 'open': handleFolderNavigate(folder); break;
      case 'copy':
        copyToClipboard([folder.id], [], null);
        break;
      case 'cut':
        cutToClipboard([folder.id], [], null);
        break;
      case 'duplicate':
        duplicateFolder(folder.id);
        break;
      case 'paste':
        if (clipboard) {
          pasteFromClipboard(folder.id).then((result) => {
            if (result.pastedFiles === 0 && result.pastedFolders === 0) return;
            Alert.alert('Paste Complete', `${result.pastedFolders} folder${result.pastedFolders !== 1 ? 's' : ''}, ${result.pastedFiles} file${result.pastedFiles !== 1 ? 's' : ''} pasted.`);
          }).catch(() => Alert.alert('Paste Failed', 'Could not paste items.'));
        }
        break;
      case 'delete':
        confirmDestructive(
          'Move to Trash',
          `Move "${folder.name}" into retention trash?`,
          () => deleteFolder(folder.id)
        );
        break;
        case 'shred':
          confirmDestructive(
            'Permanently Shred',
            `Shred "${folder.name}" and all its contents permanently?`,
            () => shredFolder(folder.id),
            'Shred Permanently'
          );
          break;
      case 'register-key': handleOpenKeyModal(folder.id, folder.name, 'folder'); break;
      case 'assign-key': if (accessKeys.length === 0) { Alert.alert('No Access Keys', 'Create an access key in Settings first.'); } else { setKeyPickerTarget({ id: folder.id, name: folder.name, type: 'folder' }); } break;
      case 'remove-key':
        setPendingPasswordRemoval({
          type: 'folder',
          id: folder.id,
          name: folder.name,
          accessKeyId: folder.accessKeyId
        });
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
      Alert.alert('Paste Complete', `${result.pastedFolders} folder${result.pastedFolders !== 1 ? 's' : ''}, ${result.pastedFiles} file${result.pastedFiles !== 1 ? 's' : ''} pasted.`);
    } catch {
      Alert.alert('Paste Failed', 'Could not paste items.');
    }
  };

  const isEmpty = totalCount === 0 && personalFavFolders.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: dash.bg }]}>
      <View style={[styles.headerRow, { backgroundColor: dash.bg }]}>
        <View style={styles.headerTextBlock}>
          <Text style={[styles.headerTitle, { color: dash.text }]} numberOfLines={1}>Favorites</Text>
          <Text style={[styles.headerTagline, { color: dash.textMuted }]} numberOfLines={1}>Your starred items</Text>
        </View>
        <ViewModeMenu />
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
              <X size={16} color={dash.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>

        <ClipboardBar
          onPaste={handlePasteToFolder}
          onUndo={undoLastCut}
          backgroundColor={dash.surface}
          textColor={dash.text}
          accentColor={dash.accent}
          mutedColor={dash.textMuted}
        />

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

        <View style={styles.resultsHeader}>
          <Text style={[{ color: dash.textMuted, fontSize: 13 }]}>
            <Text style={{ fontWeight: '600', color: dash.text }}>{totalCount}</Text>{' '}
            {totalCount === 1 ? 'item' : 'items'} found
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: dash.text }]}>Favorite Folders</Text>
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
                  }} style={styles.iconActionPill}>
                    <CheckSquare size={18} color={dash.text} strokeWidth={2.5} />
                  </TouchableOpacity>
                  {selectedIds.length > 0 && (
                    <>
                      <TouchableOpacity onPress={handleBulkCopy} style={styles.iconActionPill}>
                        <Copy size={18} color={dash.text} strokeWidth={2.5} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleBulkCut} style={styles.iconActionPill}>
                        <Scissors size={18} color={dash.text} strokeWidth={2.5} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleBulkSoftDelete} style={[styles.iconActionPill, { backgroundColor: `${colors.error}18` }]}>
                        <Trash2 size={18} color={colors.error} strokeWidth={2.5} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleBulkAssignExistingKey} style={styles.iconActionPill}>
                        <Key size={18} color={dash.accent} strokeWidth={2.5} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleBulkCreateAndAssignKey} style={styles.iconActionPill}>
                        <ShieldCheck size={18} color={dash.accent} strokeWidth={2.5} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleDeleteAll} style={[styles.iconActionPill, { backgroundColor: `${colors.error}18` }]}>
                        <Trash2 size={18} color={colors.error} strokeWidth={2.5} />
                      </TouchableOpacity>
                    </>
                  )}
                  <TouchableOpacity onPress={exitSelectionMode} style={styles.cancelBtn}>
                    <Text style={{ color: dash.textMuted, fontSize: 13, fontWeight: '700' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
          </View>

          {filteredFolders.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: dash.surface }]}>
              <Star size={36} color="#FBBF24" strokeWidth={1.5} style={{ marginBottom: 10 }} />
              <Text style={[styles.emptyTitle, { color: dash.text }]}>No Favorite Folders</Text>
              <Text style={[styles.emptyText, { color: dash.textMuted }]}>Long-press any folder and tap the star to favorite it.</Text>
            </View>
          ) : isGridMode ? (
            <View style={[styles.iconGrid, { gap: 12 }]}>
              {filteredFolders.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                const hasAccess = item.hasAccessKey || item.accessKeyId;
                return (
                  <Pressable
                    key={item.id}
                    onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
                    onPress={() => {
                      if (selectionMode) { toggleSelection(item.id); return; }
                      handleFolderNavigate(item);
                    }}
                    style={[
                      styles.iconGridItem,
                      {
                        width: gridItemWidth,
                        backgroundColor: dash.surface,
                        borderColor: isSelected ? dash.accent : 'transparent',
                        borderWidth: 2,
                      },
                    ]}
                  >
                    <View style={[styles.iconGridThumb, { backgroundColor: `${dash.accent}18` }]}>
                      <Folder size={viewMode === 'small-icons' ? 24 : viewMode === 'medium-icons' ? 28 : 32} color={dash.accent} strokeWidth={1.8} />
                      {hasAccess && (
                        <View style={[styles.thumbBadge, { backgroundColor: dash.accent }]}>
                          <Lock size={10} color="#FFF" strokeWidth={3} />
                        </View>
                      )}
                    </View>
                    {wrapAtLength(item.name, 60).map((line, index) => (
                      <Text key={index} style={[styles.iconGridName, { color: dash.text }]}>{line}</Text>
                    ))}
                    <View style={styles.iconGridIconsRow}>
                      {item.isFavorite && <Star size={12} color="#FBBF24" />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            filteredFolders.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              const isCutPending = clipboard?.mode === 'cut' && clipboard.folderIds.includes(item.id);
              return (
                <View
                  key={item.id}
                  style={[styles.folderCard, { backgroundColor: dash.surface }, isSelected && [styles.folderCardSelected, { borderColor: dash.accent }], isCutPending && { opacity: 0.5 }]}
                >
                  <TouchableOpacity
                    style={styles.folderCardLeft}
                    onPress={() => {
                      if (selectionMode) {
                        toggleSelection(item.id);
                        return;
                      }
                      handleFolderNavigate(item);
                    }}
                    onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.folderIconContainer, { backgroundColor: dash.surface }]}>
                      <Folder size={24} color={dash.text} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          {wrapAtLength(item.name, 60).map((line, index) => (
                            <Text key={index} style={[styles.folderTitleText, { color: dash.text }]}>{line}</Text>
                          ))}
                        </View>
                        {item.hasAccessKey && item.accessKeyId && <Lock size={14} color={dash.accent} strokeWidth={2} style={{ marginLeft: 6 }} />}
                        {item.isFavorite && <Star size={14} color="#FBBF24" strokeWidth={2} style={{ marginLeft: 4 }} />}
                      </View>
                      <Text style={[styles.folderMetaText, { color: dash.textMuted }]}>Directory Folder</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.folderActionsRight}>
                    {selectionMode && (
                      <View style={[
                        styles.checkboxIndicator,
                        { borderColor: dash.textMuted },
                        isSelected && { backgroundColor: dash.accent, borderColor: dash.accent }
                      ]} />
                    )}
                    {!selectionMode && (
                    <TouchableOpacity
                      style={{ padding: space(1) }}
                      onPress={() => {
                        setTargetItem(item);
                        setShowFolderMenu(true);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={[{ color: dash.textMuted, fontSize: font(14), fontWeight: '700' }]}>•••</Text>
                    </TouchableOpacity>
                    )}
                    {!selectionMode && <Text style={[styles.chevronIcon, { color: dash.textMuted }]}>›</Text>}
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: dash.text }]}>Favorite Files</Text>
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
                  }} style={styles.iconActionPill}>
                    <CheckSquare size={18} color={dash.text} strokeWidth={2.5} />
                  </TouchableOpacity>
                  {selectedIds.length > 0 && (
                    <>
                      <TouchableOpacity onPress={handleBulkCopy} style={styles.iconActionPill}>
                        <Copy size={18} color={dash.text} strokeWidth={2.5} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleBulkCut} style={styles.iconActionPill}>
                        <Scissors size={18} color={dash.text} strokeWidth={2.5} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleBulkSoftDelete} style={[styles.iconActionPill, { backgroundColor: `${colors.error}18` }]}>
                        <Trash2 size={18} color={colors.error} strokeWidth={2.5} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleBulkAssignExistingKey} style={styles.iconActionPill}>
                        <Key size={18} color={dash.accent} strokeWidth={2.5} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleBulkCreateAndAssignKey} style={styles.iconActionPill}>
                        <ShieldCheck size={18} color={dash.accent} strokeWidth={2.5} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleDeleteAll} style={[styles.iconActionPill, { backgroundColor: `${colors.error}18` }]}>
                        <Trash2 size={18} color={colors.error} strokeWidth={2.5} />
                      </TouchableOpacity>
                    </>
                  )}
                  <TouchableOpacity onPress={exitSelectionMode} style={styles.cancelBtn}>
                    <Text style={{ color: dash.textMuted, fontSize: 13, fontWeight: '700' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
              <Text style={[styles.seeAll, { color: dash.textMuted }]}>{filteredFiles.length} files</Text>
            )}
          </View>

          {filteredFiles.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: dash.surface }]}>
              <Folder size={36} color={dash.textMuted} strokeWidth={1.5} style={{ marginBottom: 10 }} />
              <Text style={[styles.emptyTitle, { color: dash.text }]}>No Favorite Files</Text>
              <Text style={[styles.emptyText, { color: dash.textMuted }]}>Long-press any file and tap the star to favorite it.</Text>
            </View>
          ) : isGridMode ? (
            <View style={[styles.iconGrid, { gap: 12 }]}>
              {filteredFiles.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                const isCutPending = clipboard?.mode === 'cut' && clipboard.fileIds.includes(item.id);
                const ft = getFileType(item.mimeType, item.name);
                const hasThumbnail = item.mimeType?.startsWith('image/') || item.mimeType?.startsWith('video/');
                const thumbColor = ft?.color ?? dash.textMuted;
                return (
                  <Pressable
                    key={item.id}
                    onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
                    onPress={() => {
                      if (selectionMode) { toggleSelection(item.id); return; }
                      handleFileNavigate(item);
                    }}
                    style={[
                      styles.iconGridItem,
                      {
                        width: gridItemWidth,
                        backgroundColor: dash.surface,
                        borderColor: isSelected ? dash.accent : 'transparent',
                        borderWidth: 2,
                      },
                    ]}
                  >
                    <View style={[styles.iconGridThumb, { backgroundColor: `${thumbColor}18` }]}>
                      {hasThumbnail && item.localPath ? (
                        <RNImage
                          source={{ uri: item.localPath }}
                          style={styles.iconGridThumbImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                          {ft?.icon || <FileText size={28} color={dash.text} strokeWidth={2} />}
                        </View>
                      )}
                      {item.mimeType?.startsWith('video/') && (
                        <View style={styles.videoBadge}>
                          <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '700' }}>▶</Text>
                        </View>
                      )}
                      {item.hasAccessKey && item.accessKeyId && (
                        <View style={[styles.thumbBadge, { backgroundColor: dash.accent }]}>
                          <Lock size={10} color="#FFF" strokeWidth={3} />
                        </View>
                      )}
                    </View>
                    {wrapAtLength(item.name, 60).map((line, index) => (
                      <Text key={index} style={[styles.iconGridName, { color: dash.text }]}>{line}</Text>
                    ))}
                    <View style={styles.iconGridIconsRow}>
                      {item.isFavorite && <Star size={12} color="#FBBF24" />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            filteredFiles.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              const isCutPending = clipboard?.mode === 'cut' && clipboard.fileIds.includes(item.id);
              const ft = getFileType(item.mimeType, item.name);
              return (
                <View
                  key={item.id}
                  style={[styles.fileCard, { backgroundColor: dash.surface }, isSelected && [styles.fileCardSelected, { borderColor: dash.accent }], isCutPending && { opacity: 0.5 }]}
                >
                  <TouchableOpacity
                    style={styles.fileCardLeft}
                    onPress={() => {
                      if (selectionMode) {
                        toggleSelection(item.id);
                        return;
                      }
                      handleFileNavigate(item);
                    }}
                    onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.fileIconContainer, { backgroundColor: dash.surface }]}>
                      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                        {ft?.icon || <FileText size={24} color={dash.text} strokeWidth={2} />}
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          {wrapAtLength(item.name, 60).map((line, index) => (
                            <Text key={index} style={[styles.fileTitleText, { color: dash.text }]}>{line}</Text>
                          ))}
                        </View>
                        {item.hasAccessKey && item.accessKeyId && <Lock size={14} color={dash.accent} strokeWidth={2} style={{ marginLeft: 6 }} />}
                        {item.isFavorite && <Star size={14} color="#FBBF24" strokeWidth={2} style={{ marginLeft: 4 }} />}
                      </View>
                      <Text style={[styles.fileMetaText, { color: dash.textMuted }]}>{(item.size / 1024).toFixed(1)} KB</Text>
                      {ft && (
                        <Text style={[styles.fileMetaText, { color: ft.color }]}>{ft.label}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.fileActionsRight}>
                    {selectionMode && (
                      <View style={[
                        styles.checkboxIndicator,
                        { borderColor: dash.textMuted },
                        isSelected && { backgroundColor: dash.accent, borderColor: dash.accent }
                      ]} />
                    )}
                    <TouchableOpacity
                      style={{ padding: space(1) }}
                      onPress={() => {
                        setTargetItem(item);
                        setShowFileMenu(true);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={[{ color: dash.textMuted, fontSize: font(14), fontWeight: '700' }]}>•••</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ padding: space(1) }}
                      onPress={() => confirmDestructive(
                        'Move to Trash',
                        `Move "${item.name}" into retention trash?`,
                        () => softDeleteFile(item.id),
                        'Move to Trash'
                      )}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Trash2 size={22} color="#FF453A" strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 140 }} />
      </ScrollView>

      <DestructiveConfirmModal state={delConfirm} onClose={closeDelConfirm} />

      <AnimatedTabBar />

      <Modal visible={showCreateFavFolder} transparent animationType="fade" onRequestClose={() => setShowCreateFavFolder(false)}>
        <View style={modalS.centeredOverlay}>
          <View style={[modalS.centeredCard, { backgroundColor: dash.surface }]}>
            <Text style={[modalS.centeredTitle, { color: dash.text }]}>New Favorites Folder</Text>
            <TextInput
              style={[modalS.centeredInput, { borderColor: dash.border, color: dash.text, backgroundColor: dash.bg }]}
              placeholder="Folder name"
              placeholderTextColor={dash.textMuted}
              value={newFavFolderName}
              onChangeText={setNewFavFolderName}
              autoFocus
            />
            <View style={modalS.centeredBtnRow}>
              <TouchableOpacity onPress={() => setShowCreateFavFolder(false)} style={[modalS.btn, { borderColor: dash.border, borderWidth: 1 }]}>
                <Text style={{ color: dash.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={createPersonalFolder} style={[modalS.btn, { backgroundColor: dash.fabBg }]}>
                <Text style={{ color: dash.fabText, fontWeight: '700' }}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showFileMenu && targetItem && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowFileMenu(false)}>
          <TouchableOpacity style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setShowFileMenu(false)} activeOpacity={1}>
            <View style={[{ backgroundColor: dash.surface, borderRadius: space(5), padding: space(6), borderWidth: 1, borderColor: dash.border, alignSelf: 'center', width: '100%' }, { paddingBottom: space(9), maxWidth: isTablet ? 520 : '100%' }]}>
              <View style={{ width: space(10), height: space(1), borderRadius: 1, backgroundColor: dash.border, alignSelf: 'center', marginBottom: space(4) }} />
              <View>
                {wrapAtLength(targetItem.name, 60).map((line, index) => (
                  <Text key={index} style={[{ color: dash.text, fontSize: font(18), fontWeight: '700', marginBottom: space(4) }]}>{line}</Text>
                ))}
              </View>
              {(() => {
                const hasPassword = targetItem.hasAccessKey && targetItem.accessKeyId;
                const baseItems = [
                  { action: 'rename', label: 'Rename', color: dash.text },
                  { action: 'move', label: 'Move to...', color: dash.text },
                  { action: 'export', label: 'Export / Save to Device', color: dash.text },
                  { action: 'favorite', label: targetItem.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: '#FBBF24' },
                  { action: 'delete', label: 'Move to Trash', color: colors.error },
                  { action: 'shred', label: 'Shred Permanently', color: colors.error },
                ];
                baseItems.splice(3, 0, { action: 'copy', label: 'Copy', color: dash.accent });
                baseItems.splice(4, 0, { action: 'cut', label: 'Cut', color: dash.accent });
                baseItems.splice(5, 0, { action: 'duplicate', label: 'Duplicate', color: dash.text });
                if (hasPassword) {
                  baseItems.splice(5, 0, { action: 'remove-key', label: 'Remove Assigned Access Key', color: colors.error });
                } else {
                  baseItems.splice(5, 0,
                    { action: 'register-key', label: 'Assign and Create Access Key', color: dash.accent },
                    { action: 'assign-key', label: 'Assign Existing Password', color: dash.accent }
                  );
                }
                return baseItems;
              })().map(item => (
                <TouchableOpacity key={item.action} style={{ paddingVertical: space(3), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: dash.border }} onPress={() => handleFileAction(targetItem, item.action)}>
                  <Text style={[{ color: item.color, fontSize: font(15), fontWeight: '500' }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {showFolderMenu && targetItem && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowFolderMenu(false)}>
          <TouchableOpacity style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setShowFolderMenu(false)} activeOpacity={1}>
            <View style={[{ backgroundColor: dash.surface, borderRadius: space(5), padding: space(6), borderWidth: 1, borderColor: dash.border, alignSelf: 'center', width: '100%' }, { paddingBottom: space(9), maxWidth: isTablet ? 520 : '100%' }]}>
              <View style={{ width: space(10), height: space(1), borderRadius: 1, backgroundColor: dash.border, alignSelf: 'center', marginBottom: space(4) }} />
              <View>
                {wrapAtLength(targetItem.name, 60).map((line, index) => (
                  <Text key={index} style={[{ color: dash.text, fontSize: font(18), fontWeight: '700', marginBottom: space(4) }]}>{line}</Text>
                ))}
              </View>
              {(() => {
                const hasPassword = targetItem.hasAccessKey && targetItem.accessKeyId;
                const hasClipboard = !!clipboard;
                const baseItems = [
                  { action: 'rename', label: 'Rename', color: dash.text },
                  { action: 'move', label: 'Move', color: dash.text },
                  { action: 'export', label: 'Export', color: dash.text },
                  { action: 'favorite', label: targetItem.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: '#FBBF24' },
                  { action: 'delete', label: 'Move to Trash', color: colors.error },
                  { action: 'shred', label: 'Shred Permanently', color: colors.error },
                ];
                if (hasClipboard) {
                  baseItems.splice(3, 0, { action: 'paste', label: 'Paste Here', color: dash.accent });
                }
                baseItems.splice(3, 0, { action: 'duplicate', label: 'Duplicate', color: dash.text });
                if (hasPassword) {
                  baseItems.splice(4, 0, { action: 'remove-key', label: 'Remove Assigned Access Key', color: colors.error });
                } else {
                  baseItems.splice(4, 0,
                    { action: 'register-key', label: 'Assign and Create Access Key', color: dash.accent },
                    { action: 'assign-key', label: 'Assign Existing Password', color: dash.accent }
                  );
                }
                return baseItems;
              })().map(item => (
                <TouchableOpacity key={item.action} style={{ paddingVertical: space(3), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: dash.border }} onPress={() => handleFolderAction(targetItem, item.action)}>
                  <Text style={[{ color: item.color, fontSize: font(15), fontWeight: '500' }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      <AccessKeyPicker
        visible={!!keyPickerTarget}
        onClose={() => setKeyPickerTarget(null)}
        onSelectPassword={async (passwordId: string) => {
          if (!keyPickerTarget) return;
          if (keyPickerTarget.type === 'bulk') {
            for (const id of selectedIds) {
              const file = filteredFiles.find(f => f.id === id);
              const folder = filteredFolders.find(f => f.id === id);
              if (file) await assignFileAccessKey(id, passwordId);
              else if (folder) await assignFolderAccessKey(id, passwordId);
            }
            Alert.alert('Access Key Assigned', `Access key has been assigned to ${selectedIds.length} items.`);
          } else if (keyPickerTarget.type === 'file') {
            await assignFileAccessKey(keyPickerTarget.id, passwordId);
            Alert.alert('Access Key Assigned', 'The selected access key is now registered.');
          } else {
            await assignFolderAccessKey(keyPickerTarget.id, passwordId);
            Alert.alert('Access Key Assigned', 'The selected access key is now registered.');
          }
          setKeyPickerTarget(null);
        }}
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
              if (pendingPasswordRemoval.type === 'file') {
                removeFileAccessKey(pendingPasswordRemoval.id);
              } else {
                removeFolderAccessKey(pendingPasswordRemoval.id);
              }
              Alert.alert('Access Key Removed', 'The access key has been removed from this item.');
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
      target={keyCreateTarget ? { id: keyCreateTarget.id, name: keyCreateTarget.name, type: keyCreateTarget.targetType } : null}
      selectedItemIds={keyCreateTarget?.targetType === 'bulk' ? selectedIds : [keyCreateTarget?.id ?? '']}
      itemTypes={{ ...Object.fromEntries(filteredFiles.filter(f => selectedIds.includes(f.id)).map(f => [f.id, 'file'])), ...Object.fromEntries(filteredFolders.filter(f => selectedIds.includes(f.id)).map(f => [f.id, 'folder'])) }}
      onClose={() => { setShowCreateKeyModal(false); setKeyCreateTarget(null); }}
      onSuccess={() => { setShowCreateKeyModal(false); setKeyCreateTarget(null); }}
      assignFolderAccessKey={assignFolderAccessKey}
      assignFileAccessKey={assignFileAccessKey}
    />

    <AccessKeyPicker
      visible={!!keyPickerTarget}
      onClose={() => { setKeyPickerTarget(null); }}
      onSelectPassword={async (passwordId: string) => {
        if (!keyPickerTarget) return;
        if (keyPickerTarget.type === 'bulk') {
          for (const id of selectedIds) {
            const file = filteredFiles.find(f => f.id === id);
            const folder = filteredFolders.find(f => f.id === id);
            if (file) await assignFileAccessKey(id, passwordId);
            else if (folder) await assignFolderAccessKey(id, passwordId);
          }
          Alert.alert('Access Key Assigned', `Access key has been assigned to ${selectedIds.length} items.`);
        } else if (keyPickerTarget.type === 'file') {
          await assignFileAccessKey(keyPickerTarget.id, passwordId);
          Alert.alert('Access Key Assigned', 'The selected access key is now registered.');
        } else {
          await assignFolderAccessKey(keyPickerTarget.id, passwordId);
          Alert.alert('Access Key Assigned', 'The selected access key is now registered.');
        }
        setKeyPickerTarget(null);
      }}
    />

    {/* Access Key Unlock Modal */}
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
            if (pendingPasswordRemoval.type === 'file') {
              removeFileAccessKey(pendingPasswordRemoval.id);
            } else {
              removeFolderAccessKey(pendingPasswordRemoval.id);
            }
            Alert.alert('Access Key Removed', 'The access key has been removed from this item.');
            setPendingPasswordRemoval(null);
          } else if (unlockTarget) {
            unlockTarget.onUnlock();
          }
          setShowUnlockModal(false);
          setUnlockTarget(null);
        }}
      />
    )}
  </View>
  );
}

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

  section: { marginBottom: 32 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  seeAll: { fontSize: 13, fontWeight: '600' },
  sectionActions: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  iconActionPill: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  textBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  textBtnDanger: { paddingHorizontal: 4, paddingVertical: 4 },
  cancelBtn: { paddingHorizontal: 4, paddingVertical: 4 },

  iconGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  iconGridItem: { borderRadius: 18, padding: 10, alignItems: 'center', marginBottom: 12 },
  iconGridThumb: { width: '100%', aspectRatio: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8, overflow: 'hidden' },
  iconGridThumbImage: { width: '100%', height: '100%', borderRadius: 14 },
  thumbBadge: { position: 'absolute', bottom: 4, right: 4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  videoBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  iconGridName: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 3 },
  iconGridIconsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  folderCard: { borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  folderCardSelected: { borderWidth: 1 },
  folderCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  folderIconContainer: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  folderTitleText: { fontSize: 16, fontWeight: '600', paddingRight: 8 },
  folderMetaText: { fontSize: 12, marginTop: 2 },
  folderActionsRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileCard: { borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  fileCardSelected: { borderWidth: 1 },
  fileCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  fileIconContainer: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  fileTitleText: { fontSize: 15, fontWeight: '600', paddingRight: 8 },
  fileMetaText: { fontSize: 12, marginTop: 2 },
  fileActionsRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkboxIndicator: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, marginRight: 12 },
  checkboxIndicatorActive: {},
  cardMenuIcon: { padding: 6 },
  menuDotsText: { fontSize: 14, fontWeight: '700' },
  chevronIcon: { fontSize: 22, fontWeight: '600' },
  checkBox: { marginLeft: 4 },

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

  emptyCard: { borderRadius: 24, alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  emptyText: { fontSize: 14, textAlign: 'center', marginBottom: 12 },

  actionSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: 36 },
  actionSheetTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 12, marginBottom: 4 },
  actionSheetItem: { paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  actionSheetLabel: { fontSize: 15, fontWeight: '500' },
});

const modalS = StyleSheet.create({
  centeredOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  centeredCard: { width: '90%', maxWidth: 400, maxHeight: '80%', borderRadius: 24, padding: 20, alignItems: 'center' },
  centeredTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20, letterSpacing: -0.3 },
  centeredInput: { width: '100%', borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20, fontSize: 15 },
  centeredBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16, letterSpacing: -0.3 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16, fontSize: 15 },
  btnRow: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
});

const pms = StyleSheet.create({
  content: { width: '100%', alignItems: 'stretch' },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 12 },
  targetRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 28, gap: 10 },
  targetChip: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  targetChipText: { fontSize: 13, fontWeight: '600' },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  optionalBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, marginLeft: 8 },
  optionalBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  input: { width: '100%', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  inputIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  passwordWrapper: { position: 'relative' },
  eyeButton: { position: 'absolute', right: 14, top: '50%', marginTop: -12, padding: 6 },
  sectionDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 28 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: 16 },
  strengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  strengthBar: { height: 4, borderRadius: 2, flex: 1, overflow: 'hidden' },
  strengthFill: { height: '100%', borderRadius: 2 },
  strengthText: { fontSize: 11, fontWeight: '600' },
  validationBox: { marginTop: 10, padding: 12, borderRadius: 12 },
  validationTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  validationItem: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  validationIcon: { fontSize: 12, marginRight: 8, fontWeight: '700', width: 16, textAlign: 'center' },
  validationText: { fontSize: 12, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 32 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  cancelText: { fontSize: 15, fontWeight: '700' },
  primaryBtn: { flex: 1.2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  primaryText: { fontSize: 15, fontWeight: '700' },
});
