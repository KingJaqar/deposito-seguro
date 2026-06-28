// File: src/app/(main)/favorites.tsx
import { router } from 'expo-router';
import { Image, Moon, Music, Plus, Search, Smartphone, Star, Sun, FileText, Play, Folder, Lock, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AnimatedTabBar from '../../components/AnimatedTabBar';
import { DestructiveConfirmModal, useConfirmDestructive } from '../../components/DestructiveConfirmModal';
import { AccessKeyPicker } from '../../components/AccessKeyPicker';
import { AccessKeyUnlockModal } from '../../components/AccessKeyUnlockModal';
import { CategoryTint } from '../../constants/Colors';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';
import { validatePassword } from '../../utils/accessKeyValidation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCREEN_PADDING = 24;
const VAULT_GAP = 16;
const FAVORITE_TILE_WIDTH = (SCREEN_WIDTH - SCREEN_PADDING * 2 - VAULT_GAP) / 2;

const CATEGORY_FILTERS = [
  { label: 'All', tint: '#A78BFA' },
  { label: 'Root Folders', tint: '#60A5FA' },
  { label: 'Subfolders', tint: '#34D399' },
  { label: 'Images', tint: CategoryTint.images },
  { label: 'Videos', tint: CategoryTint.videos },
  { label: 'Documents', tint: CategoryTint.docs },
  { label: 'Audio', tint: CategoryTint.audio },
  { label: 'Apps', tint: CategoryTint.apps },
  { label: 'Other', tint: CategoryTint.other },
];

export default function FavoritesScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const {
    files, folders, clipboard,
    toggleFavorite, softDeleteFile, createPersonalFavoritesFolder, deleteFolder, shredFile,
    assignFileAccessKey, removeFileAccessKey,
    assignFolderAccessKey, removeFolderAccessKey,
    copyToClipboard, cutToClipboard, pasteFromClipboard, clearClipboard,
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
  const [keyPickerTarget, setKeyPickerTarget] = useState<{ id: string; name: string } | null>(null);
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

  const getFileType = (mimeType: string, name?: string) => {
    if (mimeType?.startsWith('image/')) return { label: 'Image', color: '#A78BFA', icon: <Image size={20} color="#A78BFA" strokeWidth={2.2} /> };
    if (mimeType?.startsWith('video/')) return { label: 'Video', color: '#FF6B6B', icon: <Play size={20} color="#FF6B6B" strokeWidth={2.2} /> };
    if (mimeType?.startsWith('audio/')) return { label: 'Audio', color: '#FBBF24', icon: <Music size={20} color="#FBBF24" strokeWidth={2.2} /> };
    if (name?.endsWith('.apk') || name?.endsWith('.exe')) return { label: 'App', color: '#F472B6', icon: <Smartphone size={20} color="#F472B6" strokeWidth={2.2} /> };
    return { label: 'File', color: '#60A5FA', icon: <FileText size={20} color="#60A5FA" strokeWidth={2.2} /> };
  };

  const filteredFiles = favoriteFiles.filter(f => {
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      if (!f.name.toLowerCase().includes(q)) return false;
    }
    if (activeFilter === 'Root Folders') return false;
    if (activeFilter === 'Subfolders') return false;
    if (activeFilter !== 'All') {
      if (activeFilter === 'Images') return f.mimeType?.startsWith('image/');
      if (activeFilter === 'Videos') return f.mimeType?.startsWith('video/');
      if (activeFilter === 'Audio') return f.mimeType?.startsWith('audio/');
      if (activeFilter === 'Documents') return !f.mimeType?.startsWith('image/') && !f.mimeType?.startsWith('video/') && !f.mimeType?.startsWith('audio/') && (f.mimeType?.includes('pdf') || f.mimeType?.includes('document') || f.mimeType?.includes('text'));
      if (activeFilter === 'Apps') return f.name?.endsWith('.apk') || f.name?.endsWith('.exe');
      if (activeFilter === 'Other') return !f.mimeType?.startsWith('image/') && !f.mimeType?.startsWith('video/') && !f.mimeType?.startsWith('audio/') && !f.mimeType?.includes('pdf') && !f.mimeType?.includes('document') && !f.mimeType?.includes('text') && !f.name?.endsWith('.apk') && !f.name?.endsWith('.exe');
    }
    return true;
  });

  const filteredFolders = favoriteFolders.filter(f => {
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      if (!f.name.toLowerCase().includes(q)) return false;
    }
    if (activeFilter !== 'All') {
      if (activeFilter === 'Root Folders') return !f.parentId;
      if (activeFilter === 'Subfolders') return !!f.parentId;
    }
    return true;
  });

  const rootFavFolders = filteredFolders.filter(f => !f.parentId);
  const subFavFolders = filteredFolders.filter(f => !!f.parentId);
  const totalCount = filteredFiles.length + filteredFolders.length;

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const exitSelectionMode = () => { setSelectionMode(false); setSelectedIds([]); };

  const handleBulkCopy = () => {
    const selFolderIds = selectedIds.filter(id => filteredFolders.some(f => f.id === id));
    const selFileIds = selectedIds.filter(id => filteredFiles.some(f => f.id === id));
    copyToClipboard(selFolderIds, selFileIds, null);
    exitSelectionMode();
    Alert.alert('Copied', `${selectedIds.length} item(s) copied to clipboard.`);
  };

  const handleBulkCut = () => {
    const selFolderIds = selectedIds.filter(id => filteredFolders.some(f => f.id === id));
    const selFileIds = selectedIds.filter(id => filteredFiles.some(f => f.id === id));
    cutToClipboard(selFolderIds, selFileIds, null);
    exitSelectionMode();
    Alert.alert('Cut', `${selectedIds.length} item(s) cut to clipboard.`);
  };

  const handleFileNavigate = (file: any) => {
    // Check if file has password protection
    if (file.hasAccessKey && file.accessKeyId) {
      setUnlockTarget({
        type: 'file',
        id: file.id,
        name: file.name,
        accessKeyId: file.accessKeyId,
        onUnlock: () => {
          setShowUnlockModal(false);
          setUnlockTarget(null);
          // Navigate to viewer after unlock
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
    
    // No password, navigate directly
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
      case 'unfavorite': toggleFavorite(file.id); break;
      case 'copy':
        copyToClipboard([], [file.id], null);
        Alert.alert('Copied', 'File copied to clipboard.');
        break;
      case 'cut':
        cutToClipboard([], [file.id], null);
        Alert.alert('Cut', 'File cut to clipboard.');
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
           `Shred "${file.name}" permanently?`,
           () => shredFile(file.id),
           'Shred Permanently'
         );
         break;
      case 'register-key': handleCreateAndAssignPassword(file.id, file.name, 'file'); break;
      case 'assign-key': setKeyPickerTarget({ id: file.id, name: file.name }); break;
      case 'remove-key':
        if (file.accessKeyId) {
          setPendingPasswordRemoval({
            type: 'file',
            id: file.id,
            name: file.name,
            accessKeyId: file.accessKeyId
          });
          setShowUnlockModal(true);
        }
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
      case 'open': handleFolderNavigate(folder); break;
      case 'unfavorite': toggleFavorite(folder.id); break;
      case 'copy':
        copyToClipboard([folder.id], [], null);
        Alert.alert('Copied', 'Folder copied to clipboard.');
        break;
      case 'cut':
        cutToClipboard([folder.id], [], null);
        Alert.alert('Cut', 'Folder cut to clipboard.');
        break;
      case 'paste':
        if (clipboard) {
          pasteFromClipboard(folder.id).then(() => {
            clearClipboard();
            Alert.alert('Paste Complete', 'Items pasted successfully.');
          }).catch(() => Alert.alert('Paste Failed', 'Could not paste items.'));
        }
        break;
      case 'rename': setTargetItem(folder); setRenameText(folder.name); setShowRenameModal(true); break;
       case 'delete':
         confirmDestructive(
           'Move to Trash',
           `Move "${folder.name}" into retention trash?`,
           () => softDeleteFile(folder.id)
         );
         break;
       case 'shred':
         confirmDestructive(
           'Permanently Shred',
           `Shred "${folder.name}" permanently?`,
           () => shredFile(folder.id),
           'Shred Permanently'
         );
         break;
      case 'register-key': handleCreateAndAssignPassword(folder.id, folder.name, 'folder'); break;
      case 'assign-key': setKeyPickerTarget({ id: folder.id, name: folder.name }); break;
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
    }
  };

  const createPersonalFolder = () => {
    if (newFavFolderName.trim() && createPersonalFavoritesFolder) {
      createPersonalFavoritesFolder(newFavFolderName.trim());
    }
    setShowCreateFavFolder(false);
    setNewFavFolderName('');
  };

  const isEmpty = totalCount === 0 && personalFavFolders.length === 0;

  const FavoriteTile = ({ item, index, type }: { item: any; index: number; type: 'folder' | 'file' }) => {
    const isSelected = selectedIds.includes(item.id);
    const ft = type === 'file' ? getFileType(item.mimeType, item.name) : null;
    const accentColor = ['#A78BFA', '#60A5FA', '#34D399', '#FB7185', '#FBBF24', '#F472B6'][index % 6];

    return (
      <TouchableOpacity
        onLongPress={() => { setSelectionMode(true); setSelectedIds([item.id]); }}
        onPress={() => {
          if (selectionMode) toggleSelection(item.id);
          else if (type === 'folder') handleFolderNavigate(item);
          else handleFileNavigate(item);
        }}
        style={[
          styles.vaultTile,
          {
            backgroundColor: dash.surface,
            width: FAVORITE_TILE_WIDTH,
            borderColor: isSelected ? dash.accent : 'transparent',
            borderWidth: 2,
          },
        ]}
      >
        <View style={styles.vaultTopRow}>
          <View style={[styles.vaultIconChip, { backgroundColor: `${accentColor}26` }]}>
            {type === 'folder' ? (
              <Folder size={20} color={accentColor} strokeWidth={2.2} />
            ) : (
              <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                {ft?.icon || <FileText size={20} color="#60A5FA" strokeWidth={2.2} />}
              </View>
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
            {item.isEncrypted && item.encryptionKeyId ? <Lock size={14} color={dash.accent} strokeWidth={2} style={{ marginLeft: 6 }} /> : null}
            {item.isFavorite && <Star size={14} color="#FBBF24" strokeWidth={2} style={{ marginLeft: 4 }} />}
          </Text>
          <View style={styles.vaultMetaRow}>
            <Text style={[styles.vaultMeta, { color: dash.textMuted }]}>
              {type === 'folder' ? (item.isFavorite ? <Star size={12} color="#FBBF24" strokeWidth={2.5} style={{ marginRight: 4 }} /> : <Folder size={12} color={dash.textMuted} strokeWidth={2.5} style={{ marginRight: 4 }} />) : `${(item.size / 1024).toFixed(1)} KB`}
            </Text>
            {type === 'file' && ft && (
              <Text style={[styles.vaultMeta, { color: ft.color }]}>{ft.label}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: dash.bg }]}>
      <View style={[styles.headerRow, { backgroundColor: dash.bg }]}>
        <View style={styles.headerTextBlock}>
          
          <Text style={[styles.headerTitle, { color: dash.text }]} numberOfLines={1}>Favorites</Text>
          <Text style={[styles.headerTagline, { color: dash.textMuted }]} numberOfLines={1}>Your starred items</Text>
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
        <Pressable onPress={() => router.push('/(main)/search')}>
          <View style={[styles.searchBar, { backgroundColor: dash.surface }]}>
            <Search size={18} color={dash.textMuted} />
            <Text style={[styles.searchPlaceholder, { color: dash.textMuted }]}>Search favorites...</Text>
          </View>
        </Pressable>

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
          ) : (
            <View style={styles.vaultGrid}>
              {filteredFolders.map((item, index) => (
                <FavoriteTile key={item.id} item={item} index={index} type="folder" />
              ))}
            </View>
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
          ) : (
            <View style={styles.vaultGrid}>
              {filteredFiles.map((item, index) => (
                <FavoriteTile key={item.id} item={item} index={index} type="file" />
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 140 }} />
      </ScrollView>

      <Pressable
        onPress={() => setShowCreateFavFolder(true)}
        style={[styles.fab, { backgroundColor: dash.fabBg }]}
        accessibilityRole="button"
        accessibilityLabel="Create new favorites folder"
      >
        <Plus size={26} color={dash.fabText} strokeWidth={2.4} />
      </Pressable>

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
          <TouchableOpacity style={modalS.overlay} onPress={() => setShowFileMenu(false)} activeOpacity={1}>
            <View style={[styles.actionSheet, { backgroundColor: dash.surface }]}>
              <View style={[modalS.handle, { backgroundColor: dash.border }]} />
              <Text style={[styles.actionSheetTitle, { color: dash.text }]}>{targetItem.name}</Text>
              {(() => {
                const hasPassword = targetItem.hasAccessKey || targetItem.accessKeyId;
                const baseItems = [
                  { action: 'unfavorite', label: 'Remove from Favorites', color: '#FBBF24' },
                  { action: 'copy', label: 'Copy', color: dash.accent },
                  { action: 'cut', label: 'Cut', color: dash.accent },
                  { action: 'delete', label: 'Move to Trash', color: colors.error },
                  { action: 'shred', label: 'Shred Permanently', color: colors.error },
                ];
                if (hasPassword) {
                  baseItems.push({ action: 'remove-key', label: 'Remove Assigned Access Key', color: colors.error });
                } else {
                  baseItems.push(
                    { action: 'register-key', label: 'Assign and Create Access Key', color: dash.accent },
                    { action: 'assign-key', label: 'Assign Existing Password', color: dash.accent }
                  );
                }
                return baseItems;
              })().map(item => (
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
              {(() => {
                const hasPassword = targetItem.hasAccessKey && targetItem.accessKeyId;
                const baseItems = [
                  { action: 'open', label: 'Open Folder', color: dash.accent },
                  { action: 'unfavorite', label: 'Remove from Favorites', color: '#FBBF24' },
                  { action: 'copy', label: 'Copy', color: dash.accent },
                  { action: 'cut', label: 'Cut', color: dash.accent },
                  { action: 'delete', label: 'Move to Trash', color: colors.error },
                  { action: 'shred', label: 'Shred Permanently', color: colors.error },
                ];
                if (clipboard) {
                  baseItems.splice(4, 0, { action: 'paste', label: 'Paste Here', color: dash.accent });
                }
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
                <TouchableOpacity key={item.action} style={[styles.actionSheetItem, { borderBottomColor: dash.border }]} onPress={() => handleFolderAction(targetItem, item.action)}>
                  <Text style={[styles.actionSheetLabel, { color: item.color }]}>{item.label}</Text>
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

      {/* Access Key Unlock Modal */}
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

      {/* Access Key Registration Modal */}
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
  headerTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4},
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
  searchPlaceholder: { fontSize: 14, fontWeight: '500' },

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

  fab: {
    position: 'absolute',
    right: SCREEN_PADDING,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },

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
