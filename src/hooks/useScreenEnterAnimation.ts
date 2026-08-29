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
//
// Foreground recovery: opening a native activity (the DocumentPicker on the
// folder screen, share sheets, etc.) sends the Android app to `background`
// and back to `active`. On that resume Reanimated re-initializes the UI-thread
// shared values to their *declared* initial values — screenOpacity snaps back
// to 0 — but `useFocusEffect` does NOT re-fire (no React-Navigation focus
// change occurred), so the one-time fade never re-runs and the whole content
// area is left stuck at opacity 0 (reads as the screen "going blank" after an
// import). The guard/reduce-motion flags therefore live in plain JS refs
// (which survive that reset) and an AppState listener re-asserts the settled
// visible values whenever we return to `active` after the fade has already run.
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Durations } from '../constants/animations';

const ENTER_TRANSLATE_Y = 12;

export function useScreenEnterAnimation() {
  const screenOpacity = useSharedValue(0);
  const screenTranslateY = useSharedValue(ENTER_TRANSLATE_Y);
  const hasAnimated = useRef(false);
  const reduceMotion = useRef(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) reduceMotion.current = enabled;
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    // Run the mount-in fade once, on the first commit. Screens that use this
    // hook are already focused when they mount (they're the pushed/active
    // route), so a mount-time effect is equivalent to the old focus-effect
    // trigger for the enter case, and — unlike useFocusEffect — it doesn't
    // depend on a navigation focus event we can't rely on after a resume.
    if (!hasAnimated.current) {
      hasAnimated.current = true;
      const duration = reduceMotion.current ? Durations.instant : Durations.normal;
      screenOpacity.value = withTiming(1, { duration, easing: Easing.out(Easing.quad) });
      screenTranslateY.value = withTiming(0, { duration, easing: Easing.out(Easing.quad) });
    }

    // Recover from Reanimated's shared-value reset after the app returns from
    // the background (see the header note). Snap straight to visible — the
    // fade already played on first mount; replaying it here would look like a
    // flicker every time the user comes back from the picker.
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && hasAnimated.current) {
        screenOpacity.value = 1;
        screenTranslateY.value = 0;
      }
    });

    return () => subscription.remove();
  }, [screenOpacity, screenTranslateY]);

  return useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
    transform: [{ translateY: screenTranslateY.value }],
  }));
}
