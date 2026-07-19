// File: src/app/_layout.tsx
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { setBackgroundColorAsync } from 'expo-system-ui';
import { useCallback, useEffect } from 'react';
import { View, Text } from 'react-native';
import { MoveVaultModalWrapper } from '../components/MoveVaultModalWrapper';
import { RenameModalWrapper } from '../components/RenameModalWrapper';
import { MoveProvider } from '../contexts/MoveVaultContext';
import { RenameProvider } from '../contexts/RenameContext';
import { CustomThemeProvider } from '../contexts/ThemeContext';
import { UnlockProvider } from '../contexts/UnlockContext';
import { HydrationProvider } from '../contexts/HydrationContext';
import { useSettingsStore } from '../store/settingsStore';
import { useVaultStore } from '../store/vaultStore';
import { initializeDisguiseIcon, setFlagSecure } from '../utils/disguiseIcon';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
   const disguiseMode = useSettingsStore((s) => s.disguiseMode);
   const screenshotProtection = useSettingsStore((s) => s.screenshotProtection);
   const settingsError = useSettingsStore((s) => s.hydrationError);
   const vaultError = useVaultStore((s) => s._vaultHydrationError);

   const hideSplash = useCallback(async () => {
     try {
       await SplashScreen.hideAsync();
     } catch (e) {
       // splash already hidden or not supported
     }
   }, []);

   useEffect(() => {
     let mounted = true;
     const timer = setTimeout(() => {
       if (mounted) hideSplash().catch(() => {});
     }, 500);

     Promise.all([
       useSettingsStore.getState().hydrateSettings(),
       useVaultStore.getState().hydrateVault(),
     ])
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
       })
       .finally(() => {
         if (!mounted) return;
         clearTimeout(timer);
         hideSplash().catch(() => {});
       });

     return () => {
       mounted = false;
       clearTimeout(timer);
     };
   }, [hideSplash]);

   useEffect(() => {
     if (screenshotProtection) {
       setFlagSecure(true).catch(() => {});
     }
   }, [screenshotProtection]);

   const combinedError = settingsError || vaultError;

   if (combinedError) {
     return (
       <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
         <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', paddingHorizontal: 24 }}>
           {combinedError}
         </Text>
       </View>
     );
   }

   const statusBarStyle = disguiseMode === 'calculator' ? 'light' : 'auto';

   return (
     <HydrationProvider>
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
     </HydrationProvider>
   );
 }
