// src/app/(main)/viewer/document.tsx
// Rebuilt per plans/you-are-a-senior-majestic-swing.md §3/§7 Phase 4.
// Every store/service call (decrypt-then-read pipeline, text-content read,
// sandbox-file cleanup on unmount, Sharing.shareAsync) is unchanged; only
// JSX/StyleSheet is new. Notable per-plan changes:
//  - Card/Chip/Button/EmptyState primitives replace the local hero/chip/
//    action-tile markup
//  - 100% lucide-react-native icons, replacing the @expo/vector-icons
//    Ionicons this file used (§4 "100% lucide, no second icon set")
//  - the plain-text branch (chip row + text card) and the generic branch
//    (hero card + Open/Share tile + collapsible details) keep their exact
//    structure per §3's screen row
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  Info,
  Share2,
} from 'lucide-react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { VaultHeader } from '../../../components/VaultHeader';
import { Card } from '../../../components/primitives/Card';
import { Chip } from '../../../components/primitives/Chip';
import { EmptyState } from '../../../components/primitives/EmptyState';
import { Type } from '../../../constants/typography';
import { useTheme } from '../../../contexts/ThemeContext';
import { Durations } from '../../../constants/animations';
import { StorageService } from '../../../services/storage';
import { useSettingsStore } from '../../../store/settingsStore';
import { useVaultStore } from '../../../store/vaultStore';
import { EncryptionKeyMetadata } from '../../../types';

