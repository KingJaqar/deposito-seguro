// src/app/(main)/folder/[id].tsx
import * as DocumentPicker from 'expo-document-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { CheckSquare, Clipboard, Copy, Eye, EyeOff, FileText, Folder, Image, Key, Lock, Scissors, ShieldCheck, Star, Trash2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, Image as RNImage, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AccessKeyPicker } from '../../../components/AccessKeyPicker';
import { AccessKeyRegistrationModal } from '../../../components/AccessKeyRegistrationModal';
import { AccessKeyUnlockModal } from '../../../components/AccessKeyUnlockModal';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { ClipboardBar } from '../../../components/ClipboardBar';
import { DestructiveConfirmModal, useConfirmDestructive } from '../../../components/DestructiveConfirmModal';
import { ViewModeMenu } from '../../../components/ViewModeMenu';
import { useRename } from '../../../contexts/RenameContext';
import { useMove } from '../../../contexts/MoveVaultContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useFileSystemQuery } from '../../../hooks/useFileSystemQuery';
import { SecureCrypto } from '../../../security/crypto';
import { Durations, EasingCurves } from '../../../constants/animations';
import { StorageService } from '../../../services/storage';
import { useSettingsStore } from '../../../store/settingsStore';
import { useVaultStore } from '../../../store/vaultStore';

const wrapAtLength = (text: string, maxLength = 60): string[] => {
  if (!text) return [];
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += maxLength) {
    lines.push(text.slice(i, i + maxLength));
  }
  return lines;
};

