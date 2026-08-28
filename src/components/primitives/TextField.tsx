// src/components/primitives/TextField.tsx
// label/error/helper/secure-toggle, replacing 6 duplicated eye-icon blocks
// across auth-key.tsx/access-keys.tsx/register.tsx (§4). Errors always
// surface as icon+text, never a bare red border (§6).
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { Eye, EyeOff, CircleAlert } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  label?: string;
  error?: string;
  helper?: string;
  secureToggle?: boolean;
  secureTextEntry?: boolean;
  /** Tighter vertical rhythm for dense forms — still respects MIN_TOUCH_TARGET. */
  dense?: boolean;
}

export function TextField({
  label,
  error,
  helper,
  secureToggle = false,
  secureTextEntry,
  dense = false,
  value,
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const { colors, space, font, radius, iconSize, touchTarget } = useTheme();
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);

  const isSecure = secureToggle ? !reveal : secureTextEntry;
  const borderColor = error ? colors.error : focused ? colors.primary : colors.border;

  return (
    <View style={{ width: '100%', marginBottom: dense ? space(3) : space(4) }}>
      {label ? (
        <Text style={[styles.label, { fontSize: font(Type.label.size), color: colors.textSecondary, marginBottom: space(dense ? 1 : 2) }]}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.inputRow,
          {
            borderColor,
            borderWidth: focused || error ? 2 : 1,
            borderRadius: radius(5),
            backgroundColor: colors.background,
            paddingHorizontal: space(dense ? 3 : 4),
            minHeight: touchTarget(),
          },
        ]}
      >
        <TextInput
          {...inputProps}
          value={value}
          secureTextEntry={isSecure}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          accessibilityLabel={label ?? inputProps.accessibilityLabel}
          accessibilityHint={helper}
          style={[styles.input, { color: colors.text, fontSize: font(Type.body.size), paddingVertical: dense ? 8 : 12 }]}
        />
        {secureToggle && (
          <Pressable
            onPress={() => setReveal((r) => !r)}
            hitSlop={10}
            android_ripple={{ color: `${colors.textMuted}29`, borderless: true, radius: 20 }}
            accessibilityRole="button"
            accessibilityLabel={reveal ? 'Hide value' : 'Show value'}
            style={styles.toggle}
          >
            {reveal ? (
              <EyeOff size={iconSize(20)} color={colors.textMuted} strokeWidth={2} />
            ) : (
              <Eye size={iconSize(20)} color={colors.textMuted} strokeWidth={2} />
            )}
          </Pressable>
        )}
      </View>
      {error ? (
        <View style={[styles.helperRow, { marginTop: space(2) }]}>
          <CircleAlert size={iconSize(14)} color={colors.error} strokeWidth={2.5} />
          <Text style={[styles.helperText, { fontSize: font(Type.caption.size), color: colors.error, marginLeft: space(1) }]}>
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text style={[styles.helperText, { fontSize: font(Type.caption.size), color: colors.textMuted, marginTop: space(2) }]}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontWeight: '600',
  },
  inputRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    paddingVertical: 12,
  },
  toggle: {
    padding: 4,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  helperText: {
    fontWeight: '500',
  },
});
