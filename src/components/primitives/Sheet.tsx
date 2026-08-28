// src/components/primitives/Sheet.tsx
// Bottom-anchored action sheet. AnimatedActionSheet.tsx's anchor='bottom'
// gesture-driven slide/swipe-to-dismiss logic was genuinely solid engineering
// (§5), so its drag-to-dismiss PanResponder is carried forward here rather
// than reinvented; its anchor='center' path became Dialog.tsx instead.
// FolderPicker/MoveVaultModal (scrollable pickers) and ViewModeMenu are built
// on this; short-form confirmations use Dialog.
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Durations, EasingCurves } from '../../constants/animations';
import { Type } from '../../constants/typography';
import { BaseModal } from './Modal';

// Module-level so it's created once, not every render — Easing.bezier
// returns a new function each call, and re-creating it per render would
// make the enter/exit effect below re-fire on every unrelated re-render
// since it's referenced in that effect's dependency array.
const backdropEasing = Easing.bezier(...EasingCurves.modal);

// Shared spring tuning for both directions of travel (slide up to open,
// slide down to close) and for the drag-release snap-back, so all three
// share one physical "feel" instead of three differently-tuned motions.
// tension/friction are chosen close to critically damped (critical friction
// for tension 68 is ~2*sqrt(68)≈16.5; 14 is just under that) so the sheet
// still arrives with a faint natural ease-out rather than a linear stop,
// and overshootClamping clips the tiny residual bounce a slightly-under-
// damped spring would otherwise have — motion, not wobble. The rest
// thresholds are tightened so the spring commits to its final frame
// promptly instead of visibly micro-settling for an extra beat.
const SHEET_SPRING = {
  useNativeDriver: true,
  tension: 68,
  friction: 14,
  overshootClamping: true,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 0.5,
} as const;

// Closing gets its own, stiffer spring. SHEET_SPRING's tension/friction sit
// just under critical damping (see above), which settles in ~550-600ms —
// fine for the opening reveal, but a dismissal reads as sluggish at that
// length since the user's already moved on (tapped close, picked an
// action). Raising tension while keeping the ratio to friction just past
// critical (zeta ~0.9) roughly halves settle time to ~300ms without
// introducing any bounce — still a spring, just a quicker one.
const SHEET_SPRING_EXIT = {
  ...SHEET_SPRING,
  tension: 180,
  friction: 24,
} as const;

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxHeightFraction?: number; // fraction of screen height, default 0.85
  closeOnSwipeDown?: boolean;
}

