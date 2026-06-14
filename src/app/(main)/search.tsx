import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AnimatedCard } from '../../components/AnimatedCard';
import { VaultHeader } from '../../components/VaultHeader';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useFileSystemQuery } from '../../hooks/useFileSystemQuery';

export default function SearchScreen() {
  const colors = useThemeColors();
  const [query, setQuery] = useState('');
  const { matchedFiles, matchedFolders } = useFileSystemQuery(undefined, query);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Global Search" showBack />
      
      <View style={styles.searchBoxWrapper}>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="Query encrypted file or folder names..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
      </View>

      <ScrollView contentContainerStyle={styles.resultsContainer}>
        {query.trim().length === 0 ? (
          <Text style={[styles.hint, { color: colors.textMuted }]}>Type an item name to perform real-time offline sandbox mapping.</Text>
        ) : (
          <>
            {matchedFolders.length > 0 && (
              <View>
                <Text style={[styles.heading, { color: colors.text }]}>Folders Found ({matchedFolders.length})</Text>
                {matchedFolders.map(folder => (
                  <AnimatedCard 
                    key={folder.id} 
                    onPress={() => router.push({ pathname: '/(main)/folder/[id]', params: { id: folder.id } })}
                    style={styles.matchRow}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>📁 {folder.name}</Text>
                  </AnimatedCard>
                ))}
              </View>
            )}

            {matchedFiles.length > 0 && (
              <View style={{ marginTop: 20 }}>
                <Text style={[styles.heading, { color: colors.text }]}>Files Found ({matchedFiles.length})</Text>
                {matchedFiles.map(file => (
                  <AnimatedCard 
                    key={file.id} 
                    onPress={() => {
                      if (file.mimeType.startsWith('image/')) {
                        router.push({ pathname: '/(main)/viewer/image', params: { fileId: file.id } });
                      }
                    }}
                    style={styles.matchRow}
                  >
                    <Text style={{ color: colors.text }}>📄 {file.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>Mime: {file.mimeType}</Text>
                  </AnimatedCard>
                ))}
              </View>
            )}

            {matchedFolders.length === 0 && matchedFiles.length === 0 && (
              <Text style={[styles.hint, { color: colors.textMuted }]}>No records match the requested signature term.</Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchBoxWrapper: { padding: 16 },
  input: { height: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, fontSize: 15 },
  resultsContainer: { padding: 16 },
  hint: { textAlign: 'center', marginTop: 40, fontSize: 14, paddingHorizontal: 24 },
  heading: { fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
  matchRow: { marginVertical: 4 }
});