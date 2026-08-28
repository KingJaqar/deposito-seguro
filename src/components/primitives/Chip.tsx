// src/components/primitives/Chip.tsx
// Replaces the category-filter-pill markup duplicated verbatim in
// trash.tsx/favorites.tsx/search.tsx. Active/inactive is never color-only
// (§6): a checkmark-style active indicator and label-weight change accompany
// the color change.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Check } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  color?: string;
  disabled?: boolean;
}

export function Chip({ label, selected = false, onPress, icon: Icon, color, disabled = false }: ChipProps) {
  const { colors, space, font, radius, iconSize, touchTarget } = useTheme();
  const tint = color ?? colors.primary;
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      android_ripple={disabled ? undefined : { color: `${colors.text}14` }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.chip,
        {
          minHeight: touchTarget() - 12,
          paddingHorizontal: space(3),
          borderRadius: radius(3),
          backgroundColor: selected ? `${tint}1F` : colors.surfaceHover,
          borderColor: focused && !disabled ? colors.secondary : selected ? tint : colors.borderLight,
          borderWidth: focused && !disabled ? StyleSheet.hairlineWidth * 2 : StyleSheet.hairlineWidth,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {selected && <Check size={iconSize(13)} color={tint} strokeWidth={3} style={{ marginRight: space(1) }} />}
      {Icon && !selected && <Icon size={iconSize(13)} color={colors.textMuted} strokeWidth={2.5} style={{ marginRight: space(1) }} />}
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          { fontSize: font(Type.label.size), color: selected ? tint : colors.textSecondary, fontWeight: selected ? '700' : '500' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {},
});
