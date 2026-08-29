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
//
// 0.5x animation-scale pass: for a critically-damped-ish spring, settle
// time is governed by the decay envelope (~friction/2), independent of
// tension — tension alone only changes oscillation frequency, not overall
// speed. To make the whole motion land in half the time while keeping the
// exact same shape (same damping ratio zeta = friction / (2*sqrt(tension))),
// tension has to scale by 4x and friction by 2x together (zeta is preserved
// exactly at that ratio, and the decay rate — friction/2 — doubles). Values
// below are each original tension*4 / friction*2, not eyeballed.
const SHEET_SPRING = {
  useNativeDriver: true,
  tension: 272,
  friction: 28,
  overshootClamping: true,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 0.5,
} as const;

// Closing gets its own, stiffer spring. Same 4x-tension/2x-friction scaling
// as SHEET_SPRING above applied on top of the original close tuning (which
// was already ~2x the open spring's stiffness) — still a spring, same
// shape, just running at 0.5x the settle time throughout.
const SHEET_SPRING_EXIT = {
  ...SHEET_SPRING,
  tension: 720,
  friction: 48,
} as const;

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxHeightFraction?: number; // fraction of screen height, default 0.85
  // When set, the sheet takes exactly this fraction of screen height instead
  // of shrinking to fit its content — for content whose size varies at
  // runtime (e.g. a folder list), so the sheet doesn't resize as the user
  // navigates. Content that doesn't fill it is padded, not shrunk to; content
  // is expected to manage its own internal scrolling via flex (see
  // MoveVaultModal) rather than relying on the sheet's own ScrollView.
  fixedHeightFraction?: number;
  closeOnSwipeDown?: boolean;
}

export function Sheet({
  visible,
  onClose,
  title,
  children,
  maxHeightFraction = 0.85,
  fixedHeightFraction,
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
  // I-23 originally moved `setMounted(true)` out of the effect below and into
  // a synchronous "adjust state during render" check here (comparing against
  // a tracked `prevVisible`), purely to satisfy the react-hooks/set-state-in-effect
  // lint rule. Reverted: on a screen that re-renders in quick succession right
  // after the triggering click (confirmed on search.tsx — a second parent
  // render lands ~70-100ms after the first, well within the open animation),
  // this render-phase pattern intermittently read `mounted`/`prevVisible` back
  // at their stale pre-open values on that second render, as if the sheet had
  // never opened — reproduced directly via instrumented logging, not
  // theoretical. A plain effect doesn't have that failure mode: React commits
  // whatever `mounted` was set to before the next effect run ever sees new
  // props, so there's no window where a second render can observe stale
  // state. This is a deliberate, scoped exception to the lint rule — the
  // race it exists to catch (an effect chasing its own state in a loop) is
  // not present here: this effect only ever transitions mounted false→true,
  // is gated by `visible`, and settles in one commit.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (visible) setMounted(true);
  }, [visible]);
  // Read fresh inside the exit animation's completion callback (a stale
  // closure would otherwise be the `visible=false` this exit run started
  // with, even after a fast re-open flips it back to true) so a reopen that
  // interrupts a still-finishing close doesn't get hidden out from under it.
  //
  // I-23: the assignment itself used to happen directly in the render body
  // (flagged by react-hooks/refs — refs aren't meant to be written outside
  // an effect/event handler). Confirmed by reading every read site: both
  // reads of visibleRef.current are inside the two `Animated...start()`
  // completion callbacks below (never synchronously during render or from
  // an event handler), which fire asynchronously — hundreds of ms later,
  // well after any `useEffect` scheduled this render has already run — so
  // moving the write into its own effect (below) cannot reintroduce the
  // stale-closure bug this ref exists to guard against.
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotionRef.current = v; });
  }, []);

  useEffect(() => {
    const reduceMotion = reduceMotionRef.current;
    // 0.5x animation-scale pass: halved locally (not the shared
    // Durations.sheetEnter/sheetExit constant, which TopToast/Snackbar also
    // read for their own, unrelated timings) so the reduce-motion fallback
    // and the backdrop fade stay in lockstep with SHEET_SPRING/_EXIT's own
    // halved settle time above, without touching any other component.
    const enterMs = reduceMotion ? Durations.instant : Durations.sheetEnter / 2;
    const exitMs = reduceMotion ? Durations.instant : Durations.sheetExit / 2;
    if (visible) {
      // The sibling effect above (declared first, so it runs first within
      // this same commit) has already called setMounted(true) by this point
      // — it doesn't need to be duplicated here. This effect only drives the
      // animation values themselves, not `mounted`.
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
            ...(fixedHeightFraction
              ? { height: Math.round(screenHeight * fixedHeightFraction) }
              : { maxHeight: Math.round(screenHeight * maxHeightFraction) }),
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
        {fixedHeightFraction ? (
          // Fixed-height sheets hand scrolling responsibility to their
          // content (flex:1 all the way down to whatever list actually
          // needs to scroll) instead of wrapping everything in a ScrollView
          // here — a ScrollView can't be told to stop at a flex boundary,
          // so it would just keep growing to fit content and defeat the
          // fixed height.
          <View style={[styles.fixedBody, { paddingBottom: insets.bottom }]}>
            {children}
          </View>
        ) : (
          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ paddingBottom: insets.bottom + space(4) }}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {children}
          </ScrollView>
        )}
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
  fixedBody: {
    flex: 1,
  },
});
