// File: src/app/(main)/folder/[id].tsx
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AnimatedCard } from '../../../components/AnimatedCard';
import { EncryptionKeyPicker } from '../../../components/EncryptionKeyPicker';
import { VaultHeader } from '../../../components/VaultHeader';
import { useThemeColors } from '../../../contexts/ThemeContext';
import { useFileSystemQuery } from '../../../hooks/useFileSystemQuery';
import { SecureCrypto } from '../../../security/crypto';
import { StorageService } from '../../../services/storage';
import { useSettingsStore } from '../../../store/settingsStore';
import { useVaultStore } from '../../../store/vaultStore';
import { folderStyles, sheetStyles } from '../../../styles/folderStyles';
import { promptCreateEncryptionKey } from '../../../utils/encryptionKeyPrompt';

export default function FolderDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useThemeColors();
  const { folders, importFile, deleteFolder, softDeleteFile, createFolder, renameFolder, shredFolder, shredMultipleFiles, shredAllFilesInFolder, renameFile, moveFileToFolder, exportFileToDevice, toggleFolderEncryption, moveFolder, shredFile, assignFolderEncryptionKey, assignFileEncryptionKey, removeFolderEncryptionKey, removeFileEncryptionKey } = useVaultStore();
  const { encryptionKeys, createEncryptionKey, encryptionKeyExists } = useSettingsStore();
  const { matchedFiles, matchedFolders } = useFileSystemQuery(id);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [targetFile, setTargetFile] = useState<any>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [shredProgress, setShredProgress] = useState<{ current: number; total: number } | null>(null);
  const [keyPickerTarget, setKeyPickerTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);

  const folderRecord = folders.find(f => f.id === id);

  const sanitizeFilename = (name: string): string => {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_');
  };

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

  const exitSelectionMode = () => { setSelectionMode(false); setSelectedFileIds([]); };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds(prev => prev.includes(fileId) ? prev.filter(i => i !== fileId) : [...prev, fileId]);
  };

  const handleCreateNestedFolder = () => {
    if (!id) return;
    const name = Platform.OS === 'web' ? window.prompt('New folder name:') : null;
    if (name && name.trim()) createFolder(name.trim(), colors.primary, 'folder', false, id);
    if (Platform.OS !== 'web') setShowCreateFolderModal(true);
  };

  const confirmCreateFolder = () => {
    if (!id || !newFolderName.trim()) return;
    createFolder(newFolderName.trim(), colors.primary, 'folder', false, id);
    setShowCreateFolderModal(false);
    setNewFolderName('');
  };

  const handleSelectAll = () => {
    const allIds = matchedFiles.map(f => f.id);
    setSelectedFileIds(selectedFileIds.length === allIds.length ? [] : allIds);
  };

  const handleBulkShred = () => {
    if (selectedFileIds.length === 0) return;
    Alert.alert('Confirm Permanent Deletion', `Are you sure you want to permanently shred ${selectedFileIds.length} items? This cannot be undone.`,
      [{ text: 'Cancel', style: 'cancel' }, {
        text: 'Shred Selected', style: 'destructive',
        onPress: () => shredMultipleFiles(selectedFileIds, (current, total) => { setShredProgress({ current, total }); })
      }]
    );
  };

  const handleShredAll = () => {
    if (!id) return;
    Alert.prompt('CRITICAL WARNING', 'This will permanently destroy ALL files in this folder. Type "SHRED" to confirm.',
      [{ text: 'Cancel', style: 'cancel' }, {
        text: 'Confirm',
        onPress: (text?: any) => {
          if (text === 'SHRED') shredAllFilesInFolder(id, (current, total) => { setShredProgress({ current, total }); });
        }
      }], 'plain-text'
    );
  };

  const handleFolderShred = () => {
    if (!id) return;
    Alert.alert('Confirm Folder Deletion', 'Permanently shred this folder and all its contents? This cannot be undone.',
      [{ text: 'Cancel', style: 'cancel' }, {
        text: 'Shred Folder', style: 'destructive',
        onPress: () => shredFolder(id, (current, total) => { setShredProgress({ current, total }); }).then(() => router.back())
      }]
    );
  };

  const handleRegisterEncryptionKey = (type: 'file' | 'folder', targetId: string, targetName: string) => {
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

      if (type === 'file') {
        await assignFileEncryptionKey(targetId, key.id);
      } else {
        await assignFolderEncryptionKey(targetId, key.id);
      }
      Alert.alert('Encryption Registered', 'A new encryption key was generated and assigned.');
    });
  };

  const handleFileAction = (file: any, action: string) => {
    setShowFileMenu(false);
    switch (action) {
      case 'view-info':
        Alert.alert('File Details', `Name: ${file.name}\nSize: ${(file.size / 1024).toFixed(1)} KB\nType: ${file.mimeType}\nEncrypted: ${file.isEncrypted ? 'Yes' : 'No'}${file.encryptionKeyId ? `\nKey: ${file.encryptionKeyId}` : ''}`); break;
      case 'rename':
        setTargetFile(file); setRenameText(file.name); setShowRenameModal(true); break;
      case 'move':
        setTargetFile(file); setShowMoveModal(true); break;
      case 'export':
        exportFileToDevice(file.id).then(path => { if (path) Sharing.shareAsync(path); }); break;
      case 'delete':
        softDeleteFile(file.id); break;
      case 'shred':
        Alert.alert('Confirm Shred', 'Permanently delete this file?',
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Shred', style: 'destructive', onPress: () => { shredFile(file.id); exitSelectionMode(); } }]
        ); break;
      case 'register-key':
        handleRegisterEncryptionKey('file', file.id, file.name); break;
      case 'assign-key':
        setKeyPickerTarget({ type: 'file', id: file.id, name: file.name }); break;
      case 'remove-key':
        Alert.alert('Remove Encryption Key', `Remove encryption from "${file.name}"? The file will be decrypted and remain in the vault.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => removeFileEncryptionKey(file.id) }
        ]);
        break;
      case 'share':
        exportFileToDevice(file.id).then(path => { if (path) Sharing.shareAsync(path); }); break;
    }
  };

  const confirmRename = () => {
    if (targetFile) { renameFile(targetFile.id, renameText.trim()); }
    else if (folderRecord) { renameFolder(id!, renameText.trim()); }
    setShowRenameModal(false);
  };

  const confirmMoveFolder = (targetParentId: string) => {
    if (folderRecord) moveFolder(folderRecord.id, targetParentId || '');
    setShowMoveModal(false);
  };

  const confirmMoveFile = (targetFolderId: string) => {
    if (targetFile) moveFileToFolder(targetFile.id, targetFolderId);
    setShowMoveModal(false);
  };

  const handleFolderAction = (action: string) => {
    setShowFolderMenu(false);
    switch (action) {
      case 'rename': setRenameText(folderRecord?.name || ''); setShowRenameModal(true); break;
      case 'move': setTargetFile(null); setShowMoveModal(true); break;
      case 'export': break;
      case 'delete': deleteFolder(id!); router.back(); break;
      case 'shred': handleFolderShred(); break;
      case 'encrypt': toggleFolderEncryption(id!); break;
      case 'register-key':
        if (folderRecord) handleRegisterEncryptionKey('folder', folderRecord.id, folderRecord.name);
        break;
      case 'assign-key':
        if (folderRecord) setKeyPickerTarget({ type: 'folder', id: folderRecord.id, name: folderRecord.name });
        break;
      case 'remove-key':
        if (!folderRecord) return;
        Alert.alert('Remove Encryption Key', `Remove encryption from folder "${folderRecord.name}"? The folder will remain but files will be decrypted.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => removeFolderEncryptionKey(folderRecord.id) }
        ]);
        break;
    }
  };

  if (!folderRecord) {
    return (
      <View style={[folderStyles.root, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.text, fontSize: 40, marginBottom: 12 }}>📁</Text>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 6 }}>Folder Not Found</Text>
        <Text style={{ color: colors.textMuted }}>Directory node missing or destroyed.</Text>
      </View>
    );
  }

  const totalFolderSize = matchedFiles.reduce((s, f) => s + f.size, 0);
  const encryptedCount = matchedFiles.filter(f => f.isEncrypted).length;

  return (
    <View style={[folderStyles.root, { backgroundColor: colors.background }]}>
      <VaultHeader
        title={folderRecord.name}
        showBack
        rightButton={
          selectionMode ? (
            <TouchableOpacity onPress={handleSelectAll} style={folderStyles.headerBtn}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>
                {selectedFileIds.length === matchedFiles.length ? 'None' : 'All'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity onPress={handleCreateNestedFolder} style={folderStyles.headerIconBtn}>
                <Text style={{ fontSize: 17 }}>📁</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowFolderMenu(true)} style={folderStyles.headerIconBtn}>
                <Text style={{ color: colors.textMuted, fontSize: 20, letterSpacing: 1 }}>···</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />

      {/* ── Folder Stats Banner ── */}
      <View style={[folderStyles.statsBanner, { backgroundColor: colors.surface, borderColor: 'rgba(255,255,255,0.06)' }]}>
        <View style={folderStyles.statItem}>
          <Text style={[folderStyles.statNum, { color: colors.text }]}>{matchedFiles.length}</Text>
          <Text style={[folderStyles.statLabel, { color: colors.textMuted }]}>Files</Text>
        </View>
        <View style={[folderStyles.statDivider, { backgroundColor: colors.border }]} />
        <View style={folderStyles.statItem}>
          <Text style={[folderStyles.statNum, { color: colors.text }]}>{(totalFolderSize / 1024).toFixed(0)} KB</Text>
          <Text style={[folderStyles.statLabel, { color: colors.textMuted }]}>Size</Text>
        </View>
        <View style={[folderStyles.statDivider, { backgroundColor: colors.border }]} />
        <View style={folderStyles.statItem}>
          <Text style={[folderStyles.statNum, { color: encryptedCount > 0 ? '#34D399' : colors.textMuted }]}>{encryptedCount}</Text>
          <Text style={[folderStyles.statLabel, { color: colors.textMuted }]}>Encrypted</Text>
        </View>
        <View style={[folderStyles.statDivider, { backgroundColor: colors.border }]} />
        <View style={folderStyles.statItem}>
          <Text style={[folderStyles.statNum, { color: colors.text }]}>{matchedFolders.length}</Text>
          <Text style={[folderStyles.statLabel, { color: colors.textMuted }]}>Subfolders</Text>
        </View>
      </View>

      {/* ── Action Strip ── */}
      <View style={folderStyles.actionStripLocal}>
        {selectionMode ? (
          <>
            <View style={[folderStyles.selCountBadge, { backgroundColor: `${colors.primary}22` }]}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{selectedFileIds.length} selected</Text>
            </View>
            <TouchableOpacity onPress={handleSelectAll} style={[folderStyles.actionChip, { backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>
                {selectedFileIds.length === matchedFiles.length ? 'None' : 'All'}
              </Text>
            </TouchableOpacity>
            {selectedFileIds.length > 0 && (
              <TouchableOpacity onPress={handleBulkShred} style={[folderStyles.actionChip, { backgroundColor: 'rgba(255,59,48,0.18)' }]}>
                <Text style={{ color: '#FF3B30', fontWeight: '700', fontSize: 13 }}>Shred</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleShredAll} style={[folderStyles.actionChip, { backgroundColor: 'rgba(255,59,48,0.1)' }]}>
              <Text style={{ color: colors.error, fontWeight: '600', fontSize: 13 }}>💥 All</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={exitSelectionMode} style={[folderStyles.actionChip, { backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: 13 }}>✕</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={executeImportPayload} style={[folderStyles.primaryChip, { backgroundColor: colors.primary }]}>
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 13 }}>+ Add File</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSelectionMode(true)} style={[folderStyles.actionChip, { backgroundColor: `${colors.primary}18` }]}>
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>☑ Select</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleFolderShred} style={[folderStyles.actionChip, { backgroundColor: 'rgba(255,59,48,0.15)' }]}>
              <Text style={{ color: colors.error, fontWeight: '600', fontSize: 13 }}>Purge</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <ScrollView contentContainerStyle={folderStyles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Subfolders */}
        {matchedFolders.length > 0 && (
          <>
            <Text style={[folderStyles.sectionLabelLocal, { color: colors.textMuted }]}>Subfolders</Text>
            {matchedFolders.map(item => (
              <AnimatedCard
                key={`folder-${item.id}`}
                style={[folderStyles.folderCardLocal, { backgroundColor: colors.surface }]}
                onPress={() => router.push({ pathname: '/(main)/folder/[id]', params: { id: item.id } })}
                onLongPress={() => setSelectionMode(true)}
              >
                <View style={folderStyles.folderCardRow}>
                  <View style={[folderStyles.folderIconBox, { backgroundColor: `${colors.primary}18` }]}>
                    <Text style={{ fontSize: 22 }}>📁</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[folderStyles.fileNameLocal, { color: colors.text }]}>{item.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                      Created {new Date(item.createdAt).toLocaleDateString()}
                      {item.isEncrypted && item.encryptionKeyId ? ' · 🔒 Encrypted' : ''}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
                </View>
              </AnimatedCard>
            ))}
          </>
        )}

        {/* Files */}
        {matchedFiles.length > 0 && (
          <Text style={[folderStyles.sectionLabelLocal, { color: colors.textMuted, marginTop: matchedFolders.length > 0 ? 16 : 0 }]}>
            Files
          </Text>
        )}

        <FlatList
          data={matchedFiles}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => {
            const isSelected = selectedFileIds.includes(item.id);
            const isImage = item.mimeType?.startsWith('image/');
            const isVideo = item.mimeType?.startsWith('video/');
            const fileIcon = isImage ? '🖼' : isVideo ? '▶' : '📄';
            const fileColor = isImage ? '#A78BFA' : isVideo ? '#FF6B6B' : '#60A5FA';

            return (
              <AnimatedCard
                style={[folderStyles.fileCardLocal, {
                  backgroundColor: colors.surface,
                  borderColor: isSelected ? colors.primary : 'transparent',
                  borderWidth: isSelected ? 2 : 0,
                }]}
                onLongPress={() => { setSelectionMode(true); setSelectedFileIds([item.id]); }}
                onPress={() => {
                  if (selectionMode) {
                    toggleFileSelection(item.id);
                  } else {
                    if (item.mimeType?.startsWith('image/')) {
                      router.push({ pathname: '/(main)/viewer/image', params: { fileId: item.id } });
                    } else if (item.mimeType?.startsWith('video/')) {
                      router.push({ pathname: '/(main)/viewer/video', params: { fileId: item.id } });
                    } else {
                      router.push({ pathname: '/(main)/viewer/document', params: { fileId: item.id } });
                    }
                  }
                }}
              >
                <View style={folderStyles.fileCardRow}>
                  {selectionMode && (
                    <TouchableOpacity onPress={() => toggleFileSelection(item.id)} style={{ marginRight: 12 }}>
                      <View style={[folderStyles.checkCircle, { backgroundColor: isSelected ? colors.primary : 'transparent', borderColor: isSelected ? colors.primary : colors.textMuted }]}>
                        {isSelected && <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  )}
                  <View style={[folderStyles.fileIconBox, { backgroundColor: `${fileColor}18` }]}>
                    <Text style={{ fontSize: 20 }}>{fileIcon}</Text>
                    {item.isEncrypted && (
                      <View style={folderStyles.encryptedBadge}>
                        <Text style={{ fontSize: 8 }}>🔒</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[folderStyles.fileNameLocal, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                      {(item.size / 1024).toFixed(1)} KB
                      {item.isEncrypted && item.encryptionKeyId ? ' · 🔒 Encrypted' : ''}
                    </Text>
                  </View>
                  {!selectionMode && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TouchableOpacity
                        onPress={() => softDeleteFile(item.id)}
                        style={[folderStyles.fileActionBtn, { backgroundColor: 'rgba(255,59,48,0.12)' }]}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        <Text style={{ fontSize: 14 }}>🗑️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setTargetFile(item); setShowFileMenu(true); }}
                        style={[folderStyles.fileActionBtn, { backgroundColor: colors.surface }]}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        <Text style={{ color: colors.textMuted, fontWeight: '700' }}>···</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </AnimatedCard>
            );
          }}
          ListEmptyComponent={
            <View style={folderStyles.emptyBlock}>
              <Text style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>📂</Text>
              <Text style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 20 }}>
                {'No files in this folder yet.\nTap "+ Add File" to import.'}
              </Text>
            </View>
          }
        />
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Bottom Tabs ── */}
      <View style={folderStyles.bottomTabsLocal}>
        <TouchableOpacity style={folderStyles.tabButtonLocal} onPress={() => router.push('/(main)/dashboard')}>
          <Text style={{ fontSize: 22 }}>🏠</Text>
          <Text style={[folderStyles.tabLabel, { color: colors.textMuted }]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={folderStyles.tabButtonLocal} onPress={() => router.push('/(main)/favorites')}>
          <Text style={{ fontSize: 22 }}>⭐</Text>
          <Text style={[folderStyles.tabLabel, { color: colors.textMuted }]}>Favorites</Text>
        </TouchableOpacity>
        <TouchableOpacity style={folderStyles.tabButtonLocal} onPress={() => router.push('/(main)/search')}>
          <Text style={{ fontSize: 22 }}>🔍</Text>
          <Text style={[folderStyles.tabLabel, { color: colors.textMuted }]}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={folderStyles.tabButtonLocal} onPress={() => router.push('/(main)/trash')}>
          <Text style={{ fontSize: 22 }}>🗑️</Text>
          <Text style={[folderStyles.tabLabel, { color: colors.textMuted }]}>Trash</Text>
        </TouchableOpacity>
        <TouchableOpacity style={folderStyles.tabButtonLocal} onPress={() => router.push('/(main)/settings')}>
          <Text style={{ fontSize: 22 }}>⚙️</Text>
          <Text style={[folderStyles.tabLabel, { color: colors.textMuted }]}>Settings</Text>
        </TouchableOpacity>
      </View>

      {/* ── Modals ── */}
      {showFileMenu && targetFile && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowFileMenu(false)}>
          <TouchableOpacity style={sheetStyles.overlay} onPress={() => setShowFileMenu(false)} activeOpacity={1}>
            <View style={[sheetStyles.sheet, { backgroundColor: colors.surface }]}>
              <View style={sheetStyles.handle} />
              <Text style={[sheetStyles.sheetTitle, { color: colors.text }]} numberOfLines={1}>{targetFile.name}</Text>
              {[
                { action: 'view-info', label: 'View Details', icon: 'ℹ️', color: colors.text },
                { action: 'rename', label: 'Rename File', icon: '✏️', color: colors.text },
                { action: 'move', label: 'Move to...', icon: '↗️', color: colors.text },
                { action: 'export', label: 'Export / Save to Device', icon: '📤', color: colors.text },
                { action: 'share', label: 'Open with other apps', icon: '🔗', color: colors.text },
                { action: 'delete', label: 'Delete to Trash', icon: '🗑️', color: colors.error },
              { action: 'register-key', label: 'Create & Assign Encryption Key', icon: '🔑', color: colors.primary },
              { action: 'assign-key', label: 'Assign Existing Encryption Key', icon: '🔐', color: colors.primary },
              ...(targetFile.isEncrypted && targetFile.encryptionKeyId ? [{ action: 'remove-key', label: 'Remove Encryption Key', icon: '🔓', color: colors.error }] : []),
              { action: 'shred', label: 'Shred File', icon: '💥', color: colors.error },
              ].map(item => (
                <TouchableOpacity key={item.action} style={sheetStyles.item} onPress={() => handleFileAction(targetFile, item.action)}>
                  <Text style={sheetStyles.itemIcon}>{item.icon}</Text>
                  <Text style={[sheetStyles.itemLabel, { color: item.color }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {showRenameModal && (
        <Modal transparent animationType="fade">
          <View style={sheetStyles.overlay}>
            <View style={[sheetStyles.sheet, { backgroundColor: colors.surface }]}>
              <View style={sheetStyles.handle} />
              <Text style={[sheetStyles.sheetTitle, { color: colors.text }]}>Rename</Text>
              <TextInput
                style={[sheetStyles.input, { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}40` }]}
                value={renameText}
                onChangeText={setRenameText}
                autoFocus
              />
              <View style={sheetStyles.btnRow}>
                <TouchableOpacity onPress={() => setShowRenameModal(false)} style={[sheetStyles.cancelBtn, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmRename} style={[sheetStyles.confirmBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#FFF', fontWeight: '700' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {showMoveModal && (
        <Modal transparent animationType="fade">
          <View style={sheetStyles.overlay}>
            <View style={[sheetStyles.sheet, { backgroundColor: colors.surface }]}>
              <View style={sheetStyles.handle} />
              <Text style={[sheetStyles.sheetTitle, { color: colors.text }]}>Move to Folder</Text>
              {targetFile && folders.filter(f => f.id !== targetFile.folderId).map(f => (
                <TouchableOpacity key={f.id} style={sheetStyles.item} onPress={() => confirmMoveFile(f.id)}>
                  <Text style={sheetStyles.itemIcon}>📁</Text>
                  <Text style={[sheetStyles.itemLabel, { color: colors.text }]}>{f.name}</Text>
                </TouchableOpacity>
              ))}
              {!targetFile && folders.filter(f => f.id !== id).map(f => (
                <TouchableOpacity key={f.id} style={sheetStyles.item} onPress={() => confirmMoveFolder(f.id)}>
                  <Text style={sheetStyles.itemIcon}>📁</Text>
                  <Text style={[sheetStyles.itemLabel, { color: colors.text }]}>{f.name}</Text>
                </TouchableOpacity>
              ))}
              {!targetFile && (
                <TouchableOpacity style={sheetStyles.item} onPress={() => confirmMoveFolder('')}>
                  <Text style={sheetStyles.itemIcon}>🏠</Text>
                  <Text style={[sheetStyles.itemLabel, { color: colors.text }]}>Root Directory</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      )}

      <EncryptionKeyPicker
        visible={!!keyPickerTarget}
        onClose={() => setKeyPickerTarget(null)}
        onSelectKey={async (keyId) => {
          if (!keyPickerTarget) return;
          if (keyPickerTarget.type === 'file') {
            await assignFileEncryptionKey(keyPickerTarget.id, keyId);
          } else {
            await assignFolderEncryptionKey(keyPickerTarget.id, keyId);
          }
          setKeyPickerTarget(null);
          Alert.alert('Encryption Assigned', 'The selected encryption key is now registered.');
        }}
      />

      {showFolderMenu && folderRecord && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowFolderMenu(false)}>
          <TouchableOpacity style={sheetStyles.overlay} onPress={() => setShowFolderMenu(false)} activeOpacity={1}>
            <View style={[sheetStyles.sheet, { backgroundColor: colors.surface }]}>
              <View style={sheetStyles.handle} />
              <Text style={[sheetStyles.sheetTitle, { color: colors.text }]}>{folderRecord.name}</Text>
              {[
                { action: 'rename', label: 'Rename', icon: '✏️', color: colors.text },
                { action: 'move', label: 'Move Folder', icon: '↗️', color: colors.text },
                { action: 'export', label: 'Export Folder', icon: '📤', color: colors.text },
              { action: 'register-key', label: 'Create & Assign Encryption Key', icon: '🔑', color: colors.primary },
              { action: 'assign-key', label: 'Assign Existing Encryption Key', icon: '🔐', color: colors.primary },
              ...(folderRecord && folderRecord.isEncrypted && folderRecord.encryptionKeyId ? [{ action: 'remove-key', label: 'Remove Encryption Key', icon: '🔓', color: colors.error }] : []),
              { action: 'delete', label: 'Delete to Trash', icon: '🗑️', color: colors.error },
                { action: 'shred', label: 'Shred Folder', icon: '💥', color: colors.error },
              ].map(item => (
                <TouchableOpacity key={item.action} style={sheetStyles.item} onPress={() => handleFolderAction(item.action)}>
                  <Text style={sheetStyles.itemIcon}>{item.icon}</Text>
                  <Text style={[sheetStyles.itemLabel, { color: item.color }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {shredProgress && (
        <Modal transparent animationType="fade">
          <View style={sheetStyles.overlay}>
            <View style={[folderStyles.progressCard, { backgroundColor: colors.surface }]}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[folderStyles.progressText, { color: colors.text }]}>
                Shredding... ({shredProgress.current}/{shredProgress.total})
              </Text>
              <View style={folderStyles.progressBar}>
                <View style={[folderStyles.progressFill, {
                  backgroundColor: colors.primary,
                  width: `${(shredProgress.current / shredProgress.total) * 100}%` as any,
                }]} />
              </View>
            </View>
          </View>
        </Modal>
      )}

      {showCreateFolderModal && (
        <Modal transparent animationType="fade">
          <View style={sheetStyles.overlay}>
            <View style={[sheetStyles.sheet, { backgroundColor: colors.surface }]}>
              <View style={sheetStyles.handle} />
              <Text style={[sheetStyles.sheetTitle, { color: colors.text }]}>Create Subfolder</Text>
              <TextInput
                style={[sheetStyles.input, { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}40` }]}
                placeholder="Folder name"
                placeholderTextColor={colors.textMuted}
                value={newFolderName}
                onChangeText={setNewFolderName}
                autoFocus
              />
              <View style={sheetStyles.btnRow}>
                <TouchableOpacity onPress={() => setShowCreateFolderModal(false)} style={[sheetStyles.cancelBtn, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmCreateFolder} style={[sheetStyles.confirmBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#FFF', fontWeight: '700' }}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
