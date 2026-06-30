// File: src/components/AnimatedTabBar.tsx
import { router, usePathname } from 'expo-router';
import { Home, LucideIcon, Search, Settings, Star, Trash2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
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

   const animatedStyle = useAnimatedStyle(() => ({
     transform: [{ scale: scale.value }],
   }));

   const glowStyle = useAnimatedStyle(() => ({
     opacity: glow.value,
   }));

   const Icon = tab.Icon;
   const color = isActive ? activeColor : mutedColor;

   return (
      <TouchableOpacity
        style={[styles.tabBtn, { minWidth }]}
        activeOpacity={0.75}
       onPress={onPress}
       onPressIn={() => {
         scale.value = withTiming(0.95, {
           duration: Durations.fast,
         });
       }}
       onPressOut={() => {
         scale.value = withTiming(isActive ? 1.15 : 1, {
           duration: Durations.tabSwitch,
         });
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

  function CentralSearchButton({ onPress, isActive, iconSize, containerSize, marginTop }: { onPress: () => void; isActive?: boolean; iconSize: number; containerSize: number; marginTop: number }) {
    const scale = useSharedValue(isActive ? 1.15 : 1);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    return (
      <View style={[styles.centralBtnWrap, { width: containerSize, height: containerSize, marginTop }]}>
        <Animated.View style={[styles.iconContainer, animatedStyle]}>
          <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.88}
            onPressIn={() => {
              scale.value = withTiming(0.90, {
                duration: Durations.tabSwitch,
              });
            }}
            onPressOut={() => {
              scale.value = withTiming(isActive ? 1.15 : 1, {
                duration: Durations.tabSwitch,
              });
            }}
            style={[styles.centralBtn, { width: containerSize - 2, height: containerSize - 2, borderRadius: containerSize / 2 }]}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Search size={iconSize} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
 }

  export default function AnimatedTabBar() {
    const { colors, isDark, bottomTabSpacing, space, font, radius, isTablet, responsiveSize } = useTheme();
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

    const iconSize = isTablet ? 26 : 22;
    const iconContainerSize = space(10);
    const centralBtnSize = responsiveSize(56, 64, 72);
    const navRadius = radius(6);

    const navBarBg = colors.dashboardNavBar ?? `${colors.surface}E6`;
    const activeColor = isDark ? (colors.dashboardText ?? colors.text) : (colors.dashboardAccent ?? colors.accent);
    const mutedColor = colors.dashboardTextMuted ?? colors.textMuted;
    const borderColor = colors.dashboardBorder ?? colors.border;

    return (
      <View style={[styles.wrap, { backgroundColor: navBarBg, borderTopLeftRadius: navRadius, borderTopRightRadius: navRadius }]}>
        <View style={[styles.row, { borderTopColor: borderColor, paddingBottom: Platform.OS === 'ios' ? 28 : 16, paddingTop: space(3) }]}>
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
      backgroundColor: '#5162FF',
      shadowColor: '#5162FF',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.45,
      shadowRadius: 12,
      elevation: 8,
    },
  });
