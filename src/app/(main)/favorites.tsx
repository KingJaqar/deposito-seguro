import { router } from 'expo-router';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AnimatedCard } from '../../components/AnimatedCard';
import { VaultHeader } from '../../components/VaultHeader';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useVaultStore } from '../../store/vaultStore';

export default function FavoritesScreen() {
  const colors = useThemeColors();
  const { files, toggleFavorite, softDeleteFile } = useVaultStore();

  // Filter local store to render only non-trashed items marked as favorites
  const favoriteFiles = files.filter(file => file.isFavorite && !file.isTrash);

  const handleFileNavigation = (file: typeof files[0]) => {
    if (file.mimeType.startsWith('image/')) {
      router.push({ pathname: '/(main)/viewer/image', params: { fileId: file.id } });
    } else if (file.mimeType.startsWith('video/')) {
      router.push({ pathname: '/(main)/viewer/video', params: { fileId: file.id } });
    } else {
      router.push({ pathname: '/(main)/viewer/document', params: { fileId: file.id } });
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Favorite Blueprints" showBack />

      <FlatList
        data={favoriteFiles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item }) => (
          <AnimatedCard 
            style={styles.fileCard}
            onPress={() => handleFileNavigation(item)}
          >
            <View style={styles.cardContent}>
              <View style={styles.metaColumn}>
                <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                  ⭐ {item.name}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  Size: {(item.size / 1024).toFixed(1)} KB | Type: {item.mimeType.split('/')[0]}
                </Text>
              </View>

              <View style={styles.actionRow}>
                {/* Remove from Favorites Button */}
                <TouchableOpacity 
                  style={[styles.iconButton, { backgroundColor: colors.surface }]} 
                  onPress={() => toggleFavorite(item.id)}
                >
                  <Text style={{ fontSize: 16 }}>💔</Text>
                </TouchableOpacity>

                {/* Direct Trash Bin Shredding Route */}
                <TouchableOpacity 
                  style={[styles.iconButton, { backgroundColor: colors.surface }]} 
                  onPress={() => {
                    softDeleteFile(item.id);
                    Alert.alert('Moved to Trash', 'File shortcut removed from favorites and sent to retention.');
                  }}
                >
                  <Text style={{ fontSize: 16 }}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          </AnimatedCard>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyIcon, { color: colors.textMuted }]}>⭐</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No items pinned. Long-press files inside your isolated directory nodes to flag fast-access shortcuts here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContainer: { padding: 16 },
  fileCard: { marginVertical: 6, padding: 14 },
  cardContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaColumn: { flex: 1, paddingRight: 12 },
  fileName: { fontSize: 15, fontWeight: '700' },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 100, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16, opacity: 0.4 },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 22 }
});