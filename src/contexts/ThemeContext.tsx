// File: src/contexts/ThemeContext.tsx
import { createContext, ReactNode, useContext, useMemo } from 'react';
import { useWindowDimensions, Platform } from 'react-native';
import { Palette, ThemeColors } from '../constants/Colors';
import { getShadow, type ShadowKey } from '../constants/shadows';
import { getRadius, radius as radiusScale, type RadiusKey } from '../constants/radius';
import { useSettingsStore } from '../store/settingsStore';
import {
  spacing as spacingScale,
  getSpacing,
  breakpoints,
  isTablet as detectTablet,
  isPhone as detectPhone,
  isSmallPhone as detectSmallPhone,
  getFontScale,
  scaleFont,
  clampSize,
  getGridColumns,
  getGridItemWidth,
  getResponsiveSize,
  getBreakpoint,
  percentageWidth,
  percentageHeight,
  type SpacingKey,
  type Breakpoint,
} from '../utils/responsive';

export interface ShadowToken {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

interface ResponsiveThemeValues {
  spacing: Record<SpacingKey, number>;
  space: (key: SpacingKey) => number;
  screenPadding: number;
  headerPaddingTop: number;
  bottomTabSpacing: number;
  breakpoint: Breakpoint;
  isTablet: boolean;
  isPhone: boolean;
  isSmallPhone: boolean;
  font: (baseSize: number, maxScale?: number, minScale?: number) => number;
  clampSize: (minSize: number, maxSize: number) => number;
  responsiveSize: (phone: number, tablet: number, desktop?: number) => number;
  gridColumns: (viewMode: 'list' | 'small-icons' | 'medium-icons' | 'large-icons', minItemWidth?: number) => number;
  gridItemWidth: (columns: number, gap?: number, paddingHorizontal?: number) => number;
  radius: (key: RadiusKey) => number;
  shadow: (key: ShadowKey) => ShadowToken;
  percentageWidth: (pct: number) => string;
  percentageHeight: (pct: number) => string;
}

/**
 * I-7 remediation (plans/deposito-seguro-audit-report.md §11): this used to
 * be computed twice — once inside CustomThemeProvider's useMemo (whose
 * result was never actually put into context, just thrown away every
 * render) and again, formula-for-formula, inside every useTheme() call site.
 * Now there's exactly one implementation, computed once per provider render
 * and shared by every consumer via context.
 */
function computeResponsiveTheme(width: number, colors: ThemeColors): ResponsiveThemeValues {
  const isTab = detectTablet(width);

  const space = (key: SpacingKey): number => {
    const base = getSpacing(key);
    return Math.round(base * (isTab ? 1.25 : 1));
  };

  const screenPadding = space(isTab ? 12 : 8); // 24 tablet / 16 phone

  const headerPaddingTop = Platform.select({
    ios: isTab ? 52 : 48,
    android: isTab ? 52 : 44,
    default: 48,
  }) ?? 48;

  const bottomTabSpacing = Platform.select({
    ios: isTab ? 110 : 96,
    android: isTab ? 108 : 88,
    default: 96,
  }) ?? 96;

  const font = (baseSize: number, maxScale: number = 1.25, minScale: number = 0.875): number => {
    const scaled = baseSize * getFontScale(maxScale, minScale) * (isTab ? 1.15 : 1);
    return Math.round(scaled * 100) / 100;
  };

  const clamp = (minSize: number, maxSize: number): number => {
    return clampSize(minSize, maxSize, width);
  };

  const responsiveSize = (phone: number, tabletVal: number, desktop?: number): number => {
    return getResponsiveSize(phone, tabletVal, desktop, width);
  };

  const gridColumns = (viewMode: 'list' | 'small-icons' | 'medium-icons' | 'large-icons', minItemWidth: number = 80): number => {
    return getGridColumns(viewMode, width, minItemWidth);
  };

  const gridItemWidth = (columns: number, gap: number = getSpacing(6), px: number = screenPadding): number => {
    return getGridItemWidth(columns, gap, px, width);
  };

  const radius = (key: RadiusKey): number => {
    const base = getRadius(key);
    return Math.round(base * (isTab ? 1.25 : 1));
  };

  const shadow = (key: ShadowKey): ShadowToken => {
    const token = getShadow(key);
    return {
      ...token,
      shadowColor: colors.shadow,
    };
  };

  return {
    spacing: spacingScale,
    space,
    screenPadding,
    headerPaddingTop,
    bottomTabSpacing,
    breakpoint: getBreakpoint(width),
    isTablet: isTab,
    isPhone: detectPhone(width),
    isSmallPhone: detectSmallPhone(width),
    font,
    clampSize: clamp,
    responsiveSize,
    gridColumns,
    gridItemWidth,
    radius,
    shadow,
    percentageWidth,
    percentageHeight,
  };
}

interface ThemeContextValue {
  colors: ThemeColors;
  responsive: ResponsiveThemeValues;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const CustomThemeProvider = ({ children }: { children: ReactNode }) => {
  const { themeMode, disguiseMode } = useSettingsStore();

  const activePalette = useMemo(() => {
    let palette = Palette[themeMode as keyof typeof Palette] || Palette.dark;
    if (disguiseMode === 'notes') palette = Palette.notes;
    else if (disguiseMode === 'utility') palette = Palette.utility;
    return palette;
  }, [themeMode, disguiseMode]);

  const { width } = useWindowDimensions();

  const responsive = useMemo<ResponsiveThemeValues>(
    () => computeResponsiveTheme(width, activePalette),
    [width, activePalette]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ colors: activePalette, responsive }),
    [activePalette, responsive]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeColors = () => {
  const context = useContext(ThemeContext);
  return context?.colors || Palette.dark;
};

interface UseThemeReturn {
  colors: ThemeColors;
  isDark: boolean;
  themeMode: string;
  toggleTheme: () => void;
  spacing: Record<SpacingKey, number>;
  space: (key: SpacingKey) => number;
  screenPadding: number;
  headerPaddingTop: number;
  bottomTabSpacing: number;
  breakpoint: Breakpoint;
  isTablet: boolean;
  isPhone: boolean;
  isSmallPhone: boolean;
  font: (baseSize: number, maxScale?: number, minScale?: number) => number;
  clampSize: (minSize: number, maxSize: number) => number;
  responsiveSize: (phone: number, tablet: number, desktop?: number) => number;
  gridColumns: (viewMode: 'list' | 'small-icons' | 'medium-icons' | 'large-icons', minItemWidth?: number) => number;
  gridItemWidth: (columns: number, gap?: number, paddingHorizontal?: number) => number;
  radius: (key: RadiusKey) => number;
  shadow: (key: ShadowKey) => ShadowToken;
  percentageWidth: (pct: number) => string;
  percentageHeight: (pct: number) => string;
}

export const useTheme = (): UseThemeReturn => {
  const context = useContext(ThemeContext);
  const colors = context?.colors || Palette.dark;
  const { themeMode, updateSetting } = useSettingsStore();

  const toggleTheme = () => {
    updateSetting('themeMode', themeMode === 'light' ? 'dark' : 'light');
  };

  // Fallback only exercised if useTheme() is ever called outside
  // CustomThemeProvider (shouldn't happen in practice — the provider wraps
  // the whole app in src/app/_layout.tsx) so a real window width is still
  // used instead of silently returning stale/default responsive values.
  const { width: fallbackWidth } = useWindowDimensions();
  const responsive = context?.responsive ?? computeResponsiveTheme(fallbackWidth, colors);

  return {
    colors,
    isDark: themeMode !== 'light',
    themeMode,
    toggleTheme,
    ...responsive,
  };
};
