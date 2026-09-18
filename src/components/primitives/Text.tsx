// Theme-aware text primitive. It keeps React Native's Text API intact while
// applying the app's shared palette and responsive typography by default.
import React from 'react';
import { StyleSheet, Text as NativeText, type TextProps as NativeTextProps, type TextStyle } from 'react-native';
import { archivoFontFamilyForWeight, isArchivoFontFamily, Type, type TypeKey } from '../../constants/typography';
import { useTheme } from '../../contexts/ThemeContext';

export interface TextProps extends NativeTextProps {
  /** Named entry from the app's shared type scale. */
  variant?: TypeKey;
}

export const Text = React.forwardRef<NativeText, TextProps>(function Text(
  { variant = 'body', style, ...props },
  ref
) {
  const { colors, font } = useTheme();
  const type = Type[variant];
  const incoming = StyleSheet.flatten(style) ?? {};
  const requestedFamily = incoming.fontFamily;
  const requestedWeight = incoming.fontWeight;
  const finalFamily = requestedFamily ?? archivoFontFamilyForWeight(requestedWeight ?? type.weight);

  // A single flattened object is intentional: leaving `fontWeight` later in a
  // style array asks Android to synthesize a weight for an already-specific
  // custom face. That can look wrong and has caused release-only failures.
  const resolvedStyle: TextStyle = {
    color: colors.text,
    fontSize: font(type.size),
    fontFamily: finalFamily,
    letterSpacing: type.letterSpacing,
    textTransform: type.textTransform,
    ...incoming,
  };

  if (isArchivoFontFamily(finalFamily)) {
    delete resolvedStyle.fontWeight;
  }

  return (
    <NativeText
      ref={ref}
      style={resolvedStyle}
      {...props}
    />
  );
});

Text.displayName = 'Text';
