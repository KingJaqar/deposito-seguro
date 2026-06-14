import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../contexts/ThemeContext';
import { GridListView } from '../types';

interface ToggleProps {
  value: GridListView;
  onChange: (val: GridListView) => void;
}

export const GridListToggle = ({ value, onChange }: ToggleProps) => {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <TouchableOpacity 
        style={[styles.btn, value === 'grid' && { backgroundColor: colors.primary }]}
        onPress={() => onChange('grid')}
      >
        <Text style={{ color: value === 'grid' ? '#FFF' : colors.text, fontWeight: 'bold' }}>Grid</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.btn, value === 'list' && { backgroundColor: colors.primary }]}
        onPress={() => onChange('list')}
      >
        <Text style={{ color: value === 'list' ? '#FFF' : colors.text, fontWeight: 'bold' }}>List</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', borderRadius: 8, padding: 4, width: 120, alignSelf: 'flex-end', marginVertical: 8 },
  btn: { flex: 1, paddingVertical: 4, alignItems: 'center', borderRadius: 6 }
});