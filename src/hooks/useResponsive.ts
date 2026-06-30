// src/hooks/useResponsive.ts
// React hooks for responsive behavior using useWindowDimensions.
// All values update automatically on orientation change, split-screen, or fold-state change.

import { useMemo } from 'react';
import { useWindowDimensions, Platform } from 'react-native';
import {
  breakpoints,
  isTablet as detectTablet,
  isPhone as detectPhone,
  isSmallPhone as detectSmallPhone,
  isLandscape as detectLandscape,
  isPortrait as detectPortrait,
  getBreakpoint,
  getFontScale,
  scaleFont,
  getGridColumns,
  getGridItemWidth,
  clampSize,
  getResponsiveSize,
  spacing,
  type SpacingKey,
  type Breakpoint,
} from '../utils/responsive';
import type { GridListView } from '../types';
import { useBreakpoint } from './useBreakpoint';
import { useOrientation } from './useOrientation';

// ── Base Responsive Hook ────────────────────────────────────────────────────

export interface ResponsiveState {
  width: number;
  height: number;
  scale: number;
  fontScale: number;
  breakpoint: Breakpoint;
  isTablet: boolean;
  isPhone: boolean;
  isSmallPhone: boolean;
  isLandscape: boolean;
  isPortrait: boolean;
}

export const useResponsive = (): ResponsiveState => {
  const { width, height, scale, fontScale } = useWindowDimensions();
  const bp = useBreakpoint();
  const orientation = useOrientation();

  return useMemo(() => ({
    width,
    height,
    scale,
    fontScale,
    breakpoint: bp.breakpoint,
    isTablet: bp.isTablet,
    isPhone: bp.isPhone,
    isSmallPhone: bp.isSmallPhone,
    isLandscape: orientation.isLandscape,
    isPortrait: orientation.isPortrait,
  }), [width, height, scale, fontScale, bp, orientation]);
};

// Re-export standalone hooks for consumers that only need one concern
export { useBreakpoint } from './useBreakpoint';
export { useOrientation } from './useOrientation';
export type { BreakpointState } from './useBreakpoint';
export type { OrientationState } from './useOrientation';

// ── Responsive Spacing Hook ──────────────────────────────────────────────────

export interface UseResponsiveSpacingReturn {
  /** Returns the scaled spacing value for the given spacing key. */
  space: (key: SpacingKey) => number;
  /** Convenience: returns the standard horizontal screen padding based on device size. */
  screenPadding: number;
  /** Convenience: returns the standard vertical header padding (accounts for safe area concept). */
  headerPaddingTop: number;
  /** Convenience: returns bottom padding to clear tab bar + home indicator. */
  bottomTabSpacing: number;
}

export const useResponsiveSpacing = (): UseResponsiveSpacingReturn => {
  const { width } = useWindowDimensions();
  const isTab = detectTablet(width);

  return useMemo(() => {
    // Scale factor: phones use base spacing, tablets get 1.25x extra room
    const scale = isTab ? 1.25 : 1;

    const space = (key: SpacingKey): number => Math.round(spacing[key] * scale);

    // Standard horizontal padding
    const screenPadding = space(isTab ? 12 : 8); // 24 on tablet, 16 on phone

    // Header top padding approximates status bar + safe area
    const headerPaddingTop = Platform.select({
      ios: isTab ? 52 : 48,
      android: isTab ? 52 : 44,
      default: 48,
    }) ?? 48;

    // Bottom padding to float above tab bar + home indicator
    const bottomTabSpacing = Platform.select({
      ios: isTab ? 110 : 96,
      android: isTab ? 108 : 88,
      default: 96,
    }) ?? 96;

    return { space, screenPadding, headerPaddingTop, bottomTabSpacing };
  }, [width]);
};

// ── Responsive Typography Hook ────────────────────────────────────────────────

export interface ResponsiveFontSizes {
  xs: number;
  sm: number;
  base: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  display: number;
}

