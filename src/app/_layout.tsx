// File: src/app/_layout.tsx
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { setBackgroundColorAsync } from 'expo-system-ui';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { MoveVaultModalWrapper } from '../components/MoveVaultModalWrapper';
import { RenameModalWrapper } from '../components/RenameModalWrapper';
import { MoveProvider } from '../contexts/MoveVaultContext';
import { RenameProvider } from '../contexts/RenameContext';
import { CustomThemeProvider } from '../contexts/ThemeContext';
import { UnlockProvider } from '../contexts/UnlockContext';
import { useSettingsStore } from '../store/settingsStore';
import { useVaultStore } from '../store/vaultStore';
import { initializeDisguiseIcon, setFlagSecure } from '../utils/disguiseIcon';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
   const hydrateSettings = useSettingsStore((s) => s.hydrateSettings);
   const hydrateVault = useVaultStore((s) => s.hydrateVault);
   const disguiseMode = useSettingsStore((s) => s.disguiseMode);
   const screenshotProtection = useSettingsStore((s) => s.screenshotProtection);
   const [initError, setInitError] = useState<string | null>(null);

    const hideSplash = useCallback(async () => {
      try {
        await SplashScreen.hideAsync();
      } catch (e) {
        // splash already hidden or not supported
      }
    }, []);

    useEffect(() => {
      let mounted = true;
      const fallbackTimer = setTimeout(() => {
        if (mounted) hideSplash().catch(() => {});
      }, 3000);

      Promise.all([hydrateSettings(), hydrateVault()])
        .then(async () => {
          if (!mounted) return;
          await initializeDisguiseIcon();
          if (!mounted) return;
          const currentMode = useSettingsStore.getState().disguiseMode;
          if (currentMode === 'calculator') {
            await setBackgroundColorAsync('#000000');
          }
        })
        .catch((e) => {
          if (!mounted) return;
          console.error('Root init error', e);
          setInitError('Failed to initialize app data. Please restart the app.');
        })
        .finally(() => {
          if (!mounted) return;
          clearTimeout(fallbackTimer);
          hideSplash().catch(() => {});
        });

      return () => {
        mounted = false;
        clearTimeout(fallbackTimer);
      };
    }, [hydrateSettings, hydrateVault, hideSplash]);

   useEffect(() => {
     if (screenshotProtection) {
       setFlagSecure(true).catch(() => {});
     }
   }, [screenshotProtection]);

   const statusBarStyle = disguiseMode === 'calculator' ? 'light' : 'auto';

   if (initError) {
     return (
       <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
         <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', paddingHorizontal: 24 }}>
           {initError}
         </Text>
       </View>
     );
   }

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