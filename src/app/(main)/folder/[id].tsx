// src/app/(main)/folder/[id].tsx
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { EncryptionKeyPicker } from '../../../components/EncryptionKeyPicker';
import { VaultHeader } from '../../../components/VaultHeader';
import { Moon, Sun } from 'lucide-react-native';
import { useTheme, useThemeColors } from '../../../contexts/ThemeContext';
import { useFileSystemQuery } from '../../../hooks/useFileSystemQuery';
import { SecureCrypto } from '../../../security/crypto';
import { StorageService } from '../../../services/storage';
import { useSettingsStore } from '../../../store/settingsStore';
import { useVaultStore } from '../../../store/vaultStore';
import { promptCreateEncryptionKey } from '../../../utils/encryptionKeyPrompt';

export default function FolderDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, isDark, toggleTheme } = useTheme();
  
  // Bind authentic existing global context operations
  const {
    folders, importFile, deleteFolder, softDeleteFile, createFolder, renameFolder,
    shredFolder, shredMultipleFiles, shredAllFilesInFolder, renameFile, moveFileToFolder,
    exportFileToDevice, exportFolderFiles, toggleFolderEncryption, moveFolder, shredFile,
    assignFolderEncryptionKey, assignFileEncryptionKey, removeFolderEncryptionKey, removeFileEncryptionKey,
    toggleFolderFavorite, toggleFavorite,
  } = useVaultStore();
  
  const { encryptionKeys, createEncryptionKey, encryptionKeyExists } = useSettingsStore();
  const { matchedFiles, matchedFolders } = useFileSystemQuery(id);

  // Maintain authentic cross-platform layout selectors
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [targetFile, setTargetFile] = useState<any>(null);
  const [targetFolder, setTargetFolder] = useState<any>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [shredProgress, setShredProgress] = useState<{ current: number; total: number } | null>(null);
  const [keyPickerTarget, setKeyPickerTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);

  const folderRecord = folders.find(f => f.id === id);
  const folderName = folderRecord ? folderRecord.name : 'Vault Root';

  // Calculate real-time metric counters
  const totalSizeKB = useMemo(() => {
    return matchedFiles.reduce((acc, f) => acc + (f.size || 0), 0) / 1024;
  }, [matchedFiles]);

  const encryptedCount = useMemo(() => {
    return matchedFiles.filter(f => f.isEncrypted).length;
  }, [matchedFiles]);

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
        await importFile(asset.uri, id, safeName, asset.mimeType || 'application/octet-stream', asset.size || 0, false, folderRecord?.encryptionKeyId);
      } else {
        await importFile(asset.uri, id, safeName, asset.mimeType || 'application/octet-stream', asset.size || 0, folderRecord?.isEncrypted || false, folderRecord?.encryptionKeyId);
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
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds(prev => prev.includes(fileId) ? prev.filter(i => i !== fileId) : [...prev, fileId]);
  };

  const handleCreateNestedFolder = () => {
    if (!id) return;
    if (Platform.OS === 'web') {
      const name = window.prompt('New folder name:');
      if (name && name.trim()) createFolder(name.trim(), colors.primary, 'folder', false, id);
    } else {
      setShowCreateFolderModal(true);
    }
  };

  const confirmCreateFolder = () => {
    if (!id || !newFolderName.trim()) return;
    createFolder(newFolderName.trim(), colors.primary, 'folder', false, id);
    setShowCreateFolderModal(false);
    setNewFolderName('');
  };

  const handleBulkSoftDelete = () => {
    if (selectedFileIds.length === 0) {
      Alert.alert('Selection Empty', 'Select elements first before executing wipe commands.');
      return;
    }
    Alert.alert('Confirm Move', `Move ${selectedFileIds.length} elements into retention trash?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move to Trash',
        style: 'destructive',
        onPress: async () => {
          for (const fileId of selectedFileIds) {
            await softDeleteFile(fileId);
          }
          exitSelectionMode();
        }
      }
    ]);
  };

  const handleFileItemPress = (file: any) => {
    if (selectionMode) {
      toggleFileSelection(file.id);
    } else {
      if (file.mimeType?.startsWith('image/')) {
        router.push({ pathname: '/(main)/viewer/image', params: { fileId: file.id } });
      } else if (file.mimeType?.startsWith('video/')) {
        router.push({ pathname: '/(main)/viewer/video', params: { fileId: file.id } });
      } else {
        router.push({ pathname: '/(main)/viewer/document', params: { fileId: file.id } });
      }
    }
  };

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
        softDeleteFile(targetFile.id);
        break;
      case 'shred':
        Alert.alert('Confirm Shred', 'Permanently delete this file?',
          [{ text: 'Cancel', style: 'cancel' },
           { text: 'Shred', style: 'destructive', onPress: () => shredFile(targetFile.id) }]
        );
        break;
      case 'favorite':
        toggleFavorite(targetFile.id);
        break;
      case 'register-key':
        handleRegisterEncryptionKey(targetFile.id, targetFile.name);
        break;
      case 'assign-key':
        if (encryptionKeys.length === 0) {
          Alert.alert('No Encryption Keys', 'Create an encryption key in Settings first.');
        } else {
          setKeyPickerTarget({ type: 'file', id: targetFile.id, name: targetFile.name });
        }
        break;
    }
  };

  const handleRegisterEncryptionKey = (targetId: string, targetName: string) => {
    if (encryptionKeys.length >= 20) {
      Alert.alert('Encryption Key Limit', 'You can only create up to 20 encryption keys.');
      return;
    }
    promptCreateEncryptionKey(targetName, async (options) => {
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
      await assignFileEncryptionKey(targetId, key.id);
      Alert.alert('Encryption Registered', 'A new encryption key was generated and assigned.');
    });
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
      case 'register-key':
        handleRegisterEncryptionKey(folderRecord.id, folderRecord.name); break;
      case 'assign-key':
        if (encryptionKeys.length === 0) {
          Alert.alert('No Encryption Keys', 'Create an encryption key in Settings first.');
        } else {
          setKeyPickerTarget({ type: 'folder', id: folderRecord.id, name: folderRecord.name });
        }
        break;
      case 'favorite':
        toggleFolderFavorite(folderRecord.id);
        break;
      case 'delete':
        deleteFolder(folderRecord.id); router.back(); break;
      case 'shred':
        Alert.alert('Confirm Folder Shred', 'Permanently shred this folder and all contents?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Shred', style: 'destructive', onPress: () => shredFolder(folderRecord.id) }
        ]);
        break;
    }
  };

  const st = useStyles(colors, isDark);

  return (
    <View style={st.root}>
      <SafeAreaView>
        {/* Immersive Dark Mode Top Header */}
        <View style={st.topHeader}>
          <TouchableOpacity onPress={() => router.back()} style={st.backButton}>
            <Text style={st.headerIconText}>←</Text>
          </TouchableOpacity>
          <Text style={st.headerTitle} numberOfLines={1}>{folderName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={toggleTheme} style={st.themeToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              {isDark ? <Sun size={20} color={colors.text} /> : <Moon size={20} color={colors.text} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowFolderMenu(true)} style={st.menuButton}>
              <Text style={st.headerIconText}>•••</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

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
            <Text style={st.metricValue}>{encryptedCount}</Text>
            <Text style={st.metricLabel}>Encrypted</Text>
          </View>
          <View style={st.metricDivider} />
          <View style={st.metricItem}>
            <Text style={st.metricValue}>{matchedFolders.length}</Text>
            <Text style={st.metricLabel}>Subfolders</Text>
          </View>
        </View>

        {/* Action Capsule Row Layout */}
        <View style={st.actionRow}>
          <TouchableOpacity style={st.addFileButton} onPress={executeImportPayload}>
            <Text style={st.addFileText}>+ Add File</Text>
          </TouchableOpacity>

          <TouchableOpacity style={st.iconActionPill} onPress={handleCreateNestedFolder}>
            <Text style={st.pillIconText}>📁</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[st.outlinedSelectButton, selectionMode && st.activeSelectButton]} 
            onPress={() => {
              if (selectionMode) {
                exitSelectionMode();
              } else {
                setSelectionMode(true);
              }
            }}
          >
            <Text style={[st.selectButtonText, selectionMode && st.activeSelectButtonText]}>
              {selectionMode ? '✓ Selected' : '☑ Select'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={st.purgeButton} onPress={handleBulkSoftDelete}>
            <Text style={st.purgeButtonText}>Purge</Text>
          </TouchableOpacity>
        </View>

        {/* Subfolders Grid Section */}
        {matchedFolders.length > 0 && (
          <>
            <Text style={st.sectionHeader}>SUBFOLDERS</Text>
            {matchedFolders.map((folder) => (
              <TouchableOpacity 
                key={folder.id} 
                style={st.folderCard}
                onPress={() => router.push({ pathname: '/(main)/folder/[id]', params: { id: folder.id } })}
              >
                <View style={st.folderCardLeft}>
                  <View style={st.folderIconContainer}>
                    <Text style={st.cardIconText}>📁</Text>
                  </View>
                  <View>
                    <Text style={st.folderTitleText}>{folder.name}</Text>
                    <Text style={st.folderMetaText}>Directory Folder</Text>
                  </View>
                </View>
                <Text style={st.chevronIcon}>›</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Files Grid Section */}
        <Text style={st.sectionHeader}>FILES</Text>
        {matchedFiles.length === 0 ? (
          <Text style={st.emptyText}>This directory workspace is empty</Text>
        ) : (
          matchedFiles.map((file) => {
            const isSelected = selectedFileIds.includes(file.id);
            return (
              <View 
                key={file.id} 
                style={[st.fileCard, isSelected && st.fileCardSelected]}
              >
                <TouchableOpacity 
                  style={st.fileCardLeft}
                  onPress={() => handleFileItemPress(file)}
                  activeOpacity={0.7}
                >
                  <View style={st.fileIconContainer}>
                    <Text style={st.cardIconText}>
                      {file.mimeType?.startsWith('image/') ? '🖼️' : '📄'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.fileTitleText} numberOfLines={1}>{file.name}</Text>
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
                    onPressIn={() => softDeleteFile(file.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[st.menuDotsText, { color: '#FF453A' }]}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

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
          <View style={[{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: 36 }]}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 }} />
            <Text style={[{ color: colors.text, fontSize: 16, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 12, marginBottom: 4 }]}>{targetFile?.name || 'File Actions'}</Text>
            {[
              { action: 'rename', label: 'Rename', color: colors.text },
              { action: 'move', label: 'Move to...', color: colors.text },
              { action: 'export', label: 'Export / Save to Device', color: colors.text },
              { action: 'register-key', label: 'Create & Assign Key', color: colors.primary },
              { action: 'assign-key', label: 'Assign Existing Key', color: colors.primary },
              { action: 'favorite', label: targetFile?.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: '#FBBF24' },
              { action: 'delete', label: 'Move to Trash', color: colors.error },
              { action: 'shred', label: 'Shred Permanently', color: colors.error },
            ].map((item) => (
              <TouchableOpacity
                key={item.action}
                style={[{ paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
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
            <View style={[{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: 36 }]}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 }} />
              <Text style={[{ color: colors.text, fontSize: 16, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 12, marginBottom: 4 }]}>{folderRecord.name}</Text>
              {[
                { action: 'rename', label: 'Rename', color: colors.text },
                { action: 'move', label: 'Move', color: colors.text },
                { action: 'export', label: 'Export', color: colors.text },
                { action: 'register-key', label: 'Create & Assign Key', color: colors.primary },
                { action: 'assign-key', label: 'Assign Existing Key', color: colors.primary },
                { action: 'favorite', label: folderRecord.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: '#FBBF24' },
                { action: 'delete', label: 'Move to Trash', color: colors.error },
                { action: 'shred', label: 'Shred Permanently', color: colors.error },
              ].map(item => (
                <TouchableOpacity key={item.action} style={[{ paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} onPress={() => handleFolderAction(item.action)}>
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
                  <Text style={[{ fontSize: 15, fontWeight: '500', color: colors.text }]}>📁 {f.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const useStyles = (colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) => {
  const bg = colors.background;
  const surface = colors.vaultSurface || colors.surface;
  const iconBg = colors.vaultIconBg || colors.surface;
  const text = colors.text;
  const muted = colors.vaultTextMuted || colors.textMuted;
  const sectionText = colors.vaultSectionText || colors.textSecondary;
  const primary = colors.primary;
  const error = colors.error;
  const border = colors.borderLight || colors.border;
  const overlay = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.35)';

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: bg },
    topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
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
    folderCardLeft: { flexDirection: 'row', alignItems: 'center' },
    folderIconContainer: { width: 44, height: 44, backgroundColor: iconBg, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    cardIconText: { fontSize: 20 },
    folderTitleText: { color: text, fontSize: 16, fontWeight: '600' },
    folderMetaText: { color: muted, fontSize: 12, marginTop: 2 },
    chevronIcon: { color: muted, fontSize: 22, fontWeight: '600' },
    fileCard: { backgroundColor: surface, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    fileCardSelected: { borderColor: primary, borderWidth: 1 },
    fileCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    fileIconContainer: { width: 44, height: 44, backgroundColor: iconBg, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    fileTitleText: { color: text, fontSize: 15, fontWeight: '600', paddingRight: 8 },
    fileMetaText: { color: muted, fontSize: 12, marginTop: 2 },
    fileActionsRight: { flexDirection: 'row', alignItems: 'center' },
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
  });
};