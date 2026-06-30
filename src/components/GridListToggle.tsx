// File: src/components/GridListToggle.tsx
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { GridListView } from '../types';

interface ToggleProps {
  value: GridListView;
  onChange: (val: GridListView) => void;
}

export const GridListToggle = ({ value, onChange }: ToggleProps) => {
  const { colors, space, font, radius, isTablet, responsiveSize } = useTheme();
  const isList = value === 'list';

  const containerWidth = responsiveSize(120, 160, 200);
  const pillWidth = responsiveSize(44, 52, 60);
  const pillLeft = isList ? space(1) : containerWidth - pillWidth - space(1);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, width: containerWidth }]}>
      <View
        style={[
          styles.pill,
          {
            backgroundColor: colors.primary,
            left: pillLeft,
          },
        ]}
      />
      <TouchableOpacity
        style={styles.btn}
        onPress={() => onChange('list')}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ selected: isList }}
        accessibilityLabel="List view"
      >
        <Text style={[styles.btnText, { color: isList ? '#FFF' : colors.text, fontSize: font(12) }]}>
          List
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => onChange('large-icons')}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ selected: !isList }}
        accessibilityLabel="Grid view"
      >
        <Text style={[styles.btnText, { color: !isList ? '#FFF' : colors.text, fontSize: font(12) }]}>
          Grid
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 8,
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
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    zIndex: 1,
    height: 28,
    minWidth: 44,
  },
  btnText: {
    fontWeight: 'bold',
  },
});
