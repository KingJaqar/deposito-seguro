// src/components/primitives/Snackbar.tsx
// New primitive (no current equivalent exists) per §3/§5: a bottom-anchored,
// auto-dismissing, non-blocking toast replacing the single-OK-button
// Alert.alert confirmations for paste/export/access-key-assign-or-remove
// outcomes. Built from the same Durations.sheetEnter/sheetExit timing used
// for Sheet, translating from the bottom edge over a shorter distance, and
// auto-dismissing itself after ~3s.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleCheck, CircleX } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';
import { Durations } from '../../constants/animations';

export interface SnackbarState {
  visible: boolean;
  message: string;
  tone: 'success' | 'error';
}

const AUTO_DISMISS_MS = 3000;

export function useSnackbar() {
  const [state, setState] = useState<SnackbarState>({ visible: false, message: '', tone: 'success' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, tone: SnackbarState['tone'] = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({ visible: true, message, tone });
    timerRef.current = setTimeout(() => setState((s) => ({ ...s, visible: false })), AUTO_DISMISS_MS);
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState((s) => ({ ...s, visible: false }));
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { snackbarState: state, showSnackbar: show, dismissSnackbar: dismiss };
}

export function Snackbar({ state, bottomOffset = 0 }: { state: SnackbarState; bottomOffset?: number }) {
  const { colors, space, font, radius, shadow, iconSize } = useTheme();
  const insets = useSafeAreaInsets();
  // See Sheet.tsx's comment: lazy useState replaces useRef(...).current to
  // satisfy react-hooks/refs while keeping identical create-once semantics.
  const [translateY] = useState(() => new Animated.Value(80));
  const [opacity] = useState(() => new Animated.Value(0));
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotionRef.current = v; });
  }, []);

  useEffect(() => {
    const duration = reduceMotionRef.current ? Durations.instant : (state.visible ? Durations.sheetEnter : Durations.sheetExit);
    Animated.parallel([
      Animated.timing(translateY, { toValue: state.visible ? 0 : 80, duration, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: state.visible ? 1 : 0, duration, useNativeDriver: true }),
    ]).start();
    // translateY/opacity are useState-stable (never reassigned via their
    // setters) — including them satisfies exhaustive-deps without changing
    // when this effect fires.
  }, [state.visible, translateY, opacity]);

  const Icon = state.tone === 'error' ? CircleX : CircleCheck;
  const tint = state.tone === 'error' ? colors.error : colors.secondary;

  return (
    <Animated.View
      pointerEvents={state.visible ? 'box-none' : 'none'}
      style={[
        styles.container,
        shadow('lg'),
        {
          bottom: insets.bottom + space(5) + bottomOffset,
          left: space(4),
          right: space(4),
          backgroundColor: colors.text,
          borderRadius: radius(4),
          paddingVertical: space(3),
          paddingHorizontal: space(4),
          transform: [{ translateY }],
          opacity,
        },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Icon size={iconSize(18)} color={tint} strokeWidth={2.5} style={{ marginRight: space(2) }} />
      <Text numberOfLines={2} style={[styles.text, { fontSize: font(Type.body.size), color: colors.background }]}>
        {state.message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
    fontWeight: '600',
  },
});
