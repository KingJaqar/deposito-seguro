import { Slot } from 'expo-router';
import { useEffect } from 'react';
import { CustomThemeProvider } from '../contexts/ThemeContext';
import { useSettingsStore } from '../store/settingsStore';
import { useVaultStore } from '../store/vaultStore';

export default function RootLayout() {
   const { hydrateSettings } = useSettingsStore();
   const { hydrateVault } = useVaultStore();

   useEffect(() => {
     hydrateSettings();
     hydrateVault();
   }, [hydrateSettings, hydrateVault]);

   return (
     <CustomThemeProvider>
       <Slot />
     </CustomThemeProvider>
   );
 }