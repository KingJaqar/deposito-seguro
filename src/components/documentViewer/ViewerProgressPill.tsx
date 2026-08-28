// src/components/documentViewer/ViewerProgressPill.tsx
// The small floating "3 / 12" (PDF) / "42%" (DOCX/ODT scroll position) pill
// that hovers bottom-center over the document canvas, mirroring Drive's own
// transient page indicator. Shares the theme-independent-scrim convention
// video.tsx/image.tsx already established for chrome that floats over
// document/media content rather than app surface — see those files' own
// comments on why a light-theme `colors.glass` tint wouldn't read here.
import { useEffect, useRef } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Durations } from '../../constants/animations';

const PILL_BG = 'rgba(17, 24, 39, 0.82)';
const PILL_TEXT = '#FFFFFF';
const IDLE_HIDE_DELAY = 1400;

export function ViewerProgressPill({ label, tick }: { label: string | null; tick: number }) {
  const opacity = useSharedValue(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!label) return;
    opacity.value = withTiming(1, { duration: Durations.fast, easing: Easing.out(Easing.quad) });
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      opacity.value = withTiming(0, { duration: Durations.normal, easing: Easing.in(Easing.quad) });
    }, IDLE_HIDE_DELAY);
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
    // `tick` deliberately in the dep array so repeated identical labels (e.g.
    // staying on page 3) still reset the idle-hide timer on every scroll event.
  }, [label, tick, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!label) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.pill, style]}>
      <Text style={styles.text}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    backgroundColor: PILL_BG,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
  },
  text: {
    color: PILL_TEXT,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
