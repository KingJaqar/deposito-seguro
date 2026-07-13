// src/hooks/useScreenFadeTransition.ts

import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Durations } from '../constants/animations';

/**
 * Fade + slight upward translate for screen exit transitions.
 *
 * The callback passed to useFocusEffect MUST be referentially stable
 * (wrapped in useCallback with an empty dependency array). An inline
 * arrow function is re-created every render, which causes the
 * underlying focus/blur effect to tear down and re-run on every
 * re-render — e.g. every keystroke in a TextInput on the screen —
 * firing the fade-out/reset cycle repeatedly and producing visible
 * flicker. Do not remove the useCallback wrapper.
 *
 * Returns an animated style with flex: 1 baked in, so wrapping
 * <Animated.View style={screenAnimatedStyle}> always fills its parent
 * without needing a separate StyleSheet entry for it.
 */
export function useScreenFadeTransition() {
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      cancelAnimation(opacity);
      cancelAnimation(translateY);
      opacity.value = 1;
      translateY.value = 0;

      return () => {
        opacity.value = withTiming(0, {
          duration: Durations.fast,
          easing: Easing.in(Easing.quad),
        });
        translateY.value = withTiming(-8, {
          duration: Durations.fast,
          easing: Easing.in(Easing.quad),
        });
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  return useAnimatedStyle(() => ({
    flex: 1,
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
}
