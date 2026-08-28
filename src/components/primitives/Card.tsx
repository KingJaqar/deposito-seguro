// src/components/primitives/Card.tsx
// Formalizes and fully replaces AnimatedCard/SimpleCard. Shadow+hairline-
// border pairing baked in by default (§4 — cheap, and fixes shadows being
// nearly invisible against the amoled palette's true-black background).
// Absorbs settings/storage.tsx's local StatCard and settings/index.tsx's
// local SettingCard shape (both are just Card + content).
import React, { useState } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  elevation?: 'sm' | 'md' | 'lg';
  accessibilityLabel?: string;
}

export function Card({
  children,
  onPress,
  onLongPress,
  disabled = false,
  style,
  elevation = 'sm',
  accessibilityLabel,
}: CardProps) {
  const { colors, space, radius, shadow } = useTheme();
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);

  const cardStyle: ViewStyle = {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderLight,
    borderRadius: radius(8),
    borderWidth: StyleSheet.hairlineWidth,
    padding: space(4),
  };

  if (!onPress && !onLongPress) {
    return <View style={[shadow(elevation), cardStyle, style]}>{children}</View>;
  }

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={disabled}
      android_ripple={{ color: `${colors.text}14` }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[
        shadow(pressed ? 'md' : elevation),
        cardStyle,
        {
          borderColor: focused ? colors.secondary : colors.borderLight,
          borderWidth: focused ? StyleSheet.hairlineWidth * 2 : StyleSheet.hairlineWidth,
          opacity: disabled ? 0.5 : pressed ? 0.96 : 1,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
