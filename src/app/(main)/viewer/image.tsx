// src/app/(main)/viewer/image.tsx
// Rebuilt per plans/you-are-a-senior-majestic-swing.md §3/§7 Phase 4, then
// restyled into a Google Photos-style immersive viewer per follow-up
// request. The decrypt-then-load pipeline (per-file-id sandbox cache
// tracked via refs, sandbox cleanup on unmount, Sharing.shareAsync) is
// entirely unchanged; only the viewing surface itself is new:
//  - full-bleed black canvas with pinch-to-zoom, pan-when-zoomed,
//    double-tap-to-zoom and swipe-down-to-dismiss (react-native-gesture-
//    handler's Gesture API + Reanimated, mirroring the theme-independent
//    rgba() scrim convention already established by video.tsx for chrome
//    that floats over media rather than app UI)
//  - single tap toggles floating header/footer chrome, exactly like
//    video.tsx's controlsVisible pattern
//  - bottom action bar (Info / Share / Delete) replaces the old plain
//    header-only share button; Delete routes through the same
//    DestructiveConfirmModal + softDeleteFile() flow folder/[id].tsx uses
//  - loading/not-found/error branches keep the app's standard themed
//    VaultHeader + EmptyState treatment (out of scope for the immersive
//    canvas, which only applies once there's an actual image to show)
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, ChevronLeft, Share2, Trash2, Info, X } from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { VaultHeader } from '../../../components/VaultHeader';
import { EmptyState } from '../../../components/primitives/EmptyState';
import { DestructiveConfirmModal, useConfirmDestructive } from '../../../components/DestructiveConfirmModal';
import { useTheme } from '../../../contexts/ThemeContext';
import { Durations } from '../../../constants/animations';
import { Type } from '../../../constants/typography';
import { StorageService } from '../../../services/storage';
import { useSettingsStore } from '../../../store/settingsStore';
import { useVaultStore } from '../../../store/vaultStore';
import { EncryptionKeyMetadata } from '../../../types';

// Theme-independent scrim/pill colors, same rationale as video.tsx: these
// float over a photo, not the app's surface stack, so they can't take their
// color from the light/dark/amoled/notes/utility palette — a light-theme
// `colors.glass` tint would be illegible over a bright photo. Icons/text on
// top of them are plain white, which is legible against every one of these
// scrims regardless of active theme.
const CANVAS_BG = '#000000';
const CHROME_SCRIM = 'rgba(0, 0, 0, 0.55)';
const PILL_BG = 'rgba(255, 255, 255, 0.14)';
const CHROME_TEXT = '#FFFFFF';
const CHROME_SUBTEXT = 'rgba(255, 255, 255, 0.68)';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

