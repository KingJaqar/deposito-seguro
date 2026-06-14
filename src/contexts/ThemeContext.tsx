import { Palette } from '../constants/Colors';
import { useSettingsStore } from '../store/settingsStore';
import { createContext, ReactNode, useContext, useMemo } from 'react';

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