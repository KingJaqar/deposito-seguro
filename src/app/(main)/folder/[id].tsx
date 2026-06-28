// src/app/(main)/folder/[id].tsx
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Clipboard, Copy, Eye, EyeOff, FileText, Folder, Image, Lock, Music, Play, Scissors, ShieldCheck, Smartphone, Star, Trash2, Undo2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Dimensions, Image as RNImage, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { ClipboardBar } from '../../../components/ClipboardBar';
import { DestructiveConfirmModal, useConfirmDestructive } from '../../../components/DestructiveConfirmModal';
import { ViewModeMenu } from '../../../components/ViewModeMenu';
import { AccessKeyPicker } from '../../../components/AccessKeyPicker';
import { AccessKeyUnlockModal } from '../../../components/AccessKeyUnlockModal';
import { useTheme } from '../../../contexts/ThemeContext';
import { useFileSystemQuery } from '../../../hooks/useFileSystemQuery';
import { SecureCrypto } from '../../../security/crypto';
import { StorageService } from '../../../services/storage';
import { useSettingsStore } from '../../../store/settingsStore';
import { useVaultStore } from '../../../store/vaultStore';
import { getPasswordStrength, getPasswordValidationMessages, validatePassword } from '../../../utils/accessKeyValidation';

export default function FolderDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors } = useTheme();
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
  
  // Access Key modals state
  const [showPasswordPicker, setShowPasswordPicker] = useState(false);
  const [passwordPickerTarget, setPasswordPickerTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string; accessKeyId: string; onUnlock: () => void } | null>(null);
  const [pendingPasswordRemoval, setPendingPasswordRemoval] = useState<{ type: 'file' | 'folder'; id: string; name: string; accessKeyId: string } | null>(null);
  const [showCreatePasswordModal, setShowCreatePasswordModal] = useState(false);
  const { confirmState: delConfirm, confirm: confirmDestructive, close: closeDelConfirm } = useConfirmDestructive();
  const [createPasswordTarget, setCreatePasswordTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);
  const [newPasswordLabel, setNewPasswordLabel] = useState('');
  const [newPasswordDescription, setNewPasswordDescription] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewConfirmPassword, setShowNewConfirmPassword] = useState(false);

  const folderRecord = folders.find(f => f.id === id);
  const folderName = folderRecord ? folderRecord.name : 'Vault Root';

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
    return (SCREEN_WIDTH - 32 - gap * (cols - 1)) / cols;
  };
  const isGridMode = viewMode !== 'list';
  const gridColumns = getGridColumns(viewMode);
  const gridItemWidth = getGridItemWidth(viewMode);

  // Calculate real-time metric counters
  const totalSizeKB = useMemo(() => {
    return matchedFiles.reduce((acc, f) => acc + (f.size || 0), 0) / 1024;
  }, [matchedFiles]);

  const passwordProtectedCount = useMemo(() => {
    return matchedFiles.filter(f => f.hasAccessKey).length;
  }, [matchedFiles]);

  const newPasswordStrength = getPasswordStrength(newPassword);
  const newStrengthColor = newPasswordStrength === 'weak' ? colors.error : newPasswordStrength === 'medium' ? '#FBBF24' : '#34C759';
  const newStrengthLabel = newPasswordStrength === 'weak' ? 'Weak' : newPasswordStrength === 'medium' ? 'Medium' : 'Strong';
  const newStrengthWidth = newPasswordStrength === 'weak' ? '33%' : newPasswordStrength === 'medium' ? '66%' : '100%';

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
        const tempName = `${SecureCrypto.generateSalt()}_${safeName}`;
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

  // Handle creating and assigning a new access key
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
    
    // Assign the newly created password to the target
    if (createPasswordTarget.type === 'file') {
      await assignFileAccessKey(createPasswordTarget.id, fp.id);
    } else {
      await assignFolderAccessKey(createPasswordTarget.id, fp.id);
    }
    
    // Reset state
    setNewPasswordLabel('');
    setNewPasswordDescription('');
    setNewPassword('');
    setNewConfirmPassword('');
    setCreatePasswordTarget(null);
    setShowCreatePasswordModal(false);
    
    Alert.alert('Access Key Created & Assigned', `${fp.label} has been created and assigned to ${createPasswordTarget.name}.`);
  };

  // Handle file actions
  const handleFileAction = (action: string) => {
    setShowFileMenu(false);
    if (!targetFile) return;

    switch (action) {
      case 'rename':
        setRenameText(targetFile.name);
        setShowRenameModal(true);
        break;
      case 'move':
        setShowMoveModal(true);
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
        handleCreateAndAssignPassword(targetFile.id, targetFile.name, 'file');
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
        setTargetFolder(subfolder);
        setRenameText(subfolder.name);
        setShowRenameModal(true);
        break;
      case 'move':
        setTargetFolder(subfolder);
        setShowMoveModal(true);
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
        handleCreateAndAssignPassword(subfolder.id, subfolder.name, 'folder');
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
        setTargetFolder(folderRecord); setRenameText(folderRecord.name); setShowRenameModal(true); break;
      case 'move':
        setTargetFolder(folderRecord); setShowMoveModal(true); break;
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
        handleCreateAndAssignPassword(folderRecord.id, folderRecord.name, 'folder'); break;
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
  const st = useStyles(colors, isDark);
  const surface = colors.dashboardSurface ?? colors.surface;
  const border = colors.dashboardBorder ?? colors.border;
  const text = colors.dashboardText ?? colors.text;
  const primary = colors.dashboardAccent ?? colors.accent;
  const bg = colors.background;
  const fabBg = colors.fabBg ?? colors.primary;
  const fabText = colors.fabText ?? '#FFFFFF';
  const textMuted = colors.textMuted;

  return (
    <View style={st.root}>
              {/* Immersive Dark Mode Top Header */}
        <View style={st.topHeader}>
          <TouchableOpacity onPress={() => router.back()} style={st.backButton}>
            <Text style={st.headerIconText}>←</Text>
          </TouchableOpacity>
          <Text style={st.headerTitle} numberOfLines={1}>{folderName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
                <Folder size={20} color={text} strokeWidth={2} />
              </TouchableOpacity>

              {!!clipboard && (
                <TouchableOpacity style={[st.iconActionPill, { backgroundColor: primary }]} onPress={handlePaste}>
                  <Clipboard size={18} color="#FFF" strokeWidth={2} />
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={[st.outlinedSelectButton]} 
                onPress={() => setSelectionMode(true)}
              >
                <Text style={st.selectButtonText}>☑ Select</Text>
              </TouchableOpacity>

              <TouchableOpacity style={st.purgeButton} onPress={handleBulkSoftDelete}>
                <Text style={st.purgeButtonText}>Purge</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={handleBulkCopy} style={st.iconActionPill}>
                <Copy size={18} color={text} strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleBulkCut} style={st.iconActionPill}>
                <Scissors size={18} color={text} strokeWidth={2.5} />
              </TouchableOpacity>
                <TouchableOpacity onPress={exitSelectionMode} style={[st.outlinedSelectButton, st.activeSelectButton]}>
                  <Text style={[st.selectButtonText, st.activeSelectButtonText]}>✓ Selected</Text>
                </TouchableOpacity>
              </>
          )}
        </View>

        {/* Subfolders Grid Section */}
        {matchedFolders.length > 0 && (
          <>
            <Text style={st.sectionHeader}>SUBFOLDERS</Text>
            {isGridMode ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
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
                          width: gridItemWidth,
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
                      <Text style={[st.iconGridName, { color: text }]} numberOfLines={1}>{folder.name}</Text>
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
                           <Text style={st.folderTitleText} numberOfLines={1}>{folder.name}</Text>
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
          <Text style={st.emptyText}>This directory workspace is empty</Text>
        ) : isGridMode ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
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
                      width: gridItemWidth,
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
                  <Text style={[st.iconGridName, { color: text }]} numberOfLines={1}>{file.name}</Text>
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
                     <Text style={st.fileTitleText} numberOfLines={1}>{file.name}</Text>
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

      <DestructiveConfirmModal state={delConfirm} onClose={closeDelConfirm} />

      <AnimatedTabBar />

      {/* Create Subfolder Modal */}
      <Modal visible={showCreateFolderModal} transparent animationType="fade" onRequestClose={() => setShowCreateFolderModal(false)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <View style={[{
            width: '85%',
            maxWidth: 360,
            borderRadius: 24,
            padding: 24,
            alignItems: 'center',
            backgroundColor: colors.surface,
          }]}>
            <Text style={[{
              fontSize: 20,
              fontWeight: '700',
              marginBottom: 20,
              letterSpacing: -0.3,
              color: colors.text,
            }]}>Create Subfolder</Text>
            <TextInput
              style={[{
                width: '100%',
                borderWidth: 1,
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 14,
                marginBottom: 20,
                fontSize: 15,
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
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
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

      {/* File Actions Modal */}
      <Modal visible={showFileMenu} transparent animationType="fade" onRequestClose={() => setShowFileMenu(false)}>
        <TouchableOpacity style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setShowFileMenu(false)} activeOpacity={1}>
          <View style={[{ backgroundColor: surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: 36 }]}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: border, alignSelf: 'center', marginBottom: 16 }} />
            <Text style={[{ color: text, fontSize: 16, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 12, marginBottom: 4 }]}>{targetFile?.name || 'File Actions'}</Text>
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
                style={[{ paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }]}
                onPress={() => handleFileAction(item.action)}
              >
                <Text style={[{ fontSize: 15, fontWeight: '500', color: item.color }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Folder Menu Modal */}
      {showFolderMenu && folderRecord && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowFolderMenu(false)}>
          <TouchableOpacity style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setShowFolderMenu(false)} activeOpacity={1}>
            <View style={[{ backgroundColor: surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: 36 }]}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: border, alignSelf: 'center', marginBottom: 16 }} />
              <Text style={[{ color: text, fontSize: 16, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 12, marginBottom: 4 }]}>{folderRecord.name}</Text>
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
                if (hasPassword) {
                  baseItems.splice(3, 0, { action: 'remove-password', label: 'Remove Assigned Access Key', color: colors.error });
                } else {
                  baseItems.splice(3, 0,
                    { action: 'create-password', label: 'Assign and Create Access Key', color: primary },
                    { action: 'assign-password', label: 'Assign Existing Access Key', color: primary }
                  );
                }
                return baseItems;
              })().map(item => (
                <TouchableOpacity key={item.action} style={[{ paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }]} onPress={() => handleFolderAction(item.action)}>
                  <Text style={[{ fontSize: 15, fontWeight: '500', color: item.color }]}>{item.label}</Text>
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
            <View style={[{ backgroundColor: surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: 36 }]}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: border, alignSelf: 'center', marginBottom: 16 }} />
              <Text style={[{ color: text, fontSize: 16, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 12, marginBottom: 4 }]}>{targetSubfolder.name}</Text>
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
                <TouchableOpacity key={item.action} style={[{ paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }]} onPress={() => handleSubfolderAction(item.action)}>
                  <Text style={[{ fontSize: 15, fontWeight: '500', color: item.color }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Move Modal */}
      {showMoveModal && (
        <Modal transparent animationType="fade">
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <View style={[{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: 36 }]}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 }} />
              <Text style={[{ color: colors.text, fontSize: 16, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 12, marginBottom: 4 }]}>
                {targetFolder ? 'Move Folder' : 'Move File'}
              </Text>
              {folders.filter(f => f.id !== (targetFolder?.id || targetFile?.folderId)).map(f => (
                <TouchableOpacity
                  key={f.id}
                  style={[{ paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                  onPress={() => {
                    if (targetFolder) moveFolder(targetFolder.id, f.id);
                    else if (targetFile) moveFileToFolder(targetFile.id, f.id);
                    setShowMoveModal(false);
                  }}
                >
                   <Text style={[{ fontSize: 15, fontWeight: '500', color: colors.text }]}>{f.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>
      )}

      {/* Access Key Registration Modal */}
      <Modal visible={showCreatePasswordModal} transparent animationType="fade" onRequestClose={() => { setShowCreatePasswordModal(false); setCreatePasswordTarget(null); setNewPasswordLabel(''); setNewPasswordDescription(''); setNewPassword(''); setNewConfirmPassword(''); setShowNewPassword(false); setShowNewConfirmPassword(false); }}>
        <View style={st.pmsOverlay}>
          <View style={[st.pmsCard, { backgroundColor: surface }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.pmsContent}>
              <Text style={[st.pmsTitle, { color: text }]}>Access Key Registration</Text>
              
              <View style={[st.pmsTargetRow, { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' }]}>
                <FileText size={16} color={textMuted} strokeWidth={2} />
                <Text style={[st.pmsTargetChipText, { color: textMuted }]}>for {createPasswordTarget?.name}</Text>
              </View>

              <View style={{ marginBottom: 20 }}>
                <Text style={[st.pmsLabel, { color: text, marginBottom: 8 }]}>Password Label</Text>
                <TextInput
                  style={[st.pmsInput, { backgroundColor: 'rgba(255,255,255,0.05)', color: text }]}
                  placeholder="e.g. Personal Vault Password"
                  placeholderTextColor={textMuted}
                  value={newPasswordLabel}
                  onChangeText={setNewPasswordLabel}
                />
              </View>

              <View style={{ marginBottom: 24 }}>
                <View style={st.pmsLabelRow}>
                  <Text style={[st.pmsLabel, { color: text, marginBottom: 0 }]}>Description</Text>
                  <View style={[st.pmsOptionalBadge, { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1 }]}>
                    <Text style={[st.pmsOptionalBadgeText, { color: textMuted }]}>optional</Text>
                  </View>
                </View>
                <TextInput
                  style={[st.pmsInput, { backgroundColor: 'rgba(255,255,255,0.05)', color: text, minHeight: 100, textAlignVertical: 'top' }]}
                  placeholder="What is this password used for?"
                  placeholderTextColor={textMuted}
                  value={newPasswordDescription}
                  onChangeText={setNewPasswordDescription}
                  multiline
                />
              </View>

              <View style={st.pmsSectionDivider}>
                <View style={[st.pmsDividerLine, { backgroundColor: border }]} />
                <Text style={[st.pmsSectionLabel, { color: textMuted }]}>SECURITY</Text>
                <View style={[st.pmsDividerLine, { backgroundColor: border }]} />
              </View>

              <View style={{ marginBottom: 20 }}>
                <Text style={[st.pmsLabel, { color: text, marginBottom: 8 }]}>Create Password</Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={[st.pmsInput, { backgroundColor: 'rgba(255,255,255,0.05)', color: text, paddingRight: 50 }]}
                    placeholder="Enter a strong password"
                    placeholderTextColor={textMuted}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNewPassword}
                  />
                  <TouchableOpacity
                    style={st.pmsEyeButton}
                    onPress={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <Eye size={18} color={textMuted} strokeWidth={2} /> : <EyeOff size={18} color={textMuted} strokeWidth={2} />}
                  </TouchableOpacity>
                </View>
                {newPassword.length > 0 && (
                  <View style={{ marginTop: 10, gap: 6 }}>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: border, overflow: 'hidden' }}>
                      <View style={{ height: '100%', borderRadius: 2, backgroundColor: newStrengthColor, width: newStrengthWidth }} />
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: newStrengthColor, textTransform: 'capitalize' }}>{newStrengthLabel} password</Text>
                  </View>
                )}
                {newPassword.length > 0 && (
                  <View style={[st.pmsValidationBox, { backgroundColor: 'rgba(255,69,58,0.06)', borderWidth: 1, borderColor: 'rgba(255,69,58,0.12)' }]}>
                    <Text style={[st.pmsValidationTitle, { color: textMuted }]}>Password Requirements</Text>
                    {getPasswordValidationMessages(newPassword).messages.map((msg, idx) => (
                      <View key={idx} style={st.pmsValidationItem}>
                        <Text style={[st.pmsValidationIcon, { color: msg.valid ? '#34C759' : colors.error }]}>{msg.valid ? '✓' : '✗'}</Text>
                        <Text style={[st.pmsValidationText, { color: msg.valid ? textMuted : colors.error }]}>{msg.text}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={{ marginBottom: 20 }}>
                <Text style={[st.pmsLabel, { color: text, marginBottom: 8 }]}>Confirm Password</Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={[st.pmsInput, { backgroundColor: 'rgba(255,255,255,0.05)', color: text, paddingRight: 50 }]}
                    placeholder="Confirm your password"
                    placeholderTextColor={textMuted}
                    value={newConfirmPassword}
                    onChangeText={setNewConfirmPassword}
                    secureTextEntry={!showNewConfirmPassword}
                  />
                  <TouchableOpacity
                    style={st.pmsEyeButton}
                    onPress={() => setShowNewConfirmPassword(!showNewConfirmPassword)}
                  >
                    {showNewConfirmPassword ? <Eye size={18} color={textMuted} strokeWidth={2} /> : <EyeOff size={18} color={textMuted} strokeWidth={2} />}
                  </TouchableOpacity>
                </View>
                {newConfirmPassword.length > 0 && newPassword !== newConfirmPassword && (
                  <Text style={{ fontSize: 12, color: colors.error, marginTop: 8, fontWeight: '600' }}>Passwords do not match</Text>
                )}
              </View>

              <View style={st.pmsActions}>
                <TouchableOpacity onPress={() => { setShowCreatePasswordModal(false); setCreatePasswordTarget(null); setNewPasswordLabel(''); setNewPasswordDescription(''); setNewPassword(''); setNewConfirmPassword(''); setShowNewPassword(false); setShowNewConfirmPassword(false); }} style={[st.pmsCancelBtn, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                  <X size={18} color={text} strokeWidth={2.5} />
                  <Text style={[st.pmsCancelText, { color: text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmCreateAndAssignPassword} style={[st.pmsPrimaryBtn, { backgroundColor: fabBg }]}>
                  <ShieldCheck size={18} color={fabText} strokeWidth={2.5} />
                  <Text style={[st.pmsPrimaryText, { color: fabText }]}>Create Password</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Access Key Picker Modal (Assign Existing Password) */}
      <AccessKeyPicker
        visible={showPasswordPicker}
        onClose={() => { setShowPasswordPicker(false); setPasswordPickerTarget(null); }}
        onSelectPassword={async (passwordId) => {
          if (passwordPickerTarget) {
            if (passwordPickerTarget.type === 'file') {
              await assignFileAccessKey(passwordPickerTarget.id, passwordId);
            } else {
              await assignFolderAccessKey(passwordPickerTarget.id, passwordId);
            }
            Alert.alert('Password Assigned', `Access key has been assigned to ${passwordPickerTarget.name}.`);
          }
          setShowPasswordPicker(false);
          setPasswordPickerTarget(null);
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
    </View>
  );
}

const useStyles = (colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) => {
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

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: bg },
    topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, paddingTop: 50 },
    backButton: { padding: 6 },
    menuButton: { padding: 6 },
    themeToggle: { padding: 6 },
    headerIconText: { color: text, fontSize: 22, fontWeight: '600' },
    headerTitle: { color: text, fontSize: 22, fontWeight: '700', textAlign: 'center', flex: 1, paddingHorizontal: 12 },
    scrollContainer: { paddingHorizontal: 16, paddingBottom: 130 },
    metricsDeck: { flexDirection: 'row', backgroundColor: surface, borderRadius: 20, paddingVertical: 20, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'space-around', marginTop: 10, marginBottom: 24 },
    metricItem: { alignItems: 'center', flex: 1 },
    metricValue: { color: text, fontSize: 18, fontWeight: '800' },
    metricLabel: { color: muted, fontSize: 11, fontWeight: '500', marginTop: 4 },
    metricDivider: { width: 1, height: 32, backgroundColor: border, opacity: 0.6 },
    actionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 28, justifyContent: 'space-between' },
    addFileButton: { backgroundColor: colors.vaultAddFileBg || primary, borderRadius: 100, paddingVertical: 14, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    addFileText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
    iconActionPill: { backgroundColor: iconBg, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    pillIconText: { fontSize: 18 },
    outlinedSelectButton: { borderWidth: 1, borderColor: border, borderRadius: 100, paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
    activeSelectButton: { backgroundColor: colors.vaultSelectBg || surface, borderColor: colors.vaultSelectBorder || primary },
    selectButtonText: { color: primary, fontWeight: '600', fontSize: 14 },
    activeSelectButtonText: { color: primary },
    purgeButton: { backgroundColor: colors.vaultPurgeBg || `${error}18`, borderRadius: 100, paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
    purgeButtonText: { color: colors.vaultPurgeText || error, fontWeight: '700', fontSize: 14 },
    sectionHeader: { color: sectionText, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, marginBottom: 12, marginTop: 8, paddingLeft: 4 },
    folderCard: { backgroundColor: surface, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    folderCardSelected: { borderColor: primary, borderWidth: 1 },
    folderCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    folderIconContainer: { width: 44, height: 44, backgroundColor: iconBg, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    cardIconText: { fontSize: 20 },
    folderTitleText: { color: text, fontSize: 16, fontWeight: '600', paddingRight: 8 },
    folderMetaText: { color: muted, fontSize: 12, marginTop: 2 },
    folderActionsRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    chevronIcon: { color: muted, fontSize: 22, fontWeight: '600' },
    fileCard: { backgroundColor: surface, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    fileCardSelected: { borderColor: primary, borderWidth: 1 },
    fileCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    fileIconContainer: { width: 44, height: 44, backgroundColor: iconBg, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    fileTitleText: { color: text, fontSize: 15, fontWeight: '600', paddingRight: 8 },
    fileMetaText: { color: muted, fontSize: 12, marginTop: 2 },
    fileActionsRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    checkboxIndicator: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: muted, marginRight: 12 },
    checkboxIndicatorActive: { backgroundColor: primary, borderColor: primary },
    cardMenuIcon: { padding: 6 },
    menuDotsText: { color: muted, fontSize: 14, fontWeight: '700' },
    emptyText: { color: muted, fontSize: 14, textAlign: 'center', marginVertical: 20, fontStyle: 'italic' },
    bottomTabBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 92, backgroundColor: surface, borderTopWidth: 1, borderTopColor: border, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 24, paddingHorizontal: 8 },
    tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
    tabIconActive: { fontSize: 22, color: text },
    tabLabelActive: { color: text, fontSize: 11, fontWeight: '600', marginTop: 4 },
    tabIconMuted: { fontSize: 22, color: muted, opacity: 0.6 },
    tabLabelMuted: { color: muted, fontSize: 11, fontWeight: '500', marginTop: 4 },
    orbWrapper: { width: 72, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    floatingSearchOrb: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#5162FF', alignItems: 'center', justifyContent: 'center', shadowColor: '#5162FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6, transform: [{ translateY: -14 }] },
    orbIconText: { fontSize: 22, color: '#FFFFFF' },
    modalOverlay: { flex: 1, backgroundColor: overlay, justifyContent: 'center', paddingHorizontal: 24 },
    modalContent: { backgroundColor: surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: border },
    modalTitle: { color: text, fontSize: 18, fontWeight: '700', marginBottom: 16 },
    modalInput: { backgroundColor: iconBg, borderRadius: 10, padding: 14, color: text, fontSize: 15, marginBottom: 20, borderWidth: 1, borderColor: border },
    modalButtons: { flexDirection: 'row', justifyContent: 'flex-end' },
    modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16, marginRight: 12 },
    modalCancelText: { color: muted, fontSize: 15, fontWeight: '600' },
    modalConfirmBtn: { backgroundColor: primary, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
    modalConfirmText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
    fileMenuContent: { backgroundColor: surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: border },
    fileMenuHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: border, alignSelf: 'center', marginBottom: 16 },
    fileMenuTitle: { color: text, fontSize: 18, fontWeight: '700', marginBottom: 16 },
    fileMenuItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: border },
    fileMenuItemText: { fontSize: 15, fontWeight: '500' },
    pmsOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: overlay },
    pmsCard: { width: '90%', maxWidth: 400, maxHeight: '80%', borderRadius: 24, padding: 20, alignItems: 'center' },
    pmsContent: { width: '100%', alignItems: 'stretch' },
    pmsTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 12 },
    pmsTargetRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 28, gap: 10 },
    pmsTargetChip: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
    pmsTargetChipText: { fontSize: 13, fontWeight: '600' },
    pmsLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    pmsLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    pmsOptionalBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, marginLeft: 8 },
    pmsOptionalBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    pmsInput: { width: '100%', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, minHeight: 52 },
    pmsEyeButton: { position: 'absolute', right: 14, top: '50%', marginTop: -12, padding: 6 },
    pmsSectionDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 28 },
    pmsDividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
    pmsSectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: 16 },
    pmsStrengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
    pmsStrengthBar: { height: 4, borderRadius: 2, flex: 1, overflow: 'hidden' },
    pmsStrengthFill: { height: '100%', borderRadius: 2 },
    pmsStrengthText: { fontSize: 11, fontWeight: '600' },
    pmsValidationBox: { marginTop: 10, padding: 12, borderRadius: 12 },
    pmsValidationTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
    pmsValidationItem: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    pmsValidationIcon: { fontSize: 12, marginRight: 8, fontWeight: '700', width: 16, textAlign: 'center' },
    pmsValidationText: { fontSize: 12, fontWeight: '500' },
    pmsActions: { flexDirection: 'row', gap: 12, marginTop: 32 },
    pmsCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
    pmsCancelText: { fontSize: 15, fontWeight: '700' },
    pmsPrimaryBtn: { flex: 1.2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
    pmsPrimaryText: { fontSize: 15, fontWeight: '700' },
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    iconGridItem: { borderRadius: 18, padding: 10, alignItems: 'center', marginBottom: 12 },
    iconGridThumb: { width: '100%', aspectRatio: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8, overflow: 'hidden' },
    iconGridThumbImage: { width: '100%', height: '100%', borderRadius: 14 },
    thumbBadge: { position: 'absolute', bottom: 4, right: 4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    videoBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
    iconGridName: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 3 },
    iconGridIconsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  });
};
