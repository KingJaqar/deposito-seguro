// File: src/components/AnimatedCard.tsx
import React from 'react';
import { GestureResponderEvent, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

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
  const { colors, space, radius } = useTheme();

  const handlePress = (event: GestureResponderEvent) => {
    if (onPress && !disabled) {
      onPress();
    }
  };

  const cardStyle: ViewStyle = {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderLight,
    borderRadius: radius(10),
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: space(4),
    minHeight: 44,
  };

  return (
    <View style={[{ marginVertical: space(1) }, style]}>
      <View style={styles.shadow}>
        <TouchableOpacity
          onPress={handlePress}
          onLongPress={onLongPress}
          activeOpacity={0.92}
          disabled={disabled}
          style={styles.pressable}
        >
          <View style={cardStyle}>
            {children}
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // marginVertical moved to inline style for responsive value
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
});

export const SimpleCard = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => {
  const { colors, space, radius } = useTheme();

  const cardStyle: ViewStyle = {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderLight,
    borderRadius: radius(10),
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: space(4),
    minHeight: 44,
  };

  return (
    <View style={[cardStyle, style]}>
      {children}
    </View>
  );
};