export default function DocumentViewerScreen() {
  const { fileId } = useLocalSearchParams<{ fileId: string }>();
  const { colors, space, font, radius, screenPadding, isTablet , iconSize } = useTheme();
  const { files } = useVaultStore();
  const encryptionKeys = useSettingsStore((state: { encryptionKeys: EncryptionKeyMetadata[] }) => state.encryptionKeys);

  const [decryptedUri, setDecryptedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const decryptedUriRef = useRef<string | null>(null);

  const fileMeta = files.find(f => f.id === fileId);

  const screenOpacity = useSharedValue(1);
  const screenTranslateY = useSharedValue(0);
  // Phase 5 (§6 reduced-motion audit): this screen-transition-out fade is a
  // separate animation from useScreenEnterAnimation's enter fade (see that
  // hook's own comment — this one resets instantly on focus and only
  // animates on blur), so it needs its own reduced-motion check.
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotionRef.current = v; }).catch(() => {});
  }, []);

  useFocusEffect(() => {
    screenOpacity.value = 1;
    screenTranslateY.value = 0;
    return () => {
      const duration = reduceMotionRef.current ? Durations.instant : Durations.fast;
      screenOpacity.value = withTiming(0, { duration, easing: Easing.in(Easing.quad) });
      screenTranslateY.value = withTiming(-8, { duration, easing: Easing.in(Easing.quad) });
    };
  });

  const screenAnimatedStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value, transform: [{ translateY: screenTranslateY.value }] }));

  useEffect(() => {
    let mounted = true;
    decryptedUriRef.current = null;

    const loadFile = async () => {
      if (!fileMeta) return;
      try {
        let outPath = fileMeta.localPath;
        if (fileMeta.isEncrypted && fileMeta.encryptionKeyId) {
          const encryptionKey = encryptionKeys.find(k => k.id === fileMeta.encryptionKeyId)?.key;
          outPath = await StorageService.decryptSandboxFile(fileMeta.localPath, encryptionKey);
          decryptedUriRef.current = outPath;
        }

        if (fileMeta.mimeType.startsWith('text/')) {
          try {
            const content = await FileSystem.readAsStringAsync(outPath, { encoding: FileSystem.EncodingType.UTF8 });
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
      <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
          <VaultHeader title="Document" showBack />
          <View style={styles.viewport}>
            <EmptyState icon={AlertCircle} title="File not found" message="This document may have been moved or deleted." />
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  const isText = fileMeta.mimeType?.startsWith('text/') ?? false;
  const isPdf = fileMeta.mimeType === 'application/pdf' || fileMeta.name?.toLowerCase().endsWith('.pdf');

  const FileTypeIconComp = isPdf ? FileText : fileMeta.mimeType?.startsWith('image/') ? ImageIcon : isText ? BookOpen : FileIcon;

  if (isText && fileContent) {
    return (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
          <VaultHeader
            title={fileMeta.name || 'Document'}
            showBack
            rightButton={
              <TouchableOpacity
                onPress={handleOpenExternally}
                hitSlop={4}
                style={[styles.headerActionBtn, { backgroundColor: colors.surfaceHover }]}
                accessibilityRole="button"
                accessibilityLabel="Share"
              >
                <Share2 size={iconSize(18)} color={colors.text} strokeWidth={2} />
              </TouchableOpacity>
            }
          />
          <ScrollView style={styles.flex1} contentContainerStyle={{ padding: screenPadding, gap: space(3) }}>
            <View style={[styles.chipRow, { gap: space(2), marginBottom: space(2) }]}>
              <Chip label="Plain Text" color={colors.primary} />
              {fileMeta.size ? <Chip label={formatFileSize(fileMeta.size)} color={colors.textMuted} /> : null}
            </View>
            <Card>
              <Text style={[styles.textContent, { color: colors.text, fontSize: font(Type.subtitle.size) }]}>{fileContent}</Text>
            </Card>
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
        <VaultHeader title={fileMeta.name || 'Document'} showBack />
        <ScrollView style={styles.viewport} contentContainerStyle={[styles.scrollContent, { paddingHorizontal: screenPadding }]}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : decryptedUri ? (
            Platform.OS === 'web' ? (
              <iframe src={decryptedUri} style={styles.webIframe as any} title={fileMeta.name} />
            ) : (
              <View style={[styles.card, { maxWidth: isTablet ? 720 : 520 }]}>
                <Card style={{ alignItems: 'center', marginBottom: space(3) }}>
                  <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}1F`, marginBottom: space(4) }]}>
                    <FileTypeIconComp size={iconSize(32)} color={colors.primary} strokeWidth={1.75} />
                  </View>
                  <Text style={[styles.docTitle, { color: colors.text, fontSize: font(Type.subtitle.size), marginBottom: space(3) }]} numberOfLines={2}>
                    {fileMeta.name}
                  </Text>
                  <View style={[styles.chipRow, { gap: space(2) }]}>
                    <Chip label={isPdf ? 'PDF' : fileMeta.mimeType?.split('/')[1]?.toUpperCase() || 'FILE'} color={colors.primary} />
                    {fileMeta.size ? <Chip label={formatFileSize(fileMeta.size)} color={colors.textMuted} /> : null}
                  </View>
                </Card>

                <TouchableOpacity
                  onPress={handleOpenExternally}
                  style={[styles.actionTile, { backgroundColor: colors.primary, borderRadius: radius(8), marginBottom: space(2), padding: space(4) }]}
                  accessibilityRole="button"
                  accessibilityLabel="Open document"
                >
                  <View style={[styles.actionTileLeft, { gap: space(3) }]}>
                    <View style={[styles.actionIconWrap, { backgroundColor: `${colors.onPrimary}2E` }]}>
                      <ExternalLink size={iconSize(18)} color={colors.onPrimary} strokeWidth={2} />
                    </View>
                    <Text style={[styles.actionTileText, { color: colors.onPrimary, fontSize: font(Type.body.size) }]}>Open Document</Text>
                  </View>
                  <ChevronRight size={iconSize(18)} color={colors.onPrimary} strokeWidth={2} />
                </TouchableOpacity>

                <Card onPress={() => setShowDetails(!showDetails)} accessibilityLabel="File details" style={{ marginBottom: space(2) }}>
                  <View style={styles.actionTileLeftRow}>
                    <View style={[styles.actionTileLeft, { gap: space(3) }]}>
                      <View style={[styles.actionIconWrap, { backgroundColor: colors.surfaceHover }]}>
                        <Info size={iconSize(18)} color={colors.textMuted} strokeWidth={2} />
                      </View>
                      <Text style={[styles.actionTileText, { color: colors.text, fontSize: font(Type.body.size) }]}>File Details</Text>
                    </View>
                    {showDetails ? <ChevronUp size={iconSize(18)} color={colors.textMuted} strokeWidth={2} /> : <ChevronDown size={iconSize(18)} color={colors.textMuted} strokeWidth={2} />}
                  </View>
                </Card>

                {showDetails && (
                  <Card>
                    <Text style={[styles.detailsLabel, { color: colors.textMuted, fontSize: font(Type.eyebrow.size), marginBottom: space(2) }]}>Sandbox path</Text>
                    <Text style={[styles.detailsValue, { color: colors.text }]} numberOfLines={4} selectable>{decryptedUri}</Text>
                  </Card>
                )}
              </View>
            )
          ) : (
            <EmptyState icon={AlertCircle} title={fileMeta.isMissing ? 'File unavailable' : "Couldn't open document"} message={fileMeta.isMissing ? "This document's data is no longer on this device. Restore it from a backup to recover it." : "The file may be corrupted or the decryption key is missing."} />
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  viewport: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 20 },

  card: { width: '100%', alignSelf: 'center' },
  loadingWrap: { padding: 40, alignItems: 'center', justifyContent: 'center' },

  iconCircle: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  docTitle: { fontWeight: '800', textAlign: 'center', letterSpacing: -0.2 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },

  actionTile: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionTileLeftRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionTileLeft: { flexDirection: 'row', alignItems: 'center' },
  actionIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionTileText: { fontWeight: '700' },

  detailsLabel: { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  detailsValue: { fontSize: 12, fontFamily: 'monospace', lineHeight: 18 },

  textContent: { lineHeight: 26, fontWeight: '400' },

  headerActionBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  webIframe: { width: '100%', height: '100%', border: 'none' } as any,
});
