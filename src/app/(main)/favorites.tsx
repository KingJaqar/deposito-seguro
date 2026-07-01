// File: src/app/(main)/favorites.tsx
import { router } from 'expo-router';
import { Image, Star, Undo2, FileText, Folder, Lock, Trash2, Search, X, MoreVertical } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Image as RNImage } from 'react-native';
import AnimatedTabBar from '../../components/AnimatedTabBar';
import { ClipboardBar } from '../../components/ClipboardBar';
import { DestructiveConfirmModal, useConfirmDestructive } from '../../components/DestructiveConfirmModal';
import { ViewModeMenu } from '../../components/ViewModeMenu';
import { AccessKeyPicker } from '../../components/AccessKeyPicker';
import { AccessKeyUnlockModal } from '../../components/AccessKeyUnlockModal';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';
import { validatePassword } from '../../utils/accessKeyValidation';
import { getFileType } from '../../utils/getFileType';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCREEN_PADDING = 24;

export default function FavoritesScreen() {
  const { colors, space, font, radius, isTablet, screenPadding, bottomTabSpacing, headerPaddingTop } = useTheme();
  const viewMode = useSettingsStore((s) => s.viewMode);
  const {
    files, folders, clipboard,
    toggleFavorite, softDeleteFile, createPersonalFavoritesFolder, deleteFolder, shredFile,
    assignFileAccessKey, removeFileAccessKey,
    assignFolderAccessKey, removeFolderAccessKey,
    copyToClipboard, cutToClipboard, pasteFromClipboard, clearClipboard, undoLastCut,
    duplicateFile, duplicateFolder,
  } = useVaultStore();
  const { accessKeys, createAccessKey, accessKeyExists } = useSettingsStore();

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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [targetItem, setTargetItem] = useState<any>(null);
  const [showCreateFavFolder, setShowCreateFavFolder] = useState(false);
  const [newFavFolderName, setNewFavFolderName] = useState('');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [keyPickerTarget, setKeyPickerTarget] = useState<{ id: string; name: string; type: 'file' | 'folder' } | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string; accessKeyId: string; onUnlock: () => void } | null>(null);
  const [showCreatePasswordModal, setShowCreatePasswordModal] = useState(false);
  const [createPasswordTarget, setCreatePasswordTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);
  const [newPasswordLabel, setNewPasswordLabel] = useState('');
  const [newPasswordDescription, setNewPasswordDescription] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');
  const [pendingPasswordRemoval, setPendingPasswordRemoval] = useState<{ type: 'file' | 'folder'; id: string; name: string; accessKeyId: string } | null>(null);
  const { confirmState: delConfirm, confirm: confirmDestructive, close: closeDelConfirm } = useConfirmDestructive();

  const favoriteFiles = files.filter(f => f.isFavorite && !f.isTrash);
  const favoriteFolders = folders.filter(f => f.isFavorite);
  const personalFavFolders = folders.filter(f => f.isPersonalFavoritesFolder);

  useEffect(() => {}, []);

  const searchedFiles = favoriteFiles.filter(f => {
    if (!query.trim()) return true;
    return f.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  const searchedFolders = favoriteFolders.filter(f => {
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

  const totalCount = filteredFiles.length + filteredFolders.length;
  const showResults = query.trim().length > 0 || filteredFolders.length > 0 || filteredFiles.length > 0;

  const SCREEN_WIDTH = Dimensions.get('window').width;
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

  const handleCreateAndAssignPassword = (targetId: string, targetName: string, targetType: 'file' | 'folder') => {
    if (accessKeys.length >= 20) {
      Alert.alert('Access Key Limit', 'You can only create up to 20 access keys.');
      return;
    }
    setCreatePasswordTarget({ type: targetType, id: targetId, name: targetName });
    setShowCreatePasswordModal(true);
  };

  const confirmCreateAndAssignPassword = async () => {
    if (!createPasswordTarget) return;
    if (!newPasswordLabel.trim()) {
      Alert.alert('Password Label Required', 'Give this access key a recognizable name.');
      return;
    }
    if (accessKeyExists(newPasswordLabel)) {
      Alert.alert('Password Label Already Used', 'Access key labels must be unique.');
      return;
    }
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      Alert.alert('Password Does Not Meet Requirements', validation.message);
      return;
    }
    if (newPassword !== newConfirmPassword) {
      Alert.alert('Passwords Do Not Match', 'Please confirm your password correctly.');
      return;
    }
    const fp = await createAccessKey(newPasswordLabel, newPassword, newPasswordDescription);
    if (!fp) {
      Alert.alert('Access Key Limit', 'You can only create up to 20 access keys.');
      return;
    }
    if (createPasswordTarget.type === 'file') {
      await assignFileAccessKey(createPasswordTarget.id, fp.id);
    } else {
      await assignFolderAccessKey(createPasswordTarget.id, fp.id);
    }
    setShowCreatePasswordModal(false);
    setCreatePasswordTarget(null);
    setNewPasswordLabel('');
    setNewPasswordDescription('');
    setNewPassword('');
    setNewConfirmPassword('');
    Alert.alert('Access Key Created & Assigned', `${fp.label} has been created and assigned.`);
  };

  const handleFileAction = (file: any, action: string) => {
    setShowFileMenu(false);
    switch (action) {
      case 'rename': setTargetItem(file); setRenameText(file.name); setShowRenameModal(true); break;
      case 'move': Alert.alert('Move', 'Select a destination folder to move this file.'); break;
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
      case 'register-key': handleCreateAndAssignPassword(file.id, file.name, 'file'); break;
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
      case 'rename': setTargetItem(folder); setRenameText(folder.name); setShowRenameModal(true); break;
      case 'move': Alert.alert('Move', 'Select a destination folder to move this folder.'); break;
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
          () => deleteFolder(folder.id),
          'Shred Permanently'
        );
        break;
      case 'register-key': handleCreateAndAssignPassword(folder.id, folder.name, 'folder'); break;
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
                }} style={styles.textBtn}>
                  <Text style={{ color: dash.accent, fontSize: 13, fontWeight: '700' }}>
                    {filteredFolders.every(f => selectedIds.includes(f.id)) ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
                {selectedIds.length > 0 && (
                  <>
                    <TouchableOpacity onPress={handleBulkCopy} style={styles.textBtn}>
                      <Text style={{ color: dash.text, fontSize: 13, fontWeight: '700' }}>Copy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleBulkCut} style={styles.textBtn}>
                      <Text style={{ color: dash.text, fontSize: 13, fontWeight: '700' }}>Cut</Text>
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
                    <Text style={[styles.iconGridName, { color: dash.text }]} numberOfLines={1}>{item.name}</Text>
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
                    activeOpacity={0.7}
                  >
                    <View style={[styles.folderIconContainer, { backgroundColor: dash.surface }]}>
                      <Folder size={24} color={dash.text} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[styles.folderTitleText, { color: dash.text }]} numberOfLines={1}>{item.name}</Text>
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
                }} style={styles.textBtn}>
                  <Text style={{ color: dash.accent, fontSize: 13, fontWeight: '700' }}>
                    {filteredFiles.every(f => selectedIds.includes(f.id)) ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
                {selectedIds.length > 0 && (
                  <>
                    <TouchableOpacity onPress={handleBulkCopy} style={styles.textBtn}>
                      <Text style={{ color: dash.text, fontSize: 13, fontWeight: '700' }}>Copy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleBulkCut} style={styles.textBtn}>
                      <Text style={{ color: dash.text, fontSize: 13, fontWeight: '700' }}>Cut</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => {
                      if (selectedIds.length === 0) return;
                      confirmDestructive(
                        'Move to Trash',
                        `Move ${selectedIds.length} items to trash?`,
                        () => {
                          selectedIds.forEach(id => softDeleteFile(id));
                          exitSelectionMode();
                        },
                        'Move to Trash'
                      );
                    }} style={styles.textBtnDanger}>
                      <Text style={{ color: colors.error, fontSize: 13, fontWeight: '700' }}>Delete</Text>
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
                    <Text style={[styles.iconGridName, { color: dash.text }]} numberOfLines={1}>{item.name}</Text>
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
                    activeOpacity={0.7}
                  >
                    <View style={[styles.fileIconContainer, { backgroundColor: dash.surface }]}>
                      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                        {ft?.icon || <FileText size={24} color={dash.text} strokeWidth={2} />}
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[styles.fileTitleText, { color: dash.text }]} numberOfLines={1}>{item.name}</Text>
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
              <Text style={[{ color: dash.text, fontSize: font(18), fontWeight: '700', marginBottom: space(4) }]}>{targetItem.name}</Text>
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
              <Text style={[{ color: dash.text, fontSize: font(18), fontWeight: '700', marginBottom: space(4) }]}>{targetItem.name}</Text>
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
          await assignFileAccessKey(keyPickerTarget.id, passwordId);
          setKeyPickerTarget(null);
          Alert.alert('Access Key Assigned', 'The selected access key is now registered.');
        }}
      />

      {(unlockTarget || pendingPasswordRemoval) && (
        <AccessKeyUnlockModal
          visible={showUnlockModal}
          targetName={unlockTarget?.name ?? pendingPasswordRemoval?.name ?? ''}
          targetId={unlockTarget?.id ?? pendingPasswordRemoval?.id ?? ''}
          targetType={unlockTarget?.type ?? pendingPasswordRemoval?.type ?? 'file'}
          accessKeyId={unlockTarget?.accessKeyId ?? pendingPasswordRemoval?.accessKeyId ?? ''}
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

      <Modal visible={showCreatePasswordModal} transparent animationType="fade" onRequestClose={() => { setShowCreatePasswordModal(false); setCreatePasswordTarget(null); setNewPasswordLabel(''); setNewPasswordDescription(''); setNewPassword(''); setNewConfirmPassword(''); }}>
        <View style={modalS.centeredOverlay}>
          <View style={[modalS.centeredCard, { backgroundColor: dash.surface }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[modalS.centeredTitle, { color: dash.text }]}>Access Key Registration</Text>
              <Text style={[{ fontSize: 13, color: dash.textMuted, marginBottom: 20 }]}>to {createPasswordTarget?.name}</Text>

              <Text style={[{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: dash.text, marginBottom: 6 }]}>Password Label</Text>
              <TextInput
                style={[modalS.centeredInput, { borderColor: dash.border, color: dash.text, backgroundColor: dash.bg }]}
                placeholder="e.g. Personal Vault Password"
                placeholderTextColor={dash.textMuted}
                value={newPasswordLabel}
                onChangeText={setNewPasswordLabel}
              />

              <Text style={[{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: dash.text, marginBottom: 6 }]}>Description (Optional)</Text>
              <TextInput
                style={[modalS.centeredInput, { borderColor: dash.border, color: dash.text, backgroundColor: dash.bg }]}
                placeholder="What is this password used for?"
                placeholderTextColor={dash.textMuted}
                value={newPasswordDescription}
                onChangeText={setNewPasswordDescription}
                multiline
              />

              <Text style={[{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: dash.text, marginBottom: 6 }]}>Create a Password *</Text>
              <TextInput
                style={[modalS.centeredInput, { borderColor: dash.border, color: dash.text, backgroundColor: dash.bg }]}
                placeholder="Enter a strong password"
                placeholderTextColor={dash.textMuted}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />

              <Text style={[{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: dash.text, marginBottom: 6 }]}>Confirm Password *</Text>
              <TextInput
                style={[modalS.centeredInput, { borderColor: dash.border, color: dash.text, backgroundColor: dash.bg }]}
                placeholder="Confirm your password"
                placeholderTextColor={dash.textMuted}
                value={newConfirmPassword}
                onChangeText={setNewConfirmPassword}
                secureTextEntry
              />

              {newConfirmPassword.length > 0 && newPassword !== newConfirmPassword && (
                <Text style={[{ fontSize: 12, color: colors.error, marginBottom: 12, fontWeight: '600' }]}>Passwords do not match</Text>
              )}

              <View style={modalS.centeredBtnRow}>
                <TouchableOpacity onPress={() => { setShowCreatePasswordModal(false); setCreatePasswordTarget(null); setNewPasswordLabel(''); setNewPasswordDescription(''); setNewPassword(''); setNewConfirmPassword(''); }} style={[modalS.btn, { borderColor: dash.border, borderWidth: 1 }]}>
                  <Text style={{ color: dash.text, fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmCreateAndAssignPassword} style={[modalS.btn, { backgroundColor: dash.fabBg }]}>
                  <Text style={{ color: dash.fabText, fontWeight: '700' }}>Create Access Key</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {showRenameModal && (
        <Modal transparent animationType="fade">
          <View style={modalS.overlay}>
            <View style={[modalS.sheet, { backgroundColor: dash.surface }]}>
              <View style={[modalS.handle, { backgroundColor: dash.border }]} />
              <Text style={[modalS.title, { color: dash.text }]}>Rename</Text>
              <TextInput
                style={[modalS.input, { borderColor: dash.border, color: dash.text, backgroundColor: dash.bg }]}
                value={renameText}
                onChangeText={setRenameText}
                autoFocus
              />
              <View style={modalS.btnRow}>
                <TouchableOpacity onPress={() => setShowRenameModal(false)} style={[modalS.btn, { borderColor: dash.border, borderWidth: 1 }]}>
                  <Text style={{ color: dash.text, fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setShowRenameModal(false); }}
                  style={[modalS.btn, { backgroundColor: dash.fabBg }]}
                >
                  <Text style={{ color: dash.fabText, fontWeight: '700' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
  sectionActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
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
  centeredCard: { width: '85%', maxWidth: 360, borderRadius: 24, padding: 24, alignItems: 'center' },
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
