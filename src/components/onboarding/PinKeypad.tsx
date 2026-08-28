// src/components/onboarding/PinKeypad.tsx
// Square-key numeric keypad for the master-key/confirm-key onboarding steps —
// distinct from login.tsx's round keypad (PIN entry there also has a "clear
// all" key; this one is digits + backspace only, matching the onboarding
// screen references exactly: a 3-column grid, blank/0/backspace on the last
// row). Purely a dumb input widget — the parent owns the PIN string and
// decides when a full PIN triggers auto-advance.
import { Delete } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

const ROWS: (string | null)[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [null, '0', 'backspace'],
];

export interface PinKeypadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
}

export function PinKeypad({ value, onChange, maxLength = 6, disabled = false }: PinKeypadProps) {
  const { colors, space, font, radius, iconSize } = useTheme();

  const press = (key: string | null) => {
    if (disabled || key === null) return;
    if (key === 'backspace') {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= maxLength) return;
    onChange(value + key);
  };

  return (
    <View style={{ gap: space(3) }}>
      {ROWS.map((row, ri) => (
        <View key={ri} style={[styles.row, { gap: space(3) }]}>
          {row.map((key, ci) => {
            if (key === null) {
              return <View key={`blank-${ri}-${ci}`} style={styles.cell} />;
            }
            const isBackspace = key === 'backspace';
            return (
              <Pressable
                key={key}
                onPress={() => press(key)}
                disabled={disabled}
                android_ripple={{ color: `${colors.text}1F` }}
                accessibilityRole="button"
                accessibilityLabel={isBackspace ? 'Backspace' : `Digit ${key}`}
                style={({ pressed }) => [
                  styles.cell,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: radius(5),
                    opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
                  },
                ]}
              >
                {isBackspace ? (
                  <Delete size={iconSize(20)} color={colors.textMuted} strokeWidth={2} />
                ) : (
                  <Text style={[styles.digit, { color: colors.text, fontSize: font(22) }]}>{key}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  cell: { flex: 1, aspectRatio: 1.55, alignItems: 'center', justifyContent: 'center' },
  digit: { fontWeight: '600' },
});
