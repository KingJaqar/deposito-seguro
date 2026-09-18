// src/components/BootSplash.tsx
// JS-rendered splash. The native splash is intentionally image-free because
// it appears before JavaScript can read the persisted disguise setting. Once
// the setting hydrates, RootLayout renders only the matching logo or
// calculator icon, so a spoofed launch never exposes the Deposito Seguro mark.
import { Image, StyleSheet, View } from 'react-native';
import type { DisguiseIconTheme } from '../types';

const LOGO_SOURCE = require('../../assets/logo/DepoS_logo.png');

// Mirrors settings/index.tsx's own theme picker (§ disguiseIconTheme) — the
// same four options, 'default' resolving to the same white icon asset since
// that is also the app's default/undisguised icon (see app.json's "icon").
const CALC_ICON_SOURCES: Record<DisguiseIconTheme, ReturnType<typeof require>> = {
  default: require('../../assets/icons/calculator-icons/calculator-icon-black-white.png'),
  white: require('../../assets/icons/calculator-icons/calculator-icon-black-white.png'),
  orange: require('../../assets/icons/calculator-icons/calculator-icon-black-orange.png'),
  red: require('../../assets/icons/calculator-icons/calculator-icon-black-red.png'),
};

// NORMAL_BG matches app.json's image-free native splash background.
// CALC_BG matches login.tsx's CALC_BG for the calculator disguise itself —
// kept as separate literals (not imported) since neither is a themed token.
const NORMAL_BG = '#121212';
const CALC_BG = '#000000';

export interface BootSplashProps {
  resolved: boolean;
  disguised: boolean;
  iconTheme: DisguiseIconTheme;
}

export function BootSplash({ resolved, disguised, iconTheme }: BootSplashProps) {
  const source = resolved ? (disguised ? CALC_ICON_SOURCES[iconTheme] : LOGO_SOURCE) : null;
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.fill, { backgroundColor: disguised ? CALC_BG : NORMAL_BG }]}
      pointerEvents="none"
    >
      {source && <Image source={source} style={styles.image} resizeMode="contain" />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    elevation: 999,
  },
  image: { width: 160, height: 160 },
});