export default function FolderDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, space, font, screenPadding, headerPaddingTop, bottomTabSpacing, isTablet, responsiveSize, gridColumns, gridItemWidth } = useTheme();
  const viewMode = useSettingsStore((s: any) => s.viewMode);
  
  // Bind authentic existing global context operations
  const {
    folders, importFile, deleteFolder, softDeleteFile, createFolder, renameFolder,
    shredFolder, shredMultipleFiles, shredAllFilesInFolder, renameFile, moveFileToFolder,
    exportFileToDevice, exportFolderFiles, moveFolder, shredFile,
    toggleFolderFavorite, toggleFavorite,
    assignFolderAccessKey, assignFileAccessKey, removeFolderAccessKey, removeFileAccessKey,
    clipboard, undoInfo,
    copyToClipboard, cutToClipboard, pasteFromClipboard, clearClipboard, undoLastCut,
    duplicateFile, duplicateFolder,
  } = useVaultStore();
  
  const { accessKeys, createAccessKey, accessKeyExists } = useSettingsStore();
  const { matchedFiles, matchedFolders } = useFileSystemQuery(id);
  const { openRenameModal, setOnRename } = useRename();
  const { openMoveModal, setOnMove } = useMove();

  const screenOpacity = useSharedValue(1);
  const screenTranslateY = useSharedValue(0);
  const hasAnimated = useSharedValue(false);

  useFocusEffect(() => {
    if (hasAnimated.value) return;
    hasAnimated.value = true;

    screenOpacity.value = 0;
    screenTranslateY.value = 12;
    screenOpacity.value = withTiming(1, {
      duration: Durations.normal,
      easing: Easing.out(Easing.quad),
    });
    screenTranslateY.value = withTiming(0, {
      duration: Durations.normal,
      easing: Easing.out(Easing.quad),
    });
  });

  // Maintain authentic cross-platform layout selectors
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showSubfolderMenu, setShowSubfolderMenu] = useState(false);
  const [targetFile, setTargetFile] = useState<any>(null);
  const [targetFolder, setTargetFolder] = useState<any>(null);
  const [targetSubfolder, setTargetSubfolder] = useState<any>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [shredProgress, setShredProgress] = useState<{ current: number; total: number } | null>(null);
  
  const folderRecord = folders.find(f => f.id === id);
  const folderName = folderRecord ? folderRecord.name : 'Vault Root';

  const { width } = useWindowDimensions();
  const gridGap = space(6);
  const isGridMode = viewMode !== 'list';
  const gridColumnsCount = gridColumns(viewMode);
  const gridItemWidthValue = gridItemWidth(gridColumnsCount, gridGap, screenPadding);

  const totalSizeKB = useMemo(() => {
    return matchedFiles.reduce((acc, f) => acc + (f.size || 0), 0) / 1024;
  }, [matchedFiles]);

  const passwordProtectedCount = useMemo(() => {
    return matchedFiles.filter(f => f.hasAccessKey).length;
  }, [matchedFiles]);

  // Access Key modals state
  const [showPasswordPicker, setShowPasswordPicker] = useState(false);
  const [passwordPickerTarget, setPasswordPickerTarget] = useState<{ type: 'file' | 'folder' | 'bulk'; id: string; name: string } | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string; accessKeyId: string; onUnlock: () => void } | null>(null);
  const [pendingPasswordRemoval, setPendingPasswordRemoval] = useState<{ type: 'file' | 'folder'; id: string; name: string; accessKeyId: string } | null>(null);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [keyCreateTarget, setKeyCreateTarget] = useState<{ id: string; name: string; targetType: 'file' | 'folder' | 'bulk' } | null>(null);
  const { confirmState: delConfirm, confirm: confirmDestructive, close: closeDelConfirm } = useConfirmDestructive();

  const sanitizeFilename = (name: string): string => {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_');
  };

  // Authentic Document Picker payload importer
  const executeImportPayload = async () => {
    if (!id) return;
    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false, type: '*/*' });
      if (pickerResult.canceled || !pickerResult.assets) return;
      const asset = pickerResult.assets[0];
      const safeName = sanitizeFilename(asset.name);
      if (Platform.OS === 'web') {
        const tempName = `${SecureCrypto.generateUUID()}_${safeName}`;
        await StorageService.storeWebFile(asset.uri, tempName);
        await importFile(asset.uri, id, safeName, asset.mimeType || 'application/octet-stream', asset.size || 0, false);
      } else {
        await importFile(asset.uri, id, safeName, asset.mimeType || 'application/octet-stream', asset.size || 0, false);
      }
      Alert.alert('Import Success', 'File compiled and secured into system workspace.');
    } catch (e) {
      console.error(e);
      Alert.alert('Processing Failure', 'Could not index selected payload.');
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedFileIds([]);
    setSelectedFolderIds([]);
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds(prev => prev.includes(fileId) ? prev.filter(i => i !== fileId) : [...prev, fileId]);
  };

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolderIds(prev => prev.includes(folderId) ? prev.filter(i => i !== folderId) : [...prev, folderId]);
  };

  const handleCreateNestedFolder = () => {
    if (!id) return;
    if (Platform.OS === 'web') {
      const name = window.prompt('New folder name:');
      if (name !== null) createFolder(name.trim() || 'New Folder', colors.primary, 'folder', false, id);
    } else {
      setShowCreateFolderModal(true);
    }
  };

  const confirmCreateFolder = () => {
    if (!id) return;
    createFolder(newFolderName.trim(), colors.primary, 'folder', false, id);
    setShowCreateFolderModal(false);
    setNewFolderName('');
  };

  const handleBulkSoftDelete = () => {
    const totalSelected = selectedFileIds.length + selectedFolderIds.length;
    if (totalSelected === 0) {
      Alert.alert('Selection Empty', 'Select elements first before executing wipe commands.');
      return;
    }
    confirmDestructive(
      'Move to Trash',
      `Move ${totalSelected} elements into retention trash?`,
      async () => {
        for (const fileId of selectedFileIds) {
          await softDeleteFile(fileId);
        }
        for (const folderId of selectedFolderIds) {
          await deleteFolder(folderId);
        }
        exitSelectionMode();
      },
      'Move to Trash'
    );
  };



  const handleDeleteAll = () => {
    const totalItems = matchedFiles.length + matchedFolders.length;
    if (totalItems === 0) {
      Alert.alert('Folder Empty', 'There are no items to delete.');
      return;
    }
    confirmDestructive(
      'Delete Everything',
      `Move ALL  items into retention trash? This will permanently delete all items.`,
      async () => {
        for (const file of matchedFiles) {
          await softDeleteFile(file.id);
        }
        for (const folder of matchedFolders) {
          await deleteFolder(folder.id);
        }
        exitSelectionMode();
      },
      'Delete All'
    );
  };

  const handleSelectAll = () => {
    const allFileIds = matchedFiles.map(f => f.id);
    const allFolderIds = matchedFolders.map(f => f.id);
    const allSelected = allFileIds.every(id => selectedFileIds.includes(id)) && allFolderIds.every(id => selectedFolderIds.includes(id));
    if (allSelected) {
      exitSelectionMode();
    } else {
      setSelectedFileIds(allFileIds);
      setSelectedFolderIds(allFolderIds);
      setSelectionMode(true);
    }
  };  const handleBulkAssignExistingKey = () => {
    const totalSelected = selectedFileIds.length + selectedFolderIds.length;
    if (totalSelected === 0) {
      Alert.alert('Selection Empty', 'Select elements first before assigning a key.');
      return;
    }
    setPasswordPickerTarget({ type: 'bulk', id: 'bulk', name: 'selected items' });
    setShowPasswordPicker(true);
  };

  const handleBulkCreateAndAssignKey = () => {
    const totalSelected = selectedFileIds.length + selectedFolderIds.length;
    if (totalSelected === 0) {
      Alert.alert('Selection Empty', 'Select elements first before creating a key.');
      return;
    }
    setKeyCreateTarget({ id: 'bulk', name: `${totalSelected} selected items`, targetType: 'bulk' });
    setShowCreateKeyModal(true);
  };

  const handleBulkCopy = () => {
    const totalSelected = selectedFileIds.length + selectedFolderIds.length;
    if (totalSelected === 0) {
      Alert.alert('Selection Empty', 'Select elements first before copying.');
      return;
    }
    copyToClipboard(selectedFolderIds, selectedFileIds, id as string);
    exitSelectionMode();
  };

  const handleBulkCut = () => {
    const totalSelected = selectedFileIds.length + selectedFolderIds.length;
    if (totalSelected === 0) {
      Alert.alert('Selection Empty', 'Select elements first before cutting.');
      return;
    }
    cutToClipboard(selectedFolderIds, selectedFileIds, id as string);
    exitSelectionMode();
  };

  const handleFileItemPress = (file: any) => {
    if (selectionMode) {
      toggleFileSelection(file.id);
      return;
    }
    
    // Check if file has a password protection
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

  const handleOpenKeyModal = (targetId: string, targetName: string, targetType: 'file' | 'folder') => {
    if (accessKeys.length >= 20) {
      Alert.alert('Access Key Limit', 'You can only create up to 20 access keys.');
      return;
    }
    setKeyCreateTarget({ id: targetId, name: targetName, targetType });
    setShowCreateKeyModal(true);
  };

  // Handle file actions
  const handleFileAction = (action: string) => {
    setShowFileMenu(false);
    if (!targetFile) return;

    switch (action) {
      case 'rename':
        openRenameModal({ id: targetFile.id, name: targetFile.name, type: 'file' });
        setOnRename((newName: string) => {
          renameFile(targetFile.id, newName.trim());
          setTargetFile(null);
        });
        break;
      case 'move':
        if (targetFile) {
          setOnMove((destinationFolderId: string | null) => {
            if (destinationFolderId !== null) {
              moveFileToFolder(targetFile.id, destinationFolderId);
            }
          });
          openMoveModal(
            { id: targetFile.id, name: targetFile.name, type: 'file', folderId: id },
            folders.filter(f => f.id !== targetFile.folderId).map(f => ({ id: f.id, name: f.name, parentId: f.parentId })),
            id
          );
        }
        break;
      case 'export':
        exportFileToDevice(targetFile.id).then(path => {
          if (path) Sharing.shareAsync(path);
        });
        break;
       case 'delete':
         confirmDestructive(
           'Move to Trash',
           `Move "${targetFile.name}" into retention trash?`,
           () => softDeleteFile(targetFile.id)
         );
         break;
       case 'shred':
         confirmDestructive(
           'Permanently Shred',
           `Shred "${targetFile.name}" permanently?`,
           () => shredFile(targetFile.id),
           'Shred Permanently'
         );
         break;
      case 'favorite':
        toggleFavorite(targetFile.id);
        break;
       case 'create-password':
        handleOpenKeyModal(targetFile.id, targetFile.name, 'file');
        break;
       case 'assign-password':
         if (accessKeys.length === 0) {
           Alert.alert('No Access Keys', 'Create a access key in Settings first.');
         } else {
           setPasswordPickerTarget({ type: 'file', id: targetFile.id, name: targetFile.name });
           setShowPasswordPicker(true);
         }
         break;
       case 'remove-password':
         // Require password verification before removal
         setPendingPasswordRemoval({
           type: 'file',
           id: targetFile.id,
           name: targetFile.name,
           accessKeyId: targetFile.accessKeyId
         });
         setShowUnlockModal(true);
         break;
          case 'copy':
            copyToClipboard([], [targetFile.id], id!);
            break;
          case 'cut':
            cutToClipboard([], [targetFile.id], id!);
            break;
          case 'duplicate':
            duplicateFile(targetFile.id);
            break;
     }
   };

  const confirmRename = () => {
    if (targetFile) {
      renameFile(targetFile.id, renameText.trim());
      setTargetFile(null);
    } else if (targetFolder) {
      renameFolder(targetFolder.id, renameText.trim());
      setTargetFolder(null);
    }
    setShowRenameModal(false);
  };

  const confirmMove = (targetParentId: string) => {
    if (targetFolder) moveFolder(targetFolder.id, targetParentId);
    else if (targetFile) moveFileToFolder(targetFile.id, targetParentId);
    setShowMoveModal(false);
  };

  const handlePaste = async () => {
    if (!clipboard || !id) return;
    try {
      const result = await pasteFromClipboard(id as string);
      if (result.pastedFiles === 0 && result.pastedFolders === 0) return;
      Alert.alert('Paste Complete', `${result.pastedFolders} folder${result.pastedFolders !== 1 ? 's' : ''}, ${result.pastedFiles} file${result.pastedFiles !== 1 ? 's' : ''} pasted.`);
    } catch {
      Alert.alert('Paste Failed', 'Could not paste items.');
    }
  };

  const handleSubfolderAction = (action: string) => {
    setShowSubfolderMenu(false);
    if (!targetSubfolder) return;
    const subfolder = targetSubfolder;

    switch (action) {
      case 'rename':
        openRenameModal({ id: subfolder.id, name: subfolder.name, type: 'folder' });
        setOnRename((newName: string) => {
          renameFolder(subfolder.id, newName.trim());
          setTargetSubfolder(null);
        });
        break;
      case 'move':
        setTargetFolder(subfolder);
        setOnMove((destinationFolderId: string | null) => {
          if (destinationFolderId !== null) {
            moveFolder(subfolder.id, destinationFolderId);
          }
        });
        openMoveModal(
          { id: subfolder.id, name: subfolder.name, type: 'folder' },
          folders.filter(f => f.id !== subfolder.id).map(f => ({ id: f.id, name: f.name, parentId: f.parentId })),
          subfolder.parentId || id
        );
        break;
      case 'export':
        exportFolderFiles(subfolder.id).then((paths: string[]) => {
          if (paths.length > 0) Alert.alert('Export Complete', `Exported ${paths.length} files`);
          else Alert.alert('Nothing to Export', 'This vault has no files to export.');
        }).catch(() => Alert.alert('Export Failed', 'Something went wrong while exporting.'));
        break;
       case 'copy':
         copyToClipboard([subfolder.id], [], id as string);
         break;
       case 'cut':
         cutToClipboard([subfolder.id], [], id as string);
         break;
       case 'duplicate':
         duplicateFolder(subfolder.id);
         break;
       case 'create-password':
        handleOpenKeyModal(subfolder.id, subfolder.name, 'folder');
        break;
      case 'assign-password':
        if (accessKeys.length === 0) {
          Alert.alert('No Access Keys', 'Create a access key in Settings first.');
        } else {
          setPasswordPickerTarget({ type: 'folder', id: subfolder.id, name: subfolder.name });
          setShowPasswordPicker(true);
        }
        break;
      case 'remove-password':
        if (subfolder.accessKeyId) {
          setPendingPasswordRemoval({
            type: 'folder',
            id: subfolder.id,
            name: subfolder.name,
            accessKeyId: subfolder.accessKeyId
          });
          setShowUnlockModal(true);
        }
        break;
      case 'favorite':
        toggleFolderFavorite(subfolder.id);
        break;
       case 'delete':
         confirmDestructive(
           'Move to Trash',
           `Move "${subfolder.name}" into retention trash?`,
           () => deleteFolder(subfolder.id)
         );
         break;
       case 'shred':
         confirmDestructive(
           'Permanently Shred',
           `Shred "${subfolder.name}" and all its contents permanently?`,
           () => shredFolder(subfolder.id),
           'Shred Permanently'
         );
         break;
    }
  };
  const handleFolderAction = (action: string) => {
    setShowFolderMenu(false);
    if (!folderRecord) return;
    switch (action) {
      case 'rename':
        openRenameModal({ id: folderRecord.id, name: folderRecord.name, type: 'folder' });
        setOnRename((newName: string) => {
          renameFolder(folderRecord.id, newName.trim());
          setTargetFolder(null);
        });
        break;
      case 'move':
        setTargetFolder(folderRecord);
        setOnMove((destinationFolderId: string | null) => {
          if (destinationFolderId !== null) {
            moveFolder(folderRecord.id, destinationFolderId);
          }
        });
        openMoveModal(
          { id: folderRecord.id, name: folderRecord.name, type: 'folder' },
          folders.filter(f => f.id !== folderRecord.id).map(f => ({ id: f.id, name: f.name, parentId: f.parentId })),
          folderRecord.parentId || id
        );
        break;
      case 'export':
        exportFolderFiles(folderRecord.id).then((paths: string[]) => {
          if (paths.length > 0) Alert.alert('Export Complete', `Exported ${paths.length} files`);
          else Alert.alert('Nothing to Export', 'This vault has no files to export.');
        }).catch(() => Alert.alert('Export Failed', 'Something went wrong while exporting.'));
        break;
      case 'copy':
        copyToClipboard([folderRecord.id], [], id as string);
        break;
      case 'cut':
        cutToClipboard([folderRecord.id], [], id as string);
        break;
      case 'duplicate':
        duplicateFolder(folderRecord.id);
        break;
      case 'create-password':
        handleOpenKeyModal(folderRecord.id, folderRecord.name, 'folder');
        break;
      case 'assign-password':
        if (accessKeys.length === 0) {
          Alert.alert('No Access Keys', 'Create a access key in Settings first.');
        } else {
          setPasswordPickerTarget({ type: 'folder', id: folderRecord.id, name: folderRecord.name });
          setShowPasswordPicker(true);
        }
        break;
      case 'remove-password':
        if (folderRecord.accessKeyId) {
          setPendingPasswordRemoval({
            type: 'folder',
            id: folderRecord.id,
            name: folderRecord.name,
            accessKeyId: folderRecord.accessKeyId
          });
          setShowUnlockModal(true);
        }
        break;
      case 'favorite':
        toggleFolderFavorite(folderRecord.id);
        break;
       case 'delete':
         confirmDestructive(
           'Move to Trash',
           `Move "${folderRecord.name}" into retention trash?`,
           () => deleteFolder(folderRecord.id),
           'Move to Trash'
         );
         break;
       case 'shred':
         confirmDestructive(
           'Permanently Shred',
           `Shred "${folderRecord.name}" and all its contents permanently?`,
           () => shredFolder(folderRecord.id),
           'Shred Permanently'
         );
         break;
    }
  };

  const themeMode = useSettingsStore((s: any) => s.themeMode);
  const isDark = themeMode !== 'light';
  const st = useStyles(colors, isDark, { space, font, responsiveSize, isTablet, headerPaddingTop, bottomTabSpacing });
  const surface = colors.dashboardSurface ?? colors.surface;
  const border = colors.dashboardBorder ?? colors.border;
  const text = colors.dashboardText ?? colors.text;
  const primary = colors.dashboardAccent ?? colors.accent;
  const bg = colors.background;
  const fabBg = colors.fabBg ?? colors.primary;
  const fabText = colors.fabText ?? '#FFFFFF';
  const textMuted = colors.textMuted;

  const screenAnimatedStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
    transform: [{ translateY: screenTranslateY.value }],
  }));

  return (
    <SafeAreaView style={st.root}>
      <Animated.View style={screenAnimatedStyle}>
        {/* Immersive Dark Mode Top Header */}
        <View style={st.topHeader}>
          <TouchableOpacity onPress={() => router.back()} style={st.backButton}>
            <Text style={st.headerIconText}>←</Text>
          </TouchableOpacity>
          <View>
            {wrapAtLength(folderName, 60).map((line, index) => (
              <Text key={index} style={st.headerTitle}>{line}</Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(4) }}>
            <ViewModeMenu />
            <TouchableOpacity onPress={() => setShowFolderMenu(true)} style={st.menuButton}>
              <Text style={st.headerIconText}>•••</Text>
            </TouchableOpacity>
          </View>
        </View>

      <ScrollView contentContainerStyle={st.scrollContainer} showsVerticalScrollIndicator={false}>
        
        {/* Metric Summary Panel Deck */}
        <View style={st.metricsDeck}>
          <View style={st.metricItem}>
            <Text style={st.metricValue}>{matchedFiles.length}</Text>
            <Text style={st.metricLabel}>Files</Text>
          </View>
          <View style={st.metricDivider} />
          <View style={st.metricItem}>
            <Text style={st.metricValue}>{totalSizeKB.toFixed(0)}</Text>
            <Text style={st.metricLabel}>KB Size</Text>
          </View>
          <View style={st.metricDivider} />
          <View style={st.metricItem}>
            <Text style={st.metricValue}>{passwordProtectedCount}</Text>
            <Text style={st.metricLabel}>Protected</Text>
          </View>
          <View style={st.metricDivider} />
          <View style={st.metricItem}>
            <Text style={st.metricValue}>{matchedFolders.length}</Text>
            <Text style={st.metricLabel}>Subfolders</Text>
          </View>
        </View>

        <ClipboardBar
          onPaste={handlePaste}
          onUndo={undoLastCut}
          backgroundColor={surface}
          textColor={text}
          accentColor={primary}
          mutedColor={textMuted}
        />

        {/* Action Capsule Row Layout */}
        <View style={st.actionRow}>
          {!selectionMode ? (
            <>
              <TouchableOpacity style={st.addFileButton} onPress={executeImportPayload}>
                <Text style={st.addFileText}>+ Add File</Text>
              </TouchableOpacity>

               <TouchableOpacity style={st.iconActionPill} onPress={handleCreateNestedFolder}>
                 <Folder size={responsiveSize(20, 22, 24)} color={text} strokeWidth={2} />
               </TouchableOpacity>

               {!!clipboard && (
                 <TouchableOpacity style={[st.iconActionPill, { backgroundColor: primary }]} onPress={handlePaste}>
                   <Clipboard size={responsiveSize(16, 18, 20)} color="#FFF" strokeWidth={2} />
                 </TouchableOpacity>
               )}

              <TouchableOpacity 
                style={[st.outlinedSelectButton]} 
                onPress={() => setSelectionMode(true)}
              >
                <Text style={st.selectButtonText}>☑ Select</Text>
              </TouchableOpacity>

            </>
          ) : (
            <>
              <TouchableOpacity onPress={handleSelectAll} style={st.iconActionPill}>
                <CheckSquare size={18} color={text} strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleBulkCopy} style={st.iconActionPill}>
                <Copy size={18} color={text} strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleBulkCut} style={st.iconActionPill}>
                <Scissors size={18} color={text} strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleBulkSoftDelete} style={[st.iconActionPill, { backgroundColor: `${colors.error}18` }]}>
                <Trash2 size={18} color={colors.error} strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleBulkAssignExistingKey} style={st.iconActionPill}>
                <Key size={18} color={primary} strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleBulkCreateAndAssignKey} style={st.iconActionPill}>
                <ShieldCheck size={18} color={primary} strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDeleteAll} style={[st.deleteAllButton, { backgroundColor: colors.error }]}>
                <Text style={[st.deleteAllButtonText, { color: '#FFF' }]}>Delete All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={exitSelectionMode} style={[st.outlinedSelectButton, st.activeSelectButton]}>
                <Text style={[st.selectButtonText, st.activeSelectButtonText]}>✕ Exit</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Subfolders Grid Section */}
        {matchedFolders.length > 0 && (
          <>
            <Text style={st.sectionHeader}>SUBFOLDERS</Text>
            {isGridMode ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
                {matchedFolders.map((folder) => {
                  const isSelected = selectedFolderIds.includes(folder.id);
                  const isCutPending = clipboard?.mode === 'cut' && clipboard.folderIds.includes(folder.id);
                  return (
                    <Pressable
                      key={folder.id}
                      onLongPress={() => { setSelectionMode(true); setSelectedFolderIds([folder.id]); }}
                      onPress={() => {
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
                      }}
                      style={[
                        st.iconGridItem,
                        {
                          width: gridItemWidthValue,
                          borderColor: isSelected ? primary : 'transparent',
                          opacity: isCutPending ? 0.5 : 1,
                          backgroundColor: surface,
                        },
                      ]}
                    >
                      <View style={[st.iconGridThumb, { backgroundColor: `${primary}18` }]}>
                        <Folder size={viewMode === 'small-icons' ? 24 : viewMode === 'medium-icons' ? 28 : 32} color={primary} strokeWidth={1.8} />
                        {(folder.hasAccessKey && folder.accessKeyId) && (
                          <View style={[st.thumbBadge, { backgroundColor: primary }]}>
                            <Lock size={10} color="#FFF" strokeWidth={3} />
                          </View>
                        )}
                      </View>
                      <View>
                        {wrapAtLength(folder.name, 60).map((line, index) => (
                          <Text key={index} style={[st.iconGridName, { color: text }]}>{line}</Text>
                        ))}
                      </View>
                      <View style={st.iconGridIconsRow}>
                        {folder.isFavorite && <Star size={12} color="#FBBF24" />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              matchedFolders.map((folder) => {
                const isSelected = selectedFolderIds.includes(folder.id);
                const isCutPending = clipboard?.mode === 'cut' && clipboard.folderIds.includes(folder.id);
                return (
                  <View 
                    key={folder.id} 
                    style={[st.folderCard, isSelected && st.folderCardSelected, isCutPending && { opacity: 0.5 }]}
                  >
                    <TouchableOpacity 
                      style={st.folderCardLeft}
                      onPress={() => {
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
                      }}
                      activeOpacity={0.7}
                    >
                       <View style={st.folderIconContainer}>
                         <Folder size={24} color={text} strokeWidth={2} />
                       </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                           <View style={{ flex: 1, minWidth: 0 }}>
                             {wrapAtLength(folder.name, 60).map((line, index) => (
                               <Text key={index} style={st.folderTitleText}>{line}</Text>
                             ))}
                           </View>
                           {folder.hasAccessKey && folder.accessKeyId && <Lock size={14} color={primary} strokeWidth={2} style={{ marginLeft: 6 }} />}
                           {folder.isFavorite && <Star size={14} color="#FBBF24" strokeWidth={2} style={{ marginLeft: 4 }} />}
                        </View>
                        <Text style={st.folderMetaText}>Directory Folder</Text>
                      </View>
                    </TouchableOpacity>
                    <View style={st.folderActionsRight}>
                      {selectionMode && (
                        <View style={[st.checkboxIndicator, isSelected && st.checkboxIndicatorActive]} />
                      )}
                      {!selectionMode && (
                        <TouchableOpacity 
                          style={st.cardMenuIcon} 
                          onPressIn={() => {
                            setTargetSubfolder(folder);
                            setShowSubfolderMenu(true);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={st.menuDotsText}>•••</Text>
                        </TouchableOpacity>
                      )}
                      {!selectionMode && <Text style={st.chevronIcon}>›</Text>}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* Files Grid Section */}
        <Text style={st.sectionHeader}>FILES</Text>
        {matchedFiles.length === 0 ? (
          <View style={st.emptyStateContainer}>
            <Folder size={48} color={textMuted} strokeWidth={1.5} />
            <Text style={st.emptyStateTitle}>This directory workspace is empty</Text>
            <Text style={st.emptyStateSubtitle}>Add files or create subfolders to get started</Text>
          </View>
        ) : isGridMode ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
            {matchedFiles.map((file) => {
              const isSelected = selectedFileIds.includes(file.id);
              const isCutPending = clipboard?.mode === 'cut' && clipboard.fileIds.includes(file.id);
              const hasThumbnail = file.mimeType?.startsWith('image/') || file.mimeType?.startsWith('video/');
              const ft = file.mimeType?.startsWith('image/') ? { color: '#34D399', icon: '🖼️' } : file.mimeType?.startsWith('video/') ? { color: '#FF6B6B', icon: '🎬' } : { color: text, icon: <FileText size={24} color={text} strokeWidth={2} /> };
              return (
                <Pressable
                  key={file.id}
                  onLongPress={() => { setSelectionMode(true); setSelectedFileIds([file.id]); }}
                  onPress={() => handleFileItemPress(file)}
                  style={[
                    st.iconGridItem,
                    {
                      width: gridItemWidthValue,
                      backgroundColor: surface,
                      borderColor: isSelected ? primary : 'transparent',
                      borderWidth: 2,
                      opacity: isCutPending ? 0.5 : 1,
                    },
                  ]}
                >
                  <View style={[st.iconGridThumb, { backgroundColor: `${ft?.color ?? primary}18` }]}>
                    {hasThumbnail && file.localPath ? (
                      <RNImage
                        source={{ uri: file.localPath }}
                        style={st.iconGridThumbImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                        {typeof ft?.icon === 'string' ? <Text style={{ fontSize: 22 }}>{ft.icon}</Text> : ft?.icon}
                      </View>
                    )}
                    {file.mimeType?.startsWith('video/') && (
                      <View style={st.videoBadge}>
                        <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '700' }}>▶</Text>
                      </View>
                    )}
                    {(file.hasAccessKey && file.accessKeyId) && (
                      <View style={[st.thumbBadge, { backgroundColor: primary }]}>
                        <Lock size={10} color="#FFF" strokeWidth={3} />
                      </View>
                    )}
                  </View>
                  <View>
                    {wrapAtLength(file.name, 60).map((line, index) => (
                      <Text key={index} style={[st.iconGridName, { color: text }]}>{line}</Text>
                    ))}
                  </View>
                  <View style={st.iconGridIconsRow}>
                    {file.isFavorite && <Star size={12} color="#FBBF24" />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          matchedFiles.map((file) => {
            const isSelected = selectedFileIds.includes(file.id);
            const isCutPending = clipboard?.mode === 'cut' && clipboard.fileIds.includes(file.id);
            return (
              <View 
                key={file.id} 
                style={[st.fileCard, isSelected && st.fileCardSelected, isCutPending && { opacity: 0.5 }]}
              >
  <TouchableOpacity 
                style={st.fileCardLeft}
                onPress={() => handleFileItemPress(file)}
                activeOpacity={0.7}
              >
                 <View style={st.fileIconContainer}>
                   {file.mimeType?.startsWith('image/') ? (
                     <Image size={24} color={text} strokeWidth={2} />
                   ) : (
                     <FileText size={24} color={text} strokeWidth={2} />
                   )}
                 </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                     <View style={{ flex: 1, minWidth: 0 }}>
                       {wrapAtLength(file.name, 60).map((line, index) => (
                         <Text key={index} style={st.fileTitleText}>{line}</Text>
                       ))}
                     </View>
                     {file.hasAccessKey && file.accessKeyId && <Lock size={14} color={primary} strokeWidth={2} style={{ marginLeft: 6 }} />}
                     {file.isFavorite && <Star size={14} color="#FBBF24" strokeWidth={2} style={{ marginLeft: 4 }} />}
                  </View>
                  <Text style={st.fileMetaText}>{(file.size / 1024).toFixed(1)} KB</Text>
                </View>
              </TouchableOpacity>
              <View style={st.fileActionsRight}>
                {selectionMode && (
                  <View style={[st.checkboxIndicator, isSelected && st.checkboxIndicatorActive]} />
                )}
                <TouchableOpacity 
                  style={st.cardMenuIcon} 
                  onPressIn={() => {
                    setTargetFile(file);
                    setShowFileMenu(true);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={st.menuDotsText}>•••</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={st.cardMenuIcon}
                  onPress={() => confirmDestructive(
                    'Move to Trash',
                    `Move "${file.name}" into retention trash?`,
                    () => softDeleteFile(file.id),
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
      </ScrollView>
      </Animated.View>

      <DestructiveConfirmModal state={delConfirm} onClose={closeDelConfirm} />

      <AnimatedTabBar />

      {/* Create Subfolder Modal */}
      <Modal visible={showCreateFolderModal} transparent animationType="fade" onRequestClose={() => setShowCreateFolderModal(false)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}>
           <View style={[{
             width: '85%',
             maxWidth: isTablet ? 480 : 360,
             borderRadius: 24,
             padding: 24,
             alignItems: 'center',
             backgroundColor: colors.surface,
           }]}>
             <Text style={[{
               fontSize: font(20),
               fontWeight: '700',
               marginBottom: space(5),
               letterSpacing: -0.3,
               color: colors.text,
             }]}>Create Subfolder</Text>
             <TextInput
               style={[{
                 width: '100%',
                 borderWidth: 1,
                 borderRadius: space(3),
                 paddingHorizontal: space(4),
                 paddingVertical: space(3),
                 marginBottom: space(5),
                 fontSize: font(15),
                 borderColor: colors.border,
                 color: colors.text,
                 backgroundColor: `${colors.border}40`,
               }]}
              placeholder="Folder name"
              placeholderTextColor={colors.textMuted}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: space(3), width: '100%' }}>
              <TouchableOpacity onPress={() => { setShowCreateFolderModal(false); setNewFolderName(''); }} style={[st.modalCancelBtn, { borderColor: colors.border, borderWidth: 1 }]}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmCreateFolder} style={[st.modalConfirmBtn, { backgroundColor: colors.fabBg }]}>
                <Text style={{ color: colors.fabText, fontWeight: '700' }}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showFileMenu} transparent animationType="fade" onRequestClose={() => setShowFileMenu(false)}>
        <TouchableOpacity style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setShowFileMenu(false)} activeOpacity={1}>
          <View style={[st.fileMenuContent, { paddingBottom: space(9), maxWidth: isTablet ? 520 : '100%' }]}>
            <View style={st.fileMenuHandle} />
            <Text style={[st.fileMenuTitle, { color: text }]}>{targetFile?.name || 'File Actions'}</Text>
            {(() => {
              const hasPassword = targetFile?.hasAccessKey && targetFile?.accessKeyId;
              const baseItems = [
                { action: 'rename', label: 'Rename', color: text },
                { action: 'move', label: 'Move to...', color: text },
                { action: 'export', label: 'Export / Save to Device', color: text },
                { action: 'favorite', label: targetFile?.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: '#FBBF24' },
                { action: 'delete', label: 'Move to Trash', color: colors.error },
                { action: 'shred', label: 'Shred Permanently', color: colors.error },
              ];
              baseItems.splice(3, 0, { action: 'copy', label: 'Copy', color: primary });
              baseItems.splice(4, 0, { action: 'cut', label: 'Cut', color: primary });
              baseItems.splice(5, 0, { action: 'duplicate', label: 'Duplicate', color: text });
              if (hasPassword) {
                baseItems.splice(5, 0, { action: 'remove-password', label: 'Remove Assigned Access Key', color: colors.error });
              } else {
                baseItems.splice(5, 0,
                  { action: 'create-password', label: 'Assign and Create Access Key', color: primary },
                  { action: 'assign-password', label: 'Assign Existing Access Key', color: primary }
                );
              }
              return baseItems;
            })().map((item) => (
              <TouchableOpacity
                key={item.action}
                style={st.fileMenuItem}
                onPress={() => handleFileAction(item.action)}
              >
                <Text style={[st.fileMenuItemText, { color: item.color }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Folder Menu Modal */}
      {showFolderMenu && folderRecord && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowFolderMenu(false)}>
          <TouchableOpacity style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setShowFolderMenu(false)} activeOpacity={1}>
             <View style={[st.fileMenuContent, { paddingBottom: space(9), maxWidth: isTablet ? 520 : '100%' }]}>
               <View style={st.fileMenuHandle} />
               <Text style={[st.fileMenuTitle, { color: text }]}>{folderRecord.name}</Text>
              {(() => {
                const hasPassword = folderRecord.hasAccessKey && folderRecord.accessKeyId;
                const hasClipboard = !!clipboard;
                 const baseItems = [
                  { action: 'rename', label: 'Rename', color: text },
                  { action: 'move', label: 'Move', color: text },
                  { action: 'export', label: 'Export', color: text },
                  { action: 'favorite', label: folderRecord.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: '#FBBF24' },
                  { action: 'delete', label: 'Move to Trash', color: colors.error },
                  { action: 'shred', label: 'Shred Permanently', color: colors.error },
                ];
                if (hasClipboard) {
                  baseItems.splice(3, 0, { action: 'paste', label: 'Paste Here', color: primary });
                }
                baseItems.splice(3, 0, { action: 'duplicate', label: 'Duplicate', color: text });
                if (hasPassword) {
                  baseItems.splice(4, 0, { action: 'remove-password', label: 'Remove Assigned Access Key', color: colors.error });
                } else {
                  baseItems.splice(4, 0,
                    { action: 'register-key', label: 'Assign and Create Access Key', color: primary },
                    { action: 'assign-key', label: 'Assign Existing Access Key', color: primary }
                  );
                }
                return baseItems;
              })().map(item => (
                <TouchableOpacity key={item.action} style={st.fileMenuItem} onPress={() => handleFolderAction(item.action)}>
                  <Text style={[st.fileMenuItemText, { color: item.color }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Subfolder Menu Modal */}
      {showSubfolderMenu && targetSubfolder && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowSubfolderMenu(false)}>
          <TouchableOpacity style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setShowSubfolderMenu(false)} activeOpacity={1}>
             <View style={[st.fileMenuContent, { paddingBottom: space(9), maxWidth: isTablet ? 520 : '100%' }]}>
               <View style={st.fileMenuHandle} />
               <Text style={[st.fileMenuTitle, { color: text }]}>{targetSubfolder.name}</Text>
              {(() => {
                const hasPassword = targetSubfolder.hasAccessKey && targetSubfolder.accessKeyId;
                const baseItems = [
                  { action: 'rename', label: 'Rename', color: text },
                  { action: 'move', label: 'Move', color: text },
                  { action: 'export', label: 'Export', color: text },
                  { action: 'favorite', label: targetSubfolder.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: '#FBBF24' },
                  { action: 'delete', label: 'Move to Trash', color: colors.error },
                  { action: 'shred', label: 'Shred Permanently', color: colors.error },
                ];
                baseItems.splice(3, 0, { action: 'copy', label: 'Copy', color: primary });
                baseItems.splice(4, 0, { action: 'cut', label: 'Cut', color: primary });
                baseItems.splice(5, 0, { action: 'duplicate', label: 'Duplicate', color: text });
                if (hasPassword) {
                  baseItems.splice(5, 0, { action: 'remove-password', label: 'Remove Assigned Access Key', color: colors.error });
                } else {
                  baseItems.splice(5, 0,
                    { action: 'create-password', label: 'Assign and Create Access Key', color: primary },
                    { action: 'assign-password', label: 'Assign Existing Access Key', color: primary }
                  );
                }
                return baseItems;
              })().map(item => (
                <TouchableOpacity key={item.action} style={st.fileMenuItem} onPress={() => handleSubfolderAction(item.action)}>
                  <Text style={[st.fileMenuItemText, { color: item.color }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}


      {/* Access Key Picker Modal (Assign Existing Password) */}
      <AccessKeyPicker
        visible={showPasswordPicker}
        onClose={() => { setShowPasswordPicker(false); setPasswordPickerTarget(null); }}
        onSelectPassword={async (passwordId) => {
          if (passwordPickerTarget) {
            if (passwordPickerTarget.type === 'bulk') {
              for (const fileId of selectedFileIds) {
                await assignFileAccessKey(fileId, passwordId);
              }
              for (const folderId of selectedFolderIds) {
                await assignFolderAccessKey(folderId, passwordId);
              }
              Alert.alert('Password Assigned', `Access key has been assigned to ${selectedFileIds.length + selectedFolderIds.length} items.`);
            } else if (passwordPickerTarget.type === 'file') {
              await assignFileAccessKey(passwordPickerTarget.id, passwordId);
              Alert.alert('Password Assigned', `Access key has been assigned to ${passwordPickerTarget.name}.`);
            } else {
              await assignFolderAccessKey(passwordPickerTarget.id, passwordId);
              Alert.alert('Password Assigned', `Access key has been assigned to ${passwordPickerTarget.name}.`);
            }
          }
          setShowPasswordPicker(false);
        setPasswordPickerTarget(null);
      }}
    />
    <AccessKeyRegistrationModal
      visible={showCreateKeyModal}
      target={keyCreateTarget ? { id: keyCreateTarget.id, name: keyCreateTarget.name, type: keyCreateTarget.targetType } : null}
      selectedItemIds={keyCreateTarget?.targetType === 'bulk' ? [...selectedFileIds, ...selectedFolderIds] : [keyCreateTarget?.id ?? '']}
      itemTypes={{ ...Object.fromEntries(selectedFileIds.map(id => [id, 'file'])), ...Object.fromEntries(selectedFolderIds.map(id => [id, 'folder'])) }}
      onClose={() => { setShowCreateKeyModal(false); setKeyCreateTarget(null); }}
      onSuccess={() => { setShowCreateKeyModal(false); setKeyCreateTarget(null); }}
      assignFolderAccessKey={assignFolderAccessKey}
      assignFileAccessKey={assignFileAccessKey}
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
              // Complete the password removal
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
    </SafeAreaView>
  );
}

type UseTheme = ReturnType<typeof useTheme>;

const useStyles = (colors: UseTheme['colors'], isDark: boolean, theme: { space: UseTheme['space']; font: UseTheme['font']; responsiveSize: UseTheme['responsiveSize']; isTablet: boolean; headerPaddingTop: number; bottomTabSpacing: number }) => {
  const bg = colors.background;
  const surface = colors.dashboardSurface ?? colors.surface;
  const iconBg = colors.vaultIconBg || colors.surface;
  const text = colors.dashboardText ?? colors.text;
  const muted = colors.vaultTextMuted || colors.textMuted;
  const sectionText = colors.vaultSectionText || colors.textSecondary;
  const primary = colors.dashboardAccent ?? colors.accent;
  const error = colors.error;
  const border = colors.dashboardBorder ?? colors.border;
  const overlay = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.35)';
  const s = theme.space;
  const f = theme.font;
  const rs = theme.responsiveSize;
  const tab = theme.isTablet;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: bg },
    topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, paddingTop: theme.headerPaddingTop },
    backButton: { padding: 6 },
    menuButton: { padding: 6 },
    themeToggle: { padding: 6 },
    headerIconText: { color: text, fontSize: 22, fontWeight: '600' },
    headerTitle: { color: text, fontSize: 22, fontWeight: '700', textAlign: 'center', flex: 1, paddingHorizontal: 12 },
    scrollContainer: { paddingHorizontal: 16, paddingBottom: theme.bottomTabSpacing + s(6) },
    metricsDeck: { flexDirection: 'row', backgroundColor: surface, borderRadius: tab ? 24 : 20, paddingVertical: s(5), paddingHorizontal: s(3), alignItems: 'center', justifyContent: 'space-around', marginTop: s(2), marginBottom: s(6) },
    metricItem: { alignItems: 'center', flex: 1 },
    metricValue: { color: text, fontSize: f(18), fontWeight: '800' },
    metricLabel: { color: muted, fontSize: f(11), fontWeight: '500', marginTop: s(1) },
    metricDivider: { width: 1, height: s(8), backgroundColor: border, opacity: 0.6 },
    actionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: s(7), justifyContent: 'center', flexWrap: 'wrap', gap: s(3) },
    addFileButton: { backgroundColor: colors.vaultAddFileBg || primary, borderRadius: 100, paddingVertical: s(3), paddingHorizontal: s(6), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    addFileText: { color: '#FFF', fontWeight: '700', fontSize: f(15) },
    iconActionPill: { backgroundColor: iconBg, width: rs(44, 52, 56), height: rs(44, 52, 56), borderRadius: rs(22, 26, 28), alignItems: 'center', justifyContent: 'center' },
    pillIconText: { fontSize: 18 },
    outlinedSelectButton: { borderWidth: 1, borderColor: border, borderRadius: 100, paddingVertical: s(4), paddingHorizontal: s(5), justifyContent: 'center', alignItems: 'center' },
    activeSelectButton: { backgroundColor: colors.vaultSelectBg || surface, borderColor: colors.vaultSelectBorder || primary },
    selectButtonText: { color: primary, fontWeight: '600', fontSize: f(14) },
    activeSelectButtonText: { color: primary },
    purgeButton: { backgroundColor: colors.vaultPurgeBg || `${error}18`, borderRadius: 100, paddingVertical: s(3), paddingHorizontal: s(4), justifyContent: 'center', alignItems: 'center' },
    purgeButtonText: { color: colors.vaultPurgeText || error, fontWeight: '700', fontSize: f(14) },
    deleteAllButton: { backgroundColor: colors.error, borderRadius: 100, paddingVertical: s(4), paddingHorizontal: s(6), justifyContent: 'center', alignItems: 'center', minHeight: rs(44, 52, 56) },
    deleteAllButtonText: { color: '#FFF', fontWeight: '800', fontSize: f(14), letterSpacing: 0.5 },
    sectionHeader: { color: sectionText, fontSize: f(12), fontWeight: '700', letterSpacing: 1.2, marginBottom: s(3), marginTop: s(2), paddingLeft: s(1) },
    folderCard: { backgroundColor: surface, borderRadius: tab ? 22 : 18, padding: s(4), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: s(3) },
    folderCardSelected: { borderColor: primary, borderWidth: 1 },
    folderCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    folderIconContainer: { width: rs(40, 48, 52), height: rs(40, 48, 52), backgroundColor: iconBg, borderRadius: s(3), alignItems: 'center', justifyContent: 'center', marginRight: s(4) },
    cardIconText: { fontSize: f(20) },
    folderTitleText: { color: text, fontSize: f(16), fontWeight: '600', paddingRight: s(2), flexShrink: 1 },
    folderMetaText: { color: muted, fontSize: f(12), marginTop: 2 },
    folderActionsRight: { flexDirection: 'row', alignItems: 'center', gap: s(2) },
    chevronIcon: { color: muted, fontSize: f(22), fontWeight: '600' },
    fileCard: { backgroundColor: surface, borderRadius: tab ? 22 : 18, padding: s(4), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: s(3) },
    fileCardSelected: { borderColor: primary, borderWidth: 1 },
    fileCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    fileIconContainer: { width: rs(40, 48, 52), height: rs(40, 48, 52), backgroundColor: iconBg, borderRadius: s(3), alignItems: 'center', justifyContent: 'center', marginRight: s(4) },
    fileTitleText: { color: text, fontSize: f(15), fontWeight: '600', paddingRight: s(2), flexShrink: 1 },
    fileMetaText: { color: muted, fontSize: f(12), marginTop: 2 },
    fileActionsRight: { flexDirection: 'row', alignItems: 'center', gap: s(2) },
    checkboxIndicator: { width: s(4), height: s(4), borderRadius: s(2), borderWidth: 1.5, borderColor: muted, marginRight: s(3) },
    checkboxIndicatorActive: { backgroundColor: primary, borderColor: primary },
    cardMenuIcon: { padding: s(1) },
    menuDotsText: { color: muted, fontSize: f(14), fontWeight: '700' },
    emptyStateContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: s(8), paddingHorizontal: s(6), gap: s(2) },
    emptyStateTitle: { color: muted, fontSize: f(16), fontWeight: '600', textAlign: 'center' },
    emptyStateSubtitle: { color: muted, fontSize: f(13), fontWeight: '400', textAlign: 'center', opacity: 0.8 },
    bottomTabBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 92, backgroundColor: surface, borderTopWidth: 1, borderTopColor: border, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 24, paddingHorizontal: s(2) },
    tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
    tabIconActive: { fontSize: f(22), color: text },
    tabLabelActive: { color: text, fontSize: f(11), fontWeight: '600', marginTop: s(1) },
    tabIconMuted: { fontSize: f(22), color: muted, opacity: 0.6 },
    tabLabelMuted: { color: muted, fontSize: f(11), fontWeight: '500', marginTop: s(1) },
    orbWrapper: { width: rs(72, 84, 96), alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    floatingSearchOrb: { width: s(14), height: s(14), borderRadius: s(7), backgroundColor: '#5162FF', alignItems: 'center', justifyContent: 'center', shadowColor: '#5162FF', shadowOffset: { width: 0, height: s(1) }, shadowOpacity: 0.4, shadowRadius: s(2), elevation: 6, transform: [{ translateY: rs(-8, -12, -14) }] },
    orbIconText: { fontSize: f(22), color: '#FFFFFF' },
    modalOverlay: { flex: 1, backgroundColor: overlay, justifyContent: 'center', paddingHorizontal: s(6) },
    modalContent: { backgroundColor: surface, borderRadius: s(5), padding: s(6), borderWidth: 1, borderColor: border },
    modalTitle: { color: text, fontSize: f(18), fontWeight: '700', marginBottom: s(4) },
    modalInput: { backgroundColor: iconBg, borderRadius: s(2), padding: s(3), color: text, fontSize: f(15), marginBottom: s(5), borderWidth: 1, borderColor: border },
    modalButtons: { flexDirection: 'row', justifyContent: 'flex-end' },
    modalCancelBtn: { paddingVertical: s(2), paddingHorizontal: s(4), marginRight: s(3) },
    modalCancelText: { color: muted, fontSize: f(15), fontWeight: '600' },
    modalConfirmBtn: { backgroundColor: primary, borderRadius: s(2), paddingVertical: s(2), paddingHorizontal: s(5) },
    modalConfirmText: { color: '#FFF', fontSize: f(15), fontWeight: '700' },
    fileMenuContent: { backgroundColor: surface, borderRadius: s(5), padding: s(6), borderWidth: 1, borderColor: border, alignSelf: 'center', width: '100%' },
    fileMenuHandle: { width: s(10), height: s(1), borderRadius: 1, backgroundColor: border, alignSelf: 'center', marginBottom: s(4) },
    fileMenuTitle: { color: text, fontSize: f(18), fontWeight: '700', marginBottom: s(4) },
    fileMenuItem: { paddingVertical: s(3), borderBottomWidth: 1, borderBottomColor: border },
    fileMenuItemText: { fontSize: f(15), fontWeight: '500' },
    pmsOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: overlay },
    pmsCard: { width: '90%', maxWidth: tab ? 480 : 360, maxHeight: '80%', borderRadius: s(6), padding: s(5), alignItems: 'center' },
    pmsContent: { width: '100%', alignItems: 'stretch' },
    pmsTitle: { fontSize: f(28), fontWeight: '800', letterSpacing: -0.5, marginBottom: s(3) },
    pmsTargetRow: { flexDirection: 'row', alignItems: 'center', marginBottom: s(7), gap: s(2) },
    pmsTargetChip: { flexDirection: 'row', alignItems: 'center', borderRadius: s(3), paddingHorizontal: s(3), paddingVertical: s(2), gap: s(2) },
    pmsTargetChipText: { fontSize: f(13), fontWeight: '600' },
    pmsLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: s(2) },
    pmsLabel: { fontSize: f(11), fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    pmsOptionalBadge: { borderRadius: s(2), paddingHorizontal: s(2), paddingVertical: 2, marginLeft: s(2) },
    pmsOptionalBadgeText: { fontSize: f(10), fontWeight: '700', textTransform: 'uppercase' },
    pmsInput: { width: '100%', borderRadius: s(3), paddingHorizontal: s(4), paddingVertical: s(3), fontSize: f(15), minHeight: rs(48, 52, 56) },
    pmsEyeButton: { position: 'absolute', right: s(3), top: '50%', marginTop: rs(-10, -12, -14), padding: s(1) },
    pmsSectionDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: s(7) },
    pmsDividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
    pmsSectionLabel: { fontSize: f(11), fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: s(4) },
    pmsStrengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: s(2), gap: s(2) },
    pmsStrengthBar: { height: s(1), borderRadius: 1, flex: 1, overflow: 'hidden' },
    pmsStrengthFill: { height: '100%', borderRadius: 1 },
    pmsStrengthText: { fontSize: f(11), fontWeight: '600' },
    pmsValidationBox: { marginTop: s(2), padding: s(3), borderRadius: s(3) },
    pmsValidationTitle: { fontSize: f(11), fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: s(2) },
    pmsValidationItem: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    pmsValidationIcon: { fontSize: f(12), marginRight: s(2), fontWeight: '700', width: s(4), textAlign: 'center' },
    pmsValidationText: { fontSize: f(12), fontWeight: '500' },
    pmsActions: { flexDirection: 'row', gap: s(3), marginTop: s(8) },
    pmsCancelBtn: { flex: 1, paddingVertical: s(3), borderRadius: s(3), alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s(2) },
    pmsCancelText: { fontSize: f(15), fontWeight: '700' },
    pmsPrimaryBtn: { flex: 1.2, paddingVertical: s(3), borderRadius: s(3), alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s(2) },
    pmsPrimaryText: { fontSize: f(15), fontWeight: '700' },
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    iconGridItem: { borderRadius: tab ? 20 : 18, padding: s(2), alignItems: 'center', marginBottom: s(3) },
    iconGridThumb: { width: '100%', aspectRatio: 1, borderRadius: s(3), alignItems: 'center', justifyContent: 'center', marginBottom: s(2), overflow: 'hidden' },
    iconGridThumbImage: { width: '100%', height: '100%', borderRadius: s(3) },
    thumbBadge: { position: 'absolute', bottom: s(1), right: s(1), width: rs(14, 16, 18), height: rs(14, 16, 18), borderRadius: rs(7, 8, 9), alignItems: 'center', justifyContent: 'center' },
    videoBadge: { position: 'absolute', top: s(1), right: s(1), backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: s(1), paddingHorizontal: s(1), paddingVertical: 2 },
    gridMenuIcon: { position: 'absolute', top: s(1), left: s(1), width: rs(20, 24, 28), height: rs(20, 24, 28), borderRadius: rs(10, 12, 14), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.35)', zIndex: 10 },
    gridMenuDots: { color: '#FFFFFF', fontSize: f(12), fontWeight: '700', lineHeight: 14 },
    iconGridName: { fontSize: f(12), fontWeight: '600', textAlign: 'center', marginBottom: 2 },
    iconGridIconsRow: { flexDirection: 'row', alignItems: 'center', gap: s(1) },
  });
};
