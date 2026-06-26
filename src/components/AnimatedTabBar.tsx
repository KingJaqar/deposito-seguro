// File: src/components/AnimatedTabBar.tsx
import { router, usePathname } from 'expo-router';
import { Home, LucideIcon, Search, Settings, Star, Trash2 } from 'lucide-react-native';
import { useMemo, useEffect } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

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
}: {
  tab: { route: string; Icon: LucideIcon; label: string };
  isActive: boolean;
  activeColor: string;
  mutedColor: string;
  onPress: () => void;
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scale = useMemo(() => new Animated.Value(isActive ? 1.15 : 1), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const glow = useMemo(() => new Animated.Value(isActive ? 0.6 : 0), []);

  useEffect(() => {
    const targetScale = isActive ? 1.15 : 1;
    const targetGlow = isActive ? 0.6 : 0;
    Animated.parallel([
      Animated.timing(scale, {
        toValue: targetScale,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(glow, {
        toValue: targetGlow,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive, scale, glow]);

  const Icon = tab.Icon;
  const color = isActive ? activeColor : mutedColor;

  return (
    <TouchableOpacity
      style={styles.tabBtn}
      activeOpacity={0.75}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
    >
      <Animated.View style={[styles.iconContainer, { transform: [{ scale }] }]}>
        <Animated.View style={[styles.glow, { backgroundColor: activeColor, opacity: glow }]} />
        <Icon size={22} color={color} strokeWidth={isActive ? 2.4 : 2} />
      </Animated.View>
      <Text style={[styles.tabLabel, { color, fontWeight: isActive ? '800' : '600' }]}>
        {tab.label}
      </Text>
    </TouchableOpacity>
  );
}

function CentralSearchButton({ onPress, isActive }: { onPress: () => void; isActive?: boolean }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scale = useMemo(() => new Animated.Value(isActive ? 1.15 : 1), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const glow = useMemo(() => new Animated.Value(isActive ? 0.7 : 0), []);

  useEffect(() => {
    const targetScale = isActive ? 1.15 : 1;
    const targetGlow = isActive ? 0.7 : 0;
    Animated.parallel([
      Animated.timing(scale, {
        toValue: targetScale,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(glow, {
        toValue: targetGlow,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive, scale, glow]);

  return (
    <View style={styles.centralBtnWrap}>
      <Animated.View style={[styles.iconContainer, { transform: [{ scale }] }]}>
        <Animated.View style={[styles.glow, { backgroundColor: '#5162FF', opacity: glow }]} />
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.88}
          onPressIn={() => {
            scale.setValue(0.90);
          }}
          onPressOut={() => {
            Animated.timing(scale, {
              toValue: isActive ? 1.15 : 1,
              duration: 300,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }).start();
          }}
          style={[styles.centralBtn]}
        >
          <Search size={24} color="#FFFFFF" strokeWidth={2.2} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function AnimatedTabBar() {
  const { colors, isDark } = useTheme();
  const pathname = usePathname();

  const activeIndex = useMemo(() => {
    const idx = TABS.findIndex(t => {
      const seg = t.route.replace('/(main)', '');
      return pathname === seg || pathname?.startsWith(seg + '/');
    });
    return idx === -1 ? 0 : idx;
  }, [pathname]);

  const handlePress = (idx: number) => {
    router.push(TABS[idx].route as any);
  };

  const navBarBg = colors.dashboardNavBar ?? `${colors.surface}E6`;
  const activeColor = isDark ? (colors.dashboardText ?? colors.text) : (colors.dashboardAccent ?? colors.accent);
  const mutedColor = colors.dashboardTextMuted ?? colors.textMuted;
  const borderColor = colors.dashboardBorder ?? colors.border;

  return (
    <View style={[styles.wrap, { backgroundColor: navBarBg }]}>
      <View style={[styles.row, { borderTopColor: borderColor }]}>
        {TABS.map((tab, idx) => {
          const tabIsActive = idx === activeIndex;
          if (tab.route === '/(main)/search') {
            return (
              <CentralSearchButton
                key={tab.route}
                isActive={tabIsActive}
                onPress={() => handlePress(idx)}
              />
            );
          }
          return (
            <TabButton
              key={tab.route}
              tab={tab}
              isActive={tabIsActive}
              activeColor={activeColor}
              mutedColor={mutedColor}
              onPress={() => handlePress(idx)}
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
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 56,
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  iconContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    opacity: 0,
  },
  centralBtnWrap: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
    zIndex: 10,
  },
  centralBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5162FF',
    shadowColor: '#5162FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
});
