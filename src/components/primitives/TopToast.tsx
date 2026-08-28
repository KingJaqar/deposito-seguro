// src/components/primitives/TopToast.tsx
// Top-center notification, sibling to Snackbar.tsx's bottom-anchored toast
// but for outcomes that should surface near the header rather than the tab
// bar. Same auto-dismiss/reduced-motion handling and Animated timing as
// Snackbar — including the success/error `tone` split — but slides down
// from above the safe area instead of up from below, and is centered/
// content-width instead of full-bleed.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleCheck, CircleX } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';
import { Durations } from '../../constants/animations';

export interface TopToastState {
  visible: boolean;
  message: string;
  tone: 'success' | 'error';
  // Optional tap target — e.g. trash.tsx's restore toast jumps to the
  // folder the file landed in. When set, `locationLabel` is appended to
  // `message` and rendered underlined as the clickable part; the whole
  // toast becomes tappable and swaps from pointerEvents="none".
  onPress?: () => void;
  locationLabel?: string;
}

const AUTO_DISMISS_MS = 3000;

/**
 * Builds the message/tone for a bulk action whose per-item calls can fail
 * independently (a manual for-loop over softDeleteFile/deleteFolder/etc.,
 * not a single atomic store call) — so "5 items moved to trash" isn't shown
 * when only 3 of them actually made it, and a lone failure among 5 successes
 * doesn't get reported as if the whole batch failed.
 * `pastTensePhrase` reads e.g. "moved to trash" / "deleted permanently" /
 * "restored"; `infinitivePhrase` is its "Failed to ___" form, e.g.
 * "move to trash" / "delete permanently" / "restore".
 */
export function bulkOutcomeToast(
  succeeded: number,
  total: number,
  noun: string,
  pastTensePhrase: string,
  infinitivePhrase: string
): { message: string; tone: TopToastState['tone'] } {
  const plural = (n: number) => (n !== 1 ? 's' : '');
  if (succeeded === 0) {
    return { message: `Failed to ${infinitivePhrase} ${total} ${noun}${plural(total)}`, tone: 'error' };
  }
  if (succeeded === total) {
    return { message: `${total} ${noun}${plural(total)} ${pastTensePhrase}`, tone: 'success' };
  }
  return { message: `${succeeded} of ${total} ${noun}${plural(total)} ${pastTensePhrase}`, tone: 'success' };
}

export function useTopToast() {
  const [state, setState] = useState<TopToastState>({ visible: false, message: '', tone: 'success' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, tone: TopToastState['tone'] = 'success', onPress?: () => void, locationLabel?: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({ visible: true, message, tone, onPress, locationLabel });
    timerRef.current = setTimeout(() => setState((s) => ({ ...s, visible: false })), AUTO_DISMISS_MS);
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState((s) => ({ ...s, visible: false }));
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { topToastState: state, showTopToast: show, dismissTopToast: dismiss };
}

export function TopToast({ state }: { state: TopToastState }) {
  const { colors, space, font, radius, shadow, iconSize } = useTheme();
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(-40));
  const [opacity] = useState(() => new Animated.Value(0));
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotionRef.current = v; });
  }, []);

  useEffect(() => {
    const duration = reduceMotionRef.current ? Durations.instant : (state.visible ? Durations.sheetEnter : Durations.sheetExit);
    Animated.parallel([
      Animated.timing(translateY, { toValue: state.visible ? 0 : -40, duration, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: state.visible ? 1 : 0, duration, useNativeDriver: true }),
    ]).start();
  }, [state.visible, translateY, opacity]);

  const Icon = state.tone === 'error' ? CircleX : CircleCheck;
  const tint = state.tone === 'error' ? colors.error : colors.secondary;
  const { onPress } = state;

  return (
    <Animated.View
      pointerEvents={onPress ? 'box-none' : 'none'}
      style={[
        styles.container,
        shadow('lg'),
        {
          top: insets.top + space(3),
          backgroundColor: colors.text,
          borderRadius: radius(6),
          maxWidth: '88%',
          transform: [{ translateY }],
          opacity,
        },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={[styles.pressable, { paddingVertical: space(3), paddingHorizontal: space(4) }]}
        accessibilityRole={onPress ? 'button' : undefined}
      >
        <Icon size={iconSize(18)} color={tint} strokeWidth={2.5} style={{ marginRight: space(2) }} />
        <Text numberOfLines={2} style={[styles.text, { fontSize: font(Type.body.size), color: colors.background }]}>
          {state.message}
          {state.locationLabel ? <Text style={{ textDecorationLine: onPress ? 'underline' : 'none' }}>{state.locationLabel}</Text> : null}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
  },
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flexShrink: 1,
    fontWeight: '600',
  },
});
