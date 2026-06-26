// File: src/contexts/ThemeContext.tsx
import { createContext, ReactNode, useContext, useMemo } from 'react';
import { Palette } from '../constants/Colors';
import { useSettingsStore } from '../store/settingsStore';

const ThemeContext = createContext<typeof Palette.dark | null>(null);

export const CustomThemeProvider = ({ children }: { children: ReactNode }) => {
  const { themeMode, disguiseMode } = useSettingsStore();

  const activePalette = useMemo(() => {
    let palette = Palette[themeMode as keyof typeof Palette] || Palette.dark;
    if (disguiseMode !== 'default') {
      if (disguiseMode === 'calculator') palette = Palette.calculator;
      else if (disguiseMode === 'notes') palette = Palette.notes;
      else if (disguiseMode === 'utility') palette = Palette.utility;
    }
    return palette;
  }, [themeMode, disguiseMode]);

  return (
    <ThemeContext.Provider value={activePalette}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeColors = () => {
  const context = useContext(ThemeContext);
  return context || Palette.dark;
};

// FIXED: Added useTheme hook to supply colors and isDark flag to the dashboard
export const useTheme = () => {
  const context = useContext(ThemeContext);
  const colors = context || Palette.dark;
  const { themeMode, updateSetting } = useSettingsStore();

  // Flips strictly between dark <-> light, regardless of current mode (including
  // 'amoled'), since the dashboard redesign only exposes a two-state toggle.
  // Disguise mode is untouched by this — it's a separate setting.
  const toggleTheme = () => {
    updateSetting('themeMode', themeMode === 'light' ? 'dark' : 'light');
  };

  return {
    colors,
    isDark: themeMode !== 'light',
    themeMode,
    toggleTheme,
  };
};