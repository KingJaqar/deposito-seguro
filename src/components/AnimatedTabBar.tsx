// File: src/components/AnimatedTabBar.tsx
import { router, usePathname } from 'expo-router';
import { Home, LucideIcon, Settings, Star, Trash2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';

export const TABS: { route: string; Icon: LucideIcon; label: string }[] = [
  { route: '/(main)/dashboard', Icon: Home, label: 'Home' },
  { route: '/(main)/favorites', Icon: Star, label: 'Favs' },
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
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(isActive ? 1.05 : 1, { duration: 180 }) }],
  }));

  const Icon = tab.Icon;
  const color = isActive ? activeColor : mutedColor;

  return (
    <TouchableOpacity
      style={styles.tabBtn}
      activeOpacity={0.7}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
    >
      <Animated.View style={animatedStyle}>
        <Icon size={22} color={color} strokeWidth={isActive ? 2.4 : 2} />
      </Animated.View>
      <Text style={[styles.tabLabel, { color, fontWeight: isActive ? '800' : '600' }]}>
        {tab.label}
      </Text>
    </TouchableOpacity>
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
    if (idx !== activeIndex) {
      router.push(TABS[idx].route as any);
    }
  };

  // No native blur dependency is installed in this project, so the "blurred
  // translucent" nav bar from the design spec is approximated with a
  // semi-transparent surface color instead — visually close, zero extra
  // native deps, safe on web/Expo Go/standalone builds alike.
  const navBarBg = colors.dashboardNavBar ?? `${colors.surface}E6`;
  const activeColor = isDark ? (colors.dashboardText ?? colors.text) : (colors.dashboardAccent ?? colors.accent);
  const mutedColor = colors.dashboardTextMuted ?? colors.textMuted;
  const borderColor = colors.dashboardBorder ?? colors.border;

  return (
    <View style={[styles.wrap, { backgroundColor: navBarBg }]}>
      <View style={[styles.row, { borderTopColor: borderColor }]}>
        {TABS.map((tab, idx) => (
          <TabButton
            key={tab.route}
            tab={tab}
            isActive={idx === activeIndex}
            activeColor={activeColor}
            mutedColor={mutedColor}
            onPress={() => handlePress(idx)}
          />
        ))}
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
    overflow: 'hidden',
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
});