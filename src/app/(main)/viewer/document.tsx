// src/app/(main)/viewer/document.tsx
// Rebuilt per plans/you-are-a-senior-majestic-swing.md §3/§7 Phase 4, then
// given real in-app renderers per follow-up request ("implement an actual
// document viewer similar to Google Drive's"), styled to match Drive's own
// document-preview look: a fixed light-gray backdrop with a white "page"
// card, regardless of the app's active theme — same theme-independent-
// chrome precedent video.tsx/image.tsx set for viewers whose content isn't
// really "app UI". The decrypt-then-read pipeline (sandbox-file cleanup on
// unmount, Sharing.shareAsync) is unchanged; routing to a type-specific
// viewer component is new:
//  - .pdf            -> PdfViewer (pdf.js inside a WebView, fully offline)
//  - .docx            -> FlowDocViewer kind="docx" (mammoth inside a WebView)
//  - .odt             -> FlowDocViewer kind="odt" (hand-rolled ODF->HTML)
//  - .xlsx            -> SheetViewer (SheetJS, native grid, no WebView)
//  - text/*           -> TextPageViewer (unchanged content, restyled as a page)
//  - anything else    -> the original hero-card "Open Document" tile
// See src/services/documentViewers/*.ts for why everything (library code,
// file bytes) is inlined rather than fetched: app.json blocks
// android.permission.INTERNET outright, so nothing here can hit a CDN or a
// Google-Docs-Viewer-style remote render, even for the WebView-hosted paths.
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertCircle,
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
import { PdfViewer } from '../../../components/documentViewer/PdfViewer';
import { FlowDocViewer } from '../../../components/documentViewer/FlowDocViewer';
import { SheetViewer } from '../../../components/documentViewer/SheetViewer';
import { TextPageViewer } from '../../../components/documentViewer/TextPageViewer';
import { Type } from '../../../constants/typography';
import { useTheme } from '../../../contexts/ThemeContext';
import { Durations } from '../../../constants/animations';
import { StorageService } from '../../../services/storage';
import { useSettingsStore } from '../../../store/settingsStore';
import { useVaultStore } from '../../../store/vaultStore';
import { EncryptionKeyMetadata, FileMetadata } from '../../../types';

type DocKind = 'pdf' | 'docx' | 'odt' | 'xlsx' | 'text' | 'generic';

function resolveDocKind(fileMeta: FileMetadata): DocKind {
  const name = fileMeta.name?.toLowerCase() ?? '';
  const mime = fileMeta.mimeType ?? '';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) return 'docx';
  if (mime === 'application/vnd.oasis.opendocument.text' || name.endsWith('.odt')) return 'odt';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || name.endsWith('.xlsx')) return 'xlsx';
  if (mime.startsWith('text/')) return 'text';
  return 'generic';
}

export default function DocumentViewerScreen() {
  const { fileId } = useLocalSearchParams<{ fileId: string }>();
  const { colors, space, font, radius, screenPadding, isTablet, iconSize } = useTheme();
  const { files } = useVaultStore();
  const encryptionKeys = useSettingsStore((state: { encryptionKeys: EncryptionKeyMetadata[] }) => state.encryptionKeys);

  const [decryptedUri, setDecryptedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const decryptedUriRef = useRef<string | null>(null);

  const fileMeta = files.find(f => f.id === fileId);
  const docKind = fileMeta ? resolveDocKind(fileMeta) : 'generic';

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

  const shareButton = (
    <TouchableOpacity
      onPress={handleOpenExternally}
      hitSlop={4}
      style={[styles.headerActionBtn, { backgroundColor: colors.surfaceHover }]}
      accessibilityRole="button"
      accessibilityLabel="Share"
    >
      <Share2 size={iconSize(18)} color={colors.text} strokeWidth={2} />
    </TouchableOpacity>
  );

  // The 4 fully-rendered doc types share one shell: VaultHeader (theming,
  // back button, share action) above a full-bleed type-specific viewer that
  // owns its own light-gray-backdrop/white-page canvas — see each
  // component's header comment for why that canvas is theme-independent.
  if (!loading && decryptedUri && (docKind === 'pdf' || docKind === 'docx' || docKind === 'odt' || docKind === 'xlsx')) {
    return (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
          <VaultHeader title={fileMeta.name || 'Document'} showBack rightButton={shareButton} />
          {docKind === 'odt' && (
            <View style={[styles.limitationBanner, { backgroundColor: colors.surfaceHover, borderBottomColor: colors.borderLight, paddingHorizontal: screenPadding, paddingVertical: space(2) }]}>
              <Text style={[styles.limitationText, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>
                Simplified preview — text and structure only; styling and images aren&apos;t shown.
              </Text>
            </View>
          )}
          {docKind === 'pdf' && <PdfViewer localUri={decryptedUri} />}
          {docKind === 'docx' && <FlowDocViewer localUri={decryptedUri} kind="docx" />}
          {docKind === 'odt' && <FlowDocViewer localUri={decryptedUri} kind="odt" />}
          {docKind === 'xlsx' && <SheetViewer localUri={decryptedUri} />}
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (docKind === 'text' && fileContent) {
    return (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
          <VaultHeader title={fileMeta.name || 'Document'} showBack rightButton={shareButton} />
          <TextPageViewer content={fileContent} />
        </Animated.View>
      </SafeAreaView>
    );
  }

  const isPdf = docKind === 'pdf';
  const isText = docKind === 'text';
  const FileTypeIconComp = isPdf ? FileText : fileMeta.mimeType?.startsWith('image/') ? ImageIcon : isText ? FileText : FileIcon;

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
            Platform.OS === 'web' && isPdf ? (
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

  limitationBanner: { borderBottomWidth: StyleSheet.hairlineWidth },
  limitationText: { fontWeight: '500', lineHeight: 16 },

  headerActionBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  webIframe: { width: '100%', height: '100%', border: 'none' } as any,
});
