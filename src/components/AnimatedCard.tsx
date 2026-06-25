// File: src/components/AnimatedCard.tsx
import React, { useRef } from 'react';
import { GestureResponderEvent, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';
import { useThemeColors } from '../contexts/ThemeContext';

interface AnimatedCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  delay?: number;
}

export const AnimatedCard = ({ 
  children, 
  onPress, 
  onLongPress, 
  style, 
  disabled = false,
  delay = 0
}: AnimatedCardProps) => {
  const colors = useThemeColors();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);
  const pressed = useRef(false);

  // Entrance animation with staggered delay
  React.useEffect(() => {
    const timer = setTimeout(() => {
      opacity.value = withSpring(1, {
        damping: 20,
        stiffness: 200,
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const handlePressIn = () => {
    if (disabled) return;
    pressed.current = true;
    scale.value = withSpring(0.96, {
      damping: 15,
      stiffness: 300,
    });
  };

  const handlePressOut = () => {
    pressed.current = false;
    scale.value = withSpring(1, {
      damping: 15,
      stiffness: 300,
    });
  };

  const handlePress = (event: GestureResponderEvent) => {
    if (onPress && !disabled) {
      runOnJS(onPress)();
    }
  };

  const animatedContainerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const animatedInnerStyle = useAnimatedStyle(() => ({
    shadowOpacity: scale.value === 0.96 ? 0.05 : 0.12,
    shadowRadius: scale.value === 0.96 ? 2 : 8,
  }));

  return (
    <Animated.View style={[styles.container, animatedContainerStyle, style]}>
      <Animated.View style={[styles.shadow, animatedInnerStyle, { shadowColor: colors.shadow }]}>
        <TouchableOpacity
          onPress={handlePress}
          onLongPress={onLongPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={1}
          disabled={disabled}
          style={styles.pressable}
        >
          <View style={[styles.card, { 
            backgroundColor: colors.surfaceElevated, 
            borderColor: colors.borderLight 
          }]}>
            {children}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  shadow: {
    borderRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  pressable: {
    borderRadius: 20,
  },
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: 16,
  },
});

// Export a simple non-animated version for compatibility
export const SimpleCard = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => {
  const colors = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight }, style]}>
      {children}
    </View>
  );
};