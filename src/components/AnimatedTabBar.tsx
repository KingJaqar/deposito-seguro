// File: src/components/AnimatedTabBar.tsx
import { router, usePathname } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useThemeColors } from '../contexts/ThemeContext';

export const TABS = [
  { route: '/(main)/dashboard', icon: '🏠', label: 'Home' },
  { route: '/(main)/favorites', icon: '⭐', label: 'Favs' },
  { route: '/(main)/search', icon: '🔍', label: 'Search' },
  { route: '/(main)/trash', icon: '🗑️', label: 'Trash' },
  { route: '/(main)/settings', icon: '⚙️', label: 'Settings' },
];

const TAB_COUNT = TABS.length;
const BAR_HEIGHT = 80;
const NOTCH_DEPTH = 28;

type TabColors = ReturnType<typeof useThemeColors>;

function AnimatedTabButton({
  tab,
  idx,
  activeIndex,
  scales,
  translateYs,
  colors,
  onPress,
}: {
  tab: { route: string; icon: string; label: string };
  idx: number;
  activeIndex: number;
  scales: ReturnType<typeof useSharedValue<number>>[];
  translateYs: ReturnType<typeof useSharedValue<number>>[];
  colors: TabColors;
  onPress: (idx: number) => void;
}) {
  const isActive = idx === activeIndex;
  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scales[idx].value },
      { translateY: translateYs[idx].value },
    ],
  }));

  return (
    <TouchableOpacity
      style={styles.tabBtn}
      activeOpacity={0.7}
      onPress={() => onPress(idx)}
    >
      <Animated.View style={[styles.iconWrap, animStyle]}>
        <View style={[styles.iconContainer, isActive && { backgroundColor: `${colors.primary}20` }]}>
          <Text style={styles.icon}>{tab.icon}</Text>
        </View>
      </Animated.View>
      <Text
        style={[
          styles.tabLabel,
          {
            color: isActive ? colors.primary : colors.textMuted,
            fontWeight: isActive ? '700' : '500',
          },
        ]}
      >
        {tab.label}
      </Text>
      {isActive && <View style={[styles.activeIndicator, { backgroundColor: colors.primary }]} />}
    </TouchableOpacity>
  );
}

function buildNotchPath(screenWidth: number, tabWidth: number, centerX: number): string {
  const H = BAR_HEIGHT;
  const W = tabWidth * 0.55;
  const D = NOTCH_DEPTH;
  const R = 22;

  const lx = centerX - W;
  const rx = centerX + W;

  return [
    `M0,${H} L0,0 L${screenWidth},0 L${screenWidth},${H}`,
    `L${rx + R},${H}`,
    `C${rx + R * 0.4},${H} ${rx},${H - D * 0.15} ${rx},${H - D}`,
    `C${rx},${H - D * 1.55} ${centerX + R * 0.5},${H - D * 1.82} ${centerX},${H - D * 1.82}`,
    `C${centerX - R * 0.5},${H - D * 1.55} ${lx},${H - D * 1.55} ${lx},${H - D}`,
    `C${lx},${H - D * 0.15} ${lx - R * 0.4},${H} ${lx - R},${H}`,
    `Z`,
  ].join(' ');
}

