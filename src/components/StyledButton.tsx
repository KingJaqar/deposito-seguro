import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useThemeColors } from '../contexts/ThemeContext';

interface StyledButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'danger';
}

export const StyledButton = ({ title, onPress, variant = 'primary' }: StyledButtonProps) => {
  const colors = useThemeColors();
  const bg = variant === 'primary' ? colors.primary : colors.error;

  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={styles.txt}>{title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  txt: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
