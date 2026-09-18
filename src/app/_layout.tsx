// File: src/app/_layout.tsx
import { Slot } from 'expo-router';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { setBackgroundColorAsync } from 'expo-system-ui';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BootSplash } from '../components/BootSplash';
import { MoveVaultModalWrapper } from '../components/MoveVaultModalWrapper';
import { RenameModalWrapper } from '../components/RenameModalWrapper';
import { MoveProvider } from '../contexts/MoveVaultContext';
import { RenameProvider } from '../contexts/RenameContext';
import { CustomThemeProvider, useThemeColors } from '../contexts/ThemeContext';
import { FontFamily, Type } from '../constants/typography';
import { Text } from '../components/primitives/Text';
import { HydrationProvider } from '../contexts/HydrationContext';
import { DisguiseIconTheme } from '../types';
import { useLockoutStore } from '../store/lockoutStore';
import { useSettingsStore } from '../store/settingsStore';
import { useVaultStore } from '../store/vaultStore';
import { StorageService } from '../services/storage';
import { initializeDisguiseIcon, setFlagSecure } from '../utils/disguiseIcon';
import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
} from '@expo-google-fonts/archivo';
import { ArchivoBlack_400Regular } from '@expo-google-fonts/archivo-black';

// How long the JS boot splash (BootSplash) stays visible after the native
// splash hides, so the correct branded image (§ bootSplashProps below) is
// actually seen by the user rather than being swapped in and out on the
// same frame. Purely cosmetic — hydration itself is not gated on this.
const BOOT_SPLASH_LINGER_MS = 400;

// Same exemption class as login.tsx's CALC_* constants (§1): this is the
// calculator disguise's own hardcoded black, applied to the OS system-bar
// background so it matches the disguise's un-themed UI. Not a leftover from
// the old palette — never route this through `colors`. Safe to leave opaque:
// with SafeAreaProvider now in the tree, every header covers this region
// with its own themed background, so the system bg never shows through.
const CALC_SYSTEM_BG = '#000000';

SplashScreen.preventAutoHideAsync();

const archivoFonts = {
  [FontFamily.regular]: Archivo_400Regular,
  [FontFamily.medium]: Archivo_500Medium,
  [FontFamily.semiBold]: Archivo_600SemiBold,
  [FontFamily.bold]: Archivo_700Bold,
  [FontFamily.extraBold]: Archivo_800ExtraBold,
  [FontFamily.black]: Archivo_900Black,
  [FontFamily.display]: ArchivoBlack_400Regular,
};

export default function RootLayout() {
  // Rendered before CustomThemeProvider mounts (the error branch below can
  // fire pre-provider), so this resolves to the Palette.dark fallback per
  // useThemeColors()'s own documented fallback — a deliberate neutral choice
  // for a hard-failure screen, not a bug. Restyled onto tokens per §7 Phase
  // 3; the hydration/error control flow itself is untouched.
  const colors = useThemeColors();
  const disguiseMode = useSettingsStore((s) => s.disguiseMode);
  const screenshotProtection = useSettingsStore((s) => s.screenshotProtection);
  const settingsError = useSettingsStore((s) => s.hydrationError);
  const vaultError = useVaultStore((s) => s._vaultHydrationError);

  // Keeps the JS splash image-free until AsyncStorage confirms the disguise
  // choice. The native splash also has no image: that removes every path that
  // could expose the Deposito Seguro logo before calculator spoofing is known.
  const [bootSplashProps, setBootSplashProps] = useState<{ resolved: boolean; disguised: boolean; iconTheme: DisguiseIconTheme }>({
    resolved: false,
    disguised: false,
    iconTheme: 'default',
  });
  const [showBootSplash, setShowBootSplash] = useState(true);

  const hideSplash = useCallback(async () => {
    try {
      await SplashScreen.hideAsync();
    } catch {
      // splash already hidden or not supported
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const timer = setTimeout(() => {
      if (mounted) hideSplash().catch(() => { });
    }, 500);

    Promise.all([
      // The boot splash covers the app until the faces are registered. A
      // failed asset must never prevent access to the encrypted vault.
      Font.loadAsync(archivoFonts).catch((error) => {
        console.error('Archivo font load error', error);
      }),
      useSettingsStore.getState().hydrateSettings(),
      useVaultStore.getState().hydrateVault(),
      useLockoutStore.getState().hydrateLockouts(),
      // Item 9: independent of the three hydrate calls above (scans the
      // sandbox directory itself, not vault metadata — see its own doc
      // comment), so it runs alongside them rather than waiting its turn.
      StorageService.sweepOrphanedPlaintextTempFiles(),
    ])
      .then(async () => {
        if (!mounted) return;
        await initializeDisguiseIcon();
        if (!mounted) return;
        const currentMode = useSettingsStore.getState().disguiseMode;
        const currentIconTheme = useSettingsStore.getState().disguiseIconTheme;
        // Set before hideSplash() below so the first visible splash image is
        // the correct one. Before this point both native and JS splash layers
        // are intentionally image-free.
        setBootSplashProps({ resolved: true, disguised: currentMode === 'calculator', iconTheme: currentIconTheme });
        if (currentMode === 'calculator') {
          await setBackgroundColorAsync(CALC_SYSTEM_BG);
        }
      })
      .catch((e) => {
        if (!mounted) return;
        console.error('Root init error', e);
      })
      .finally(() => {
        if (!mounted) return;
        clearTimeout(timer);
        hideSplash().catch(() => { });
        setTimeout(() => {
          if (mounted) setShowBootSplash(false);
        }, BOOT_SPLASH_LINGER_MS);
      });

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [hideSplash]);

  useEffect(() => {
    if (screenshotProtection) {
      setFlagSecure(true).catch(() => { });
    }
  }, [screenshotProtection]);

  const combinedError = settingsError || vaultError;

  if (combinedError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <Text style={{ color: colors.text, fontSize: Type.body.size, fontWeight: Type.body.weight, textAlign: 'center', paddingHorizontal: 24 }}>
          {combinedError}
        </Text>
      </View>
    );
  }

  const statusBarStyle = disguiseMode === 'calculator' ? 'light' : 'auto';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider statusBarTranslucent>
        <SafeAreaProvider>
          <HydrationProvider>
            <CustomThemeProvider>
              <RenameProvider>
                <MoveProvider>
                  <StatusBar style={statusBarStyle} />
                  <Slot />
                  <RenameModalWrapper />
                  <MoveVaultModalWrapper />
                  {showBootSplash && <BootSplash resolved={bootSplashProps.resolved} disguised={bootSplashProps.disguised} iconTheme={bootSplashProps.iconTheme} />}
                </MoveProvider>
              </RenameProvider>
            </CustomThemeProvider>
          </HydrationProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
