import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
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
  const hydrateSettings = useSettingsStore((s) => s.hydrateSettings);
  const hydrateVault = useVaultStore((s) => s.hydrateVault);

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([hydrateSettings(), hydrateVault()])
      .catch((e) => console.error('Background hydration error', e))
      .finally(() => {
        if (!cancelled) {
          setIsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hydrateSettings, hydrateVault]);

  const error = settingsError || vaultError;

  const value = {
    isReady,
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
