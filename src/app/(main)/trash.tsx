import { FlatList, Platform, StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';
import { AnimatedCard } from '../../components/AnimatedCard';
import { VaultHeader } from '../../components/VaultHeader';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useVaultStore } from '../../store/vaultStore';

export default function TrashScreen() {
  const colors = useThemeColors();
  const { files, restoreFileFromTrash, permanentlyDeleteFile } = useVaultStore();

  const trashedFiles = files.filter(f => f.isTrash);

  const handleShred = (id: string) => {
    permanentlyDeleteFile(id);
  };

  const handlePermanentPurge = (id: string, name: string) => {
    if (Platform.OS === 'web') {
      if (confirm(`Shred "${name}"? This permanently deletes the file.`)) {
        handleShred(id);
      }
    } else {
      Alert.alert(
        'Irreversible Destruction',
        `Are you completely sure you want to shred "${name}"? This permanently unlinks the physical sandbox blocks.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Shred File', 
            style: 'destructive', 
            onPress: () => handleShred(id)
          }
        ]
      );
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Isolated Trash Bin" showBack />
      
      <FlatList
        data={trashedFiles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <AnimatedCard style={styles.trashCard}>
            <View style={styles.textColumn}>
              <Text style={[styles.fileName, { color: colors.text }]}>{item.name}</Text>
              <Text style={{ color: colors.error, fontSize: 12 }}>Marked for complete filesystem destruction</Text>
            </View>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface }]} onPress={() => restoreFileFromTrash(item.id)}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Restore</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.error }]} onPress={() => handlePermanentPurge(item.id, item.name)}>
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Shred</Text>
              </TouchableOpacity>
            </View>
          </AnimatedCard>
        )}
        ListEmptyComponent={
          <Text style={[styles.emptyState, { color: colors.textMuted }]}>Retention queue empty. No files flagged for deletion.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  trashCard: { padding: 12 },
  textColumn: { marginBottom: 12 },
  fileName: { fontSize: 16, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, marginLeft: 10 },
  emptyState: { textAlign: 'center', marginTop: 60, paddingHorizontal: 32 }
});