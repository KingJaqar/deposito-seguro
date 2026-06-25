// File: src/app/(main)/search.tsx
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AnimatedCard } from '../../components/AnimatedCard';
import AnimatedTabBar from '../../components/AnimatedTabBar';
import { VaultHeader } from '../../components/VaultHeader';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useFileSystemQuery } from '../../hooks/useFileSystemQuery';

const FILTERS = [
  { label: 'All', color: '#A78BFA' },
  { label: 'Images', color: '#34D399' },
  { label: 'Videos', color: '#FF6B6B' },
  { label: 'Documents', color: '#60A5FA' },
  { label: 'Audio', color: '#FBBF24' },
  { label: 'Apps', color: '#F472B6' },
  { label: 'Other', color: '#94A3B8' },
  { label: 'Favorites', color: '#FBBF24' },
];

export default function SearchScreen() {
  const colors = useThemeColors();
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const { matchedFiles, matchedFolders } = useFileSystemQuery(undefined, query);

  const filteredFiles = matchedFiles.filter(f => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Images') return f.mimeType?.startsWith('image/');
    if (activeFilter === 'Videos') return f.mimeType?.startsWith('video/');
    if (activeFilter === 'Audio') return f.mimeType?.startsWith('audio/');
    if (activeFilter === 'Documents') return (
      !f.mimeType?.startsWith('image/') && !f.mimeType?.startsWith('video/') && !f.mimeType?.startsWith('audio/') &&
      (f.mimeType?.includes('pdf') || f.mimeType?.includes('document') || f.mimeType?.includes('text') || f.mimeType?.includes('sheet'))
    );
    if (activeFilter === 'Apps') return (
      f.name?.endsWith('.apk') || f.name?.endsWith('.exe') || f.name?.endsWith('.dmg') ||
      f.mimeType === 'application/vnd.android.package-archive' || f.mimeType === 'application/x-msdownload'
    );
    if (activeFilter === 'Favorites') return f.isFavorite;
    if (activeFilter === 'Other') return (
      !f.mimeType?.startsWith('image/') && !f.mimeType?.startsWith('video/') && !f.mimeType?.startsWith('audio/') &&
      !f.mimeType?.includes('pdf') && !f.mimeType?.includes('document') && !f.mimeType?.includes('text') && !f.mimeType?.includes('sheet') &&
      !f.name?.endsWith('.apk') && !f.name?.endsWith('.exe') && !f.name?.endsWith('.dmg')
    );
    return true;
  });

  const getFileType = (mimeType: string, name: string) => {
    if (mimeType?.startsWith('image/')) return { label: 'Image', color: '#A78BFA', icon: '🖼' };
    if (mimeType?.startsWith('video/')) return { label: 'Video', color: '#FF6B6B', icon: '▶' };
    if (mimeType?.startsWith('audio/')) return { label: 'Audio', color: '#FBBF24', icon: '♪' };
    if (name?.endsWith('.apk') || name?.endsWith('.exe')) return { label: 'App', color: '#F472B6', icon: '📱' };
    return { label: 'File', color: '#60A5FA', icon: '📄' };
  };

  const totalResults = matchedFolders.length + filteredFiles.length;
  const showResults = query.trim().length > 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Search" showBack />

      {/* Search Bar */}
      <View style={styles.searchWrapper}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: `${colors.border}45` }]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search files & folders..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: 15 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Pills — same style as dashboard type grid */}
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
                    borderColor: isActive ? f.color : `${f.color}25`,
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

      <ScrollView contentContainerStyle={styles.results} showsVerticalScrollIndicator={false}>
        {!showResults ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconBox, { backgroundColor: `${colors.primary}12` }]}>
              <Text style={{ fontSize: 44 }}>🔍</Text>
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Search Your Vault</Text>
            <Text style={[styles.emptyCaption, { color: colors.textMuted }]}>
              Type a file name or keyword to find files and folders.
            </Text>
          </View>
        ) : (
          <>
            {totalResults > 0 && (
              <View style={styles.resultSummary}>
                <Text style={[{ color: colors.textMuted, fontSize: 13 }]}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>{totalResults}</Text>{' '}
                  {totalResults === 1 ? 'result' : 'results'}
                </Text>
              </View>
            )}

            {matchedFolders.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Folders</Text>
                {matchedFolders.map(folder => (
                  <AnimatedCard
                    key={folder.id}
                    onPress={() => router.push({ pathname: '/(main)/folder/[id]', params: { id: folder.id } })}
                    style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: `${colors.border}35` }]}
                  >
                    <View style={styles.resultContent}>
                      <View style={[styles.resultIcon, { backgroundColor: `${colors.primary}15` }]}>
                        <Text style={{ fontSize: 20 }}>📁</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.resultName, { color: colors.text }]}>{folder.name}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>
                          {new Date(folder.createdAt).toLocaleDateString()}
                          {folder.isEncrypted && folder.encryptionKeyId ? ' · 🔒 Encrypted' : ''}
                        </Text>
                      </View>
                    </View>
                  </AnimatedCard>
                ))}
              </>
            )}

            {filteredFiles.length > 0 && (
              <>
                {matchedFolders.length > 0 && <View style={{ height: 14 }} />}
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Files</Text>
                {filteredFiles.map(file => {
                  const ft = getFileType(file.mimeType, file.name);
                  return (
                    <AnimatedCard
                      key={file.id}
                      onPress={() => {
                        if (file.mimeType?.startsWith('image/')) {
                          router.push({ pathname: '/(main)/viewer/image', params: { fileId: file.id } });
                        }
                      }}
                      style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: `${colors.border}35` }]}
                    >
                      <View style={styles.resultContent}>
                        <View style={[styles.resultIcon, { backgroundColor: `${ft.color}15` }]}>
                          <Text style={{ fontSize: 20 }}>{ft.icon}</Text>
                          {file.isEncrypted && (
                            <View style={styles.encBadge}><Text style={{ fontSize: 8 }}>🔒</Text></View>
                          )}
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>
                            {file.name}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                              {(file.size / 1024).toFixed(1)} KB{file.isEncrypted && file.encryptionKeyId ? ' · 🔒 Encrypted' : ''}
                            </Text>
                            <Text style={{ color: ft.color, fontSize: 12, fontWeight: '500' }}>{ft.label}</Text>
                            {file.isFavorite && <Text style={{ color: '#FBBF24', fontSize: 12 }}>⭐</Text>}
                          </View>
                        </View>
                      </View>
                    </AnimatedCard>
                  );
                })}
              </>
            )}

            {totalResults === 0 && (
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 38, marginBottom: 10, opacity: 0.3 }}>🔍</Text>
                <Text style={[{ fontSize: 16, fontWeight: '700', color: colors.text }]}>No results found</Text>
                <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 6, fontSize: 13 }}>
                  Try a different search term
                </Text>
              </View>
            )}
          </>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      <AnimatedTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  searchWrapper: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1,
  },
  searchIcon: { fontSize: 15, marginRight: 10 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500', padding: 0 },

  filterSection: { paddingBottom: 8 },
  filterScroll: { paddingHorizontal: 16, gap: 7 },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1,
  },
  filterLabel: { fontSize: 12 },

  results: { paddingHorizontal: 16 },
  resultSummary: { paddingVertical: 8 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8, marginTop: 2 },

  resultCard: { marginBottom: 7, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  resultContent: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  resultIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  resultName: { fontSize: 14, fontWeight: '600' },
  encBadge: { position: 'absolute', bottom: -3, right: -3, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: 1 },

  emptyState: { alignItems: 'center', paddingTop: 72 },
  emptyIconBox: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 19, fontWeight: '700', marginBottom: 7 },
  emptyCaption: { textAlign: 'center', lineHeight: 20, fontSize: 13, paddingHorizontal: 32 },
});
