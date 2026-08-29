// File: src/components/AnimatedTabBar.tsx
// Rebuilt per §5/§7 Phase 3: fixes the real bug where the central Search
// button hardcoded #5162FF regardless of theme/disguise skin — now routed
// through colors.primary/colors.fabBg — and drops every colors.dashboardX
// deprecated-alias reference in favor of the real v2 schema names, since
// this file is being fully rewritten anyway. Route table, active-tab
// detection, and router.push navigation are unchanged.
import { router, usePathname } from 'expo-router';
import { Home, LucideIcon, Search, Settings, Star, Trash2 } from 'lucide-react-native';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';
import { Durations } from '../constants/animations';

export const TABS: { route: string; Icon: LucideIcon; label: string }[] = [
  { route: '/(main)/dashboard', Icon: Home, label: 'Home' },
  { route: '/(main)/favorites', Icon: Star, label: 'Favs' },
  { route: '/(main)/search', Icon: Search, label: 'Search' },
  { route: '/(main)/trash', Icon: Trash2, label: 'Trash' },
  { route: '/(main)/settings', Icon: Settings, label: 'Settings' },
];

// Tab-bar-only animation timing, scaled 0.5x vs the shared Durations values
// so switching tabs feels instant/snappy. Kept local to this file (rather
// than edited into constants/animations.ts) so nothing else in the app's
// animation timing is affected — only the bottom tab bar's own feedback.
const TAB_ANIM = {
  press: Durations.fast * 0.5, // icon press-in scale
  settle: Durations.tabSwitch * 0.5, // icon press-out + active pill fade
} as const;
const TAB_EASING = Easing.out(Easing.cubic);

// Floating pill tab bar: each tab is a plain circular icon button, and the
// active tab gets a filled rounded-square "pill" behind its icon instead of
// a color swap + label. No text labels — icon-only, per the updated design.
const TabButton = memo(function TabButton({
  tab,
  isActive,
  activeBg,
  activeIconColor,
  mutedColor,
  onPress,
  iconSize,
  circleSize,
}: {
  tab: { route: string; Icon: LucideIcon; label: string };
  isActive: boolean;
  activeBg: string;
  activeIconColor: string;
  mutedColor: string;
  onPress: () => void;
  iconSize: number;
  circleSize: number;
}) {
  const scale = useSharedValue(isActive ? 1 : 1);
  const bgProgress = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    bgProgress.value = withTiming(isActive ? 1 : 0, { duration: TAB_ANIM.settle, easing: TAB_EASING });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const bgStyle = useAnimatedStyle(() => ({ opacity: bgProgress.value }));

  const Icon = tab.Icon;
  const color = isActive ? activeIconColor : mutedColor;

  // Pressable + reanimated-only feedback (scale), instead of TouchableOpacity's
  // built-in opacity animation which runs on the legacy Animated API in
  // parallel with reanimated — one animation driver here, not two.
  return (
    <Pressable
      style={styles.tabBtn}
      onPress={onPress}
      onPressIn={() => {
        // eslint-disable-next-line react-hooks/immutability
        scale.value = withTiming(0.92, { duration: TAB_ANIM.press, easing: TAB_EASING });
      }}
      onPressOut={() => {
        // eslint-disable-next-line react-hooks/immutability
        scale.value = withTiming(1, { duration: TAB_ANIM.settle, easing: TAB_EASING });
      }}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
    >
      <Animated.View style={[styles.iconCircle, { width: circleSize, height: circleSize, borderRadius: circleSize * 0.32 }, animatedStyle]}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: activeBg, borderRadius: circleSize * 0.32 },
            bgStyle,
          ]}
        />
        <Icon size={iconSize} color={color} strokeWidth={2} />
      </Animated.View>
    </Pressable>
  );
});

export default function AnimatedTabBar() {
  const { colors, space, isTablet, responsiveSize, iconSize: scaleIcon } = useTheme();
  const pathname = usePathname();

  const activeIndex = useMemo(() => {
    const idx = TABS.findIndex((t) => {
      const seg = t.route.replace('/(main)', '');
      return pathname === seg || pathname?.startsWith(seg + '/');
    });
    return idx === -1 ? 0 : idx;
  }, [pathname]);

  // ROOT CAUSE of the multi-second tab-switch delay: every tab tap called
  // router.push, which — per expo-router's own docs — always *appends* a new
  // stack entry rather than reusing one. Since AnimatedTabBar only renders on
  // these 5 root screens (see the Stack comment below), bouncing between
  // tabs never popped anything, so the native stack grew by one mounted
  // screen instance per tap for the whole session. Every one of those old
  // instances stays subscribed to useVaultStore/useSettingsStore (zustand
  // doesn't know about navigation focus), so they keep re-rendering off-
  // screen on every store update — and each new push has to be reconciled
  // against an ever-larger screen list, which is what made the delay grow
  // the longer a session went on instead of being instant every time.
  // router.replace navigates "without appending to the history" (expo-router
  // docs), so switching tabs now swaps the current top-of-stack screen in
  // place — stack depth for the tab layer stays at 1, no ghost instances.
  const activeIndexRef = useRef(activeIndex);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // Stable per-tab callbacks so TabButton's memo actually skips re-rendering
  // the 4 inactive tabs whenever the active one changes. Kept a ref-guarded
  // no-op for re-tapping the already-active tab, instead of depending on
  // activeIndex directly, so this array's identity (and therefore memo)
  // never breaks.
  const handlers = useMemo(
    () => TABS.map((tab, idx) => () => {
      if (activeIndexRef.current === idx) return;
      router.replace(tab.route as any);
    }),
    []
  );

  const iconSize = scaleIcon(isTablet ? 26 : 22);
  const circleSize = scaleIcon(responsiveSize(52, 58, 64));

  return (
    <View style={[styles.wrap, { bottom: Platform.OS === 'ios' ? space(9) : space(6) }]} pointerEvents="box-none">
      <View
        style={[
          styles.pill,
          {
            backgroundColor: colors.navBar,
            borderColor: colors.borderLight,
            paddingHorizontal: space(3),
            height: circleSize + space(3),
            borderRadius: (circleSize + space(3)) / 2,
          },
        ]}
      >
        {TABS.map((tab, idx) => (
          <TabButton
            key={tab.route}
            tab={tab}
            isActive={idx === activeIndex}
            activeBg={colors.primary}
            activeIconColor={colors.fabText}
            mutedColor={colors.textMuted}
            onPress={handlers[idx]}
            iconSize={iconSize}
            circleSize={circleSize}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
    elevation: 100,
  },
  pill: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  tabBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
