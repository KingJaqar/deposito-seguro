// File: src/components/AnimatedTabBar.tsx
// Rebuilt per §5/§7 Phase 3: fixes the real bug where the central Search
// button hardcoded #5162FF regardless of theme/disguise skin — now routed
// through colors.primary/colors.fabBg — and drops every colors.dashboardX
// deprecated-alias reference in favor of the real v2 schema names, since
// this file is being fully rewritten anyway. Route table, active-tab
// detection, and router.push navigation are unchanged.
import { router, usePathname } from 'expo-router';
import { Home, LucideIcon, Search, Settings, Star, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

function TabButton({
  tab,
  isActive,
  activeColor,
  mutedColor,
  onPress,
  iconSize,
  minWidth,
}: {
  tab: { route: string; Icon: LucideIcon; label: string };
  isActive: boolean;
  activeColor: string;
  mutedColor: string;
  onPress: () => void;
  iconSize: number;
  minWidth: number;
}) {
  const scale = useSharedValue(isActive ? 1.15 : 1);
  const glow = useSharedValue(isActive ? 0.6 : 0);

  useEffect(() => {
    scale.value = withTiming(isActive ? 1.15 : 1, { duration: Durations.tabSwitch, easing: Easing.out(Easing.quad) });
    glow.value = withTiming(isActive ? 0.6 : 0, { duration: Durations.tabSwitch, easing: Easing.out(Easing.quad) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  const Icon = tab.Icon;
  const color = isActive ? activeColor : mutedColor;

  return (
    <TouchableOpacity
      style={[styles.tabBtn, { minWidth }]}
      activeOpacity={0.75}
      onPress={onPress}
      onPressIn={() => {
        // eslint-disable-next-line react-hooks/immutability
        scale.value = withTiming(0.95, { duration: Durations.fast });
      }}
      onPressOut={() => {
        // eslint-disable-next-line react-hooks/immutability
        scale.value = withTiming(isActive ? 1.15 : 1, { duration: Durations.tabSwitch });
      }}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 16 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
    >
      <Animated.View style={[styles.iconContainer, animatedStyle]}>
        <Animated.View style={[styles.glow, { backgroundColor: activeColor }, glowStyle]} />
        <Icon size={iconSize} color={color} strokeWidth={isActive ? 2.4 : 2} />
      </Animated.View>
      <Text style={[styles.tabLabel, { color, fontWeight: isActive ? '800' : '600' }]} numberOfLines={1}>
        {tab.label}
      </Text>
    </TouchableOpacity>
  );
}

function CentralSearchButton({
  onPress,
  isActive,
  iconSize,
  containerSize,
  marginTop,
  fabBg,
  fabText,
}: {
  onPress: () => void;
  isActive?: boolean;
  iconSize: number;
  containerSize: number;
  marginTop: number;
  fabBg: string;
  fabText: string;
}) {
  const scale = useSharedValue(isActive ? 1.15 : 1);

  useEffect(() => {
    scale.value = withTiming(isActive ? 1.15 : 1, { duration: Durations.tabSwitch, easing: Easing.out(Easing.quad) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={[styles.centralBtnWrap, { width: containerSize, height: containerSize, marginTop }]}>
      <Animated.View style={[styles.iconContainer, animatedStyle]}>
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.88}
          onPressIn={() => {
            // eslint-disable-next-line react-hooks/immutability
            scale.value = withTiming(0.9, { duration: Durations.tabSwitch });
          }}
          onPressOut={() => {
            // eslint-disable-next-line react-hooks/immutability
            scale.value = withTiming(isActive ? 1.15 : 1, { duration: Durations.tabSwitch });
          }}
          style={[
            styles.centralBtn,
            {
              width: containerSize - 2,
              height: containerSize - 2,
              borderRadius: containerSize / 2,
              backgroundColor: fabBg,
              shadowColor: fabBg,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Search size={iconSize} color={fabText} strokeWidth={2.2} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

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

  const handlePress = (idx: number) => {
    router.push(TABS[idx].route as any);
  };

  const iconSize = scaleIcon(isTablet ? 26 : 22);
  const centralBtnSize = scaleIcon(responsiveSize(56, 64, 72));
  const navRadius = space(6);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.navBar, borderTopLeftRadius: navRadius, borderTopRightRadius: navRadius }]}>
      <View style={[styles.row, { borderTopColor: colors.borderLight, paddingBottom: Platform.OS === 'ios' ? 28 : 16, paddingTop: space(3) }]}>
        {TABS.map((tab, idx) => {
          const tabIsActive = idx === activeIndex;
          if (tab.route === '/(main)/search') {
            return (
              <CentralSearchButton
                key={tab.route}
                isActive={tabIsActive}
                onPress={() => handlePress(idx)}
                iconSize={iconSize + 2}
                containerSize={centralBtnSize}
                marginTop={responsiveSize(-24, -28, -32)}
                fabBg={colors.fabBg}
                fabText={colors.fabText}
              />
            );
          }
          return (
            <TabButton
              key={tab.route}
              tab={tab}
              isActive={tabIsActive}
              activeColor={colors.primary}
              mutedColor={colors.textMuted}
              onPress={() => handlePress(idx)}
              iconSize={iconSize}
              minWidth={space(14)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'visible',
    zIndex: 100,
    elevation: 100,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexShrink: 1,
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    borderRadius: 20,
  },
  centralBtnWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    flexShrink: 0,
  },
  centralBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
});
