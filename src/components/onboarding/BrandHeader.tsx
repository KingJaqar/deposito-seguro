// src/components/onboarding/BrandHeader.tsx
// Shared top-of-screen identity row for the onboarding wizard: the
// DepoS_logo badge plus the "Deposito Seguro / Local vault" wordmark. Used
// as-is (no per-step variant) on steps 1–3 so the header stays identical
// across the overview, master-key, and confirm-key screens. An optional
// back-chevron button renders above it on the master-key/confirm-key steps
// — laid out as its own row with real margin (not stacked on top of the
// badge) so it never overlaps the wordmark.
import { ChevronLeft } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';

const LOGO_SOURCE = require('../../../assets/logo/DepoS_logo.png');

export interface BrandHeaderProps {
  onBack?: () => void;
}

export function BrandHeader({ onBack }: BrandHeaderProps) {
  const { colors, space, font, radius, iconSize, touchTarget } = useTheme();

  return (
    <View>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={10}
          android_ripple={{ color: `${colors.textMuted}29`, borderless: true, radius: 20 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={[styles.backRow, { minWidth: touchTarget(), minHeight: touchTarget(), marginBottom: space(4) }]}
        >
          <ChevronLeft size={iconSize(20)} color={colors.textMuted} strokeWidth={2.25} />
        </Pressable>
      ) : null}

      <View style={styles.row}>
        <View
          style={[
            styles.badge,
            {
              width: iconSize(40),
              height: iconSize(40),
              borderRadius: radius(4),
              backgroundColor: colors.surfaceElevated,
            },
          ]}
        >
          <Image source={LOGO_SOURCE} style={{ width: iconSize(26), height: iconSize(26) }} resizeMode="contain" />
        </View>
        <View style={{ marginLeft: space(3) }}>
          <Text style={[styles.title, { color: colors.text, fontSize: font(Type.subtitle.size) }]}>Deposito Seguro</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>Local vault</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', marginLeft: -8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  badge: { alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '800' },
  subtitle: { fontFamily: 'monospace', fontWeight: '500', marginTop: 2 },
});
