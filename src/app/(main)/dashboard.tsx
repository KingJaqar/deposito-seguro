// File: src/app/(main)/dashboard.tsx
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { AnimatedCard } from '../../components/AnimatedCard';
import AnimatedTabBar from '../../components/AnimatedTabBar';
import { EncryptionKeyPicker } from '../../components/EncryptionKeyPicker';
import { VaultHeader } from '../../components/VaultHeader';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';
import { promptCreateEncryptionKey } from '../../utils/encryptionKeyPrompt';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DashboardScreen() {
  const colors = useThemeColors();
  const {
    folders, files,
    createFolder, hydrateVault, renameFolder, moveFolder,
    deleteFolder, shredFolder,
    shredMultipleFolders, exportFolderFiles, toggleFavorite,
    assignFolderEncryptionKey,
  } = useVaultStore();
  const { encryptionKeys, createEncryptionKey, encryptionKeyExists } = useSettingsStore();

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

  // Scroll tracking for header animation
  const scrollY = useSharedValue(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  useEffect(() => { hydrateVault(); }, [hydrateVault]);

  const activeFiles = files.filter(f => !f.isTrash);
  const totalBytes = activeFiles.reduce((sum, f) => sum + f.size, 0);
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

  const imageCount = activeFiles.filter(f => f.mimeType?.startsWith('image/')).length;
  const videoCount = activeFiles.filter(f => f.mimeType?.startsWith('video/')).length;
  const audioCount = activeFiles.filter(f => f.mimeType?.startsWith('audio/')).length;
  const appCount = activeFiles.filter(f =>
    f.mimeType === 'application/vnd.android.package-archive' ||
    f.mimeType === 'application/x-msdownload' ||
    f.name?.endsWith('.apk') || f.name?.endsWith('.exe') || f.name?.endsWith('.dmg')
  ).length;
  const docCount = activeFiles.filter(f =>
    !f.mimeType?.startsWith('image/') &&
    !f.mimeType?.startsWith('video/') &&
    !f.mimeType?.startsWith('audio/') &&
    !f.name?.endsWith('.apk') && !f.name?.endsWith('.exe') && !f.name?.endsWith('.dmg') &&
    (f.mimeType?.includes('pdf') || f.mimeType?.includes('document') || f.mimeType?.includes('text') || f.mimeType?.includes('sheet'))
  ).length;
  const otherCount = activeFiles.length - imageCount - videoCount - audioCount - appCount - docCount;

  const rootFolders = folders.filter(f => !f.parentId);
  const subFolders = folders.filter(f => !!f.parentId);

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
        exportFolderFiles(folder.id).then(paths => { if (paths.length > 0) alert(`Exported ${paths.length} files`); }); break;
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
        toggleFavorite && toggleFavorite(folder.id);
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

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolderIds(prev => prev.includes(folderId) ? prev.filter(id => id !== folderId) : [...prev, folderId]);
  };

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

  const FolderRow = ({ item, index }: { item: any; index: number }) => {
    const folderFileCount = files.filter(f => f.folderId === item.id && !f.isTrash).length;
    const isSelected = selectedFolderIds.includes(item.id);
    const isFav = item.isFavorite;

    return (
      <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
        <AnimatedCard
          style={[styles.folderCard, {
            backgroundColor: colors.surfaceElevated,
            borderColor: isSelected ? colors.primary : 'transparent',
            borderWidth: isSelected ? 2 : 0,
          }]}
          onLongPress={() => { setSelectionMode(true); setSelectedFolderIds([item.id]); }}
          onPress={() => {
            if (selectionMode) toggleFolderSelection(item.id);
            else router.push({ pathname: '/(main)/folder/[id]', params: { id: item.id } });
          }}
        >
          <View style={styles.folderCardContent}>
            {selectionMode && (
              <View style={styles.checkBox}>
                <View style={[styles.checkInner, { backgroundColor: isSelected ? colors.primary : 'transparent', borderColor: colors.primary }]}>
                  {isSelected && <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>✓</Text>}
                </View>
              </View>
            )}
            <View style={[styles.folderIconWrap, { backgroundColor: `${colors.primary}18` }]}>
              <Text style={{ fontSize: 22 }}>📁</Text>
              {isFav && <View style={styles.favBadge}><Text style={{ fontSize: 8 }}>⭐</Text></View>}
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={[styles.folderName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>
                {folderFileCount} {folderFileCount === 1 ? 'file' : 'files'}
                {item.isEncrypted && item.encryptionKeyId ? ' · 🔒' : ''}
              </Text>
            </View>
            {!selectionMode && (
              <TouchableOpacity
                style={styles.moreBtn}
                onPress={() => { setTargetFolder(item); setShowFolderMenu(true); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 20 }}>···</Text>
              </TouchableOpacity>
            )}
          </View>
        </AnimatedCard>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Storage Vault" scrollY={scrollY} />

      <Animated.ScrollView
        ref={scrollViewRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        {/* Premium Stats Cards */}
        <View style={styles.statsRow}>
          <AnimatedCard delay={0} style={[styles.statCard, { backgroundColor: colors.surfaceElevated }]}>
            <View style={styles.statContent}>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Folders</Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>{folders.length}</Text>
            </View>
          </AnimatedCard>
          <AnimatedCard delay={50} style={[styles.statCard, { backgroundColor: colors.surfaceElevated }]}>
            <View style={styles.statContent}>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Storage</Text>
              <Text style={[styles.statValue, { color: colors.success }]}>{totalMB} MB</Text>
            </View>
          </AnimatedCard>
          <AnimatedCard delay={100} style={[styles.statCard, { backgroundColor: colors.surfaceElevated }]}>
            <View style={styles.statContent}>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Files</Text>
              <Text style={[styles.statValue, { color: colors.accent }]}>{activeFiles.length}</Text>
            </View>
          </AnimatedCard>
        </View>

        {/* File Types Grid */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>File Types</Text>
          </View>
          <View style={styles.typeGrid}>
            {[
              { label: 'Images', count: imageCount, color: '#A78BFA', icon: '🖼' },
              { label: 'Videos', count: videoCount, color: '#FF6B6B', icon: '🎬' },
              { label: 'Docs', count: docCount, color: '#34D399', icon: '📄' },
              { label: 'Audio', count: audioCount, color: '#FBBF24', icon: '🎵' },
              { label: 'Apps', count: appCount, color: '#60A5FA', icon: '📱' },
              { label: 'Other', count: otherCount, color: '#F472B6', icon: '📦' },
            ].map((item, i) => (
              <AnimatedCard key={i} delay={150 + i * 30} style={[styles.typeCard, { backgroundColor: `${item.color}08` }]}>
                <TouchableOpacity
                  onPress={() => router.push('/(main)/search')}
                  activeOpacity={0.7}
                  style={styles.typeCardContent}
                >
                  <Text style={{ fontSize: 24, marginBottom: 4 }}>{item.icon}</Text>
                  <Text style={[styles.typeLabel, { color: item.color }]}>{item.label}</Text>
                  <Text style={[styles.typeCount, { color: colors.text }]}>{item.count}</Text>
                </TouchableOpacity>
              </AnimatedCard>
            ))}
          </View>
        </View>

        {/* Vaults Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Vaults</Text>
            <View style={styles.sectionActions}>
              {selectionMode ? (
                <>
                  <TouchableOpacity onPress={handleSelectAllFolders} style={styles.textBtn}>
                    <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
                      {selectedFolderIds.length === folders.length ? 'Deselect All' : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                  {selectedFolderIds.length > 0 && (
                    <TouchableOpacity onPress={handleBulkShredFolders} style={styles.textBtnDanger}>
                      <Text style={{ color: '#FF3B30', fontSize: 13, fontWeight: '600' }}>Shred</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={exitSelectionMode} style={styles.cancelBtn}>
                    <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity onPress={handleDirectoryProvisioning} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#FFF', fontSize: 20, fontWeight: '300' }}>+</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {folders.length === 0 ? (
            <AnimatedCard style={styles.emptyCard}>
              <View style={styles.emptyBlock}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>🏦</Text>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Vaults Yet</Text>
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>Create your first secure vault to get started</Text>
                <TouchableOpacity onPress={handleDirectoryProvisioning} style={[styles.emptyBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 14 }}>Create First Vault</Text>
                </TouchableOpacity>
              </View>
            </AnimatedCard>
          ) : (
            <>
              {/* Root Folders */}
              {rootFolders.length > 0 && (
                <>
                  <View style={styles.groupLabel}>
                    <View style={[styles.groupLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.groupText, { color: colors.textMuted }]}>ROOT</Text>
                    <View style={[styles.groupLine, { backgroundColor: colors.border }]} />
                  </View>
                  {rootFolders.map((item, index) => <FolderRow key={item.id} item={item} index={index} />)}
                </>
              )}

              {/* Sub Folders */}
              {subFolders.length > 0 && (
                <>
                  <View style={styles.groupLabel}>
                    <View style={[styles.groupLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.groupText, { color: colors.textMuted }]}>SUBFOLDERS</Text>
                    <View style={[styles.groupLine, { backgroundColor: colors.border }]} />
                  </View>
                  {subFolders.map((item, index) => <FolderRow key={item.id} item={item} index={rootFolders.length + index} />)}
                </>
              )}
            </>
          )}
        </View>

        <View style={{ height: 120 }} />
      </Animated.ScrollView>

      {/* Animated Tab Bar */}
      <AnimatedTabBar />

      {/* ── Modals ── */}
      <Modal visible={showFolderModal} transparent animationType="fade" onRequestClose={() => setShowFolderModal(false)}>
        <View style={modalS.overlay}>
          <Animated.View entering={FadeInDown.duration(300)} style={[modalS.sheet, { backgroundColor: colors.surfaceElevated }]}>
            <View style={modalS.handle} />
            <Text style={[modalS.title, { color: colors.text }]}>New Vault</Text>
            <TextInput
              style={[modalS.input, { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}15` }]}
              placeholder="Vault name"
              placeholderTextColor={colors.textMuted}
              value={folderName}
              onChangeText={setFolderName}
              autoFocus
            />
            <View style={modalS.btnRow}>
              <TouchableOpacity onPress={() => setShowFolderModal(false)} style={[modalS.btn, { borderColor: colors.border, borderWidth: 1 }]}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmFolderCreation} style={[modalS.btn, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#FFF', fontWeight: '600' }}>Create</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {showFolderMenu && targetFolder && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowFolderMenu(false)}>
          <TouchableOpacity style={modalS.overlay} onPress={() => setShowFolderMenu(false)} activeOpacity={1}>
            <Animated.View entering={FadeInDown.duration(300)} style={[styles.actionSheet, { backgroundColor: colors.surfaceElevated }]}>
              <View style={modalS.handle} />
              <Text style={[styles.actionSheetTitle, { color: colors.text }]}>{targetFolder.name}</Text>
              {[
                { action: 'rename', label: 'Rename', color: colors.text },
                { action: 'move', label: 'Move', color: colors.text },
                { action: 'export', label: 'Export', color: colors.text },
                { action: 'register-key', label: 'Create & Assign Key', color: colors.primary },
                { action: 'assign-key', label: 'Assign Existing Key', color: colors.primary },
                { action: 'favorite', label: targetFolder.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: '#FBBF24' },
                { action: 'add-to-fav-folder', label: 'Add to Favorites Folder', color: '#FBBF24' },
                { action: 'delete', label: 'Move to Trash', color: colors.error },
                { action: 'shred', label: 'Shred Permanently', color: colors.error },
              ].map(item => (
                <TouchableOpacity key={item.action} style={styles.actionSheetItem} onPress={() => handleFolderAction(targetFolder, item.action)}>
                  <Text style={[styles.actionSheetLabel, { color: item.color }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
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
            <Animated.View entering={FadeInDown.duration(300)} style={[modalS.sheet, { backgroundColor: colors.surfaceElevated }]}>
              <View style={modalS.handle} />
              <Text style={[modalS.title, { color: colors.text }]}>Rename Vault</Text>
              <TextInput
                style={[modalS.input, { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}15` }]}
                value={renameText}
                onChangeText={setRenameText}
                autoFocus
              />
              <View style={modalS.btnRow}>
                <TouchableOpacity onPress={() => setShowRenameModal(false)} style={[modalS.btn, { borderColor: colors.border, borderWidth: 1 }]}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmRename} style={[modalS.btn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#FFF', fontWeight: '600' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}

      {showMoveModal && (
        <Modal transparent animationType="fade">
          <View style={modalS.overlay}>
            <Animated.View entering={FadeInDown.duration(300)} style={[modalS.sheet, { backgroundColor: colors.surfaceElevated }]}>
              <View style={modalS.handle} />
              <Text style={[modalS.title, { color: colors.text }]}>Move Vault</Text>
              {folders.filter(f => f.id !== targetFolder?.id).map(f => (
                <TouchableOpacity key={f.id} style={styles.actionSheetItem} onPress={() => confirmMove(f.id)}>
                  <Text style={[styles.actionSheetLabel, { color: colors.text }]}>📁  {f.name}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollBody: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },

  // Stats Row
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24, marginTop: 8 },
  statCard: { flex: 1, borderRadius: 20, overflow: 'hidden' },
  statContent: { padding: 16, alignItems: 'center' },
  statLabel: { fontSize: 11, fontWeight: '500', marginBottom: 6, letterSpacing: 0.5 },
  statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },

  // Sections
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  sectionActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  addBtn: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  textBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  textBtnDanger: { paddingHorizontal: 8, paddingVertical: 4 },
  cancelBtn: { paddingHorizontal: 8, paddingVertical: 4 },

  // File Types Grid
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeCard: { width: (SCREEN_WIDTH - 56) / 3, borderRadius: 18, overflow: 'hidden' },
  typeCardContent: { padding: 14, alignItems: 'center' },
  typeLabel: { fontSize: 11, fontWeight: '600', marginBottom: 2, letterSpacing: 0.3 },
  typeCount: { fontSize: 16, fontWeight: '700' },

  // Group Labels
  groupLabel: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10, marginTop: 4 },
  groupLine: { flex: 1, height: StyleSheet.hairlineWidth },
  groupText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },

  // Folder Cards
  folderCard: { marginBottom: 8, borderRadius: 18, overflow: 'hidden' },
  folderCardContent: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  checkBox: { marginRight: 10 },
  checkInner: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  folderIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  favBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: 2 },
  folderName: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  moreBtn: { paddingHorizontal: 8, paddingVertical: 4 },

  // Empty State
  emptyCard: { borderRadius: 20, overflow: 'hidden' },
  emptyBlock: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 8 },

  // Action Sheet
  actionSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: 36 },
  actionSheetTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 12, marginBottom: 4 },
  actionSheetItem: { paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.04)' },
  actionSheetLabel: { fontSize: 15, fontWeight: '500' },
});

const modalS = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16, letterSpacing: -0.3 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16, fontSize: 15 },
  btnRow: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
});