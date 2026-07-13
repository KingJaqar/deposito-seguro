// file: src/app/(main)/viewer/document.tsx

import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { VaultHeader } from '../../../components/VaultHeader';
import { useTheme } from '../../../contexts/ThemeContext';
import { Durations } from '../../../constants/animations';
import { StorageService } from '../../../services/storage';
import { useSettingsStore } from '../../../store/settingsStore';
import { useVaultStore } from '../../../store/vaultStore';
import { EncryptionKeyMetadata } from '../../../types';

export default function DocumentViewerScreen() {
  const { fileId } = useLocalSearchParams<{ fileId: string }>();
  const { colors, screenPadding, isTablet, isDark } = useTheme();
  const { files } = useVaultStore();
  const encryptionKeys = useSettingsStore(
    (state: { encryptionKeys: EncryptionKeyMetadata[] }) => state.encryptionKeys
  );

  const [decryptedUri, setDecryptedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const decryptedUriRef = useRef<string | null>(null);

  const fileMeta = files.find(f => f.id === fileId);

  const screenOpacity = useSharedValue(1);
  const screenTranslateY = useSharedValue(0);

  useFocusEffect(() => {
    screenOpacity.value = 1;
    screenTranslateY.value = 0;

    return () => {
      screenOpacity.value = withTiming(0, {
        duration: Durations.fast,
        easing: Easing.in(Easing.quad),
      });
      screenTranslateY.value = withTiming(-8, {
        duration: Durations.fast,
        easing: Easing.in(Easing.quad),
      });
    };
  });

  const screenAnimatedStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
    transform: [{ translateY: screenTranslateY.value }],
  }));

  useEffect(() => {
    let mounted = true;
    decryptedUriRef.current = null;

    const loadFile = async () => {
      if (!fileMeta) return;
      try {
        let outPath = fileMeta.localPath;
        if (fileMeta.isEncrypted && fileMeta.encryptionKeyId) {
          const encryptionKey = encryptionKeys.find(
            k => k.id === fileMeta.encryptionKeyId
          )?.key;
          outPath = await StorageService.decryptSandboxFile(fileMeta.localPath, encryptionKey);
          decryptedUriRef.current = outPath;
        }

        if (fileMeta.mimeType.startsWith('text/')) {
          try {
            const content = await FileSystem.readAsStringAsync(outPath, {
              encoding: FileSystem.EncodingType.UTF8,
            });
            setFileContent(content);
          } catch {
            console.error('Could not read text content');
          }
        }

        if (mounted) {
          decryptedUriRef.current = outPath;
          setDecryptedUri(outPath);
        }
      } catch (err) {
        console.error('Failed parsing document pipeline payload structures.', err);
        if (mounted) setDecryptedUri(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadFile();

    return () => {
      if (fileMeta && fileMeta.isEncrypted && decryptedUriRef.current) {
        StorageService.removeSandboxFile(decryptedUriRef.current).catch(e => console.error(e));
      }
    };
  }, [fileId, fileMeta, encryptionKeys]);

  const handleOpenExternally = async () => {
    if (decryptedUri) {
      try {
        await Sharing.shareAsync(decryptedUri);
      } catch {
        Alert.alert('Error', 'Could not open document');
      }
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(0)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  if (!fileMeta) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.animatedContent, screenAnimatedStyle]}>
          <VaultHeader title="Document" showBack />
          <View style={styles.viewport}>
            <View style={styles.card}>
              <View
                style={[
                  styles.heroCard,
                  { backgroundColor: colors.surface, shadowColor: colors.text },
                ]}
              >
                <View style={[styles.iconCircle, { backgroundColor: colors.error + '14' }]}>
                  <Ionicons name="alert-circle-outline" size={36} color={colors.error} />
                </View>
                <Text style={[styles.docTitle, { color: colors.error }]}>File not found</Text>
                <Text style={[styles.docSubtitle, { color: colors.textMuted }]}>
                  This document may have been moved or deleted.
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  const isText = fileMeta.mimeType?.startsWith('text/') ?? false;
  const isPdf =
    fileMeta.mimeType === 'application/pdf' || fileMeta.name?.toLowerCase().endsWith('.pdf');

  const getFileIcon = () => {
    if (isPdf) return 'document-text';
    if (fileMeta.mimeType?.startsWith('image/')) return 'image';
    if (isText) return 'reader';
    return 'document';
  };

  if (isText && fileContent) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.animatedContent, screenAnimatedStyle]}>
          <VaultHeader
            title={fileMeta.name || 'Document'}
            showBack
            rightButton={
              <TouchableOpacity
                onPress={handleOpenExternally}
                style={[styles.headerActionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Share"
              >
                <Ionicons name="share-outline" size={20} color={colors.text} />
              </TouchableOpacity>
            }
          />
          <ScrollView
            style={styles.textContainer}
            contentContainerStyle={styles.textContentWrapper}
          >
            <View style={[styles.chipRow, { paddingHorizontal: screenPadding }]}>
              <View style={[styles.chip, { backgroundColor: colors.primary + '14' }]}>
                <Ionicons name="reader-outline" size={13} color={colors.primary} />
                <Text style={[styles.chipText, { color: colors.primary }]}>Plain Text</Text>
              </View>
              {fileMeta.size ? (
                <View style={[styles.chip, { backgroundColor: colors.textMuted + '14' }]}>
                  <Text style={[styles.chipText, { color: colors.textMuted }]}>
                    {formatFileSize(fileMeta.size)}
                  </Text>
                </View>
              ) : null}
            </View>

            <View
              style={[
                styles.textCard,
                { backgroundColor: colors.surface, shadowColor: colors.text },
              ]}
            >
              <Text style={[styles.textContent, { color: colors.text }]}>{fileContent}</Text>
            </View>
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <Animated.View style={[styles.animatedContent, screenAnimatedStyle]}>
        <VaultHeader title={fileMeta.name || 'Document'} showBack />
        <ScrollView
          style={styles.viewport}
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: screenPadding }]}
        >
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : decryptedUri ? (
            Platform.OS === 'web' ? (
              <iframe
                src={decryptedUri}
                style={styles.webIframe as any}
                title={fileMeta.name}
              />
            ) : (
              <View style={[styles.card, { maxWidth: isTablet ? 720 : 520 }]}>
                <View
                  style={[
                    styles.heroCard,
                    { backgroundColor: colors.surface, shadowColor: colors.text },
                  ]}
                >
                  <View style={[styles.iconCircle, { backgroundColor: colors.primary + '14' }]}>
                    <Ionicons name={getFileIcon() as any} size={36} color={colors.primary} />
                  </View>

                  <Text style={[styles.docTitle, { color: colors.text }]} numberOfLines={2}>
                    {fileMeta.name}
                  </Text>

                  <View style={styles.chipRow}>
                    <View style={[styles.chip, { backgroundColor: colors.primary + '14' }]}>
                      <Text style={[styles.chipText, { color: colors.primary }]}>
                        {isPdf ? 'PDF' : fileMeta.mimeType?.split('/')[1]?.toUpperCase() || 'FILE'}
                      </Text>
                    </View>
                    {fileMeta.size ? (
                      <View style={[styles.chip, { backgroundColor: colors.textMuted + '14' }]}>
                        <Text style={[styles.chipText, { color: colors.textMuted }]}>
                          {formatFileSize(fileMeta.size)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.actionTile,
                    { backgroundColor: colors.primary, shadowColor: colors.primary },
                  ]}
                  onPress={handleOpenExternally}
                  activeOpacity={0.85}
                >
                  <View style={styles.actionTileLeft}>
                  <View style={[styles.actionIconWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : colors.surface }]}>
                    <Ionicons name="open-outline" size={18} color={isDark ? '#FFF' : colors.textMuted} />
                  </View>
                    <Text style={styles.actionTileText}>Open Document</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.text} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.actionTile,
                    styles.secondaryTile,
                    { backgroundColor: colors.surface, shadowColor: colors.text },
                  ]}
                  onPress={() => setShowDetails(!showDetails)}
                  activeOpacity={0.85}
                >
                  <View style={styles.actionTileLeft}>
                    <View
                      style={[styles.actionIconWrap, { backgroundColor: colors.textMuted + '14' }]}
                    >
                      <Ionicons name="information-outline" size={18} color={colors.textMuted} />
                    </View>
                    <Text style={[styles.actionTileText, { color: colors.text }]}>
                      File Details
                    </Text>
                  </View>
                  <Ionicons
                    name={showDetails ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>

                {showDetails && (
                  <View
                    style={[
                      styles.detailsBox,
                      { backgroundColor: colors.surface, shadowColor: colors.text },
                    ]}
                  >
                    <Text style={[styles.detailsLabel, { color: colors.textMuted }]}>
                      Sandbox path
                    </Text>
                    <Text
                      style={[styles.detailsValue, { color: colors.text }]}
                      numberOfLines={4}
                      selectable
                    >
                      {decryptedUri}
                    </Text>
                  </View>
                )}
              </View>
            )
          ) : (
            <View style={[styles.card, { maxWidth: isTablet ? 720 : 520 }]}>
              <View
                style={[
                  styles.heroCard,
                  { backgroundColor: colors.surface, shadowColor: colors.text },
                ]}
              >
                <View style={[styles.iconCircle, { backgroundColor: colors.error + '14' }]}>
                  <Ionicons name="alert-circle-outline" size={36} color={colors.error} />
                </View>
                <Text style={[styles.docTitle, { color: colors.error }]}>
                  Couldn&apos;t open document
                </Text>
                <Text style={[styles.docSubtitle, { color: colors.textMuted }]}>
                  The file may be corrupted or the decryption key is missing.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  animatedContent: {
    flex: 1,
  },
  viewport: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },

  card: {
    width: '100%',
    alignSelf: 'center',
  },

  loadingWrap: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroCard: {
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 14,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 2,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  docTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  docSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 19,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  actionTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 3,
  },
  secondaryTile: {
    shadowOpacity: 0.05,
    elevation: 1,
  },
  actionTileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  actionTileText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },

  detailsBox: {
    borderRadius: 18,
    padding: 16,
    marginTop: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  detailsLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  detailsValue: { fontSize: 12, fontFamily: 'monospace', lineHeight: 18 },

  textContainer: { flex: 1 },
  textContentWrapper: { padding: 20, gap: 12 },
  textCard: {
    borderRadius: 22,
    padding: 22,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 2,
  },
  textContent: { fontSize: 16, lineHeight: 26, fontWeight: '400' },

  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },

  webIframe: { width: '100%', height: '100%', border: 'none' } as any,
});
