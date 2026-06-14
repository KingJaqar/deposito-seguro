import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal } from 'react-native';
import { AnimatedCard } from '../../components/AnimatedCard';
import { StyledButton } from '../../components/StyledButton';
import { VaultHeader } from '../../components/VaultHeader';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useVaultStore } from '../../store/vaultStore';

export default function DashboardScreen() {
  const colors = useThemeColors();
  const { folders, files, createFolder, hydrateVault } = useVaultStore();
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  
  useEffect(() => {
    hydrateVault();
  }, []);
  
  const totalBytes = files.filter(f => !f.isTrash).reduce((sum, f) => sum + f.size, 0);
  const formattedSize = (totalBytes / (1024 * 1024)).toFixed(2);

  const handleDirectoryProvisioning = () => {
    if (Platform.OS === 'web') {
      const name = window.prompt('Specify structural identity partition tag:');
      if (name && name.trim()) {
        createFolder(name.trim(), colors.primary, 'folder', false);
      }
    } else {
      setShowFolderModal(true);
    }
  };

  const confirmFolderCreation = () => {
    if (folderName.trim()) {
      createFolder(folderName.trim(), colors.primary, 'folder', false);
    }
    setShowFolderModal(false);
    setFolderName('');
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Storage Vault Console" />
      
      <ScrollView contentContainerStyle={styles.scrollBody}>
        <AnimatedCard style={styles.metricsBox}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>SECURE LOCAL BOUND FOOTPRINT</Text>
          <Text style={[styles.metaVal, { color: colors.primary }]}>{formattedSize} MB</Text>
          <View style={styles.metricsRow}>
            <Text style={[styles.metricText, { color: colors.text }]}>Active Directories: {folders.length}</Text>
            <Text style={[styles.metricText, { color: colors.text }]}>Indexed Blobs: {files.filter(f => !f.isTrash).length}</Text>
          </View>
        </AnimatedCard>

        <View style={styles.utilityBar}>
          <TouchableOpacity style={[styles.actionChip, { backgroundColor: colors.surface }]} onPress={() => router.push('/(main)/search')}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>🔍 Search Index</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionChip, { backgroundColor: colors.surface }]} onPress={() => router.push('/(main)/trash')}>
            <Text style={{ color: colors.error, fontWeight: '600' }}>🗑️ Trash Bin</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionChip, { backgroundColor: colors.surface }]} onPress={() => router.push('/(main)/settings')}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>⚙️ Settings</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>FileSystem Containers</Text>
          <TouchableOpacity onPress={handleDirectoryProvisioning}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>+ New Allocation</Text>
          </TouchableOpacity>
        </View>

        {folders.length === 0 ? (
          <View style={styles.emptyView}>
            <Text style={{ color: colors.textMuted }}>No virtual hardware storage matrices partition maps mapped.</Text>
          </View>
        ) : (
          <FlatList
            data={folders}
            scrollEnabled={false}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <AnimatedCard 
                style={styles.folderCard}
                onPress={() => router.push({ pathname: '/(main)/folder/[id]', params: { id: item.id } })}
              >
                <View style={styles.folderRow}>
                  <Text style={styles.folderIcon}>📁</Text>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.folderName, { color: colors.text }]}>{item.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      Created {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textMuted }}>➔</Text>
                </View>
              </AnimatedCard>
            )}
          />
        )}
      </ScrollView>

      <Modal
        visible={showFolderModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFolderModal(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.modal, { backgroundColor: colors.surface }]}>
            <Text style={[modalStyles.title, { color: colors.text }]}>Allocate Folder Node</Text>
            <TextInput
              style={[modalStyles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="Folder name"
              placeholderTextColor={colors.textMuted}
              value={folderName}
              onChangeText={setFolderName}
              autoFocus
            />
            <View style={modalStyles.actions}>
              <TouchableOpacity onPress={() => setShowFolderModal(false)}>
                <Text style={{ color: colors.textMuted }}>Cancel</Text>
              </TouchableOpacity>
              <StyledButton title="Provision" onPress={confirmFolderCreation} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollBody: { padding: 16 },
  metricsBox: { padding: 20 },
  metaLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  metaVal: { fontSize: 36, fontWeight: '900', marginVertical: 6 },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  metricText: { fontSize: 13, fontWeight: '600' },
  utilityBar: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 16 },
  actionChip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, flex: 1, alignItems: 'center', marginHorizontal: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  emptyView: { padding: 40, alignItems: 'center' },
  folderCard: { marginVertical: 4 },
  folderRow: { flexDirection: 'row', alignItems: 'center' },
  folderIcon: { fontSize: 28 },
  folderName: { fontSize: 16, fontWeight: '700' }
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { width: '80%', padding: 20, borderRadius: 12 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 16 },
  actions: { flexDirection: 'row', justifyContent: 'space-between' }
});