export const useResponsiveFonts = (): ResponsiveFontSizes => {
  const { width } = useWindowDimensions();
  const isTab = detectTablet(width);

  return useMemo(() => {
    // Base font sizes
    const baseSizes = {
      xs: 11,
      sm: 12,
      base: 14,
      md: 16,
      lg: 18,
      xl: 22,
      xxl: 28,
      display: 34,
    } as const;

    // Tablet gets a slightly larger base (15% boost) while still respecting fontScale
    const sizeMultiplier = isTab ? 1.15 : 1;

    const scaled = {} as ResponsiveFontSizes;
    for (const key of Object.keys(baseSizes) as Array<keyof typeof baseSizes>) {
      scaled[key] = scaleFont(baseSizes[key] * sizeMultiplier);
    }

    return scaled;
  }, [width]);
};

// ── Grid Helpers Hook ────────────────────────────────────────────────────────

export interface UseGridHelpersReturn {
  /** Returns the recommended number of columns for the current view mode and screen width. */
  getColumns: (viewMode: GridListView, minItemWidth?: number) => number;
  /** Returns the calculated item width for the given column count and gap. */
  getItemWidth: (columns: number, gap?: number, paddingHorizontal?: number) => number;
  /** Returns both columns and item width in one call. */
  resolveGrid: (
    viewMode: GridListView,
    gap?: number,
    paddingHorizontal?: number,
    minItemWidth?: number
  ) => { columns: number; itemWidth: number };
}

export const useGridHelpers = (gap: number = spacing[6], paddingHorizontal: number = spacing[12]): UseGridHelpersReturn => {
  const { width } = useWindowDimensions();

  return useMemo(() => {
    const getColumns = (viewMode: GridListView, minItemWidth: number = 80): number => {
      return getGridColumns(viewMode, width, minItemWidth);
    };

    const getItemWidth = (columns: number, g: number = gap, px: number = paddingHorizontal): number => {
      return getGridItemWidth(columns, g, px, width);
    };

    const resolveGrid = (
      viewMode: GridListView,
      g: number = gap,
      px: number = paddingHorizontal,
      minItemWidth: number = 80
    ): { columns: number; itemWidth: number } => {
      const cols = getColumns(viewMode, minItemWidth);
      return { columns: cols, itemWidth: getItemWidth(cols, g, px) };
    };

    return { getColumns, getItemWidth, resolveGrid };
  }, [width, gap, paddingHorizontal]);
};

// ── Responsive Size Hook ─────────────────────────────────────────────────────

export interface UseResponsiveSizeReturn {
  /** Returns a size interpolated between min and max based on current width. */
  clamp: (minSize: number, maxSize: number) => number;
  /** Returns a size based on breakpoints: phone / tablet / desktop. */
  size: (phone: number, tablet: number, desktop?: number) => number;
  /** Current screen width. */
  width: number;
  /** Current screen height. */
  height: number;
}

export const useResponsiveSize = (): UseResponsiveSizeReturn => {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const clamp = (minSize: number, maxSize: number): number => {
      return clampSize(minSize, maxSize, width);
    };

    const size = (phone: number, tablet: number, desktop?: number): number => {
      return getResponsiveSize(phone, tablet, desktop, width);
    };

    return { clamp, size, width, height };
  }, [width, height]);
};

// ── Screen Size Category Hook ─────────────────────────────────────────────────

export type ScreenSize = 'compact' | 'medium' | 'expanded' | 'large';

export interface UseScreenSizeReturn {
  size: ScreenSize;
  columns: number; // recommended columns for icon grids
}

export const useScreenSize = (): UseScreenSizeReturn => {
  const { width } = useWindowDimensions();

  return useMemo(() => {
    if (width < breakpoints.sm) {
      return { size: 'compact', columns: 2 };
    }
    if (width < breakpoints.md) {
      return { size: 'medium', columns: 3 };
    }
    if (width < breakpoints.lg) {
      return { size: 'expanded', columns: 4 };
    }
    return { size: 'large', columns: 5 };
  }, [width]);
};
