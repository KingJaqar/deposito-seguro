// File: src/app/(main)/favorites.tsx
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AnimatedCard } from '../../components/AnimatedCard';
import AnimatedTabBar from '../../components/AnimatedTabBar';
import { EncryptionKeyPicker } from '../../components/EncryptionKeyPicker';
import { VaultHeader } from '../../components/VaultHeader';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';
import { promptCreateEncryptionKey } from '../../utils/encryptionKeyPrompt';

const FILTERS = [
  { label: 'All', color: '#A78BFA' },
  { label: 'Root Folders', color: '#60A5FA' },
  { label: 'Subfolders', color: '#34D399' },
  { label: 'Images', color: '#F472B6' },
  { label: 'Videos', color: '#FF6B6B' },
  { label: 'Documents', color: '#60A5FA' },
  { label: 'Audio', color: '#FBBF24' },
  { label: 'Apps', color: '#F59E0B' },
  { label: 'Other', color: '#94A3B8' },
];

export default function FavoritesScreen() {
  const colors = useThemeColors();
  const {
    files, folders,
    toggleFavorite, softDeleteFile,
    createPersonalFavoritesFolder,
    shredFile, assignFileEncryptionKey,
  } = useVaultStore();
  const { encryptionKeys, createEncryptionKey, encryptionKeyExists } = useSettingsStore();

  const [activeFilter, setActiveFilter] = useState('All');
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

  const favoriteFiles = files.filter(f => f.isFavorite && !f.isTrash);
  const favoriteFolders = folders.filter(f => f.isFavorite);
  const personalFavFolders = folders.filter(f => f.isPersonalFavoritesFolder);

  const getFileType = (mimeType: string, name?: string) => {
    if (mimeType?.startsWith('image/')) return { label: 'Image', color: '#A78BFA', icon: '🖼' };
    if (mimeType?.startsWith('video/')) return { label: 'Video', color: '#FF6B6B', icon: '▶' };
    if (mimeType?.startsWith('audio/')) return { label: 'Audio', color: '#FBBF24', icon: '♪' };
    if (name?.endsWith('.apk') || name?.endsWith('.exe')) return { label: 'App', color: '#F472B6', icon: '📱' };
    return { label: 'File', color: '#60A5FA', icon: '📄' };
  };

  const filteredFiles = favoriteFiles.filter(f => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Images') return f.mimeType?.startsWith('image/');
    if (activeFilter === 'Videos') return f.mimeType?.startsWith('video/');
    if (activeFilter === 'Audio') return f.mimeType?.startsWith('audio/');
    if (activeFilter === 'Documents') return (
      !f.mimeType?.startsWith('image/') && !f.mimeType?.startsWith('video/') && !f.mimeType?.startsWith('audio/') &&
      (f.mimeType?.includes('pdf') || f.mimeType?.includes('document') || f.mimeType?.includes('text'))
    );
    if (activeFilter === 'Apps') return f.name?.endsWith('.apk') || f.name?.endsWith('.exe');
    if (activeFilter === 'Other') return (
      !f.mimeType?.startsWith('image/') && !f.mimeType?.startsWith('video/') && !f.mimeType?.startsWith('audio/') &&
      !f.mimeType?.includes('pdf') && !f.mimeType?.includes('document') && !f.mimeType?.includes('text') &&
      !f.name?.endsWith('.apk') && !f.name?.endsWith('.exe')
    );
    if (activeFilter === 'Root Folders' || activeFilter === 'Subfolders') return false;
    return true;
  });

  const filteredFolders = favoriteFolders.filter(f => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Root Folders') return !f.parentId;
    if (activeFilter === 'Subfolders') return !!f.parentId;
    return false;
  });

  const rootFavFolders = filteredFolders.filter(f => !f.parentId);
  const subFavFolders = filteredFolders.filter(f => !!f.parentId);

  const totalCount = filteredFiles.length + filteredFolders.length;

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const exitSelectionMode = () => { setSelectionMode(false); setSelectedIds([]); };

  const handleFileNavigate = (file: any) => {
    if (file.mimeType?.startsWith('image/')) {
      router.push({ pathname: '/(main)/viewer/image', params: { fileId: file.id } });
    } else if (file.mimeType?.startsWith('video/')) {
      router.push({ pathname: '/(main)/viewer/video', params: { fileId: file.id } });
    } else {
      router.push({ pathname: '/(main)/viewer/document', params: { fileId: file.id } });
    }
  };

  const handleFileAction = (file: any, action: string) => {
    setShowFileMenu(false);
    switch (action) {
      case 'unfavorite': toggleFavorite(file.id); break;
      case 'delete': softDeleteFile(file.id); break;
      case 'shred':
        Alert.alert('Confirm Shred', 'Permanently delete this file?',
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Shred', style: 'destructive', onPress: () => shredFile(file.id) }]
        ); break;
      case 'register-key':
        handleRegisterEncryptionKey(file.id, file.name); break;
      case 'assign-key':
        setKeyPickerTarget({ id: file.id, name: file.name }); break;
    }
  };

  const handleRegisterEncryptionKey = (fileId: string, fileNameValue: string) => {
    if (encryptionKeys.length >= 20) {
      Alert.alert('Encryption Key Limit', 'You can only create up to 20 encryption keys.');
      return;
    }

    promptCreateEncryptionKey(fileNameValue, async (options) => {
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

      await assignFileEncryptionKey(fileId, key.id);
      Alert.alert('Encryption Registered', 'A new encryption key was generated and assigned.');
    });
  };

  const handleFolderAction = (folder: any, action: string) => {
    setShowFolderMenu(false);
    switch (action) {
      case 'open': router.push({ pathname: '/(main)/folder/[id]', params: { id: folder.id } }); break;
      case 'unfavorite': toggleFavorite && toggleFavorite(folder.id); break;
      case 'rename': setTargetItem(folder); setRenameText(folder.name); setShowRenameModal(true); break;
      case 'delete': break;
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Favorites" showBack />

      {/* Filter Scrollable Header */}
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {FILTERS.map(f => {
            const isActive = activeFilter === f.label;
            return (
              <TouchableOpacity
                key={f.label}
                onPress={() => setActiveFilter(f.label)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isActive ? f.color : `${f.color}10`,
                    borderColor: isActive ? f.color : `${f.color}22`,
                  }
                ]}
                activeOpacity={0.75}
              >
                <Text style={[
                  styles.filterLabel,
                  { color: isActive ? '#FFF' : f.color, fontWeight: isActive ? '700' : '500' }
                ]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Action Row */}
        <View style={styles.topActions}>
          <Text style={[styles.countText, { color: colors.textMuted }]}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{totalCount}</Text> items
          </Text>
          <View style={styles.topActionsRight}>
            {selectionMode ? (
              <>
                <TouchableOpacity onPress={exitSelectionMode} style={styles.cancelBtn}>
                  <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={() => setShowCreateFavFolder(true)}
                style={[styles.createFolderBtn, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}30` }]}
              >
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>+ Favorites Folder</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Personal Favorites Folders */}
        {personalFavFolders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.groupLabel}>
              <View style={[styles.groupLine, { backgroundColor: `${colors.border}60` }]} />
              <Text style={[styles.groupText, { color: colors.textMuted }]}>MY FAVORITES FOLDERS</Text>
              <View style={[styles.groupLine, { backgroundColor: `${colors.border}60` }]} />
            </View>
            {personalFavFolders.map(folder => (
              <AnimatedCard
                key={folder.id}
                style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: `${colors.primary}30`, borderWidth: 1 }]}
                onPress={() => router.push({ pathname: '/(main)/folder/[id]', params: { id: folder.id } })}
                onLongPress={() => { setSelectionMode(true); setSelectedIds([folder.id]); }}
              >
                <View style={styles.itemRow}>
                  <View style={[styles.itemIcon, { backgroundColor: `${colors.primary}18` }]}>
                    <Text style={{ fontSize: 20 }}>📂</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.itemName, { color: colors.text }]}>{folder.name}</Text>
                    <Text style={{ color: colors.primary, fontSize: 11, marginTop: 3 }}>Personal Favorites</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { setTargetItem(folder); setShowFolderMenu(true); }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 18 }}>···</Text>
                  </TouchableOpacity>
                </View>
              </AnimatedCard>
            ))}
          </View>
        )}

        {isEmpty ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconBox, { backgroundColor: 'rgba(251,191,36,0.1)' }]}>
              <Text style={{ fontSize: 44 }}>⭐</Text>
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Favorites Yet</Text>
            <Text style={[styles.emptyCaption, { color: colors.textMuted }]}>
              Long-press files or folders to add them to your favorites.
            </Text>
          </View>
        ) : (
          <>
            {/* Root Favorite Folders */}
            {rootFavFolders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.groupLabel}>
                  <View style={[styles.groupLine, { backgroundColor: `${colors.border}60` }]} />
                  <Text style={[styles.groupText, { color: colors.textMuted }]}>ROOT FOLDERS</Text>
                  <View style={[styles.groupLine, { backgroundColor: `${colors.border}60` }]} />
                </View>
                {rootFavFolders.map(folder => (
                  <AnimatedCard
                    key={folder.id}
                    style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: `${colors.border}35`, borderWidth: 1 }]}
                    onLongPress={() => { setSelectionMode(true); setSelectedIds([folder.id]); }}
                    onPress={() => {
                      if (selectionMode) toggleSelection(folder.id);
                      else router.push({ pathname: '/(main)/folder/[id]', params: { id: folder.id } });
                    }}
                  >
                    <View style={styles.itemRow}>
                      {selectionMode && (
                        <View style={[styles.checkInner, { marginRight: 10, backgroundColor: selectedIds.includes(folder.id) ? colors.primary : 'transparent', borderColor: colors.primary }]}>
                          {selectedIds.includes(folder.id) && <Text style={{ color: '#FFF', fontSize: 10 }}>✓</Text>}
                        </View>
                      )}
                      <View style={[styles.itemIcon, { backgroundColor: `${colors.primary}18` }]}>
                        <Text style={{ fontSize: 20 }}>📁</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.itemName, { color: colors.text }]}>{folder.name}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>
                          Root Folder{folder.isEncrypted && folder.encryptionKeyId ? ' · 🔒 Encrypted' : ''}
                        </Text>
                      </View>
                      {!selectionMode && (
                        <TouchableOpacity
                          onPress={() => { setTargetItem(folder); setShowFolderMenu(true); }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Text style={{ color: colors.textMuted, fontSize: 18 }}>···</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </AnimatedCard>
                ))}
              </View>
            )}

            {/* Sub Favorite Folders */}
            {subFavFolders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.groupLabel}>
                  <View style={[styles.groupLine, { backgroundColor: `${colors.border}60` }]} />
                  <Text style={[styles.groupText, { color: colors.textMuted }]}>SUBFOLDERS</Text>
                  <View style={[styles.groupLine, { backgroundColor: `${colors.border}60` }]} />
                </View>
                {subFavFolders.map(folder => (
                  <AnimatedCard
                    key={folder.id}
                    style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: `${colors.border}35`, borderWidth: 1 }]}
                    onLongPress={() => { setSelectionMode(true); setSelectedIds([folder.id]); }}
                    onPress={() => {
                      if (selectionMode) toggleSelection(folder.id);
                      else router.push({ pathname: '/(main)/folder/[id]', params: { id: folder.id } });
                    }}
                  >
                    <View style={styles.itemRow}>
                      {selectionMode && (
                        <View style={[styles.checkInner, { marginRight: 10, backgroundColor: selectedIds.includes(folder.id) ? colors.primary : 'transparent', borderColor: colors.primary }]}>
                          {selectedIds.includes(folder.id) && <Text style={{ color: '#FFF', fontSize: 10 }}>✓</Text>}
                        </View>
                      )}
                      <View style={[styles.itemIcon, { backgroundColor: '#34D39918' }]}>
                        <Text style={{ fontSize: 20 }}>📁</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.itemName, { color: colors.text }]}>{folder.name}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>
                          Subfolder{folder.isEncrypted && folder.encryptionKeyId ? ' · 🔒 Encrypted' : ''}
                        </Text>
                      </View>
                      {!selectionMode && (
                        <TouchableOpacity
                          onPress={() => { setTargetItem(folder); setShowFolderMenu(true); }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Text style={{ color: colors.textMuted, fontSize: 18 }}>···</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </AnimatedCard>
                ))}
              </View>
            )}

            {/* Favorite Files */}
            {filteredFiles.length > 0 && (
              <View style={styles.section}>
                <View style={styles.groupLabel}>
                  <View style={[styles.groupLine, { backgroundColor: `${colors.border}60` }]} />
                  <Text style={[styles.groupText, { color: colors.textMuted }]}>FILES</Text>
                  <View style={[styles.groupLine, { backgroundColor: `${colors.border}60` }]} />
                </View>
                {filteredFiles.map(file => {
                  const ft = getFileType(file.mimeType, file.name);
                  const isSelected = selectedIds.includes(file.id);
                  return (
                    <AnimatedCard
                      key={file.id}
                      style={[styles.itemCard, {
                        backgroundColor: colors.surface,
                        borderColor: isSelected ? colors.primary : `${colors.border}35`,
                        borderWidth: 1,
                      }]}
                      onLongPress={() => { setSelectionMode(true); setSelectedIds([file.id]); }}
                      onPress={() => {
                        if (selectionMode) toggleSelection(file.id);
                        else handleFileNavigate(file);
                      }}
                    >
                      <View style={styles.itemRow}>
                        {selectionMode && (
                          <View style={[styles.checkInner, { marginRight: 10, backgroundColor: isSelected ? colors.primary : 'transparent', borderColor: colors.primary }]}>
                            {isSelected && <Text style={{ color: '#FFF', fontSize: 10 }}>✓</Text>}
                          </View>
                        )}
                        <View style={[styles.itemIcon, { backgroundColor: `${ft.color}15` }]}>
                          <Text style={{ fontSize: 20 }}>{ft.icon}</Text>
                          {file.isEncrypted && (
                            <View style={styles.encBadge}><Text style={{ fontSize: 8 }}>🔒</Text></View>
                          )}
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>{file.name}</Text>
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
                            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{(file.size / 1024).toFixed(1)} KB{file.isEncrypted && file.encryptionKeyId ? ' · 🔒 Encrypted' : ''}</Text>
                            <Text style={{ color: ft.color, fontSize: 12, fontWeight: '500' }}>{ft.label}</Text>
                          </View>
                        </View>
                        {!selectionMode && (
                          <TouchableOpacity
                            onPress={() => { setTargetItem(file); setShowFileMenu(true); }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Text style={{ color: colors.textMuted, fontSize: 18 }}>···</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </AnimatedCard>
                  );
                })}
              </View>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Animated Tab Bar */}
      <AnimatedTabBar />

      {/* File Menu Modal */}
      {showFileMenu && targetItem && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowFileMenu(false)}>
          <TouchableOpacity style={modalS.overlay} onPress={() => setShowFileMenu(false)} activeOpacity={1}>
            <View style={[styles.actionSheet, { backgroundColor: colors.surface }]}>
              <View style={modalS.handle} />
              <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>{targetItem.name}</Text>
              {[
                { action: 'unfavorite', label: 'Remove from Favorites', color: '#FBBF24' },
                { action: 'delete', label: 'Move to Trash', color: colors.error },
                { action: 'shred', label: 'Shred Permanently', color: colors.error },
                { action: 'register-key', label: 'Create & Assign Encryption Key', color: colors.primary },
                { action: 'assign-key', label: 'Assign Existing Encryption Key', color: colors.primary },
              ].map(item => (
                <TouchableOpacity key={item.action} style={styles.sheetItem} onPress={() => handleFileAction(targetItem, item.action)}>
                  <Text style={[styles.sheetLabel, { color: item.color }]}>{item.label}</Text>
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
          await assignFileEncryptionKey(keyPickerTarget.id, keyId);
          setKeyPickerTarget(null);
          Alert.alert('Encryption Assigned', 'The selected encryption key is now registered.');
        }}
      />

      {/* Folder Menu Modal */}
      {showFolderMenu && targetItem && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowFolderMenu(false)}>
          <TouchableOpacity style={modalS.overlay} onPress={() => setShowFolderMenu(false)} activeOpacity={1}>
            <View style={[styles.actionSheet, { backgroundColor: colors.surface }]}>
              <View style={modalS.handle} />
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{targetItem.name}</Text>
              {[
                { action: 'open', label: 'Open Folder', color: colors.text },
                { action: 'rename', label: 'Rename', color: colors.text },
                { action: 'unfavorite', label: 'Remove from Favorites', color: '#FBBF24' },
                { action: 'delete', label: 'Move to Trash', color: colors.error },
              ].map(item => (
                <TouchableOpacity key={item.action} style={styles.sheetItem} onPress={() => handleFolderAction(targetItem, item.action)}>
                  <Text style={[styles.sheetLabel, { color: item.color }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Create Personal Favorites Folder */}
      {showCreateFavFolder && (
        <Modal transparent animationType="fade">
          <View style={modalS.overlay}>
            <View style={[modalS.sheet, { backgroundColor: colors.surface }]}>
              <View style={modalS.handle} />
              <Text style={[modalS.title, { color: colors.text }]}>New Favorites Folder</Text>
              <TextInput
                style={[modalS.input, { borderColor: `${colors.border}60`, color: colors.text, backgroundColor: `${colors.border}25` }]}
                placeholder="Folder name"
                placeholderTextColor={colors.textMuted}
                value={newFavFolderName}
                onChangeText={setNewFavFolderName}
                autoFocus
              />
              <View style={modalS.btnRow}>
                <TouchableOpacity onPress={() => setShowCreateFavFolder(false)} style={[modalS.btn, { borderColor: `${colors.border}60`, borderWidth: 1 }]}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={createPersonalFolder} style={[modalS.btn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#FFF', fontWeight: '600' }}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <Modal transparent animationType="fade">
          <View style={modalS.overlay}>
            <View style={[modalS.sheet, { backgroundColor: colors.surface }]}>
              <View style={modalS.handle} />
              <Text style={[modalS.title, { color: colors.text }]}>Rename</Text>
              <TextInput
                style={[modalS.input, { borderColor: `${colors.border}60`, color: colors.text, backgroundColor: `${colors.border}25` }]}
                value={renameText}
                onChangeText={setRenameText}
                autoFocus
              />
              <View style={modalS.btnRow}>
                <TouchableOpacity onPress={() => setShowRenameModal(false)} style={[modalS.btn, { borderColor: `${colors.border}60`, borderWidth: 1 }]}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setShowRenameModal(false); }}
                  style={[modalS.btn, { backgroundColor: colors.primary }]}
                >
                  <Text style={{ color: '#FFF', fontWeight: '600' }}>Save</Text>
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
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },

  filterSection: { paddingVertical: 8 },
  filterScroll: { paddingHorizontal: 16, gap: 7 },
  filterPill: {
    paddingHorizontal: 13, paddingVertical: 7,
    borderRadius: 9, borderWidth: 1,
  },
  filterLabel: { fontSize: 12 },

  topActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  topActionsRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  countText: { fontSize: 13 },
  createFolderBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, borderWidth: 1 },
  cancelBtn: { paddingHorizontal: 8, paddingVertical: 4 },

  section: { marginBottom: 6 },
  groupLabel: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, marginTop: 4 },
  groupLine: { flex: 1, height: StyleSheet.hairlineWidth },
  groupText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },

  itemCard: { marginBottom: 7, borderRadius: 12, overflow: 'hidden' },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  checkInner: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  itemIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  itemName: { fontSize: 14, fontWeight: '600' },
  encBadge: { position: 'absolute', bottom: -3, right: -3, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: 1 },

  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 19, fontWeight: '700', marginBottom: 7 },
  emptyCaption: { textAlign: 'center', lineHeight: 20, fontSize: 13, paddingHorizontal: 32 },

  actionSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 36 },
  sheetTitle: { fontSize: 15, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 12 },
  sheetItem: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  sheetLabel: { fontSize: 14, fontWeight: '500' },
});

const modalS = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 16 },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 32 },
  title: { fontSize: 19, fontWeight: '700', marginBottom: 14 },
  input: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, fontSize: 15 },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
});
