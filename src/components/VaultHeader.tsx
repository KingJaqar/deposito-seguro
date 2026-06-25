// File: src/components/VaultHeader.tsx
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle
} from 'react-native-reanimated';
import { useThemeColors } from '../contexts/ThemeContext';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  rightButton?: React.ReactNode;
  scrollY?: SharedValue<number>;
  style?: ViewStyle;
}

export const VaultHeader = ({ title, showBack = false, rightButton, scrollY, style }: HeaderProps) => {
  const colors = useThemeColors();

  // If scrollY is provided, add parallax and collapse effects
  const animatedHeaderStyle = useAnimatedStyle(() => {
    if (!scrollY) {
      return {};
    }
    return {
      transform: [{ translateY: -scrollY.value * 0.3 }],
      opacity: interpolate(scrollY.value, [0, 60], [1, 0], Extrapolation.CLAMP),
    };
  });

  const animatedTitleStyle = useAnimatedStyle(() => {
    if (!scrollY) {
      return {};
    }
    return {
      transform: [{ scale: interpolate(scrollY.value, [0, 80], [1, 0.92], Extrapolation.CLAMP) }],
    };
  });

  const handleBackPress = () => {
    if (showBack) {
      router.back();
    }
  };

  return (
    <Animated.View style={[styles.container, { borderBottomColor: colors.borderLight, backgroundColor: colors.glass }, style, animatedHeaderStyle]}>
      <View style={styles.content}>
        {showBack && (
          <TouchableOpacity
            onPress={handleBackPress}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <Animated.View style={[styles.backIconWrap, { backgroundColor: `${colors.primary}15` }]}>
              <Text style={styles.backIcon}>←</Text>
            </Animated.View>
          </TouchableOpacity>
        )}
        
        <Animated.View style={[styles.titleContainer, animatedTitleStyle]}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
        </Animated.View>

        {rightButton && (
          <View style={styles.rightBtn}>
            {rightButton}
          </View>
        )}
      </View>
      
      {/* Subtle bottom gradient line */}
      <View style={[styles.gradientLine, { backgroundColor: colors.primary, opacity: 0.3 }]} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'space-between',
    zIndex: 100,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    marginRight: 8,
  },
  backIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: -1,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  rightBtn: {
    marginLeft: 'auto',
  },
  gradientLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
  },
});