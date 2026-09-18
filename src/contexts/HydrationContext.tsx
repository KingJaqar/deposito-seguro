import { createContext, ReactNode, useContext } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { useVaultStore } from '../store/vaultStore';

interface HydrationContextValue {
  isReady: boolean;
  settingsReady: boolean;
  vaultReady: boolean;
  error: string | null;
}

const HydrationContext = createContext<HydrationContextValue>({
  isReady: false,
  settingsReady: false,
  vaultReady: false,
  error: null,
});

export function HydrationProvider({ children }: { children: ReactNode }) {
  const settingsHydrated = useSettingsStore((s) => s.isHydrated);
  const vaultHydrated = useVaultStore((s) => s._isVaultHydrated);
  const settingsError = useSettingsStore((s) => s.hydrationError);
  const vaultError = useVaultStore((s) => s._vaultHydrationError);
  const error = settingsError || vaultError;

  const value = {
    isReady: settingsHydrated && vaultHydrated,
    settingsReady: settingsHydrated,
    vaultReady: vaultHydrated,
    error,
  };

  return (
    <HydrationContext.Provider value={value}>
      {children}
    </HydrationContext.Provider>
  );
}

export function useHydration() {
  return useContext(HydrationContext);
}
