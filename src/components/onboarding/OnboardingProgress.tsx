// src/components/onboarding/OnboardingProgress.tsx
// The 4-segment step indicator + "Step N · Label" caption shared by every
// onboarding screen. Per the reference screens only the *current* step's
// segment is highlighted (not a cumulative fill) — passing activeStep={0}
// (the sealed/done screen) renders all four segments inactive, matching
// "onboarding 5 done setup.png" exactly.
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';

export interface OnboardingProgressProps {
  totalSteps?: number;
  /** 1-based index of the highlighted segment; 0 highlights none. */
  activeStep: number;
  label: string;
}

export function OnboardingProgress({ totalSteps = 4, activeStep, label }: OnboardingProgressProps) {
  const { colors, space, font, radius, iconSize } = useTheme();

  return (
    <View>
      <View style={[styles.track, { gap: space(2), marginBottom: space(4) }]}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              {
                height: iconSize(3),
                borderRadius: radius(1),
                backgroundColor: i + 1 === activeStep ? colors.primary : colors.borderLight,
              },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.label, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row' },
  segment: { flex: 1 },
  label: { fontFamily: 'monospace', fontWeight: '500' },
});
