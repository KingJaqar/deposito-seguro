// src/app/(main)/viewer/video.tsx
// Rebuilt per plans/you-are-a-senior-majestic-swing.md §3/§7 Phase 4, then
// restyled a second time (per follow-up request) to match a reference video
// player UI: full-bleed immersive black canvas (edge-to-edge, mirroring
// image.tsx's "Google Photos style" viewer rather than the old boxed 16:9
// player pushed below a docked header), a scrub bar with elapsed/remaining
// time flanking it, and a centered rewind/play/forward transport trio.
// Per explicit instruction, the floating header is NOT copied from the
// reference screenshot (which had its own close/PiP/cast/volume cluster) —
// it is copied verbatim from image.tsx's immersive topBar instead: same
// pill back button, same title/subtitle block, same CHROME_SCRIM/PILL_BG
// treatment, same insets-driven padding.
// The playback engine, the scrub PanResponder, fullscreen/orientation-lock
// logic, and every store/service call are untouched — only chrome (layout +
// styling) changed. Fullscreen now toggles landscape orientation lock only
// (the canvas itself is always edge-to-edge); Share moved into the
// transport row's right-hand slot, mirrored against the fullscreen icon on
// the left, so the rewind/play/forward trio stays visually centered exactly
// like the reference.
// The overlay scrim and control-pill backgrounds stay theme-independent
// translucent-black rgba() values (never hex) — these controls float over a
// video frame, not the app chrome, so they can't take their color from the
// light/dark palette (a light-theme `colors.glass` tint would be illegible
// against a video). This mirrors the same theme-independent-scrim precedent
// already set by Modal.tsx/Sheet.tsx's own `rgba(0,0,0,0.5)` backdrops, and
// isn't caught by the hex-literal sweep (§7 Phase 6), which only flags
// `#RRGGBB` literals. Icon/text color on top of that scrim is plain white,
// matching image.tsx's CHROME_TEXT/CHROME_SUBTEXT constants exactly.
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, PanResponder } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, withSequence, interpolate, Extrapolation } from 'react-native-reanimated';
import * as Sharing from 'expo-sharing';
// Static import, not `await import(...)` — a dynamic import here previously
// hit Metro's "Requiring unknown module" bug (its async-import module-id
// graph goes out of sync with a native module that's already part of the
// main bundle graph). A top-level import avoids the async chunk entirely.
import * as ScreenOrientation from 'expo-screen-orientation';

import { VaultHeader } from '../../../components/VaultHeader';
import { EmptyState } from '../../../components/primitives/EmptyState';
import { useTheme } from '../../../contexts/ThemeContext';
import { Durations } from '../../../constants/animations';
import { Type } from '../../../constants/typography';
import { StorageService } from '../../../services/storage';
import { useSettingsStore } from '../../../store/settingsStore';
import { useVaultStore } from '../../../store/vaultStore';
import { EncryptionKeyMetadata } from '../../../types';
import {
  AlertCircle,
  ChevronLeft,
  Share2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize2,
  Minimize2,
} from 'lucide-react-native';

const CONTROL_FADE_DURATION = Durations.normal;
// Same constants/values as image.tsx's immersive-viewer chrome, so the
// header this screen reuses is pixel-for-pixel identical.
const CANVAS_BG = '#000000';
const CHROME_SCRIM = 'rgba(0, 0, 0, 0.55)';
const PILL_BG = 'rgba(255, 255, 255, 0.14)';
const CHROME_TEXT = '#FFFFFF';
const CHROME_SUBTEXT = 'rgba(255, 255, 255, 0.68)';
const TRACK_BG = 'rgba(255, 255, 255, 0.22)';
const BUFFERED_BG = 'rgba(255, 255, 255, 0.34)';

