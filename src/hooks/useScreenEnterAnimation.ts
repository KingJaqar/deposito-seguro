// src/hooks/useScreenEnterAnimation.ts
// Shared screen-enter fade, extracted from the identical hand-rolled copy
// that had accreted across 4 screens (folder/[id].tsx, settings/access-keys.tsx,
// settings/auth-key.tsx, settings/index.tsx — verified byte-for-byte identical
// modulo variable names before extracting, per plans/
// you-are-a-senior-majestic-swing.md §4 "confirm which ones actually qualify
// before extracting"). viewer/document.tsx, viewer/image.tsx and
// viewer/video.tsx were checked too and do NOT qualify: they run a different
// animation — reset-to-visible on focus, fade-and-lift-out on blur — tied to
// screen-transition-out rather than a one-time mount-in fade, so unifying them
// here would misrepresent what they actually do.
//
// Runs the fade exactly once per screen instance (a `hasAnimated` guard, same
// as the original per-screen copies) the first time the screen gains focus,
// so remounts via tab navigation don't replay it. Honors reduced-motion per
// §6: when AccessibilityInfo reports it enabled, the "animation" resolves at
// Durations.instant instead of animating.
import { useCallback, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Durations } from '../constants/animations';

const ENTER_TRANSLATE_Y = 12;

export function useScreenEnterAnimation() {
  const screenOpacity = useSharedValue(0);
  const screenTranslateY = useSharedValue(ENTER_TRANSLATE_Y);
  const hasAnimated = useSharedValue(false);
  const reduceMotion = useSharedValue(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) reduceMotion.value = enabled;
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [reduceMotion]);

  useFocusEffect(
    useCallback(() => {
      if (hasAnimated.value) return;
      hasAnimated.value = true;
      const duration = reduceMotion.value ? Durations.instant : Durations.normal;
      screenOpacity.value = withTiming(1, { duration, easing: Easing.out(Easing.quad) });
      screenTranslateY.value = withTiming(0, { duration, easing: Easing.out(Easing.quad) });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  return useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
    transform: [{ translateY: screenTranslateY.value }],
  }));
}
