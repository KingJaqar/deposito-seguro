// File: src/components/AnimatedCard.tsx
import React from 'react';
import { GestureResponderEvent, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
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
  delay = 0,
}: AnimatedCardProps) => {
  const colors = useThemeColors();

  const handlePress = (event: GestureResponderEvent) => {
    if (onPress && !disabled) {
      onPress();
    }
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.shadow}>
        <TouchableOpacity
          onPress={handlePress}
          onLongPress={onLongPress}
          activeOpacity={0.92}
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
      </View>
    </View>
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

export const SimpleCard = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => {
  const colors = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight }, style]}>
      {children}
    </View>
  );
};
