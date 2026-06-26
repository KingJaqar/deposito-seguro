import { router } from 'expo-router';
import {
  Box,
  Cloud,
  FileText,
  Folder,
  Image as ImageIcon,
  Moon,
  MoreVertical,
  Music,
  Plus,
  Search,
  Smartphone,
  Sun,
  Video,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AnimatedTabBar from '../../components/AnimatedTabBar';
import { EncryptionKeyPicker } from '../../components/EncryptionKeyPicker';
import { CategoryTint } from '../../constants/Colors';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';
import { promptCreateEncryptionKey } from '../../utils/encryptionKeyPrompt';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCREEN_PADDING = 24;
const CATEGORY_GAP = 12;
const VAULT_GAP = 16;
const CATEGORY_TILE_WIDTH = (SCREEN_WIDTH - SCREEN_PADDING * 2 - CATEGORY_GAP * 2) / 3;
const VAULT_TILE_WIDTH = (SCREEN_WIDTH - SCREEN_PADDING * 2 - VAULT_GAP) / 2;

const DISPLAY_CAPACITY_GB = 100;

export default function DashboardScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const {
    folders, files,
    createFolder, hydrateVault, renameFolder, moveFolder,
    deleteFolder, shredFolder,
    shredMultipleFolders, exportFolderFiles, toggleFolderFavorite,
    assignFolderEncryptionKey,
  } = useVaultStore();
  const { encryptionKeys, createEncryptionKey, encryptionKeyExists } = useSettingsStore();

  const dash = useMemo(() => ({
    bg: colors.dashboardBg ?? colors.background,
    surface: colors.dashboardSurface ?? colors.surface,
    surfaceHover: colors.dashboardSurfaceHover ?? colors.surfaceElevated,
    accent: colors.dashboardAccent ?? colors.accent,
    text: colors.dashboardText ?? colors.text,
    textMuted: colors.dashboardTextMuted ?? colors.textMuted,
    border: colors.dashboardBorder ?? colors.border,
    fabBg: colors.fabBg ?? colors.primary,
    fabText: colors.fabText ?? '#FFFFFF',
  }), [colors]);

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [targetFolder, setTargetFolder] = useState<any>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [keyPickerTarget, setKeyPickerTarget] = useState<{ id: string; name: string } | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => { hydrateVault(); }, [hydrateVault]);

  const activeFiles = useMemo(() => files.filter(f => !f.isTrash), [files]);
  const totalBytes = useMemo(() => activeFiles.reduce((sum, f) => sum + f.size, 0), [activeFiles]);
  const totalGB = totalBytes / (1024 * 1024 * 1024);
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
  const displayStorageValue = totalGB >= 1 ? totalGB.toFixed(1) : totalMB;
  const displayStorageUnit = totalGB >= 1 ? 'GB' : 'MB';
  const percentUsed = Math.min(100, Math.round((totalGB / DISPLAY_CAPACITY_GB) * 100));

  const imageCount = useMemo(() => activeFiles.filter(f => f.mimeType?.startsWith('image/')).length, [activeFiles]);
  const videoCount = useMemo(() => activeFiles.filter(f => f.mimeType?.startsWith('video/')).length, [activeFiles]);
  const audioCount = useMemo(() => activeFiles.filter(f => f.mimeType?.startsWith('audio/')).length, [activeFiles]);
  const appCount = useMemo(() => activeFiles.filter(f =>
    f.mimeType === 'application/vnd.android.package-archive' ||
    f.mimeType === 'application/x-msdownload' ||
    f.name?.endsWith('.apk') || f.name?.endsWith('.exe') || f.name?.endsWith('.dmg')
  ).length, [activeFiles]);
  const docCount = useMemo(() => activeFiles.filter(f =>
    !f.mimeType?.startsWith('image/') &&
    !f.mimeType?.startsWith('video/') &&
    !f.mimeType?.startsWith('audio/') &&
    !f.name?.endsWith('.apk') && !f.name?.endsWith('.exe') && !f.name?.endsWith('.dmg') &&
    (f.mimeType?.includes('pdf') || f.mimeType?.includes('document') || f.mimeType?.includes('text') || f.mimeType?.includes('sheet'))
  ).length, [activeFiles]);
  const otherCount = useMemo(() => activeFiles.length - imageCount - videoCount - audioCount - appCount - docCount, [activeFiles, imageCount, videoCount, audioCount, appCount, docCount]);

  const categoryData = useMemo(() => [
    { key: 'images', label: 'Images', count: imageCount, color: CategoryTint.images, Icon: ImageIcon },
    { key: 'videos', label: 'Videos', count: videoCount, color: CategoryTint.videos, Icon: Video },
    { key: 'docs', label: 'Docs', count: docCount, color: CategoryTint.docs, Icon: FileText },
    { key: 'audio', label: 'Audio', count: audioCount, color: CategoryTint.audio, Icon: Music },
    { key: 'apps', label: 'Apps', count: appCount, color: CategoryTint.apps, Icon: Smartphone },
    { key: 'other', label: 'Other', count: otherCount, color: CategoryTint.other, Icon: Box },
  ], [imageCount, videoCount, audioCount, appCount, docCount, otherCount]);

  const vaultAccentPalette = useMemo(() => ['#A78BFA', '#60A5FA', '#34D399', '#FB7185', '#FBBF24', '#F472B6'], []);

  const rootFolders = useMemo(() => folders.filter(f => !f.parentId), [folders]);
  const subFolders = useMemo(() => folders.filter(f => !!f.parentId), [folders]);

  const folderStatsMap = useMemo(() => {
    const map: Record<string, { count: number; size: number }> = {};
    for (const f of files) {
      if (f.isTrash) continue;
      const fid = f.folderId;
      if (!map[fid]) map[fid] = { count: 0, size: 0 };
      map[fid].count += 1;
      map[fid].size += f.size;
    }
    return map;
  }, [files]);

  const moveDestinations = useMemo(() => folders.filter(f => f.id !== targetFolder?.id), [folders, targetFolder]);

  const handleDirectoryProvisioning = () => {
    if (Platform.OS === 'web') {
      const name = window.prompt('Folder name:');
      if (name && name.trim()) createFolder(name.trim(), colors.primary, 'folder', false);
    } else {
      setShowFolderModal(true);
    }
  };

  const confirmFolderCreation = () => {
    if (folderName.trim()) createFolder(folderName.trim(), colors.primary, 'folder', false);
    setShowFolderModal(false);
    setFolderName('');
  };

  const handleRegisterEncryptionKey = (folderId: string, folderNameValue: string) => {
    if (encryptionKeys.length >= 20) {
      Alert.alert('Encryption Key Limit', 'You can only create up to 20 encryption keys.');
      return;
    }

    promptCreateEncryptionKey(folderNameValue, async (options) => {
      if (encryptionKeys.length >= 20) {
        Alert.alert('Encryption Key Limit', 'You can only create up to 20 encryption keys.');
        return;
      }

      if (encryptionKeyExists(options.name)) {
        Alert.alert('Key Name Already Used', 'Encryption key names must be unique.');
        return;
      }

      const key = await createEncryptionKey(options.name, options.customKey, options.description);
      if (!key) {
        Alert.alert('Encryption Key Limit', 'You can only create up to 20 encryption keys.');
        return;
      }

      await assignFolderEncryptionKey(folderId, key.id);
      Alert.alert('Encryption Registered', 'A new encryption key was generated and assigned.');
    });
  };

  const handleFolderAction = (folder: any, action: string) => {
    setShowFolderMenu(false);
    switch (action) {
      case 'rename':
        setTargetFolder(folder); setRenameText(folder.name); setShowRenameModal(true); break;
      case 'move':
        setTargetFolder(folder); setShowMoveModal(true); break;
      case 'export':
        exportFolderFiles(folder.id).then(paths => {
          if (paths.length > 0) Alert.alert('Export Complete', `Exported ${paths.length} files`);
          else Alert.alert('Nothing to Export', 'This vault has no files to export.');
        }).catch(() => Alert.alert('Export Failed', 'Something went wrong while exporting.'));
        break;
      case 'delete':
        deleteFolder(folder.id); break;
      case 'shred':
        Alert.alert('Delete Permanently', 'Shred this folder and all contents?',
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Shred', style: 'destructive', onPress: () => shredFolder(folder.id) }]); break;
      case 'register-key':
        handleRegisterEncryptionKey(folder.id, folder.name); break;
      case 'assign-key':
        if (encryptionKeys.length === 0) {
          Alert.alert('No Encryption Keys', 'Create an encryption key in Settings first.');
        } else {
          setKeyPickerTarget({ id: folder.id, name: folder.name });
        }
        break;
      case 'favorite':
        toggleFolderFavorite && toggleFolderFavorite(folder.id);
        break;
    }
  };

  const confirmRename = () => {
    if (targetFolder) renameFolder(targetFolder.id, renameText.trim());
    setShowRenameModal(false);
  };

  const confirmMove = (targetParentId: string) => {
    if (targetFolder) moveFolder(targetFolder.id, targetParentId);
    setShowMoveModal(false);
  };

  const toggleFolderSelection = useCallback((folderId: string) => {
    setSelectedFolderIds(prev => prev.includes(folderId) ? prev.filter(id => id !== folderId) : [...prev, folderId]);
  }, []);

  const handleSelectAllFolders = () => {
    const allIds = folders.map(f => f.id);
    setSelectedFolderIds(selectedFolderIds.length === allIds.length ? [] : allIds);
  };

  const handleBulkShredFolders = () => {
    if (selectedFolderIds.length === 0) return;
    Alert.alert('Delete Permanently', `Shred ${selectedFolderIds.length} folders?`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Shred', style: 'destructive', onPress: () => shredMultipleFolders(selectedFolderIds) }]);
  };

  const exitSelectionMode = () => { setSelectionMode(false); setSelectedFolderIds([]); };

  const CategoryTile = useCallback(({ item, index }: { item: typeof categoryData[number]; index: number }) => (
    <Pressable
      onPress={() => router.push('/(main)/search')}
      style={[styles.categoryTile, { backgroundColor: dash.surface, width: CATEGORY_TILE_WIDTH }]}
    >
      <View style={[styles.categoryIconChip, { backgroundColor: `${item.color}1A` }]}>
        <item.Icon size={20} color={item.color} strokeWidth={2.2} />
      </View>
      <Text style={[styles.categoryLabel, { color: dash.text }]} numberOfLines={1}>{item.label}</Text>
      <Text style={[styles.categoryCount, { color: dash.textMuted }]}>{item.count} files</Text>
    </Pressable>
  ), [dash.surface, dash.text, dash.textMuted]);

  const VaultTile = useCallback(({ item, index }: { item: any; index: number }) => {
    const stats = folderStatsMap[item.id] || { count: 0, size: 0 };
    const folderFileCount = stats.count;
    const folderMB = stats.size / (1024 * 1024);
    const sizeLabel = folderMB >= 1024 ? `${(folderMB / 1024).toFixed(1)} GB` : `${folderMB.toFixed(0)} MB`;
    const isSelected = selectedFolderIds.includes(item.id);
    const accentColor = vaultAccentPalette[index % vaultAccentPalette.length];

    return (
      <Pressable
        onLongPress={() => { setSelectionMode(true); setSelectedFolderIds([item.id]); }}
        onPress={() => {
          if (selectionMode) toggleFolderSelection(item.id);
          else router.push({ pathname: '/(main)/folder/[id]', params: { id: item.id } });
        }}
        style={[
          styles.vaultTile,
          {
            backgroundColor: dash.surface,
            width: VAULT_TILE_WIDTH,
            borderColor: isSelected ? dash.accent : 'transparent',
            borderWidth: 2,
          },
        ]}
      >
        <View style={styles.vaultTopRow}>
          <View style={[styles.vaultIconChip, { backgroundColor: `${accentColor}26` }]}>
            <Folder size={20} color={accentColor} strokeWidth={2.2} />
          </View>
          {selectionMode ? (
            <View style={styles.checkBox}>
              <View style={[styles.checkInner, { backgroundColor: isSelected ? dash.accent : 'transparent', borderColor: dash.accent }]}>
                {isSelected && <Text style={{ color: dash.fabText, fontSize: 10, fontWeight: '700' }}>✓</Text>}
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => { setTargetFolder(item); setShowFolderMenu(true); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <MoreVertical size={18} color={dash.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.vaultBottomBlock}>
          <Text style={[styles.vaultName, { color: dash.text }]} numberOfLines={1}>
            {item.name}
            {item.isEncrypted && item.encryptionKeyId ? ' 🔒' : ''}
            {item.isFavorite ? ' ⭐' : ''}
          </Text>
          <View style={styles.vaultMetaRow}>
            <Text style={[styles.vaultMeta, { color: dash.textMuted }]}>{folderFileCount} files</Text>
            <Text style={[styles.vaultMeta, { color: dash.textMuted }]}>{sizeLabel}</Text>
          </View>
        </View>
      </Pressable>
    );
  }, [dash.surface, dash.accent, dash.fabText, dash.text, dash.textMuted, folderStatsMap, selectedFolderIds, selectionMode, toggleFolderSelection, vaultAccentPalette]);

  return (
    <View style={[styles.root, { backgroundColor: dash.bg }]}>
      <View style={[styles.headerRow, { backgroundColor: dash.bg }]}>
        <View style={styles.headerTextBlock}>
          <Text style={[styles.headerTitle, { color: dash.text }]} numberOfLines={1}>Deposito Seguro</Text>
          <Text style={[styles.headerTagline, { color: dash.textMuted }]} numberOfLines={1}>Your secure storage vault</Text>
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
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.push('/(main)/search')}>
          <View style={[styles.searchBar, { backgroundColor: dash.surface }]}>
            <Search size={18} color={dash.textMuted} />
            <Text style={[styles.searchPlaceholder, { color: dash.textMuted }]}>Search files, vaults...</Text>
          </View>
        </Pressable>

        <View
          style={[
            styles.storageCard,
            { backgroundColor: isDark ? dash.surface : dash.accent },
          ]}
        >
          <View style={styles.storageTopRow}>
            <View style={styles.storageLabelRow}>
              <Cloud size={18} color={isDark ? dash.textMuted : dash.text} />
              <Text style={[styles.storageLabel, { color: isDark ? dash.textMuted : dash.text }]}>
                Cloud Storage
              </Text>
            </View>
            <View style={[styles.usedPill, { backgroundColor: isDark ? dash.surfaceHover : dash.surface }]}>
              <Text style={[styles.usedPillText, { color: dash.text }]}>{percentUsed}% Used</Text>
            </View>
          </View>

          <View style={styles.storageValueRow}>
            <Text style={[styles.storageValue, { color: dash.text }]}>{displayStorageValue}</Text>
            <Text style={[styles.storageUnit, { color: dash.text }]}> {displayStorageUnit}</Text>
          </View>

          <View style={[styles.progressTrack, { backgroundColor: isDark ? dash.surfaceHover : 'rgba(255,255,255,0.4)' }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: isDark ? dash.fabBg : dash.text, width: `${Math.max(2, percentUsed)}%` },
              ]}
            />
          </View>
          <View style={styles.progressLabelsRow}>
            <Text style={[styles.progressLabel, { color: isDark ? dash.textMuted : dash.text }]}>0 GB</Text>
            <Text style={[styles.progressLabel, { color: isDark ? dash.textMuted : dash.text }]}>
              {DISPLAY_CAPACITY_GB} GB
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: dash.text }]}>Categories</Text>
            <TouchableOpacity onPress={() => router.push('/(main)/search')}>
              <Text style={[styles.seeAll, { color: dash.textMuted }]}>See all</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.categoryGrid}>
            {categoryData.map((item, i) => (
              <CategoryTile key={item.key} item={item} index={i} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: dash.text }]}>My Vaults</Text>
            {selectionMode ? (
              <View style={styles.sectionActions}>
                <TouchableOpacity onPress={handleSelectAllFolders} style={styles.textBtn}>
                  <Text style={{ color: dash.accent, fontSize: 13, fontWeight: '700' }}>
                    {selectedFolderIds.length === folders.length ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
                {selectedFolderIds.length > 0 && (
                  <TouchableOpacity onPress={handleBulkShredFolders} style={styles.textBtnDanger}>
                    <Text style={{ color: colors.error, fontSize: 13, fontWeight: '700' }}>Shred</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={exitSelectionMode} style={styles.cancelBtn}>
                  <Text style={{ color: dash.textMuted, fontSize: 13, fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => router.push('/(main)/favorites')}>
                <Text style={[styles.seeAll, { color: dash.textMuted }]}>See all</Text>
              </TouchableOpacity>
            )}
          </View>

          {folders.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: dash.surface }]}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>🏦</Text>
              <Text style={[styles.emptyTitle, { color: dash.text }]}>No Vaults Yet</Text>
              <Text style={[styles.emptyText, { color: dash.textMuted }]}>Create your first secure vault to get started</Text>
              <TouchableOpacity onPress={handleDirectoryProvisioning} style={[styles.emptyBtn, { backgroundColor: dash.fabBg }]}>
                <Text style={{ color: dash.fabText, fontWeight: '700', fontSize: 14 }}>Create First Vault</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {rootFolders.length > 0 && (
                <View style={styles.vaultSection}>
                  <Text style={[styles.vaultSectionLabel, { color: dash.textMuted }]}>ROOT VAULTS</Text>
                  <View style={styles.vaultGrid}>
                    {rootFolders.map((item, index) => (
                      <VaultTile key={item.id} item={item} index={index} />
                    ))}
                  </View>
                </View>
              )}
              {subFolders.length > 0 && (
                <View style={styles.vaultSection}>
                  <Text style={[styles.vaultSectionLabel, { color: dash.textMuted }]}>SUBFOLDERS</Text>
                  <View style={styles.vaultGrid}>
                    {subFolders.map((item, index) => (
                      <VaultTile key={item.id} item={item} index={index} />
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={{ height: 140 }} />
      </ScrollView>

      <Pressable
        onPress={handleDirectoryProvisioning}
        style={[styles.fab, { backgroundColor: dash.fabBg }]}
        accessibilityRole="button"
        accessibilityLabel="Create new vault"
      >
        <Plus size={26} color={dash.fabText} strokeWidth={2.4} />
      </Pressable>

      <AnimatedTabBar />

      <Modal visible={showFolderModal} transparent animationType="fade" onRequestClose={() => setShowFolderModal(false)}>
        <View style={modalS.centeredOverlay}>
          <View style={[modalS.centeredCard, { backgroundColor: dash.surface }]}>
            <Text style={[modalS.centeredTitle, { color: dash.text }]}>New Vault</Text>
            <TextInput
              style={[modalS.centeredInput, { borderColor: dash.border, color: dash.text, backgroundColor: dash.bg }]}
              placeholder="Vault name"
              placeholderTextColor={dash.textMuted}
              value={folderName}
              onChangeText={setFolderName}
              autoFocus
            />
            <View style={modalS.centeredBtnRow}>
              <TouchableOpacity onPress={() => setShowFolderModal(false)} style={[modalS.btn, { borderColor: dash.border, borderWidth: 1 }]}>
                <Text style={{ color: dash.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmFolderCreation} style={[modalS.btn, { backgroundColor: dash.fabBg }]}>
                <Text style={{ color: dash.fabText, fontWeight: '700' }}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showFolderMenu && targetFolder && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowFolderMenu(false)}>
          <TouchableOpacity style={modalS.overlay} onPress={() => setShowFolderMenu(false)} activeOpacity={1}>
            <View style={[styles.actionSheet, { backgroundColor: dash.surface }]}>
              <View style={[modalS.handle, { backgroundColor: dash.border }]} />
              <Text style={[styles.actionSheetTitle, { color: dash.text }]}>{targetFolder.name}</Text>
              {[
                { action: 'rename', label: 'Rename', color: dash.text },
                { action: 'move', label: 'Move', color: dash.text },
                { action: 'export', label: 'Export', color: dash.text },
                { action: 'register-key', label: 'Create & Assign Key', color: dash.accent },
                { action: 'assign-key', label: 'Assign Existing Key', color: dash.accent },
                { action: 'favorite', label: targetFolder.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: '#FBBF24' },
                { action: 'delete', label: 'Move to Trash', color: colors.error },
                { action: 'shred', label: 'Shred Permanently', color: colors.error },
              ].map(item => (
                <TouchableOpacity key={item.action} style={[styles.actionSheetItem, { borderBottomColor: dash.border }]} onPress={() => handleFolderAction(targetFolder, item.action)}>
                  <Text style={[styles.actionSheetLabel, { color: item.color }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      <EncryptionKeyPicker
        visible={!!keyPickerTarget}
        onClose={() => setKeyPickerTarget(null)}
        onSelectKey={async (keyId) => {
          if (!keyPickerTarget) return;
          await assignFolderEncryptionKey(keyPickerTarget.id, keyId);
          setKeyPickerTarget(null);
          Alert.alert('Encryption Assigned', 'The selected encryption key is now registered.');
        }}
      />

      {showRenameModal && (
        <Modal transparent animationType="fade">
          <View style={modalS.overlay}>
            <View style={[modalS.sheet, { backgroundColor: dash.surface }]}>
              <View style={[modalS.handle, { backgroundColor: dash.border }]} />
              <Text style={[modalS.title, { color: dash.text }]}>Rename Vault</Text>
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
                <TouchableOpacity onPress={confirmRename} style={[modalS.btn, { backgroundColor: dash.fabBg }]}>
                  <Text style={{ color: dash.fabText, fontWeight: '700' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {showMoveModal && (
        <Modal transparent animationType="fade">
          <View style={modalS.overlay}>
            <View style={[modalS.sheet, { backgroundColor: dash.surface }]}>
              <View style={[modalS.handle, { backgroundColor: dash.border }]} />
              <Text style={[modalS.title, { color: dash.text }]}>Move Vault</Text>
              {moveDestinations.length === 0 ? (
                <Text style={[styles.emptyText, { color: dash.textMuted, paddingVertical: 12 }]}>
                  No other vaults available to move into.
                </Text>
              ) : (
                moveDestinations.map(f => (
                  <TouchableOpacity key={f.id} style={[styles.actionSheetItem, { borderBottomColor: dash.border }]} onPress={() => confirmMove(f.id)}>
                    <Text style={[styles.actionSheetLabel, { color: dash.text }]}>📁  {f.name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollBody: { paddingHorizontal: SCREEN_PADDING, paddingTop: 8, paddingBottom: 140 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_PADDING,
    paddingVertical: 0,
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

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 32,
  },
  searchPlaceholder: { fontSize: 14, fontWeight: '500' },

  storageCard: { borderRadius: 24, padding: 24, marginBottom: 32 },
  storageTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  storageLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  storageLabel: { fontSize: 13, fontWeight: '600' },
  usedPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  usedPillText: { fontSize: 12, fontWeight: '700' },
  storageValueRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 18 },
  storageValue: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  storageUnit: { fontSize: 16, fontWeight: '700' },
  progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabelsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 12, fontWeight: '500' },

  section: { marginBottom: 32 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  seeAll: { fontSize: 13, fontWeight: '600' },
  sectionActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  textBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  textBtnDanger: { paddingHorizontal: 4, paddingVertical: 4 },
  cancelBtn: { paddingHorizontal: 4, paddingVertical: 4 },

  vaultSection: { marginBottom: 24 },
  vaultSectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CATEGORY_GAP },
  categoryTile: { borderRadius: 16, paddingVertical: 18, paddingHorizontal: 10, alignItems: 'center' },
  categoryIconChip: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  categoryLabel: { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  categoryCount: { fontSize: 11, fontWeight: '600' },

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
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 8 },

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
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16, letterSpacing: -0.3 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16, fontSize: 15 },
  btnRow: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  centeredOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  centeredCard: { width: '85%', maxWidth: 360, borderRadius: 24, padding: 24, alignItems: 'center' },
  centeredTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20, letterSpacing: -0.3 },
  centeredInput: { width: '100%', borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20, fontSize: 15 },
  centeredBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
});
