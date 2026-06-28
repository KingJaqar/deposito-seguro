import { router } from 'expo-router';
import {
  Box,
  Clipboard,
  ClipboardCheck,
  Cloud,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Folder,
  Image as ImageIcon,
  Lock,
  MoreVertical,
  Music,
  Plus,
  Scissors,
  Search,
  ShieldCheck,
  Smartphone,
  Undo2,
  Video,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
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
import { ClipboardBar } from '../../components/ClipboardBar';
import { DestructiveConfirmModal, useConfirmDestructive } from '../../components/DestructiveConfirmModal';
import { AccessKeyPicker } from '../../components/AccessKeyPicker';
import { AccessKeyUnlockModal } from '../../components/AccessKeyUnlockModal';
import { ViewModeMenu } from '../../components/ViewModeMenu';
import { CategoryTint } from '../../constants/Colors';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';
import { getPasswordStrength, getPasswordValidationMessages, validatePassword } from '../../utils/accessKeyValidation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCREEN_PADDING = 24;
const CATEGORY_GAP = 12;
const VAULT_GAP = 16;
const CATEGORY_TILE_WIDTH = (SCREEN_WIDTH - SCREEN_PADDING * 2 - CATEGORY_GAP * 2) / 3;
const VAULT_TILE_WIDTH = (SCREEN_WIDTH - SCREEN_PADDING * 2 - VAULT_GAP) / 2;

const DISPLAY_CAPACITY_GB = 100;

export default function DashboardScreen() {
  const { colors } = useTheme();
  const {
    disguiseAppName,
  } = useSettingsStore();
  const viewMode = useSettingsStore((s) => s.viewMode);
  const {
    folders, files, clipboard, undoInfo,
    createFolder, hydrateVault, renameFolder, moveFolder,
    deleteFolder, shredFolder,
    shredMultipleFolders, exportFolderFiles, toggleFolderFavorite,
    assignFolderAccessKey, removeFolderAccessKey,
    copyToClipboard, cutToClipboard, pasteFromClipboard, clearClipboard, undoLastCut,
    duplicateFolder,
  } = useVaultStore();
  const { accessKeys, createAccessKey, accessKeyExists } = useSettingsStore();

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

  const displayName = disguiseAppName || 'Deposito Seguro';

  const { confirmState: delConfirm, confirm: confirmDestructive, close: closeDelConfirm } = useConfirmDestructive();

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
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<{ type: 'folder'; id: string; name: string; accessKeyId: string; onUnlock: () => void } | null>(null);
  const [showCreatePasswordModal, setShowCreatePasswordModal] = useState(false);
  const [createPasswordTarget, setCreatePasswordTarget] = useState<{ id: string; name: string } | null>(null);
  const [newPasswordLabel, setNewPasswordLabel] = useState('');
  const [newPasswordDescription, setNewPasswordDescription] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewConfirmPassword, setShowNewConfirmPassword] = useState(false);
  const [pendingPasswordRemoval, setPendingPasswordRemoval] = useState<{ type: 'folder'; id: string; name: string; accessKeyId: string } | null>(null);

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

  const handleVaultPress = (folder: any) => {
    if (selectionMode) {
      toggleFolderSelection(folder.id);
      return;
    }
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
      if (name !== null) createFolder(name.trim() || 'New Folder', colors.primary, 'folder', false);
    } else {
      setShowFolderModal(true);
    }
  };

  const confirmFolderCreation = () => {
    createFolder(folderName.trim(), colors.primary, 'folder', false);
    setShowFolderModal(false);
    setFolderName('');
  };

  const handleCreateAndAssignPassword = (targetId: string, targetName: string) => {
    if (accessKeys.length >= 20) {
      Alert.alert('Access Key Limit', 'You can only create up to 20 access keys.');
      return;
    }
    setCreatePasswordTarget({ id: targetId, name: targetName });
    setShowCreatePasswordModal(true);
  };

  const newPasswordStrength = getPasswordStrength(newPassword);
  const newStrengthColor = newPasswordStrength === 'weak' ? colors.error : newPasswordStrength === 'medium' ? '#FBBF24' : '#34C759';
  const newStrengthLabel = newPasswordStrength === 'weak' ? 'Weak' : newPasswordStrength === 'medium' ? 'Medium' : 'Strong';
  const newStrengthWidth = newPasswordStrength === 'weak' ? '33%' : newPasswordStrength === 'medium' ? '66%' : '100%';

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

    await assignFolderAccessKey(createPasswordTarget.id, fp.id);
    setShowCreatePasswordModal(false);
    setCreatePasswordTarget(null);
    setNewPasswordLabel('');
    setNewPasswordDescription('');
    setNewPassword('');
    setNewConfirmPassword('');
    Alert.alert('Access Key Created & Assigned', `${fp.label} has been created and assigned.`);
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
      case 'register-key':
        handleCreateAndAssignPassword(folder.id, folder.name); break;
      case 'assign-key':
        if (accessKeys.length === 0) {
          Alert.alert('No Access Keys', 'Create an access key in Settings first.');
        } else {
          setKeyPickerTarget({ id: folder.id, name: folder.name });
        }
        break;
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
      case 'favorite':
        toggleFolderFavorite && toggleFolderFavorite(folder.id);
        break;
      case 'duplicate':
        duplicateFolder(folder.id);
        break;
      case 'paste':
        if (clipboard) {
          pasteFromClipboard(folder.id).then((result) => {
            if (result.pastedFiles > 0 || result.pastedFolders > 0) {
              Alert.alert('Paste Complete', `${result.pastedFolders} folder${result.pastedFolders !== 1 ? 's' : ''}, ${result.pastedFiles} file${result.pastedFiles !== 1 ? 's' : ''} pasted.`);
            }
          }).catch(() => Alert.alert('Paste Failed', 'Could not paste items.'));
        }
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
    confirmDestructive(
      'Permanently Shred',
      `Shred ${selectedFolderIds.length} folders and all their contents permanently?`,
      () => shredMultipleFolders(selectedFolderIds),
      'Shred Permanently'
    );
  };

  const handleBulkCopy = () => {
    if (selectedFolderIds.length === 0) return;
    copyToClipboard(selectedFolderIds, [], null);
    exitSelectionMode();
  };

  const handleBulkCut = () => {
    if (selectedFolderIds.length === 0) return;
    cutToClipboard(selectedFolderIds, [], null);
    exitSelectionMode();
  };

  const handlePasteToRoot = async () => {
    if (!clipboard) return;
    try {
      const result = await pasteFromClipboard('');
      if (result.pastedFiles === 0 && result.pastedFolders === 0) return;
      Alert.alert('Paste Complete', `${result.pastedFolders} folder${result.pastedFolders !== 1 ? 's' : ''}, ${result.pastedFiles} file${result.pastedFiles !== 1 ? 's' : ''} pasted.`);
    } catch {
      Alert.alert('Paste Failed', 'Could not paste items.');
    }
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

  const VaultTile = useCallback(({ item, index, gridWidth }: { item: any; index: number; gridWidth?: number }) => {
    const stats = folderStatsMap[item.id] || { count: 0, size: 0 };
    const folderFileCount = stats.count;
    const folderMB = stats.size / (1024 * 1024);
    const sizeLabel = folderMB >= 1024 ? `${(folderMB / 1024).toFixed(1)} GB` : `${folderMB.toFixed(0)} MB`;
    const isSelected = selectedFolderIds.includes(item.id);
    const accentColor = vaultAccentPalette[index % vaultAccentPalette.length];
    const width = gridWidth ?? VAULT_TILE_WIDTH;

    return (
      <Pressable
        onLongPress={() => { setSelectionMode(true); setSelectedFolderIds([item.id]); }}
        onPress={() => handleVaultPress(item)}
        style={[
          styles.vaultTile,
          {
            backgroundColor: dash.surface,
            width,
            borderColor: isSelected ? dash.accent : 'transparent',
            borderWidth: 2,
          },
        ]}
      >
        <View style={styles.vaultTopRow}>
          <View style={[styles.vaultIconChip, { backgroundColor: `${accentColor}26` }]}>
            <Folder size={20} color={accentColor} strokeWidth={2.2} />
            {(item.hasAccessKey || item.accessKeyId) && (
              <View style={[styles.lockBadge, { backgroundColor: dash.accent }]}>
                <Lock size={10} color="#FFFFFF" strokeWidth={3} />
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
              onPress={() => { setTargetFolder(item); setShowFolderMenu(true); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <MoreVertical size={18} color={dash.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.vaultBottomBlock}>
          <View style={styles.vaultNameRow}>
            <Text style={[styles.vaultName, { color: dash.text }]} numberOfLines={1}>{item.name}</Text>
            <View style={styles.vaultNameIcons}>
              {(item.hasAccessKey || item.accessKeyId) && <Lock size={14} color={dash.accent} />}
              {item.isEncrypted && item.encryptionKeyId ? <Text style={{ fontSize: 12 }}>🔐</Text> : null}
              {item.isFavorite ? <ShieldCheck size={14} color="#FBBF24" /> : null}
            </View>
          </View>
          <View style={styles.vaultMetaRow}>
            <Text style={[styles.vaultMeta, { color: dash.textMuted }]}>{folderFileCount} files</Text>
            <Text style={[styles.vaultMeta, { color: dash.textMuted }]}>{sizeLabel}</Text>
          </View>
        </View>
      </Pressable>
    );
  }, [dash.surface, dash.accent, dash.fabText, dash.text, dash.textMuted, folderStatsMap, selectedFolderIds, selectionMode, toggleFolderSelection, vaultAccentPalette, handleVaultPress]);

  const VAULT_GAP = 12;
  const getVaultColumns = (mode: string) => {
    if (mode === 'list') return 1;
    if (mode === 'small-icons') return 5;
    if (mode === 'medium-icons') return 3;
    return 2;
  };
  const getVaultItemWidth = (mode: string) => {
    const cols = getVaultColumns(mode);
    const gap = VAULT_GAP;
    return (SCREEN_WIDTH - SCREEN_PADDING * 2 - gap * (cols - 1)) / cols;
  };

  const renderVaultGrid = (folders: any[], accentOffset = 0) => {
    const itemWidth = getVaultItemWidth(viewMode);
    const isGrid = viewMode !== 'list';
    const gap = viewMode === 'list' ? 0 : VAULT_GAP;

    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
        {folders.map((item, i) => {
          const accentColor = vaultAccentPalette[(i + accentOffset) % vaultAccentPalette.length];
          if (isGrid) {
            return (
              <Pressable
                key={item.id}
                onLongPress={() => { setSelectionMode(true); setSelectedFolderIds([item.id]); }}
                onPress={() => handleVaultPress(item)}
                style={[
                  styles.vaultGridTile,
                  {
                    width: itemWidth,
                    backgroundColor: dash.surface,
                    borderColor: selectedFolderIds.includes(item.id) ? dash.accent : 'transparent',
                    borderWidth: 2,
                  },
                ]}
              >
                <View style={[styles.vaultGridIcon, { backgroundColor: `${accentColor}26` }]}>
                  <Folder size={28} color={accentColor} strokeWidth={2} />
                  {(item.hasAccessKey || item.accessKeyId) && (
                    <View style={[styles.lockBadge, { backgroundColor: dash.accent }]}>
                      <Lock size={10} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  )}
                </View>
                <Text style={[styles.vaultGridName, { color: dash.text }]} numberOfLines={1}>{item.name}</Text>
                <View style={styles.vaultGridIconsRow}>
                  {(item.hasAccessKey || item.accessKeyId) && <Lock size={12} color={dash.accent} />}
                  {item.isFavorite && <ShieldCheck size={12} color="#FBBF24" />}
                </View>
              </Pressable>
            );
          }

          return (
            <View key={item.id} style={{ width: '100%', marginBottom: 12 }}>
              <VaultTile item={item} index={i + accentOffset} />
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: dash.bg }]}>
      <View style={[styles.headerRow, { backgroundColor: dash.bg }]}>
        
        <View style={styles.headerTextBlock}>
          <Text style={[styles.headerTitle, { color: dash.text }]} numberOfLines={1}>{displayName}</Text>
          <Text style={[styles.headerTagline, { color: dash.textMuted }]} numberOfLines={1}>Your secure storage vault</Text>
        </View>
        <ViewModeMenu />
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

        <ClipboardBar
          onPaste={handlePasteToRoot}
          onUndo={undoLastCut}
          backgroundColor={dash.surface}
          textColor={dash.text}
          accentColor={dash.accent}
          mutedColor={dash.textMuted}
        />

        <View
          style={[
            styles.storageCard,
            { backgroundColor: dash.accent },
          ]}
        >
          <View style={styles.storageTopRow}>
            <View style={styles.storageLabelRow}>
              <Cloud size={18} color={dash.text} />
              <Text style={[styles.storageLabel, { color: dash.text }]}>
                Cloud Storage
              </Text>
            </View>
            <View style={[styles.usedPill, { backgroundColor: dash.surface }]}>
              <Text style={[styles.usedPillText, { color: dash.text }]}>{percentUsed}% Used</Text>
            </View>
          </View>

          <View style={styles.storageValueRow}>
            <Text style={[styles.storageValue, { color: dash.text }]}>{displayStorageValue}</Text>
            <Text style={[styles.storageUnit, { color: dash.text }]}> {displayStorageUnit}</Text>
          </View>

          <View style={[styles.progressTrack, { backgroundColor: dash.surfaceHover }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: dash.fabBg, width: `${Math.max(2, percentUsed)}%` },
              ]}
            />
          </View>
          <View style={styles.progressLabelsRow}>
            <Text style={[styles.progressLabel, { color: dash.text }]}>0 GB</Text>
            <Text style={[styles.progressLabel, { color: dash.text }]}>
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
                  <>
                    <TouchableOpacity onPress={handleBulkCopy} style={styles.textBtn}>
                      <Copy size={14} color={dash.text} strokeWidth={2.5} />
                      <Text style={{ color: dash.text, fontSize: 13, fontWeight: '700' }}>Copy</Text>
                    </TouchableOpacity>
                     <TouchableOpacity onPress={handleBulkCut} style={styles.textBtn}>
                       <Scissors size={14} color={dash.text} strokeWidth={2.5} />
                       <Text style={{ color: dash.text, fontSize: 13, fontWeight: '700' }}>Cut</Text>
                     </TouchableOpacity>
                     {clipboard && (
                       <TouchableOpacity onPress={handlePasteToRoot} style={styles.textBtn}>
                         <ClipboardCheck size={14} color={dash.accent} strokeWidth={2.5} />
                         <Text style={{ color: dash.accent, fontSize: 13, fontWeight: '700' }}>Paste</Text>
                       </TouchableOpacity>
                     )}
                     <TouchableOpacity onPress={handleBulkShredFolders} style={styles.textBtnDanger}>
                      <Text style={{ color: colors.error, fontSize: 13, fontWeight: '700' }}>Shred</Text>
                     </TouchableOpacity>
                  </>
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
                  {renderVaultGrid(rootFolders, 0)}
                </View>
              )}
              {subFolders.length > 0 && (
                <View style={styles.vaultSection}>
                  <Text style={[styles.vaultSectionLabel, { color: dash.textMuted }]}>SUBFOLDERS</Text>
                  {renderVaultGrid(subFolders, rootFolders.length)}
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

      <DestructiveConfirmModal state={delConfirm} onClose={closeDelConfirm} />

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
              {(() => {
                const hasPassword = targetFolder.hasAccessKey || targetFolder.accessKeyId;
                const hasClipboard = !!clipboard;
                 const baseItems = [
                  { action: 'rename', label: 'Rename', color: dash.text },
                  { action: 'move', label: 'Move', color: dash.text },
                  { action: 'export', label: 'Export', color: dash.text },
                  { action: 'duplicate', label: 'Duplicate', color: dash.text },
                  { action: 'favorite', label: targetFolder.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: '#FBBF24' },
                  { action: 'delete', label: 'Move to Trash', color: colors.error },
                  { action: 'shred', label: 'Shred Permanently', color: colors.error },
                ];
                if (hasClipboard) {
                  baseItems.splice(3, 0, { action: 'paste', label: 'Paste Here', color: dash.accent });
                }
                if (hasPassword) {
                  baseItems.splice(3, 0, { action: 'remove-key', label: 'Remove Assigned Access Key', color: colors.error });
                } else {
                  baseItems.splice(3, 0, 
                    { action: 'register-key', label: 'Assign and Create Access Key', color: dash.accent },
                    { action: 'assign-key', label: 'Assign Existing Access Key', color: dash.accent }
                  );
                }
                return baseItems;
              })().map(item => (
                <TouchableOpacity key={item.action} style={[styles.actionSheetItem, { borderBottomColor: dash.border }]} onPress={() => handleFolderAction(targetFolder, item.action)}>
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
          await assignFolderAccessKey(keyPickerTarget.id, passwordId);
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
          targetType={unlockTarget?.type ?? pendingPasswordRemoval?.type ?? 'folder'}
          accessKeyId={unlockTarget?.accessKeyId ?? pendingPasswordRemoval?.accessKeyId ?? ''}
          onClose={() => {
            setShowUnlockModal(false);
            setUnlockTarget(null);
            setPendingPasswordRemoval(null);
          }}
          onUnlock={() => {
            if (pendingPasswordRemoval) {
              removeFolderAccessKey(pendingPasswordRemoval.id);
              Alert.alert('Access Key Removed', 'The access key has been removed from this folder.');
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
      <Modal visible={showCreatePasswordModal} transparent animationType="fade" onRequestClose={() => { setShowCreatePasswordModal(false); setCreatePasswordTarget(null); setNewPasswordLabel(''); setNewPasswordDescription(''); setNewPassword(''); setNewConfirmPassword(''); setShowNewPassword(false); setShowNewConfirmPassword(false); }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <View style={[modalS.centeredCard, { backgroundColor: dash.surface }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={pms.content}>
              <Text style={[pms.title, { color: dash.text }]}>Access Key Registration</Text>
              
              <View style={[pms.targetRow, { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' }]}>
                <FileText size={16} color={dash.textMuted} strokeWidth={2} />
                <Text style={[pms.targetChipText, { color: dash.textMuted }]}>for {createPasswordTarget?.name}</Text>
              </View>

              <View style={{ marginBottom: 20 }}>
                <Text style={[pms.label, { color: dash.text, marginBottom: 8 }]}>Password Label</Text>
                <TextInput
                  style={[pms.input, { backgroundColor: 'rgba(255,255,255,0.05)', color: dash.text }]}
                  placeholder="e.g. Personal Vault Password"
                  placeholderTextColor={dash.textMuted}
                  value={newPasswordLabel}
                  onChangeText={setNewPasswordLabel}
                />
              </View>

              <View style={{ marginBottom: 24 }}>
                <View style={pms.labelRow}>
                  <Text style={[pms.label, { color: dash.text, marginBottom: 0 }]}>Description</Text>
                  <View style={[pms.optionalBadge, { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1 }]}>
                    <Text style={[pms.optionalBadgeText, { color: dash.textMuted }]}>optional</Text>
                  </View>
                </View>
                <TextInput
                  style={[pms.input, { backgroundColor: 'rgba(255,255,255,0.05)', color: dash.text, minHeight: 100, textAlignVertical: 'top' }]}
                  placeholder="What is this password used for?"
                  placeholderTextColor={dash.textMuted}
                  value={newPasswordDescription}
                  onChangeText={setNewPasswordDescription}
                  multiline
                />
              </View>

              <View style={[pms.sectionDivider, { backgroundColor: 'transparent' }]}>
                <View style={[pms.dividerLine, { backgroundColor: dash.border }]} />
                <Text style={[pms.sectionLabel, { color: dash.textMuted }]}>SECURITY</Text>
                <View style={[pms.dividerLine, { backgroundColor: dash.border }]} />
              </View>

              <View style={{ marginBottom: 20 }}>
                <Text style={[pms.label, { color: dash.text, marginBottom: 8 }]}>Create Password</Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={[pms.input, { backgroundColor: 'rgba(255,255,255,0.05)', color: dash.text, paddingRight: 50 }]}
                    placeholder="Enter a strong password"
                    placeholderTextColor={dash.textMuted}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNewPassword}
                  />
                  <TouchableOpacity
                    style={pms.eyeButton}
                    onPress={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <Eye size={18} color={dash.textMuted} strokeWidth={2} /> : <EyeOff size={18} color={dash.textMuted} strokeWidth={2} />}
                  </TouchableOpacity>
                </View>
                {newPassword.length > 0 && (
                  <View style={{ marginTop: 10, gap: 6 }}>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: dash.border, overflow: 'hidden' }}>
                      <View style={{ height: '100%', borderRadius: 2, backgroundColor: newStrengthColor, width: newStrengthWidth }} />
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: newStrengthColor, textTransform: 'capitalize' }}>{newStrengthLabel} password</Text>
                  </View>
                )}
                {newPassword.length > 0 && (
                  <View style={[pms.validationBox, { backgroundColor: 'rgba(255,69,58,0.06)', borderWidth: 1, borderColor: 'rgba(255,69,58,0.12)' }]}>
                    <Text style={[pms.validationTitle, { color: dash.textMuted }]}>Password Requirements</Text>
                    {getPasswordValidationMessages(newPassword).messages.map((msg, idx) => (
                      <View key={idx} style={pms.validationItem}>
                        <Text style={[pms.validationIcon, { color: msg.valid ? '#34C759' : colors.error }]}>{msg.valid ? '✓' : '✗'}</Text>
                        <Text style={[pms.validationText, { color: msg.valid ? dash.textMuted : colors.error }]}>{msg.text}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={{ marginBottom: 20 }}>
                <Text style={[pms.label, { color: dash.text, marginBottom: 8 }]}>Confirm Password</Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={[pms.input, { backgroundColor: 'rgba(255,255,255,0.05)', color: dash.text, paddingRight: 50 }]}
                    placeholder="Confirm your password"
                    placeholderTextColor={dash.textMuted}
                    value={newConfirmPassword}
                    onChangeText={setNewConfirmPassword}
                    secureTextEntry={!showNewConfirmPassword}
                  />
                  <TouchableOpacity
                    style={pms.eyeButton}
                    onPress={() => setShowNewConfirmPassword(!showNewConfirmPassword)}
                  >
                    {showNewConfirmPassword ? <Eye size={18} color={dash.textMuted} strokeWidth={2} /> : <EyeOff size={18} color={dash.textMuted} strokeWidth={2} />}
                  </TouchableOpacity>
                </View>
                {newConfirmPassword.length > 0 && newPassword !== newConfirmPassword && (
                  <Text style={{ fontSize: 12, color: colors.error, marginTop: 8, fontWeight: '600' }}>Passwords do not match</Text>
                )}
              </View>

              <View style={pms.actions}>
                <TouchableOpacity onPress={() => { setShowCreatePasswordModal(false); setCreatePasswordTarget(null); setNewPasswordLabel(''); setNewPasswordDescription(''); setNewPassword(''); setNewConfirmPassword(''); setShowNewPassword(false); setShowNewConfirmPassword(false); }} style={[pms.cancelBtn, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                  <X size={18} color={dash.text} strokeWidth={2.5} />
                  <Text style={[pms.cancelText, { color: dash.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmCreateAndAssignPassword} style={[pms.primaryBtn, { backgroundColor: dash.fabBg }]}>
                  <ShieldCheck size={18} color={dash.fabText} strokeWidth={2.5} />
                  <Text style={[pms.primaryText, { color: dash.fabText }]}>Create Password</Text>
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
    paddingTop: 50,
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
  vaultGridTile: { borderRadius: 20, padding: 12, alignItems: 'center', justifyContent: 'center', minHeight: 120 },
  vaultGridIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  vaultGridName: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  vaultGridIconsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  vaultTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  vaultIconChip: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  lockBadge: { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  vaultBottomBlock: { marginTop: 14 },
  vaultNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vaultNameIcons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  centeredCard: { width: '90%', maxWidth: 400, maxHeight: '80%', borderRadius: 24, padding: 20, alignItems: 'center' },
  centeredTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20, letterSpacing: -0.3 },
  centeredInput: { width: '100%', borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20, fontSize: 15 },
  centeredBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
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