export default function VideoViewerScreen() {
  const { fileId } = useLocalSearchParams<{ fileId?: string }>();
  const { colors, space, font, iconSize } = useTheme();
  const { files } = useVaultStore();
  const encryptionKeys = useSettingsStore((state: { encryptionKeys: EncryptionKeyMetadata[] }) => state.encryptionKeys);
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const decryptedPathRef = useRef<string | null>(null);

  const fileMeta = files.find(f => f.id === fileId);

  const screenOpacity = useSharedValue(1);
  const screenTranslateY = useSharedValue(0);
  // Phase 5 (§6 reduced-motion audit): separate animation from
  // useScreenEnterAnimation (resets instantly on focus, animates on blur
  // only), so it needs its own reduced-motion check.
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

  useEffect(() => {
    let mounted = true;
    decryptedPathRef.current = null;

    const loadFile = async () => {
      if (!fileMeta) return;
      try {
        let path = fileMeta.localPath;
        if (fileMeta.isEncrypted && fileMeta.encryptionKeyId) {
          const encryptionKey = encryptionKeys.find(k => k.id === fileMeta.encryptionKeyId)?.key;
          path = await StorageService.decryptSandboxFile(fileMeta.localPath, encryptionKey);
          decryptedPathRef.current = path;
        }
        if (mounted) setVideoUri(path);
      } catch (err) {
        console.error('Failed opening cryptographic video asset pipeline.', err);
        if (mounted) setVideoUri(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadFile();

    return () => {
      if (decryptedPathRef.current) {
        StorageService.removeSandboxFile(decryptedPathRef.current).catch(e => console.error(e));
      }
    };
  }, [fileId, fileMeta, encryptionKeys]);

  const videoSource = useMemo(() => (videoUri ? { uri: videoUri } : null), [videoUri]);

  const player = useVideoPlayer(videoSource, (player) => {
    player.loop = false;
    player.timeUpdateEventInterval = 0.25;
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const timeUpdate = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });
  const sourceLoad = useEvent(player, 'sourceLoad', {
    videoSource: null,
    duration: 0,
    availableVideoTracks: [],
    availableSubtitleTracks: [],
    availableAudioTracks: [],
  });

  // Guard against NaN: expo-video can emit NaN for currentTime at boundaries
  // (video end, pre-first-frame). `??` won't help because NaN is not null/undefined.
  const rawCurrentTime = Number.isFinite(timeUpdate?.currentTime) ? (timeUpdate!.currentTime) : 0;
  const bufferedPosition = Number.isFinite(timeUpdate?.bufferedPosition) ? (timeUpdate!.bufferedPosition) : 0;
  // Root cause of the "skip resets to 0:00" report (confirmed via device
  // logs): for some source files ExoPlayer can't resolve a real duration and
  // instead reports `C.TIME_UNSET` (Android's "unknown" sentinel, effectively
  // `Long.MIN_VALUE`), which crosses the bridge as a huge NEGATIVE number
  // (observed: -9223372474941440) — not `0`, not `NaN`, not `undefined`.
  // Because it's nonzero, `??`/`||` fallbacks treat it as "a real value" and
  // let it leak through as `duration`. Once that happens, ExoPlayer treats
  // the source as non-seekable: any `currentTime =` write causes a brief
  // buffer blip (readyToPlay -> loading -> readyToPlay) and playback just
  // resumes from ~wherever it already was — indistinguishable from "the skip
  // button reset the video." No JS-side clamp math can fix that; it's a
  // native seek capability limitation for this file's container, not a bug
  // in this component. Guard against it by only trusting a duration that is
  // finite AND positive — anything else (0, NaN, or this negative sentinel)
  // is normalized to 0 ("unknown"), which the `canSeek` flag below then uses
  // to stop attempting seeks that are guaranteed to fail.
  const rawDuration = sourceLoad?.duration || player.duration || 0;
  const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;
  const canSeek = duration > 0;

  const [controlsVisible, setControlsVisible] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Optimistic seek time — set immediately on skip/scrub so the display and
  // thumb don't wait for the next timeUpdate event (which only fires during
  // active playback). Declared here (after all other useState hooks) so that
  // derived values that reference it come after this declaration.
  const [pendingSeekTime, setPendingSeekTime] = useState<number | null>(null);

  // Merge native time with the optimistic value. Use the native value once
  // it catches up within 0.5 s of the seek target. Guard against NaN
  // propagation: if the pending value itself was somehow set to NaN, fall back.
  const currentTime = (pendingSeekTime !== null && Number.isFinite(pendingSeekTime))
    ? pendingSeekTime
    : rawCurrentTime;

  // Clear the optimistic value once timeUpdate catches up.
  useEffect(() => {
    if (pendingSeekTime !== null && Math.abs(rawCurrentTime - pendingSeekTime) < 0.5) {
      setPendingSeekTime(null);
    }
  }, [rawCurrentTime, pendingSeekTime]);
  const scrubberLeft = useRef(0);
  // `PanResponder.create()` below runs once (captured via `useRef(...).current`),
  // so its callbacks can only see render-scope values (`duration`, `canSeek`)
  // through refs kept fresh across renders — plain closure variables here
  // would otherwise always read whatever they were on the very first render.
  const durationRef = useRef(0);
  const canSeekRef = useRef(false);
  useEffect(() => { durationRef.current = duration; canSeekRef.current = canSeek; }, [duration, canSeek]);

  const controlsOpacity = useSharedValue(1);
  const playScale = useSharedValue(1);
  const scrubberAnim = useSharedValue(0);
  const scrubberWidth = useSharedValue(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { setIsSeeking(true); },
      onPanResponderMove: (_, gestureState) => {
        if (scrubberWidth.value === 0 || !canSeekRef.current) return;
        const relativeX = gestureState.moveX - scrubberLeft.current;
        const ratio = Math.max(0, Math.min(1, relativeX / scrubberWidth.value));
        scrubberAnim.value = ratio;
        const seekTime = ratio * durationRef.current;
        player.currentTime = seekTime;
      },
      onPanResponderRelease: () => { setIsSeeking(false); },
      onPanResponderTerminate: () => { setIsSeeking(false); },
    })
  ).current;

  useEffect(() => {
    controlsOpacity.value = withTiming(controlsVisible ? 1 : 0, { duration: CONTROL_FADE_DURATION, easing: Easing.out(Easing.quad) });
  }, [controlsVisible, controlsOpacity]);

  const toggleControls = () => setControlsVisible((prev) => !prev);

  const handlePlayPause = () => {
    playScale.value = withSequence(
      withTiming(0.85, { duration: 80, easing: Easing.in(Easing.quad) }),
      withTiming(1, { duration: Durations.fast, easing: Easing.out(Easing.back(2.5)) })
    );
    if (isPlaying) {
      player.pause();
      return;
    }
    // If playback already ran to the end, expo-video just leaves
    // currentTime sitting at duration and won't auto-restart — resuming
    // from there would replay nothing. Reset to 0 first, same as tapping
    // play on a finished video anywhere else (YouTube, native players).
    const liveTime = Number.isFinite(player.currentTime) && player.currentTime >= 0
      ? player.currentTime : currentTime;
    if (duration > 0 && liveTime >= duration - 0.15) {
      player.currentTime = 0;
      setPendingSeekTime(0);
      scrubberAnim.value = 0;
    }
    player.play();
  };

  const handleSkip = (seconds: number) => {
    if (!videoUri || !canSeek) return;
    // `player` (from useReleasingSharedObject) is a stable instance across
    // renders, so read the live position off it. Fall back to the
    // `currentTime` state (fed by the `timeUpdate` event) if the live getter
    // isn't reporting yet, so a skip is always relative to the position the
    // user actually sees.
    // Prefer the live player getter; fall back to the React state value.
    // Guard both against NaN (expo-video can emit NaN at video boundaries).
    const liveTime = Number.isFinite(player.currentTime) && player.currentTime >= 0
      ? player.currentTime : null;
    const base = liveTime ?? (Number.isFinite(currentTime) ? currentTime : 0);
    let target = base + seconds;
    if (!Number.isFinite(target) || target < 0) target = 0;
    else if (target > duration) target = duration;
    player.currentTime = target;
    // Move the scrubber immediately — don't wait for the timeUpdate event,
    // which only fires during active playback and would leave the thumb stuck.
    setPendingSeekTime(target);
    if (durationRef.current > 0) scrubberAnim.value = target / durationRef.current;
  };

  const formatTime = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const bufferedProgress = duration > 0 ? Math.min(bufferedPosition / duration, 1) : 0;
  const remainingTime = duration > 0 ? Math.max(0, duration - currentTime) : 0;

  const handleScrubberLayout = (event: any) => {
    const { width, x } = event.nativeEvent.layout;
    scrubberWidth.value = width;
    scrubberLeft.current = x;
  };

  const handleScrubberPress = (event: any) => {
    if (scrubberWidth.value === 0 || !canSeek) return;
    const { locationX } = event.nativeEvent;
    const ratio = Math.max(0, Math.min(1, locationX / scrubberWidth.value));
    const seekTime = ratio * duration;
    player.currentTime = seekTime;
    scrubberAnim.value = ratio;
    setPendingSeekTime(seekTime);
  };

  const handleShare = async () => {
    if (!videoUri || !fileMeta) return;
    try {
      await Sharing.shareAsync(videoUri, { mimeType: fileMeta.mimeType || 'video/*', dialogTitle: fileMeta.name });
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  const handleFullscreen = async () => {
    const enteringFullscreen = !isFullscreen;
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      try {
        if (enteringFullscreen) {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } else {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        }
      } catch (e) {
        console.warn('Fullscreen unavailable:', e);
      }
    }
    setIsFullscreen(enteringFullscreen);
  };

  useEffect(() => {
    return () => {
      if (isFullscreen && (Platform.OS === 'ios' || Platform.OS === 'android')) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (!isSeeking && duration > 0) scrubberAnim.value = progress;
  }, [progress, isSeeking, duration]);

  const screenAnimatedStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value, transform: [{ translateY: screenTranslateY.value }] }));
  const controlsOverlayStyle = useAnimatedStyle(() => ({ opacity: controlsOpacity.value }));
  const playButtonScaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: playScale.value }] }));
  const scrubberFillStyle = useAnimatedStyle(() => ({ width: `${interpolate(scrubberAnim.value, [0, 1], [0, 100], Extrapolation.CLAMP)}%` }));
  const scrubberThumbStyle = useAnimatedStyle(() => ({
    // `left` must be a plain number — React Native's layout engine ignores
    // string values like "8px" for positioning properties, which was the root
    // cause of the thumb never moving even when scrubberAnim updated correctly.
    left: interpolate(scrubberAnim.value, [0, 1], [-6, Math.max(0, (scrubberWidth.value || 0) - 6)], Extrapolation.CLAMP),
  }));

  const formatDate = (ms?: number) => {
    if (!ms) return '';
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
          <VaultHeader title={fileMeta ? fileMeta.name : 'Video View Canvas'} showBack />
          <View style={styles.viewport}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (!videoUri) {
    return (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
          <VaultHeader title={fileMeta ? fileMeta.name : 'Video View Canvas'} showBack />
          <View style={styles.viewport}>
            <EmptyState icon={AlertCircle} title={fileMeta?.isMissing ? 'File unavailable' : "Couldn't open video"} message={fileMeta?.isMissing ? "This video's data is no longer on this device. Restore it from a backup to recover it." : "The file may be corrupted or the decryption key is missing."} />
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
          <VaultHeader title={fileMeta ? fileMeta.name : 'Video View Canvas'} showBack />
          <View style={styles.viewport}>
            <video src={videoUri} controls muted playsInline style={styles.videoElementWeb as any} />
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  // --- Immersive full-bleed canvas, header copied verbatim from image.tsx's
  // topBar (pill back button + title/subtitle over CHROME_SCRIM) --------
  return (
    <View style={[styles.root, { backgroundColor: CANVAS_BG }]}>
      <Animated.View style={[styles.flex1, screenAnimatedStyle]}>
        <TouchableOpacity activeOpacity={1} onPress={toggleControls} style={styles.videoTouchArea}>
          <VideoView
            style={{ width: winWidth, height: winHeight }}
            player={player}
            contentFit="contain"
            allowsPictureInPicture
            fullscreenOptions={{ enable: true }}
            nativeControls={false}
          />

          <Animated.View
            pointerEvents={controlsVisible ? 'auto' : 'none'}
            style={[styles.topBar, controlsOverlayStyle, { backgroundColor: CHROME_SCRIM, paddingTop: insets.top + space(2), paddingHorizontal: space(4), paddingBottom: space(3) }]}
          >
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={8}
              style={[styles.pillBtn, { backgroundColor: PILL_BG }]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft size={iconSize(22)} color={CHROME_TEXT} strokeWidth={2.5} />
            </TouchableOpacity>

            <View style={styles.topBarTitleWrap}>
              <Text style={[styles.topBarTitle, { fontSize: font(Type.subtitle.size), color: CHROME_TEXT }]} numberOfLines={1}>
                {fileMeta ? fileMeta.name : 'Video View Canvas'}
              </Text>
              {fileMeta?.importedAt ? (
                <Text style={[styles.topBarSubtitle, { fontSize: font(Type.caption.size), color: CHROME_SUBTEXT }]} numberOfLines={1}>
                  {formatDate(fileMeta.importedAt)}
                </Text>
              ) : null}
            </View>
          </Animated.View>

          <Animated.View
            pointerEvents={controlsVisible ? 'auto' : 'none'}
            style={[styles.bottomControls, controlsOverlayStyle, { backgroundColor: CHROME_SCRIM, paddingBottom: insets.bottom + space(4) }]}
          >
            <TouchableOpacity activeOpacity={1} onLayout={handleScrubberLayout} onPress={handleScrubberPress} {...panResponder.panHandlers} style={styles.scrubberTrack}>
              <View style={[styles.scrubberBackground, { backgroundColor: TRACK_BG }]}>
                <Animated.View style={[styles.scrubberBuffered, { width: `${bufferedProgress * 100}%`, backgroundColor: BUFFERED_BG }]} />
                <Animated.View style={[styles.scrubberFill, scrubberFillStyle, { backgroundColor: colors.primary }]} />
              </View>
              <Animated.View style={[styles.scrubberThumb, scrubberThumbStyle, { backgroundColor: CHROME_TEXT }]} />
            </TouchableOpacity>

            <View style={styles.timeRow}>
              <Text style={[styles.timeText, { color: CHROME_TEXT }]}>{formatTime(currentTime)}</Text>
              <Text style={[styles.timeText, { color: CHROME_SUBTEXT }]}>{canSeek ? `-${formatTime(remainingTime)}` : formatTime(0)}</Text>
            </View>

            <View style={styles.transportRow}>
              <TouchableOpacity
                onPress={handleFullscreen}
                hitSlop={8}
                style={styles.transportSideBtn}
                accessibilityRole="button"
                accessibilityLabel={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? <Minimize2 size={iconSize(20)} color={CHROME_TEXT} strokeWidth={2} /> : <Maximize2 size={iconSize(20)} color={CHROME_TEXT} strokeWidth={2} />}
              </TouchableOpacity>

              <View style={styles.centerControls}>
                <TouchableOpacity
                  onPress={() => handleSkip(-15)}
                  disabled={!canSeek}
                  style={[styles.skipButton, { opacity: canSeek ? 1 : 0.4 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Skip back 15 seconds"
                  accessibilityState={{ disabled: !canSeek }}
                >
                  <SkipBack size={iconSize(26)} color={CHROME_TEXT} strokeWidth={2} fill={CHROME_TEXT} />
                  <Text style={[styles.skipLabel, { color: CHROME_TEXT }]}>15</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={handlePlayPause} style={styles.playButton} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
                  <Animated.View style={playButtonScaleStyle}>
                    {isPlaying ? (
                      <Pause size={iconSize(36)} color={CHROME_TEXT} strokeWidth={2.2} fill={CHROME_TEXT} />
                    ) : (
                      <Play size={iconSize(36)} color={CHROME_TEXT} strokeWidth={2.2} fill={CHROME_TEXT} style={{ marginLeft: 3 }} />
                    )}
                  </Animated.View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleSkip(15)}
                  disabled={!canSeek}
                  style={[styles.skipButton, { opacity: canSeek ? 1 : 0.4 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Skip forward 15 seconds"
                  accessibilityState={{ disabled: !canSeek }}
                >
                  <SkipForward size={iconSize(26)} color={CHROME_TEXT} strokeWidth={2} fill={CHROME_TEXT} />
                  <Text style={[styles.skipLabel, { color: CHROME_TEXT }]}>15</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={handleShare} hitSlop={8} style={styles.transportSideBtn} accessibilityRole="button" accessibilityLabel="Share">
                <Share2 size={iconSize(20)} color={CHROME_TEXT} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  viewport: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  videoTouchArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  videoElementWeb: { width: '100%', height: '100%' } as any,

  // Header — copied verbatim from image.tsx's immersive topBar.
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', zIndex: 10 },
  topBarTitleWrap: { flex: 1, marginHorizontal: 12 },
  topBarTitle: { fontWeight: '700' },
  topBarSubtitle: { fontWeight: '500', marginTop: 1 },
  pillBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  // Bottom controls — scrub bar, then flanking elapsed/remaining time, then
  // a centered rewind/play/forward trio, per the reference UI.
  bottomControls: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12, gap: 6, zIndex: 10 },
  scrubberTrack: { width: '100%', height: 24, justifyContent: 'center', position: 'relative' },
  scrubberBackground: { width: '100%', height: 4, borderRadius: 2, overflow: 'hidden', position: 'relative' },
  scrubberBuffered: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
  scrubberFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
  scrubberThumb: { position: 'absolute', top: '50%', width: 12, height: 12, borderRadius: 6, marginTop: -6, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeText: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: 0.3 },
  transportRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  transportSideBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  centerControls: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36 },
  skipButton: { alignItems: 'center', justifyContent: 'center', width: 48, height: 48 },
  skipLabel: { fontSize: 10, fontWeight: '700', marginTop: -2, letterSpacing: 0.5 },
  playButton: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
});
