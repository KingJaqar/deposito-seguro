// src/components/primitives/Badge.tsx
// Small icon-only lock/key/star indicator used on vault/file tiles. Icon +
// color always paired (§6) — never a color-only dot.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';

export interface BadgeProps {
  icon: LucideIcon;
  color?: string;
  size?: number;
}

export function Badge({ icon: Icon, color, size = 22 }: BadgeProps) {
  const { colors, shadow, iconSize } = useTheme();
  const scaledSize = iconSize(size);
  const tint = color ?? colors.primary;

  return (
    <View
      style={[
        shadow('sm'),
        styles.badge,
        {
          width: scaledSize,
          height: scaledSize,
          borderRadius: scaledSize / 2,
          backgroundColor: colors.surface,
          borderColor: colors.borderLight,
        },
      ]}
    >
      <Icon size={scaledSize * 0.6} color={tint} strokeWidth={2.5} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
