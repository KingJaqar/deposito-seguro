import { StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface StyledButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
}

export const StyledButton = ({ title, onPress, variant = 'primary', disabled = false, style }: StyledButtonProps) => {
  const { colors, space, font, radius } = useTheme();
  const bg = variant === 'primary' ? colors.primary : colors.error;

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        { backgroundColor: bg, paddingVertical: space(3), paddingHorizontal: space(4), borderRadius: radius(8) },
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={[styles.txt, { fontSize: font(14) }]}>{title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  txt: {
    color: '#FFF',
    fontWeight: '600',
  },
});
