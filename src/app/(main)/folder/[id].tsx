import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AnimatedCard } from '../../../components/AnimatedCard';
import { StyledButton } from '../../../components/StyledButton';
import { VaultHeader } from '../../../components/VaultHeader';
import { useThemeColors } from '../../../contexts/ThemeContext';
import { StorageService } from '../../../services/storage';
import { useFileSystemQuery } from '../../../hooks/useFileSystemQuery';
import { useVaultStore } from '../../../store/vaultStore';

export default function FolderDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useThemeColors();
  const { folders, importFile, deleteFolder, softDeleteFile } = useVaultStore();
  const { matchedFiles } = useFileSystemQuery(id);

  const folderRecord = folders.find(f => f.id === id);

const executeImportPayload = async () => {
    if (!id) return;
    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({ 
        copyToCacheDirectory: false, 
        type: '*/*' 
      });
      if (pickerResult.canceled || !pickerResult.assets) return;

      const asset = pickerResult.assets[0];
      
      if (Platform.OS === 'web') {
        await StorageService.storeWebFile(asset.uri, `${Date.now()}_${asset.name}`);
        await importFile(
          asset.uri,
          id,
          asset.name,
          asset.mimeType || 'application/octet-stream',
          asset.size || 0,
          false
        );
      } else {
        await importFile(
          asset.uri,
          id,
          asset.name,
          asset.mimeType || 'application/octet-stream',
          asset.size || 0,
          folderRecord?.isEncrypted || false
        );
      }
      Alert.alert('Import Success', 'File compiled and secured into system workspace.');
    } catch (e) {
      console.error(e);
      Alert.alert('Processing Failure', 'Could not index selected payload.');
    }
  };

  if (!folderRecord) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.text }}>Directory node missing or destroyed.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title={folderRecord.name} showBack />
      
      <View style={styles.actionStrip}>
        <StyledButton title="+ Import File" onPress={executeImportPayload} />
        <StyledButton title="Purge Folder Container" variant="danger" onPress={() => { if (id) deleteFolder(id); router.back(); }} />
      </View>

      <FlatList
        data={matchedFiles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <AnimatedCard 
            style={styles.fileCard}
onPress={() => {
               if (item.mimeType.startsWith('image/')) {
                 router.push({ pathname: '/(main)/viewer/image', params: { fileId: item.id } });
               } else if (item.mimeType.startsWith('video/')) {
                 router.push({ pathname: '/(main)/viewer/video', params: { fileId: item.id } });
               } else {
                 router.push({ pathname: '/(main)/viewer/document', params: { fileId: item.id } });
               }
             }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fileName, { color: colors.text }]}>{item.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Size: {(item.size / 1024).toFixed(1)} KB | Encrypted: {item.isEncrypted ? 'TRUE' : 'FALSE'}
                </Text>
              </View>
              <TouchableOpacity style={styles.deleteFileIcon} onPress={() => softDeleteFile(item.id)}>
                <Text style={{ color: colors.error, fontSize: 18 }}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </AnimatedCard>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>No files nested in this configuration node.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  actionStrip: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 16, marginVertical: 8 },
  fileCard: { marginVertical: 4 },
  fileName: { fontSize: 15, fontWeight: '600', paddingRight: 8 },
  deleteFileIcon: { padding: 4 },
  empty: { textAlign: 'center', marginTop: 40 }
});