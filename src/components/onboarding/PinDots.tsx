// src/components/onboarding/PinDots.tsx
// Row of filled/empty dots reflecting how many digits of the target-length
// PIN have been entered so far — used by both the master-key and
// confirm-key onboarding steps.
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

export interface PinDotsProps {
  length: number;
  total: number;
}

export function PinDots({ length, total }: PinDotsProps) {
  const { colors, space, iconSize } = useTheme();

  return (
    <View
      style={[styles.row, { gap: space(3) }]}
      accessibilityRole="text"
      accessibilityLabel={`${length} of ${total} digits entered`}
    >
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < length;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              {
                width: iconSize(10),
                height: iconSize(10),
                borderRadius: iconSize(5),
                backgroundColor: filled ? colors.primary : 'transparent',
                borderColor: filled ? colors.primary : colors.border,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { borderWidth: 1.5 },
});
