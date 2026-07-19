import { router } from 'expo-router';
import {
  Box,
  CheckSquare,
  Cloud,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Folder,
  Image as ImageIcon,
  Key,
  Lock,
  Music,
  Plus,
  Scissors,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  Video,
  X
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { AccessKeyPicker } from '../../components/AccessKeyPicker';
import { AccessKeyUnlockModal } from '../../components/AccessKeyUnlockModal';
import { AccessKeyRegistrationModal } from '../../components/AccessKeyRegistrationModal';
import AnimatedTabBar from '../../components/AnimatedTabBar';
import { ClipboardBar } from '../../components/ClipboardBar';
import { DestructiveConfirmModal, useConfirmDestructive } from '../../components/DestructiveConfirmModal';
import { ViewModeMenu } from '../../components/ViewModeMenu';
import { CategoryTint } from '../../constants/Colors';
import { useRename } from '../../contexts/RenameContext';
import { useMove } from '../../contexts/MoveVaultContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';

const wrapAtLength = (text: string, maxLength = 60): string[] => {
  if (!text) return [];
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += maxLength) {
    lines.push(text.slice(i, i + maxLength));
  }
  return lines;
};

const DISPLAY_CAPACITY_GB = 100;

export default function DashboardScreen() {
  const { colors, isDark, space, font, screenPadding, headerPaddingTop, bottomTabSpacing, isTablet, responsiveSize, gridColumns, gridItemWidth } = useTheme();
  const { width } = useWindowDimensions();
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
  const { openRenameModal, setOnRename } = useRename();
  const { openMoveModal, setOnMove } = useMove();

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
    cloudBg: isDark ? '#E5E7EB' : '#E8F0FE',
    cloudText: '#0F172A',
  }), [colors, isDark]);

  const displayName = disguiseAppName || 'Deposito Seguro';

  const { confirmState: delConfirm, confirm: confirmDestructive, close: closeDelConfirm } = useConfirmDestructive();

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [targetFolder, setTargetFolder] = useState<any>(null);
  const [showMoveModal, setShowMoveModal] = useState(false); // will be replaced by context
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [showPasswordPicker, setShowPasswordPicker] = useState(false);
  const [keyPickerTarget, setKeyPickerTarget] = useState<{ type: 'folder' | 'bulk'; id: string; name: string } | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<{ type: 'folder'; id: string; name: string; accessKeyId: string; onUnlock: () => void } | null>(null);
  const [pendingPasswordRemoval, setPendingPasswordRemoval] = useState<{ type: 'folder'; id: string; name: string; accessKeyId: string } | null>(null);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [keyCreateTarget, setKeyCreateTarget] = useState<{ id: string; name: string } | null>(null);

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

  const toggleFolderSelection = useCallback((folderId: string) => {
    setSelectedFolderIds(prev => prev.includes(folderId) ? prev.filter(id => id !== folderId) : [...prev, folderId]);
  }, []);

  const handleVaultPress = useCallback((folder: any) => {
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
  }, [selectionMode, toggleFolderSelection, setUnlockTarget, setShowUnlockModal]);

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

  const handleOpenKeyModal = (targetId: string, targetName: string) => {
    if (accessKeys.length >= 20) {
      Alert.alert('Access Key Limit', 'You can only create up to 20 access keys.');
      return;
    }
    setKeyCreateTarget({ id: targetId, name: targetName });
    setShowCreateKeyModal(true);
  };

  const handleFolderAction = (folder: any, action: string) => {
    setShowFolderMenu(false);
    switch (action) {
      case 'rename':
        setTargetFolder(folder);
        openRenameModal({ id: folder.id, name: folder.name, type: 'folder' });
        setOnRename((newName: string) => {
          renameFolder(folder.id, newName.trim());
        });
        break;
      case 'move':
        setTargetFolder(folder);
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
        handleOpenKeyModal(folder.id, folder.name);
        break;
       case 'assign-key':
         if (accessKeys.length === 0) {
           Alert.alert('No Access Keys', 'Create an access key in Settings first.');
         } else {
           setKeyPickerTarget({ type: 'folder', id: folder.id, name: folder.name });
           setShowPasswordPicker(true);
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

  const handleDeleteAllFolders = () => {
    if (folders.length === 0) return;
    confirmDestructive(
      'Permanently Delete All Vaults',
      `Permanently delete all ${folders.length} vaults and their contents? This cannot be undone.`,
      () => shredMultipleFolders(folders.map(f => f.id)),
      'Delete All'
    );
  };

  const handleBulkAssignExistingKey = () => {
    if (selectedFolderIds.length === 0) return;
    setKeyPickerTarget({ type: 'bulk', id: 'bulk', name: 'selected vaults' });
    setShowPasswordPicker(true);
  };

  const handleBulkCreateAndAssignKey = () => {
    if (selectedFolderIds.length === 0) return;
    setKeyCreateTarget({ id: 'bulk', name: `${selectedFolderIds.length} selected vaults` });
    setShowCreateKeyModal(true);
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

  const CategoryTile = useCallback(({ item, index, width }: { item: typeof categoryData[number]; index: number; width: number }) => {
    const filterLabel = item.key === 'docs' ? 'Documents' : item.label;
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/(main)/search', params: { filter: filterLabel } })}
        style={[styles.categoryTile, { backgroundColor: dash.surface, paddingVertical: space(4), paddingHorizontal: space(2), borderRadius: space(2), alignItems: 'center', width }]}
      >
        <View style={[styles.categoryIconChip, { backgroundColor: `${item.color}1A`, marginBottom: space(2), width: responsiveSize(40, 48, 52), height: responsiveSize(40, 48, 52), borderRadius: responsiveSize(12, 14, 16) }]}>
          <item.Icon size={responsiveSize(20, 22, 24)} color={item.color} strokeWidth={2.2} />
        </View>
        <Text style={[styles.categoryLabel, { color: dash.text, fontSize: font(13), marginBottom: space(1) }]} numberOfLines={1}>{item.label}</Text>
        <Text style={[styles.categoryCount, { color: dash.textMuted, fontSize: font(11) }]}>{item.count} files</Text>
      </Pressable>
    );
  }, [dash.surface, dash.text, dash.textMuted, space, font, responsiveSize]);

  const VaultTile = useCallback(({ item, index, gridWidth }: { item: any; index: number; gridWidth?: number }) => {
    const stats = folderStatsMap[item.id] || { count: 0, size: 0 };
    const folderFileCount = stats.count;
    const folderMB = stats.size / (1024 * 1024);
    const sizeLabel = folderMB >= 1024 ? `${(folderMB / 1024).toFixed(1)} GB` : `${folderMB.toFixed(0)} MB`;
    const isSelected = selectedFolderIds.includes(item.id);
    const accentColor = vaultAccentPalette[index % vaultAccentPalette.length];
    const width = gridWidth ?? 160;

    // Compact horizontal layout for list view
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
            paddingVertical: space(2),
            paddingHorizontal: space(3),
            minHeight: responsiveSize(64, 72, 80),
            flexDirection: 'row',
            alignItems: 'center',
          },
        ]}
      >
        {/* Icon section - left side */}
        <View style={[styles.vaultIconChip, { backgroundColor: `${accentColor}26`, width: responsiveSize(40, 44, 48), height: responsiveSize(40, 44, 48), borderRadius: responsiveSize(12, 14, 16), marginRight: space(3), flexShrink: 0 }]}>
          <Folder size={responsiveSize(20, 22, 24)} color={accentColor} strokeWidth={2.2} />
          {(item.hasAccessKey || item.accessKeyId) && (
            <View style={{ position: 'absolute', bottom: -2, right: -2, width: responsiveSize(14, 16, 18), height: responsiveSize(14, 16, 18), borderRadius: responsiveSize(7, 8, 9), alignItems: 'center', justifyContent: 'center', backgroundColor: dash.accent }}>
              <Lock size={responsiveSize(8, 10, 12)} color="#FFFFFF" strokeWidth={3} />
            </View>
          )}
        </View>

        {/* Content section - right side */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', minWidth: 0 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.vaultNameRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                {wrapAtLength(item.name, 60).map((line, index) => (
                  <Text key={index} style={[styles.vaultName, { color: dash.text, fontSize: font(14), marginBottom: 2 }]}>{line}</Text>
                ))}
              </View>
              <View style={[styles.vaultNameIcons, { alignSelf: 'flex-start' }]}>
                {(item.hasAccessKey || item.accessKeyId) && <Lock size={responsiveSize(12, 14, 16)} color={dash.accent} />}
                {item.isEncrypted && item.encryptionKeyId ? <Text style={{ fontSize: responsiveSize(10, 12, 14) }}>🔐</Text> : null}
                {item.isFavorite ? <ShieldCheck size={responsiveSize(12, 14, 16)} color="#FBBF24" /> : null}
              </View>
            </View>
            <View style={styles.vaultMetaRow}>
              <Text style={[styles.vaultMeta, { color: dash.textMuted, fontSize: font(11) }]}>{folderFileCount} files</Text>
              <View style={{ width: 64, alignItems: 'center', position: 'relative' }}>
                {selectionMode ? (
                  <View style={[styles.checkBox, { position: 'absolute', top: 0, flexShrink: 0 }]}>
                    <View style={{ width: responsiveSize(20, 22, 24), height: responsiveSize(20, 22, 24), borderRadius: responsiveSize(6, 7, 8), borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: isSelected ? dash.accent : 'transparent', borderColor: dash.accent }}>
                      {isSelected && <Text style={{ color: dash.fabText, fontSize: 10, fontWeight: '700' }}>✓</Text>}
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => { setTargetFolder(item); setShowFolderMenu(true); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                    style={{ position: 'absolute', top: 0 }}
                  >
                    <Text style={[styles.gridMenuDots, { color: dash.textMuted, fontSize: 14 }]}>•••</Text>
                  </TouchableOpacity>
                )}
                <Text style={[styles.vaultMeta, { color: dash.textMuted, fontSize: font(11), marginTop: 20 }]}>{sizeLabel}</Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    );
  }, [dash.surface, dash.accent, dash.fabText, dash.text, dash.textMuted, folderStatsMap, selectedFolderIds, selectionMode, vaultAccentPalette, handleVaultPress, responsiveSize, font, space]);

   const vaultGap = space(6);
   const categoryGap = space(6);
   const categoryColumns = gridColumns('small-icons', 100);
   const categoryItemWidth = gridItemWidth(categoryColumns, categoryGap, screenPadding);
  const getVaultColumns = useCallback((mode: string) => {
    const w = width - screenPadding * 2;
    if (mode === 'list') return 1;
    if (mode === 'small-icons') return 5;
    if (mode === 'medium-icons') return 3;
    if (mode === 'large-icons') return 2;
    if (w > 900 || isTablet) return 4;
    return 2;
  }, [width, screenPadding, isTablet]);

  const getVaultItemWidth = useCallback((mode: string) => {
    const cols = getVaultColumns(mode);
    const gap = vaultGap;
    return Math.max(60, (width - screenPadding * 2 - gap * (cols - 1)) / cols);
  }, [width, screenPadding, vaultGap, getVaultColumns]);

  const renderVaultGrid = (folders: any[], accentOffset = 0) => {
    const itemWidth = getVaultItemWidth(viewMode);

    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: vaultGap }}>
        {folders.map((item, i) => {
          const width = itemWidth;
          if (viewMode === 'list') {
            return (
               <View key={item.id} style={{ width, flexDirection: 'row' }}>
                 <VaultTile item={item} index={i + accentOffset} gridWidth={width} />
               </View>
            );
          }

          const accentColor = vaultAccentPalette[(i + accentOffset) % vaultAccentPalette.length];
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
                  minHeight: responsiveSize(110, 130, 150),
                },
              ]}
            >
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); setTargetFolder(item); setShowFolderMenu(true); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
                style={styles.gridMenuIcon}
              >
                <Text style={styles.gridMenuDots}>•••</Text>
              </TouchableOpacity>
              <View style={{ width: responsiveSize(44, 52, 60), height: responsiveSize(44, 52, 60), borderRadius: responsiveSize(16, 18, 20), alignItems: 'center', justifyContent: 'center', marginBottom: 10, position: 'relative', backgroundColor: `${accentColor}26` }}>
                <Folder size={responsiveSize(24, 28, 32)} color={accentColor} strokeWidth={2} />
                {(item.hasAccessKey || item.accessKeyId) && (
                  <View style={{ position: 'absolute', bottom: -2, right: -2, width: responsiveSize(14, 16, 18), height: responsiveSize(14, 16, 18), borderRadius: responsiveSize(7, 8, 9), alignItems: 'center', justifyContent: 'center', backgroundColor: dash.accent }}>
                    <Lock size={responsiveSize(8, 10, 12)} color="#FFFFFF" strokeWidth={3} />
                  </View>
                )}
              </View>
              {wrapAtLength(item.name, 60).map((line, index) => (
                <Text key={index} style={[styles.vaultGridName, { color: dash.text, fontSize: font(13) }]}>{line}</Text>
              ))}
              <View style={styles.vaultGridIconsRow}>
                {(item.hasAccessKey || item.accessKeyId) && <Lock size={responsiveSize(10, 12, 14)} color={dash.accent} />}
                {item.isFavorite && <ShieldCheck size={responsiveSize(10, 12, 14)} color="#FBBF24" />}
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: dash.bg }]}>
      <View style={[styles.headerRow, { backgroundColor: dash.bg, paddingTop: headerPaddingTop, paddingHorizontal: screenPadding }]}>
        <View style={styles.headerTextBlock}>
          <Text style={[styles.headerTitle, { color: dash.text, fontSize: font(24) }]} numberOfLines={1}>Deposito Seguro</Text>
          <Text style={[styles.headerTagline, { color: dash.textMuted, fontSize: font(13) }]} numberOfLines={1}>Your secure storage vault</Text>
        </View>
        <ViewModeMenu />
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollBody, { paddingHorizontal: screenPadding, paddingBottom: bottomTabSpacing + responsiveSize(90, 100, 110) }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.push('/(main)/search')}>
          <View style={[styles.searchBar, { backgroundColor: dash.surface, paddingHorizontal: space(4), paddingVertical: space(3), marginBottom: space(8) }]}>
            <Search size={18} color={dash.textMuted} />
            <Text style={[styles.searchPlaceholder, { color: dash.textMuted, fontSize: font(14) }]}>Search files, vaults...</Text>
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
            { backgroundColor: dash.cloudBg, borderRadius: space(2), padding: space(5), marginBottom: space(8) },
          ]}
        >
          <View style={styles.storageTopRow}>
            <View style={styles.storageLabelRow}>
              <Cloud size={18} color={dash.cloudText} />
              <Text style={[styles.storageLabel, { color: dash.cloudText, fontSize: font(13) }]}>
                Cloud Storage
              </Text>
            </View>
            <View style={[styles.usedPill, { backgroundColor: dash.surface }]}>
              <Text style={[styles.usedPillText, { color: dash.text, fontSize: font(12) }]}>{percentUsed}% Used</Text>
            </View>
          </View>

          <View style={styles.storageValueRow}>
            <Text style={[styles.storageValue, { color: dash.cloudText, fontSize: font(30) }]}>{displayStorageValue}</Text>
            <Text style={[styles.storageUnit, { color: dash.cloudText, fontSize: font(16) }]}> {displayStorageUnit}</Text>
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
            <Text style={[styles.progressLabel, { color: dash.cloudText, fontSize: font(12) }]}>0 GB</Text>
            <Text style={[styles.progressLabel, { color: dash.cloudText, fontSize: font(12) }]}>
              {DISPLAY_CAPACITY_GB} GB
            </Text>
          </View>
        </View>

        <View style={[styles.section, { marginBottom: space(8) }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: dash.text, fontSize: font(18) }]}>Categories</Text>
            <TouchableOpacity onPress={() => router.push('/(main)/search')}>
              <Text style={[styles.seeAll, { color: dash.textMuted, fontSize: font(13) }]}>See all</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.categoryGrid, { gap: categoryGap }]}>
            {categoryData.map((item, i) => (
              <CategoryTile key={item.key} item={item} index={i} width={categoryItemWidth} />
            ))}
          </View>
        </View>

        <View style={[styles.section, { marginBottom: space(8) }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: dash.text, fontSize: font(18) }]}>My Vaults</Text>
             {selectionMode ? (
               <View style={styles.sectionActions}>
                 <TouchableOpacity onPress={handleSelectAllFolders} style={styles.iconActionPill}>
                   <CheckSquare size={18} color={dash.text} strokeWidth={2.5} />
                 </TouchableOpacity>
                 {selectedFolderIds.length > 0 && (
                   <>
                     <TouchableOpacity onPress={handleBulkCopy} style={styles.iconActionPill}>
                       <Copy size={18} color={dash.text} strokeWidth={2.5} />
                     </TouchableOpacity>
                     <TouchableOpacity onPress={handleBulkCut} style={styles.iconActionPill}>
                       <Scissors size={18} color={dash.text} strokeWidth={2.5} />
                     </TouchableOpacity>
                     <TouchableOpacity onPress={handleBulkShredFolders} style={[styles.iconActionPill, { backgroundColor: `${colors.error}18` }]}>
                       <Trash2 size={18} color={colors.error} strokeWidth={2.5} />
                     </TouchableOpacity>
                     <TouchableOpacity onPress={handleBulkAssignExistingKey} style={styles.iconActionPill}>
                       <Key size={18} color={dash.accent} strokeWidth={2.5} />
                     </TouchableOpacity>
                     <TouchableOpacity onPress={handleBulkCreateAndAssignKey} style={styles.iconActionPill}>
                       <ShieldCheck size={18} color={dash.accent} strokeWidth={2.5} />
                     </TouchableOpacity>
                   </>
                 )}
                 <TouchableOpacity onPress={handleDeleteAllFolders} style={styles.textBtnDanger}>
                   <Text style={{ color: colors.error, fontSize: font(13), fontWeight: '700' }}>Delete All</Text>
                 </TouchableOpacity>
                 <TouchableOpacity onPress={exitSelectionMode} style={styles.cancelBtn}>
                   <Text style={{ color: dash.textMuted, fontSize: font(13), fontWeight: '700' }}>Cancel</Text>
                 </TouchableOpacity>
               </View>
              ) : (
               <TouchableOpacity onPress={() => router.push('/(main)/search')}>
                 <Text style={[styles.seeAll, { color: dash.textMuted, fontSize: font(13) }]}>See all</Text>
               </TouchableOpacity>
             )}
          </View>

          {folders.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: dash.surface, borderRadius: space(2), paddingVertical: space(10), paddingHorizontal: space(5) }]}>
              <Text style={{ fontSize: responsiveSize(36, 42, 48), marginBottom: space(3) }}>🏦</Text>
              <Text style={[styles.emptyTitle, { color: dash.text, fontSize: font(18) }]}>No Vaults Yet</Text>
              <Text style={[styles.emptyText, { color: dash.textMuted, fontSize: font(14) }]}>Create your first secure vault to get started</Text>
              <TouchableOpacity onPress={handleDirectoryProvisioning} style={[styles.emptyBtn, { backgroundColor: dash.fabBg }]}>
                <Text style={{ color: dash.fabText, fontWeight: '700', fontSize: font(14) }}>Create First Vault</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {rootFolders.length > 0 && (
                <View style={[styles.vaultSection, { marginBottom: space(6) }]}>
                  <Text style={[styles.vaultSectionLabel, { color: dash.textMuted, marginBottom: space(2) }]}>ROOT VAULTS</Text>
                  {renderVaultGrid(rootFolders, 0)}
                </View>
              )}
              {subFolders.length > 0 && (
                <View style={[styles.vaultSection, { marginBottom: space(6) }]}>
                  <Text style={[styles.vaultSectionLabel, { color: dash.textMuted, marginBottom: space(2) }]}>SUBFOLDERS</Text>
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
        style={[styles.fab, { backgroundColor: dash.fabBg, width: responsiveSize(56, 64, 72), height: responsiveSize(56, 64, 72), borderRadius: responsiveSize(28, 32, 36), bottom: bottomTabSpacing + responsiveSize(16, 20, 24), right: screenPadding }]}
        accessibilityRole="button"
        accessibilityLabel="Create new vault"
      >
        <Plus size={responsiveSize(24, 26, 28)} color={dash.fabText} strokeWidth={2.4} />
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
              <Text style={[styles.actionSheetTitle, { color: dash.text, paddingHorizontal: space(5), paddingVertical: space(4) }]}>{targetFolder.name}</Text>
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
                <TouchableOpacity key={item.action} style={[styles.actionSheetItem, { borderBottomColor: dash.border, paddingHorizontal: space(5), paddingVertical: space(4) }]} onPress={() => handleFolderAction(targetFolder, item.action)}>
                  <Text style={[styles.actionSheetLabel, { color: item.color }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      <AccessKeyPicker
        visible={showPasswordPicker}
        onClose={() => { setShowPasswordPicker(false); setKeyPickerTarget(null); }}
        onSelectPassword={async (passwordId: string) => {
          if (!keyPickerTarget) return;
          if (keyPickerTarget.type === 'bulk') {
            for (const folderId of selectedFolderIds) {
              await assignFolderAccessKey(folderId, passwordId);
            }
            Alert.alert('Access Key Assigned', `Access key has been assigned to ${selectedFolderIds.length} vaults.`);
          } else {
            await assignFolderAccessKey(keyPickerTarget.id, passwordId);
            Alert.alert('Access Key Assigned', 'The selected access key is now registered.');
          }
          setShowPasswordPicker(false);
          setKeyPickerTarget(null);
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
          mode="unlock"
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

      <AccessKeyRegistrationModal
        visible={showCreateKeyModal}
        target={keyCreateTarget ? { ...keyCreateTarget, type: keyCreateTarget.id === 'bulk' ? 'bulk' : 'folder' } : null}
        selectedItemIds={selectedFolderIds}
        itemTypes={Object.fromEntries(selectedFolderIds.map(id => [id, 'folder']))}
        onClose={() => { setShowCreateKeyModal(false); setKeyCreateTarget(null); }}
        onSuccess={() => { setShowCreateKeyModal(false); setKeyCreateTarget(null); }}
        assignFolderAccessKey={assignFolderAccessKey}
        assignFileAccessKey={() => Promise.resolve()}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollBody: { paddingTop: 8 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 0,
  },
  headerTextBlock: { flex: 1, marginRight: 12 },
  headerTitle: { fontWeight: '800', letterSpacing: -0.4 },
  headerTagline: { fontWeight: '500', marginTop: 4 },
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
  },
  searchPlaceholder: { fontWeight: '500' },

  storageCard: { marginBottom: 32 },
  storageTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  storageLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  storageLabel: { fontWeight: '600' },
  usedPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  usedPillText: { fontWeight: '700' },
  storageValueRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 18 },
  storageValue: { fontWeight: '800', letterSpacing: -0.5 },
  storageUnit: { fontWeight: '700' },
  progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabelsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontWeight: '500' },

  section: { marginBottom: 32 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontWeight: '700', letterSpacing: -0.3 },
  seeAll: { fontWeight: '600' },
  sectionActions: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  iconActionPill: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  textBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  textBtnDanger: { paddingHorizontal: 12, paddingVertical: 8 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 8 },

  vaultSection: { marginBottom: 24 },
  vaultSectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  categoryTile: { alignItems: 'center' },
  categoryIconChip: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  categoryLabel: { fontWeight: '700', marginBottom: 3 },
  categoryCount: { fontWeight: '600' },

  vaultGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  vaultTile: { borderRadius: 24, justifyContent: 'space-between' },
  vaultGridTile: { borderRadius: 20, padding: 12, alignItems: 'center', justifyContent: 'center', minHeight: 120, position: 'relative' },
  vaultGridIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 10, position: 'relative' },
  vaultGridName: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 4, flexShrink: 1 },
  vaultGridIconsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  vaultTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  vaultIconChip: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  lockBadge: { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  gridMenuIcon: { position: 'absolute', top: 4, left: 4, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.35)', zIndex: 10 },
  gridMenuDots: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', lineHeight: 14 },
  vaultBottomBlock: { marginTop: 14 },
  vaultNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vaultNameIcons: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  vaultName: { fontWeight: '700', letterSpacing: -0.2, marginBottom: 6, flexShrink: 1 },
  vaultMetaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  vaultMeta: { fontWeight: '600' },
  checkBox: { marginLeft: 4 },
  checkInner: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },

  emptyCard: { borderRadius: 24, alignItems: 'center' },
  emptyTitle: { fontWeight: '700', marginBottom: 4 },
  emptyText: { textAlign: 'center', marginBottom: 12 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 8 },

  fab: {
    position: 'absolute',
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
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
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