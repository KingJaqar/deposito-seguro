// file: src/app/(main)/viewer/image.tsx

import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View, TouchableOpacity, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { VaultHeader } from '../../../components/VaultHeader';
import { useTheme } from '../../../contexts/ThemeContext';
import { Durations } from '../../../constants/animations';
import { StorageService } from '../../../services/storage';
import { useSettingsStore } from '../../../store/settingsStore';
import { useVaultStore } from '../../../store/vaultStore';
import { EncryptionKeyMetadata } from '../../../types';

export default function ImageViewerScreen() {
  const { fileId } = useLocalSearchParams<{ fileId: string }>();
  const { colors, isDark } = useTheme();
  const { files } = useVaultStore();
  const encryptionKeys = useSettingsStore(
    (state: { encryptionKeys: EncryptionKeyMetadata[] }) => state.encryptionKeys
  );

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fileMeta = files.find(f => f.id === fileId);
  const isUnsupported = !!fileMeta?.mimeType && ['image/svg', 'image/heic', 'image/heif'].some(prefix => fileMeta!.mimeType!.startsWith(prefix));
  const prevFileIdRef = useRef<string | null>(null);

  const loadedFileIdRef = useRef<string | null>(null);
  const decryptedPathRef = useRef<string | null>(null);

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
    const fileChanged = prevFileIdRef.current !== fileId;
    prevFileIdRef.current = fileId;

    if (fileChanged) {
      setLoading(true);
      setLoadError(false);
    }

    let mounted = true;

    const loadFile = async () => {
      if (!fileMeta) {
        if (mounted) {
          loadedFileIdRef.current = null;
          decryptedPathRef.current = null;
          setImageUri(null);
        }
        if (mounted) setLoading(false);
        return;
      }

      if (loadedFileIdRef.current === fileMeta.id && decryptedPathRef.current) {
        if (mounted) {
          setImageUri(decryptedPathRef.current);
          if (fileChanged) setLoading(false);
        }
        return;
      }

      if (decryptedPathRef.current && loadedFileIdRef.current !== fileMeta.id) {
        StorageService.removeSandboxFile(decryptedPathRef.current).catch(e => console.error(e));
      }

      try {
        let path = fileMeta.localPath;
        if (fileMeta.isEncrypted && fileMeta.encryptionKeyId) {
          const encryptionKey = encryptionKeys.find(k => k.id === fileMeta.encryptionKeyId)?.key;
          path = await StorageService.decryptSandboxFile(fileMeta.localPath, encryptionKey);
        }

        if (mounted) {
          loadedFileIdRef.current = fileMeta.id;
          decryptedPathRef.current = path;
          setImageUri(path);
        }
      } catch (err) {
        console.error('Failed opening image asset.', err);
        if (mounted) {
          loadedFileIdRef.current = null;
          decryptedPathRef.current = null;
          setImageUri(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadFile();

    return () => {
    };
  }, [fileId, fileMeta, encryptionKeys]);

  useEffect(() => {
    return () => {
      if (decryptedPathRef.current) {
        StorageService.removeSandboxFile(decryptedPathRef.current).catch(e => console.error(e));
        decryptedPathRef.current = null;
        loadedFileIdRef.current = null;
      }
    };
  }, []);

  const handleShare = async () => {
    if (!imageUri || !fileMeta) return;
    try {
      await Sharing.shareAsync(imageUri, {
        mimeType: fileMeta.mimeType || 'image/*',
        dialogTitle: fileMeta.name,
      });
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  const handleImageError = () => {
    setLoadError(true);
  };

  if (!fileMeta) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.animatedContent, screenAnimatedStyle]}>
          <VaultHeader title="Image" showBack />
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
                  This image may have been moved or deleted.
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  const formatErrorMessage = () => {
    if (isUnsupported) return 'This image format is supported on newer operating-system versions. Please update your device.';
    return "Couldn't load this image. The file may be corrupted or the decryption key is missing.";
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(0)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <Animated.View style={[styles.animatedContent, screenAnimatedStyle]}>
        <VaultHeader
          title={fileMeta.name}
          showBack
          rightButton={
            <TouchableOpacity
              onPress={handleShare}
              style={[styles.headerActionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Share"
            >
              <Ionicons name="share-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          }
        />

        <View style={styles.viewport}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : imageUri && !loadError && !isUnsupported ? (
            <View style={[styles.imageContainer, { backgroundColor: colors.surface }]}>
              <Image
                source={{ uri: imageUri }}
                style={styles.canvasImage}
                resizeMode="contain"
                onError={handleImageError}
              />
            </View>
          ) : (
            <View style={[styles.card, { maxWidth: 520 }]}>
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
                  {isUnsupported ? "Can't preview this image" : "Couldn't load image"}
                </Text>
                <Text style={[styles.docSubtitle, { color: colors.textMuted }]}>
                  {formatErrorMessage()}
                </Text>
                {fileMeta.size ? (
                  <Text style={[styles.metaSize, { color: colors.textMuted }]}>
                    {formatFileSize(fileMeta.size)}
                  </Text>
                ) : null}
              </View>
            </View>
          )}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  animatedContent: {
    flex: 1,
  },
  viewport: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  imageContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvasImage: { width: '100%', height: '100%' },

  loadingWrap: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: { width: '100%', alignSelf: 'center' },
  heroCard: {
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
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
    lineHeight: 19,
  },
  metaSize: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    letterSpacing: 0.3,
  },

  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
