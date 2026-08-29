// File: src/app/_layout.tsx
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { setBackgroundColorAsync } from 'expo-system-ui';
import { useCallback, useEffect } from 'react';
import { View, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MoveVaultModalWrapper } from '../components/MoveVaultModalWrapper';
import { RenameModalWrapper } from '../components/RenameModalWrapper';
import { MoveProvider } from '../contexts/MoveVaultContext';
import { RenameProvider } from '../contexts/RenameContext';
import { CustomThemeProvider, useThemeColors } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';
import { HydrationProvider } from '../contexts/HydrationContext';
import { useLockoutStore } from '../store/lockoutStore';
import { useSettingsStore } from '../store/settingsStore';
import { useVaultStore } from '../store/vaultStore';
import { StorageService } from '../services/storage';
import { initializeDisguiseIcon, setFlagSecure } from '../utils/disguiseIcon';

// Same exemption class as login.tsx's CALC_* constants (§1): this is the
// calculator disguise's own hardcoded black, applied to the OS system-bar
// background so it matches the disguise's un-themed UI. Not a leftover from
// the old palette — never route this through `colors`. Safe to leave opaque:
// with SafeAreaProvider now in the tree, every header covers this region
// with its own themed background, so the system bg never shows through.
const CALC_SYSTEM_BG = '#000000';

SplashScreen.preventAutoHideAsync();

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
       if (mounted) hideSplash().catch(() => {});
     }, 500);

     Promise.all([
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
       <SafeAreaProvider>
         <HydrationProvider>
           <CustomThemeProvider>
             <RenameProvider>
               <MoveProvider>
                 <StatusBar style={statusBarStyle} />
                 <Slot />
                 <RenameModalWrapper />
                 <MoveVaultModalWrapper />
               </MoveProvider>
             </RenameProvider>
           </CustomThemeProvider>
         </HydrationProvider>
       </SafeAreaProvider>
     </GestureHandlerRootView>
   );
 }
