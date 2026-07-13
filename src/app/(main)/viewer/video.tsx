// file: src/app/(main)/viewer/video.tsx

import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, PanResponder, SafeAreaView } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, withSequence, interpolate, Extrapolation } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Sharing from 'expo-sharing';

import { VaultHeader } from '../../../components/VaultHeader';
import { useTheme } from '../../../contexts/ThemeContext';
import { Durations } from '../../../constants/animations';
import { StorageService } from '../../../services/storage';
import { useSettingsStore } from '../../../store/settingsStore';
import { useVaultStore } from '../../../store/vaultStore';
import { EncryptionKeyMetadata } from '../../../types';
import {
  Share2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Settings2,
  Maximize2,
  Minimize2,
  Hd,
} from 'lucide-react-native';
const CONTROL_FADE_DURATION = Durations.normal;

export default function VideoViewerScreen() {
  const { fileId } = useLocalSearchParams<{ fileId?: string }>();
  const { colors, isDark, radius } = useTheme();
  const { files } = useVaultStore();
  const encryptionKeys = useSettingsStore(
    (state: { encryptionKeys: EncryptionKeyMetadata[] }) => state.encryptionKeys
  );
  const { width: winWidth, height: winHeight } = useWindowDimensions();

  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const decryptedPathRef = useRef<string | null>(null);

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
        if (mounted) {
          setVideoUri(path);
        }
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

  const videoSource = useMemo(
    () => (videoUri ? { uri: videoUri } : null),
    [videoUri]
  );

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

  const currentTime = timeUpdate?.currentTime ?? 0;
  const bufferedPosition = timeUpdate?.bufferedPosition ?? 0;
  const duration = sourceLoad?.duration ?? player.duration ?? 0;

  const [controlsVisible, setControlsVisible] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const scrubberLeft = useRef(0);

  const controlsOpacity = useSharedValue(1);
  const playScale = useSharedValue(1);
  const scrubberAnim = useSharedValue(0);
  const scrubberWidth = useSharedValue(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setIsSeeking(true);
      },
      onPanResponderMove: (_, gestureState) => {
        if (scrubberWidth.value === 0) return;
        const relativeX = gestureState.moveX - scrubberLeft.current;
        const ratio = Math.max(0, Math.min(1, relativeX / scrubberWidth.value));
        scrubberAnim.value = ratio;
        const seekTime = ratio * duration;
        player.currentTime = seekTime;
      },
      onPanResponderRelease: () => {
        setIsSeeking(false);
      },
      onPanResponderTerminate: () => {
        setIsSeeking(false);
      },
    })
  ).current;

  useEffect(() => {
    controlsOpacity.value = withTiming(controlsVisible ? 1 : 0, {
      duration: CONTROL_FADE_DURATION,
      easing: Easing.out(Easing.quad),
    });
  }, [controlsVisible, controlsOpacity]);

  const toggleControls = () => {
    setControlsVisible((prev) => !prev);
  };

  const handlePlayPause = () => {
    playScale.value = withSequence(
      withTiming(0.85, {
        duration: 80,
        easing: Easing.in(Easing.quad),
      }),
      withTiming(1, {
        duration: Durations.fast,
        easing: Easing.out(Easing.back(2.5)),
      })
    );
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const playerRef = useRef<ReturnType<typeof useVideoPlayer> | null>(null);
  const durationRef = useRef<number>(0);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  const handleSkip = (seconds: number) => {
    const currentPlayer = playerRef.current;
    const currentDuration = durationRef.current;
    if (!currentPlayer || !currentDuration || !videoUri) return;
    const nextTime = Math.max(0, Math.min(currentDuration, currentPlayer.currentTime + seconds));
    currentPlayer.currentTime = nextTime;
  };

  const formatTime = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const bufferedProgress = duration > 0 ? Math.min(bufferedPosition / duration, 1) : 0;

  const handleScrubberLayout = (event: any) => {
    const { width, x } = event.nativeEvent.layout;
    scrubberWidth.value = width;
    scrubberLeft.current = x;
  };

  const handleScrubberPress = (event: any) => {
    if (scrubberWidth.value === 0) return;
    const { locationX } = event.nativeEvent;
    const ratio = Math.max(0, Math.min(1, locationX / scrubberWidth.value));
    const seekTime = ratio * duration;
    player.currentTime = seekTime;
    scrubberAnim.value = ratio;
  };

  const handleShare = async () => {
    if (!videoUri || !fileMeta) return;
    try {
      const shareUri = videoUri;
      await Sharing.shareAsync(shareUri, {
        mimeType: fileMeta.mimeType || 'video/*',
        dialogTitle: fileMeta.name,
      });
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  const handleSettings = () => {
    player.playbackRate = player.playbackRate === 1.5 ? 1 : 1.5;
  };

  const handleFullscreen = async () => {
    const enteringFullscreen = !isFullscreen;

    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      try {
        const screenOrientation = await import('expo-screen-orientation');
        if (enteringFullscreen) {
          await screenOrientation.lockAsync(screenOrientation.OrientationLock.LANDSCAPE);
        } else {
          await screenOrientation.lockAsync(screenOrientation.OrientationLock.PORTRAIT_UP);
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
        import('expo-screen-orientation')
          .then((screenOrientation) =>
            screenOrientation.lockAsync(screenOrientation.OrientationLock.PORTRAIT_UP)
          )
          .catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (!isSeeking && duration > 0) {
      scrubberAnim.value = progress;
    }
  }, [progress, isSeeking, duration]);

  const screenAnimatedStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
    transform: [{ translateY: screenTranslateY.value }],
  }));

  const controlsOverlayStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const playButtonBlurStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
  }));

  const scrubberFillStyle = useAnimatedStyle(() => ({
    width: `${interpolate(scrubberAnim.value, [0, 1], [0, 100], Extrapolation.CLAMP)}%`,
  }));

  const scrubberThumbStyle = useAnimatedStyle(() => ({
    left: `${interpolate(scrubberAnim.value, [0, 1], [-6, Math.max(0, (scrubberWidth.value || 0) - 6)], Extrapolation.CLAMP)}px` as any,
  }));

  const videoDynamicStyle = useMemo(() => {
    if (isFullscreen) {
      return { width: winWidth, height: winHeight };
    }
    return { width: winWidth, height: winWidth * (9 / 16) };
  }, [isFullscreen, winWidth, winHeight]);

  const overlayEnd = isDark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.45)';
  const trackBg = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(15, 23, 42, 0.12)';
  const bufferedColor = isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(15, 23, 42, 0.18)';

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.animatedContent, screenAnimatedStyle]}>
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
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.animatedContent, screenAnimatedStyle]}>
          <VaultHeader title={fileMeta ? fileMeta.name : 'Video View Canvas'} showBack />
          <View style={styles.viewport}>
            <Text style={{ color: colors.error }}>
              Failed structural conversion of specified video asset.
            </Text>
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.animatedContent, screenAnimatedStyle]}>
          <VaultHeader title={fileMeta ? fileMeta.name : 'Video View Canvas'} showBack />
          <View style={styles.viewport}>
            <video
              src={videoUri}
              controls
              muted
              playsInline
              style={styles.videoElementWeb as any}
            />
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <Animated.View style={[styles.animatedContent, screenAnimatedStyle]}>
        {!isFullscreen && (
          <VaultHeader
            title={fileMeta ? fileMeta.name : 'Video View Canvas'}
            showBack
            rightButton={
              <TouchableOpacity
                onPress={handleShare}
                style={[styles.headerShareBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Share"
              >
                <Share2 size={20} color={colors.text} strokeWidth={1.8} />
              </TouchableOpacity>
            }
          />
        )}

        <View style={styles.viewport}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={toggleControls}
            style={styles.videoTouchArea}
          >
            <View style={[styles.videoContainer, { borderRadius: isFullscreen ? 0 : radius(6) }]}>
              <VideoView
                style={[styles.videoElement, videoDynamicStyle]}
                player={player}
                contentFit="contain"
                allowsPictureInPicture
                fullscreenOptions={{ enable: true }}
                nativeControls={false}
              />
            </View>

            <Animated.View
              style={[styles.controlsOverlay, controlsOverlayStyle]}
              pointerEvents={controlsVisible ? 'auto' : 'none'}
            >
              <View style={[styles.controlsGradient, { backgroundColor: overlayEnd }]} />
              <View style={styles.bottomControls}>
                <View style={styles.centerControls}>
                  <TouchableOpacity
                    onPress={() => handleSkip(-15)}
                    style={styles.skipButton}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Skip back 15 seconds"
                  >
                    <SkipBack size={22} color="#FFFFFF" strokeWidth={2} fill="#FFFFFF" />
                    <Text style={styles.skipLabel}>15</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handlePlayPause}
                    style={styles.playButtonContainer}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                  >
                    <Animated.View style={[styles.playButtonBlur, playButtonBlurStyle]}>
                      <BlurView
                        tint={isDark ? 'dark' : 'light'}
                        intensity={isDark ? 40 : 50}
                        style={StyleSheet.absoluteFill}
                      />
                    </Animated.View>
                    <View style={styles.playButtonInner}>
                      {isPlaying ? (
                        <Pause size={28} color="#FFFFFF" strokeWidth={2.2} fill="#FFFFFF" />
                      ) : (
                        <Play
                          size={28}
                          color="#FFFFFF"
                          strokeWidth={2.2}
                          fill="#FFFFFF"
                          style={{ marginLeft: 3 }}
                        />
                      )}
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleSkip(15)}
                    style={styles.skipButton}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Skip forward 15 seconds"
                  >
                    <SkipForward size={22} color="#FFFFFF" strokeWidth={2} fill="#FFFFFF" />
                    <Text style={styles.skipLabel}>15</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                  <Text style={styles.timeSeparator}>/</Text>
                  <Text style={[styles.timeText, styles.timeTextTotal]}>
                    {formatTime(duration)}
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={1}
                  onLayout={handleScrubberLayout}
                  onPress={handleScrubberPress}
                  {...panResponder.panHandlers}
                  style={styles.scrubberTrack}
                >
                  <View style={[styles.scrubberBackground, { backgroundColor: trackBg }]}>
                    <Animated.View
                      style={[
                        styles.scrubberBuffered,
                        {
                          width: `${bufferedProgress * 100}%`,
                          backgroundColor: bufferedColor,
                        },
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.scrubberFill,
                        scrubberFillStyle,
                        {
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <Animated.View style={[styles.scrubberThumb, scrubberThumbStyle]} />
                </TouchableOpacity>

                <View style={styles.actionsRow}>
                  <View style={styles.actionsLeft}>
                    <TouchableOpacity style={styles.actionButton} activeOpacity={0.7}>
                      <Hd size={18} color="#FFFFFF" strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSettings}
                      style={styles.actionButton}
                      activeOpacity={0.7}
                    >
                      <Settings2 size={18} color="#FFFFFF" strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.actionsRight}>
                    <TouchableOpacity
                      onPress={handleFullscreen}
                      style={styles.actionButton}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    >
                      {isFullscreen ? (
                        <Minimize2 size={18} color="#FFFFFF" strokeWidth={2} />
                      ) : (
                        <Maximize2 size={18} color="#FFFFFF" strokeWidth={2} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  animatedContent: {
    flex: 1,
  },
  viewport: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoTouchArea: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoContainer: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoElement: {},
  videoElementWeb: {
    width: '100%',
    height: '100%',
  } as any,
  controlsOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  controlsGradient: {
    ...StyleSheet.absoluteFill,
  },
  bottomControls: {
    width: '100%',
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  centerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
    marginBottom: 12,
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  skipLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    marginTop: -2,
    letterSpacing: 0.5,
  },
  playButtonContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  playButtonBlur: {
    ...StyleSheet.absoluteFill,
    borderRadius: 36,
  },
  playButtonInner: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },
  timeSeparator: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    fontWeight: '500',
  },
  timeTextTotal: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  scrubberTrack: {
    width: '100%',
    height: 32,
    justifyContent: 'center',
    position: 'relative',
  },
  scrubberBackground: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  scrubberBuffered: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
  },
  scrubberFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
  },
  scrubberThumb: {
    position: 'absolute',
    top: '50%',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    marginTop: -7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  actionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerShareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
});
