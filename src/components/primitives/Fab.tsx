// src/components/primitives/Fab.tsx
// Thin circular wrapper around Button styling for the dashboard's create-
// vault FAB. Kept separate rather than overloading Button with a shape prop.
import React, { useState } from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';

export interface FabProps {
  icon: LucideIcon;
  onPress: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
}

export function Fab({ icon: Icon, onPress, size = 56, style, accessibilityLabel }: FabProps) {
  const { colors, shadow, iconSize } = useTheme();
  const scaledSize = iconSize(size);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      android_ripple={{ color: `${colors.fabText}33`, borderless: true, radius: scaledSize / 2 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        shadow('xl'),
        styles.fab,
        {
          width: scaledSize,
          height: scaledSize,
          borderRadius: scaledSize / 2,
          backgroundColor: colors.fabBg,
          borderColor: focused ? colors.secondary : 'transparent',
          borderWidth: focused ? 2 : 0,
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
        style,
      ]}
    >
      <Icon size={scaledSize * 0.43} color={colors.fabText} strokeWidth={2.5} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
