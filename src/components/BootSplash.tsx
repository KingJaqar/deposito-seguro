// src/components/BootSplash.tsx
// JS-rendered continuation of the native boot splash. The native splash
// configured in app.json (expo-splash-screen) renders before any JS runs,
// so it cannot know the user's disguise setting — that only becomes
// available once settingsStore hydrates from AsyncStorage. RootLayout
// (src/app/_layout.tsx) keeps the native splash up for the whole hydration
// window, then mounts this overlay on top of the routed screen with the
// now-known disguise state before hiding the native splash, so the very
// first branded frame the user sees already matches their disguise choice
// instead of leaking the real "Deposito Seguro" identity while disguised.
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

// NORMAL_BG matches app.json's expo-splash-screen plugin backgroundColor;
// CALC_BG matches login.tsx's CALC_BG for the calculator disguise itself —
// kept as separate literals (not imported) since neither is a themed token.
const NORMAL_BG = '#121212';
const CALC_BG = '#000000';

export interface BootSplashProps {
  disguised: boolean;
  iconTheme: DisguiseIconTheme;
}

export function BootSplash({ disguised, iconTheme }: BootSplashProps) {
  const source = disguised ? CALC_ICON_SOURCES[iconTheme] : LOGO_SOURCE;
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.fill, { backgroundColor: disguised ? CALC_BG : NORMAL_BG }]}
      pointerEvents="none"
    >
      <Image source={source} style={styles.image} resizeMode="contain" />
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