export default function ImageViewerScreen() {
  const { fileId } = useLocalSearchParams<{ fileId: string }>();
  const { colors, space, font, radius, iconSize } = useTheme();
  const { files, softDeleteFile } = useVaultStore();
  const encryptionKeys = useSettingsStore((state: { encryptionKeys: EncryptionKeyMetadata[] }) => state.encryptionKeys);
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [infoVisible, setInfoVisible] = useState(false);
  const { confirmState: delConfirm, confirm: confirmDestructive, close: closeDelConfirm } = useConfirmDestructive();

  const fileMeta = files.find(f => f.id === fileId);
  const isUnsupported = !!fileMeta?.mimeType && ['image/svg', 'image/heic', 'image/heif'].some(prefix => fileMeta!.mimeType!.startsWith(prefix));
  const prevFileIdRef = useRef<string | null>(null);

  const loadedFileIdRef = useRef<string | null>(null);
  const decryptedPathRef = useRef<string | null>(null);

  const screenOpacity = useSharedValue(1);
  const screenTranslateY = useSharedValue(0);
  // Phase 5 (§6 reduced-motion audit): separate animation from
  // useScreenEnterAnimation (resets instantly on focus, animates on blur
  // only), so it needs its own reduced-motion check.
  const reduceMotionRef = useRef(false);

  // Pinch/pan/dismiss gesture state, all UI-thread shared values.
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const chromeOpacity = useSharedValue(1);

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
    const fileChanged = prevFileIdRef.current !== fileId;
    prevFileIdRef.current = fileId;

    if (fileChanged) {
      setLoading(true);
      setLoadError(false);
      // Reset zoom/pan/chrome whenever the viewed file changes so switching
      // images from the same route (e.g. a future swipe-between-images
      // gesture) never leaks a stale zoom level onto the next photo.
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      setChromeVisible(true);
      setInfoVisible(false);
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
        // Only encrypted files produce a throwaway plaintext copy that this
        // screen owns and must clean up. For a non-encrypted file `path` IS
        // the persistent sandbox original, so it must NEVER end up in
        // decryptedPathRef — otherwise the unmount/file-switch cleanup below
        // deletes the real stored file (mirrors video.tsx/document.tsx).
        let isTempDecrypt = false;
        if (fileMeta.isEncrypted && fileMeta.encryptionKeyId) {
          const encryptionKey = encryptionKeys.find(k => k.id === fileMeta.encryptionKeyId)?.key;
          // S-11: decryptSandboxFile no longer silently falls back when the
          // key can't be resolved — fail loudly here so the catch below
          // shows an error state instead of rendering corrupted image bytes.
          if (!encryptionKey) {
            throw new Error(`Encryption key unavailable for file ${fileMeta.id}`);
          }
          path = await StorageService.decryptSandboxFile(fileMeta.localPath, encryptionKey);
          isTempDecrypt = true;
        }

        if (mounted) {
          loadedFileIdRef.current = fileMeta.id;
          decryptedPathRef.current = isTempDecrypt ? path : null;
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

    return () => {};
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

  useEffect(() => {
    chromeOpacity.value = withTiming(chromeVisible ? 1 : 0, { duration: Durations.normal, easing: Easing.out(Easing.quad) });
  }, [chromeVisible, chromeOpacity]);

  const toggleChrome = () => setChromeVisible((prev) => !prev);
  const dismissViewer = () => router.back();

  const handleShare = async () => {
    if (!imageUri || !fileMeta) return;
    try {
      await Sharing.shareAsync(imageUri, { mimeType: fileMeta.mimeType || 'image/*', dialogTitle: fileMeta.name });
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  const handleDeletePress = () => {
    if (!fileMeta) return;
    confirmDestructive('Move to Trash', `Move "${fileMeta.name}" into retention trash?`, async () => {
      await softDeleteFile(fileMeta.id);
      router.back();
    });
  };

  const handleImageError = () => setLoadError(true);

  // --- Gestures --------------------------------------------------------
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clamp(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .maxPointers(2)
    .onUpdate((e) => {
      if (scale.value > 1.02) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      } else {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (scale.value > 1.02) {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
        return;
      }
      const pastThreshold = Math.abs(e.translationY) > DISMISS_DISTANCE || Math.abs(e.velocityY) > DISMISS_VELOCITY;
      if (pastThreshold) {
        const flingTo = (e.translationY > 0 ? 1 : -1) * Math.max(winHeight, 600);
        translateY.value = withTiming(flingTo, { duration: Durations.fast, easing: Easing.in(Easing.quad) }, (finished) => {
          if (finished) runOnJS(dismissViewer)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd(() => {
      if (scale.value > 1.02) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd(() => {
      runOnJS(toggleChrome)();
    });

  const tapGesture = Gesture.Exclusive(doubleTapGesture, singleTapGesture);
  const zoomPanGesture = Gesture.Simultaneous(pinchGesture, panGesture);
  const composedGesture = Gesture.Race(tapGesture, zoomPanGesture);

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const canvasAnimatedStyle = useAnimatedStyle(() => {
    const dragProgress = scale.value <= 1.02 ? clamp(Math.abs(translateY.value) / 300, 0, 1) : 0;
    return { opacity: 1 - dragProgress * 0.6 };
  });

  const chromeAnimatedStyle = useAnimatedStyle(() => ({ opacity: chromeOpacity.value }));

  if (!fileMeta) {
    return (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
          <VaultHeader title="Image" showBack />
          <View style={styles.viewport}>
            <EmptyState icon={AlertCircle} title="File not found" message="This image may have been moved or deleted." />
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  const formatErrorMessage = () => {
    if (isUnsupported) return 'This image format is supported on newer operating-system versions. Please update your device.';
    if (fileMeta.isMissing) return "This image's data is no longer on this device. Restore it from a backup to recover it.";
    return "Couldn't load this image. The file may be corrupted or the decryption key is missing.";
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(0)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const formatDate = (ms?: number) => {
    if (!ms) return '';
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const canShowImage = imageUri && !loadError && !isUnsupported && !fileMeta.isMissing;

  if (loading || !canShowImage) {
    return (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
          <VaultHeader
            title={fileMeta.name}
            showBack
            rightButton={
              <TouchableOpacity
                onPress={handleShare}
                hitSlop={4}
                style={[styles.headerActionBtn, { backgroundColor: colors.surfaceHover }]}
                accessibilityRole="button"
                accessibilityLabel="Share"
              >
                <Share2 size={iconSize(18)} color={colors.text} strokeWidth={2} />
              </TouchableOpacity>
            }
          />
          <View style={styles.viewport}>
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <View style={{ width: '100%' }}>
                <EmptyState
                  icon={AlertCircle}
                  title={isUnsupported ? "Can't preview this image" : fileMeta.isMissing ? 'File unavailable' : "Couldn't load image"}
                  message={`${formatErrorMessage()}${fileMeta.size ? `\n${formatFileSize(fileMeta.size)}` : ''}`}
                />
              </View>
            )}
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  // --- Immersive Google Photos-style canvas -----------------------------
  return (
    <View style={[styles.root, { backgroundColor: CANVAS_BG }]}>
      <Animated.View style={[styles.flex1, screenAnimatedStyle, canvasAnimatedStyle]}>
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={styles.canvas}>
            <Animated.Image
              source={{ uri: imageUri! }}
              style={[{ width: winWidth, height: winHeight }, imageAnimatedStyle]}
              resizeMode="contain"
              onError={handleImageError}
            />
          </Animated.View>
        </GestureDetector>

        <Animated.View
          pointerEvents={chromeVisible ? 'auto' : 'none'}
          style={[styles.topBar, chromeAnimatedStyle, { backgroundColor: CHROME_SCRIM, paddingTop: insets.top + space(2), paddingHorizontal: space(4), paddingBottom: space(3) }]}
        >
          <TouchableOpacity
            onPress={dismissViewer}
            hitSlop={8}
            style={[styles.pillBtn, { backgroundColor: PILL_BG }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={iconSize(22)} color={CHROME_TEXT} strokeWidth={2.5} />
          </TouchableOpacity>

          <View style={styles.topBarTitleWrap}>
            <Text style={[styles.topBarTitle, { fontSize: font(Type.subtitle.size), color: CHROME_TEXT }]} numberOfLines={1}>
              {fileMeta.name}
            </Text>
            {fileMeta.importedAt ? (
              <Text style={[styles.topBarSubtitle, { fontSize: font(Type.caption.size), color: CHROME_SUBTEXT }]} numberOfLines={1}>
                {formatDate(fileMeta.importedAt)}
              </Text>
            ) : null}
          </View>
        </Animated.View>

        {infoVisible ? (
          <View style={[styles.infoPanel, { backgroundColor: CHROME_SCRIM, borderRadius: radius(5), padding: space(4), marginHorizontal: space(4), marginBottom: space(3) + insets.bottom }]}>
            <View style={styles.infoPanelHeader}>
              <Text style={[styles.infoName, { fontSize: font(Type.body.size), color: CHROME_TEXT }]} numberOfLines={2}>
                {fileMeta.name}
              </Text>
              <TouchableOpacity onPress={() => setInfoVisible(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close details">
                <X size={iconSize(16)} color={CHROME_SUBTEXT} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.infoMeta, { fontSize: font(Type.caption.size), color: CHROME_SUBTEXT }]}>
              {[formatDate(fileMeta.importedAt), formatFileSize(fileMeta.size), fileMeta.mimeType].filter(Boolean).join(' • ')}
            </Text>
          </View>
        ) : null}

        <Animated.View
          pointerEvents={chromeVisible ? 'auto' : 'none'}
          style={[styles.bottomBar, chromeAnimatedStyle, { backgroundColor: CHROME_SCRIM, paddingBottom: insets.bottom + space(4), paddingTop: space(3) }]}
        >
          <TouchableOpacity
            onPress={() => setInfoVisible((prev) => !prev)}
            style={styles.bottomBarBtn}
            accessibilityRole="button"
            accessibilityLabel="File details"
            accessibilityState={{ selected: infoVisible }}
          >
            <Info size={iconSize(22)} color={CHROME_TEXT} strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleShare} style={styles.bottomBarBtn} accessibilityRole="button" accessibilityLabel="Share">
            <Share2 size={iconSize(22)} color={CHROME_TEXT} strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleDeletePress} style={styles.bottomBarBtn} accessibilityRole="button" accessibilityLabel="Move to trash">
            <Trash2 size={iconSize(22)} color={CHROME_TEXT} strokeWidth={2} />
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      <DestructiveConfirmModal state={delConfirm} onClose={closeDelConfirm} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  viewport: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },

  loadingWrap: { padding: 40, alignItems: 'center', justifyContent: 'center' },

  headerActionBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  canvas: { flex: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },

  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', zIndex: 10 },
  topBarTitleWrap: { flex: 1, marginHorizontal: 12 },
  topBarTitle: { fontWeight: '700' },
  topBarSubtitle: { fontWeight: '500', marginTop: 1 },

  pillBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', zIndex: 10 },
  bottomBarBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },

  infoPanel: { position: 'absolute', bottom: 92, left: 0, right: 0, zIndex: 11 },
  infoPanelHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  infoName: { fontWeight: '700', flex: 1 },
  infoMeta: { fontWeight: '500', marginTop: 6 },
});
