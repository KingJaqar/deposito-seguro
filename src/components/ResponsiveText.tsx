// src/components/ResponsiveText.tsx
// Drop-in replacement for <Text> that applies responsive font scaling.
// Usage: <ResponsiveText size="md" weight="700">Hello</ResponsiveText>

import { Text, TextProps, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

type TextSize = 'xs' | 'sm' | 'base' | 'md' | 'lg' | 'xl' | 'xxl' | 'display';
type TextWeight = '400' | '500' | '600' | '700' | '800';

interface ResponsiveTextProps extends TextProps {
  size?: TextSize;
  weight?: TextWeight;
  color?: string;
  center?: boolean;
}

const SIZE_MAP: Record<TextSize, number> = {
  xs: 11,
  sm: 12,
  base: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 34,
};

export const ResponsiveText = ({
  size = 'base',
  weight = '400',
  color,
  center = false,
  style,
  ...rest
}: ResponsiveTextProps) => {
  const { font, colors } = useTheme();
  const resolvedColor = color ?? colors.text;

  const fontSize = font(SIZE_MAP[size]);
  const fontWeight = weight as TextWeight;

  return (
    <Text
      style={[
        { color: resolvedColor, fontSize, fontWeight },
        center && styles.center,
        style,
      ]}
      {...rest}
    />
  );
};

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
});
