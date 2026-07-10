// File: src/app/_layout.tsx
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { setBackgroundColorAsync } from 'expo-system-ui';
import { useCallback, useEffect } from 'react';
import { MoveVaultModalWrapper } from '../components/MoveVaultModalWrapper';
import { RenameModalWrapper } from '../components/RenameModalWrapper';
import { MoveProvider } from '../contexts/MoveVaultContext';
import { RenameProvider } from '../contexts/RenameContext';
import { CustomThemeProvider } from '../contexts/ThemeContext';
import { UnlockProvider } from '../contexts/UnlockContext';
import { useSettingsStore } from '../store/settingsStore';
import { useVaultStore } from '../store/vaultStore';
import { initializeDisguiseIcon } from '../utils/disguiseIcon';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
   const hydrateSettings = useSettingsStore((s) => s.hydrateSettings);
   const hydrateVault = useVaultStore((s) => s.hydrateVault);
   const disguiseMode = useSettingsStore((s) => s.disguiseMode);

   const hideSplash = useCallback(async () => {
     try {
       await SplashScreen.hideAsync();
     } catch (e) {
       // Splash screen already hidden or not supported
     }
   }, []);

    useEffect(() => {
      hydrateSettings();
      hydrateVault();
      initializeDisguiseIcon();
    }, [hydrateSettings, hydrateVault]);

    useEffect(() => {
      if (disguiseMode === 'calculator') {
        setBackgroundColorAsync('#000000');
        hideSplash();
      }
    }, [disguiseMode, hideSplash]);

    useEffect(() => {
      if (disguiseMode !== 'calculator') {
        const timer = setTimeout(() => {
          hideSplash();
        }, 800);
        return () => clearTimeout(timer);
      }
    }, [disguiseMode, hideSplash]);

   const statusBarStyle = disguiseMode === 'calculator' ? 'light' : 'auto';

    return (
      <CustomThemeProvider>
      <RenameProvider>
        <MoveProvider>
          <UnlockProvider>
            <StatusBar style={statusBarStyle} />
            <Slot />
            <RenameModalWrapper />
            <MoveVaultModalWrapper />
          </UnlockProvider>
        </MoveProvider>
      </RenameProvider>
      </CustomThemeProvider>
    );
 }