export default function AnimatedTabBar() {
  const colors = useThemeColors();
  const pathname = usePathname();
  const { width: screenWidth } = useWindowDimensions();
  const tabWidth = screenWidth / TAB_COUNT;

  const activeIndex = useMemo(() => {
    const idx = TABS.findIndex(t => {
      const seg = t.route.replace('/(main)', '');
      return pathname === seg || pathname.startsWith(seg + '/');
    });
    return idx === -1 ? 0 : idx;
  }, [pathname]);

  const scale0 = useSharedValue(activeIndex === 0 ? 1.15 : 1);
  const scale1 = useSharedValue(activeIndex === 1 ? 1.15 : 1);
  const scale2 = useSharedValue(activeIndex === 2 ? 1.15 : 1);
  const scale3 = useSharedValue(activeIndex === 3 ? 1.15 : 1);
  const scale4 = useSharedValue(activeIndex === 4 ? 1.15 : 1);
  const translate0 = useSharedValue(activeIndex === 0 ? -14 : 0);
  const translate1 = useSharedValue(activeIndex === 1 ? -14 : 0);
  const translate2 = useSharedValue(activeIndex === 2 ? -14 : 0);
  const translate3 = useSharedValue(activeIndex === 3 ? -14 : 0);
  const translate4 = useSharedValue(activeIndex === 4 ? -14 : 0);
  const scales = useMemo(() => [scale0, scale1, scale2, scale3, scale4], [scale0, scale1, scale2, scale3, scale4]);
  const translateYs = useMemo(() => [translate0, translate1, translate2, translate3, translate4], [translate0, translate1, translate2, translate3, translate4]);
  const archX = useSharedValue(tabWidth * activeIndex + tabWidth / 2);
  const dotX = useSharedValue(tabWidth * activeIndex + tabWidth / 2 - 3);

  useEffect(() => {
    const newCx = tabWidth * activeIndex + tabWidth / 2;

    archX.value = withTiming(newCx, {
      duration: 400,
      easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
    });

    dotX.value = withTiming(newCx - 3, {
      duration: 400,
      easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
    });

    TABS.forEach((_, i) => {
      if (i === activeIndex) {
        scales[i].value = withSpring(1.15, { damping: 18, stiffness: 200, mass: 0.8 });
        translateYs[i].value = withSpring(-14, { damping: 18, stiffness: 200, mass: 0.8 });
      } else {
        scales[i].value = withSpring(1, { damping: 18, stiffness: 200, mass: 0.8 });
        translateYs[i].value = withSpring(0, { damping: 18, stiffness: 200, mass: 0.8 });
      }
    });
  }, [activeIndex, archX, dotX, scales, translateYs, tabWidth]);

  const [pathD, setPathD] = React.useState(() => buildNotchPath(screenWidth, tabWidth, tabWidth * activeIndex + tabWidth / 2));

  useEffect(() => {
    const startPath = pathD;
    const endCx = tabWidth * activeIndex + tabWidth / 2;
    const endPath = buildNotchPath(screenWidth, tabWidth, endCx);
    if (startPath === endPath) return;

    let frame = 0;
    const totalFrames = 24;
    const interval = setInterval(() => {
      frame++;
      const t = frame / totalFrames;
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      const startCx = parseFloat(startPath.split('C')[0].split('L').pop()?.split(',')[0] ?? String(endCx));
      const currentCx = startCx + (endCx - startCx) * ease;

      setPathD(buildNotchPath(screenWidth, tabWidth, currentCx));

      if (frame >= totalFrames) {
        clearInterval(interval);
        setPathD(endPath);
      }
    }, 16);

    return () => clearInterval(interval);
  }, [activeIndex, pathD, screenWidth, tabWidth]);

  const animatedDotStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dotX.value }],
  }));

  const handlePress = (idx: number) => {
    router.push(TABS[idx].route);
  };

  const glassBackground = useAnimatedStyle(() => ({
    backgroundColor: `${colors.surface}E6`,
  }));

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      {/* Glass background with blur effect */}
      <Animated.View style={[styles.glassBack, glassBackground]} />
      
      {/* Top border with subtle glow */}
      <View style={[styles.topBorder, { backgroundColor: colors.border }]} />

      {/* Morphing SVG notch */}
      <Svg
        width={screenWidth}
        height={BAR_HEIGHT}
        style={styles.svg}
        viewBox={`0 0 ${screenWidth} ${BAR_HEIGHT}`}
      >
        <Path d={pathD} fill={colors.primary} opacity={0.15} />
      </Svg>

      {/* Tab buttons */}
      <View style={styles.tabRow}>
        {TABS.map((tab, idx) => (
          <AnimatedTabButton
            key={tab.route}
            tab={tab}
            idx={idx}
            activeIndex={activeIndex}
            scales={scales}
            translateYs={translateYs}
            colors={colors}
            onPress={handlePress}
          />
        ))}
      </View>

      {/* Active dot indicator */}
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: colors.primary, shadowColor: colors.primary },
          animatedDotStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: BAR_HEIGHT,
    overflow: 'visible',
  },
  glassBack: {
    ...StyleSheet.absoluteFill,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  svg: {
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
  topBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  tabRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: Platform.OS === 'ios' ? 14 : 6,
    paddingTop: 6,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: BAR_HEIGHT,
    paddingBottom: 2,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 20 },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.2,
    marginTop: 2,
  },
  dot: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 18 : 8,
    left: 0,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});