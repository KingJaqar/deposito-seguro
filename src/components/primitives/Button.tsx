// src/components/primitives/Button.tsx
// Per plans/you-are-a-senior-majestic-swing.md §4/§5 — replaces StyledButton.tsx
// entirely. Material structure (state layer, ripple), flat rendering (solid
// fill, no gradients). MIN_TOUCH_TARGET is a non-optional floor.
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const SIZE_HEIGHT: Record<ButtonSize, number> = { sm: 38, md: 48, lg: 56 };
const SIZE_FONT: Record<ButtonSize, number> = { sm: Type.label.size, md: Type.body.size, lg: Type.subtitle.size };
const SIZE_ICON: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon: Icon,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const { colors, space, font, radius, iconSize, touchTarget } = useTheme();
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isDisabled = disabled || loading;

  const palette = (() => {
    switch (variant) {
      case 'primary':
        return { bg: colors.primary, fg: colors.onPrimary, border: 'transparent' };
      case 'secondary':
        return { bg: colors.secondary, fg: colors.onPrimary, border: 'transparent' };
      case 'danger':
        return { bg: colors.error, fg: colors.onPrimary, border: 'transparent' };
      case 'tertiary':
        return { bg: colors.surfaceHover, fg: colors.text, border: colors.borderLight };
      case 'ghost':
        return { bg: 'transparent', fg: colors.primary, border: 'transparent' };
    }
  })();

  // Material "state layer": an 8-12% black/white overlay tint over the base
  // surface for pressed feedback, not a swap to a different hardcoded color.
  const stateLayerColor = variant === 'ghost' || variant === 'tertiary' ? colors.text : colors.onPrimary;
  const height = Math.max(iconSize(SIZE_HEIGHT[size]), touchTarget());

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={isDisabled}
      android_ripple={{ color: `${stateLayerColor}29`, borderless: false }}
      hitSlop={height < touchTarget() ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        {
          height,
          minWidth: touchTarget(),
          backgroundColor: palette.bg,
          borderColor: focused ? colors.secondary : palette.border,
          borderWidth: palette.border === 'transparent' && !focused ? 0 : StyleSheet.hairlineWidth * (focused ? 2 : 1),
          borderRadius: radius(5),
          paddingHorizontal: space(5),
          opacity: isDisabled ? 0.5 : 1,
        },
        // iOS has no ripple — approximate the state layer with opacity on press.
        Platform.OS === 'ios' && pressed && !isDisabled ? { opacity: 0.85 } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <View style={styles.content}>
          {Icon && <Icon size={iconSize(SIZE_ICON[size])} color={palette.fg} strokeWidth={2.25} style={{ marginRight: space(2) }} />}
          <Text
            numberOfLines={1}
            style={[styles.label, { color: palette.fg, fontSize: font(SIZE_FONT[size]) }]}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '700',
  },
});
