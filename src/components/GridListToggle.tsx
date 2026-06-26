// File: src/components/GridListToggle.tsx
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../contexts/ThemeContext';
import { GridListView } from '../types';

interface ToggleProps {
  value: GridListView;
  onChange: (val: GridListView) => void;
}

export const GridListToggle = ({ value, onChange }: ToggleProps) => {
  const colors = useThemeColors();
  const isGrid = value === 'grid';

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View
        style={[
          styles.pill,
          {
            backgroundColor: colors.primary,
            left: isGrid ? 4 : 64,
          },
        ]}
      />
      <TouchableOpacity
        style={styles.btn}
        onPress={() => onChange('grid')}
        activeOpacity={0.7}
      >
        <Text style={[styles.btnText, { color: isGrid ? '#FFF' : colors.text }]}>
          Grid
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => onChange('list')}
        activeOpacity={0.7}
      >
        <Text style={[styles.btnText, { color: !isGrid ? '#FFF' : colors.text }]}>
          List
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 4,
    width: 120,
    alignSelf: 'flex-end',
    marginVertical: 8,
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: 4,
    width: 52,
    height: 28,
    borderRadius: 6,
  },
  btn: {
    flex: 1,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    zIndex: 1,
  },
  btnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});