export function Sheet({
  visible,
  onClose,
  title,
  children,
  maxHeightFraction = 0.85,
  closeOnSwipeDown = true,
}: SheetProps) {
  const { colors, space, font, radius, shadow, isTablet, iconSize, touchTarget } = useTheme();
  const closeBtnSize = touchTarget() - 8;
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  // react-hooks/refs (eslint-plugin-react-hooks' React Compiler rule set)
  // forbids reading ref.current during render — useRef(...).current is the
  // wrong tool for "create once, keep stable" values even though it's a
  // long-standing RN idiom. A lazy useState initializer gives the identical
  // create-once-per-mount semantics without a render-time ref read.
  const [translateY] = useState(() => new Animated.Value(400));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const [dragY] = useState(() => new Animated.Value(0));
  const reduceMotionRef = useRef(false);
  const [closeFocused, setCloseFocused] = React.useState(false);

  // `visible` (the prop) says where the sheet should be animating *toward*;
  // `mounted` says whether it's still on screen at all. They're deliberately
  // not the same thing: `if (!visible) return null` used to unmount the
  // Modal in the same render pass that kicked off the closing animation, so
  // the slide-down had nothing left to animate — the sheet just vanished —
  // and unmounting mid-spring left translateY stranded at whatever value
  // the interrupted animation was at, so the *next* open started from a
  // random offset instead of the clean 400 every time. `mounted` stays true
  // until the exit animation actually finishes, then tears the Modal down.
  const [mounted, setMounted] = useState(visible);
  // Read fresh inside the exit animation's completion callback (a stale
  // closure would otherwise be the `visible=false` this exit run started
  // with, even after a fast re-open flips it back to true) so a reopen that
  // interrupts a still-finishing close doesn't get hidden out from under it.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotionRef.current = v; });
  }, []);

  useEffect(() => {
    const reduceMotion = reduceMotionRef.current;
    const enterMs = reduceMotion ? Durations.instant : Durations.sheetEnter;
    const exitMs = reduceMotion ? Durations.instant : Durations.sheetExit;
    if (visible) {
      setMounted(true);
      dragY.setValue(0);
      if (reduceMotion) {
        Animated.parallel([
          Animated.timing(translateY, { toValue: 0, duration: enterMs, useNativeDriver: true }),
          Animated.timing(backdropOpacity, { toValue: 1, duration: enterMs, easing: backdropEasing, useNativeDriver: true }),
        ]).start();
      } else {
        // A tuned spring (rather than a fixed-duration timing curve) is what
        // makes native bottom sheets feel smooth: it settles with a slight,
        // physically-plausible deceleration instead of easing to a stop on a
        // clock, and it correctly picks up mid-flight if visible flips twice
        // in quick succession instead of snapping.
        Animated.parallel([
          Animated.spring(translateY, { ...SHEET_SPRING, toValue: 0 }),
          Animated.timing(backdropOpacity, { toValue: 1, duration: enterMs, easing: backdropEasing, useNativeDriver: true }),
        ]).start();
      }
    } else if (reduceMotion) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 400, duration: exitMs, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: exitMs, easing: backdropEasing, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished && !visibleRef.current) setMounted(false);
      });
    } else {
      // Close uses SHEET_SPRING_EXIT rather than mirroring the open spring:
      // still a spring (so it settles with the same physical character as
      // the rest of the sheet's motion, not a mechanically different
      // timing curve), just stiffer, so the sheet is off-screen in well
      // under a second instead of ~600ms. Backdrop fade is sped up to
      // match so it doesn't linger after the sheet itself is gone.
      Animated.parallel([
        Animated.spring(translateY, { ...SHEET_SPRING_EXIT, toValue: 400 }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: exitMs, easing: backdropEasing, useNativeDriver: true }),
      ]).start(({ finished }) => {
        // `finished` is false if this animation got interrupted (e.g. a
        // fast reopen started a new spring on the same Animated.Values) —
        // in that case skip unmounting, the interrupting animation owns the
        // sheet's fate now. visibleRef guards the same race from the other
        // side: a reopen-then-close-again before this callback fires.
        if (finished && !visibleRef.current) setMounted(false);
      });
    }
    // translateY/backdropOpacity/dragY are useState-stable (never reassigned
    // via their setters), so including them is correct and never causes an
    // extra run — this just satisfies exhaustive-deps.
  }, [visible, translateY, backdropOpacity, dragY]);

  const [panResponder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => closeOnSwipeDown && gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) dragY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 100 || gesture.vy > 1.2) {
          onClose();
        } else {
          // Snap back with the drag's own release velocity as the spring's
          // initial velocity so the sheet keeps moving the direction the
          // finger was already going, instead of visibly reversing course.
          Animated.spring(dragY, { ...SHEET_SPRING, toValue: 0, velocity: gesture.vy }).start();
        }
      },
    })
  );

  if (!mounted) return null;

  return (
    <BaseModal visible={mounted} onRequestClose={onClose} align="bottom">
      <Animated.View
        style={[
          styles.sheet,
          shadow('lg'),
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderLight,
            borderTopLeftRadius: radius(6),
            borderTopRightRadius: radius(6),
            // A pixel maxHeight, not a `${n}%` string: BaseModal's content
            // wrapper has no definite height of its own (it shrinks to fit
            // this sheet), and a percentage height is only meaningful
            // against a parent with a definite size — against an auto-sized
            // parent it's unresolvable, so this constraint was silently
            // dropped. That's what was cutting the option list down to a
            // sliver that needed scrolling instead of showing all of it.
            maxHeight: Math.round(screenHeight * maxHeightFraction),
            maxWidth: isTablet ? 560 : undefined,
            transform: [{ translateY: Animated.add(translateY, dragY) }],
          },
        ]}
        accessibilityViewIsModal
        {...panResponder.panHandlers}
      >
        <View style={[styles.handle, { backgroundColor: colors.borderLight }]} />
        {title ? (
          <View style={[styles.headerRow, { paddingHorizontal: space(5), marginBottom: space(3) }]}>
            <Text style={[styles.title, { fontSize: font(Type.subtitle.size), color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              onFocus={() => setCloseFocused(true)}
              onBlur={() => setCloseFocused(false)}
              hitSlop={10}
              android_ripple={{ color: `${colors.text}29`, borderless: true, radius: closeBtnSize / 2 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [
                styles.closeBtn,
                {
                  width: closeBtnSize,
                  height: closeBtnSize,
                  borderRadius: closeBtnSize / 2,
                  backgroundColor: colors.surfaceHover,
                  borderWidth: closeFocused ? StyleSheet.hairlineWidth * 2 : 0,
                  borderColor: colors.secondary,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <X size={iconSize(18)} color={colors.textSecondary} strokeWidth={2.5} />
            </Pressable>
          </View>
        ) : null}
        <ScrollView
          style={{ flexShrink: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + space(4) }}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontWeight: '700',
    flex: 1,
  },
  closeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
