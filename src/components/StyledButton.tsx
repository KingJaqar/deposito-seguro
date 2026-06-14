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
      activeOpacity={0.7}
    >
      <Text style={styles.txt}>{title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: { padding: 14, borderRadius: 8, alignItems: 'center', marginVertical: 8, cursor: 'pointer' },
  txt: { color: '#FFF', fontWeight: '700', fontSize: 16 }
});