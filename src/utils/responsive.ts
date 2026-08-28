// src/utils/responsive.ts
// Core responsive utilities: spacing scale, breakpoints, tablet detection, sizing helpers.

import { Dimensions, PixelRatio, Platform, ScaledSize } from 'react-native';

// ── Spacing Scale ──────────────────────────────────────────────────────────
// Based on a 4px baseline grid (iOS HIG / Material Design standard).
// Use spacing(n) anywhere a numeric margin/padding is needed.
// On tablets, values are scaled up by the tabletScale factor automatically.

export const spacing = {
  0: 0,
  1: 2,
  2: 4,
  3: 6,
  4: 8,
  5: 10,
  6: 12,
  7: 14,
  8: 16,
  9: 18,
  10: 20,
  11: 22,
  12: 24,
  14: 28,
  16: 32,
  20: 40,
  24: 48,
  28: 56,
  32: 64,
  36: 72,
  40: 80,
  48: 96,
  56: 112,
  64: 128,
} as const;

export type SpacingKey = keyof typeof spacing;

export const getSpacing = (key: SpacingKey): number => spacing[key];

// ── Breakpoints ────────────────────────────────────────────────────────────
export const breakpoints = {
  xs: 0,
  sm: 360,
  md: 600,
  lg: 900,
  xl: 1200,
} as const;

export type Breakpoint = keyof typeof breakpoints;

export const getBreakpoint = (width: number): Breakpoint => {
  if (width >= breakpoints.xl) return 'xl';
  if (width >= breakpoints.lg) return 'lg';
  if (width >= breakpoints.md) return 'md';
  if (width >= breakpoints.sm) return 'sm';
  return 'xs';
};

// ── Device Form Factor ──────────────────────────────────────────────────────
export const isTablet = (width: number): boolean => {
  return width >= breakpoints.md;
};

export const isPhone = (width: number): boolean => {
  return width < breakpoints.md;
};

export const isSmallPhone = (width: number): boolean => {
  return width < breakpoints.sm;
};

// ── Responsive Font Scaling ─────────────────────────────────────────────────
// Clamps the system font scale to prevent extreme zooming while respecting
// accessibility settings up to a reasonable limit.

const DEFAULT_MAX_FONT_SCALE = 1.25;
const DEFAULT_MIN_FONT_SCALE = 0.875;

export const getFontScale = (
  maxScale: number = DEFAULT_MAX_FONT_SCALE,
  minScale: number = DEFAULT_MIN_FONT_SCALE
): number => {
  const systemScale = PixelRatio.getFontScale();
  return Math.min(Math.max(systemScale, minScale), maxScale);
};

export const scaleFont = (
  baseFontSize: number,
  maxScale: number = DEFAULT_MAX_FONT_SCALE,
  minScale: number = DEFAULT_MIN_FONT_SCALE
): number => {
  const scaled = baseFontSize * getFontScale(maxScale, minScale);
  return Math.round(scaled * 100) / 100;
};

// ── Pixel Ratio Handling ────────────────────────────────────────────────────
// Converts dp (density-independent pixels) to physical pixels for image sizing.

export const getPixelRatio = (): number => PixelRatio.get();

export const dpToPx = (dp: number): number => PixelRatio.getPixelSizeForLayoutSize(dp);

export const pxToDp = (px: number): number => px / PixelRatio.get();

// ── Responsive Sizing Helpers ────────────────────────────────────────────────
/**
 * Returns a size interpolated between min and max based on screen width.
 * At breakpoints.sm it returns min, at breakpoints.xl it returns max.
 * Linear interpolation in between.
 */
export const clampSize = (
  minSize: number,
  maxSize: number,
  width: number
): number => {
  const { sm, xl } = breakpoints;
  if (width <= sm) return minSize;
  if (width >= xl) return maxSize;
  const ratio = (width - sm) / (xl - sm);
  return Math.round(minSize + ratio * (maxSize - minSize));
};

/**
 * Returns a size based on discrete breakpoints.
 * Provide 3 sizes (phone, tablet, desktop) and get the matching one.
 */
export const getResponsiveSize = (
  phone: number,
  tablet: number,
  desktop?: number,
  width?: number
): number => {
  const w = width ?? Dimensions.get('window').width;
  if (w >= breakpoints.lg && desktop !== undefined) return desktop;
  if (w >= breakpoints.md) return tablet;
  return phone;
};

// ── Grid / Column Helpers ────────────────────────────────────────────────────
export const getGridItemWidth = (
  columns: number,
  gap: number = spacing[6],
  paddingHorizontal: number = spacing[12],
  width?: number
): number => {
  const w = width ?? Dimensions.get('window').width;
  return Math.max(60, (w - paddingHorizontal * 2 - gap * (columns - 1)) / columns);
};

/**
 * Returns the recommended number of grid columns for a given viewMode and width.
 * Respects a minimum item width so tiles never become unusably narrow.
 */
export const getGridColumns = (
  viewMode: 'list' | 'small-icons' | 'medium-icons' | 'large-icons',
  containerWidth?: number,
  minItemWidth: number = 80
): number => {
  const w = containerWidth ?? Dimensions.get('window').width;
  const usableWidth = w - spacing[12] * 2; // default padding

  if (viewMode === 'list') return 1;

  // Determine gap by viewMode
  const gap = viewMode === 'small-icons' ? spacing[4] : spacing[6];

  const targetColumns =
    viewMode === 'small-icons'
      ? 5
      : viewMode === 'medium-icons'
        ? 3
        : 2;

  // Calculate actual columns that fit while respecting minItemWidth
  const maxColumnsByWidth = Math.floor((usableWidth + gap) / (minItemWidth + gap));
  return Math.max(1, Math.min(targetColumns, maxColumnsByWidth));
};

// ── Dimension Helpers ────────────────────────────────────────────────────────
export const getScreenWidth = (): number => Dimensions.get('window').width;
export const getScreenHeight = (): number => Dimensions.get('window').height;

/**
 * Returns an object mirroring Dimensions but with safe-area-aware fallbacks.
 * Prefer `useWindowDimensions()` in React components; this is for non-component code.
 */
export const getScreenDimensions = (): {
  width: number;
  height: number;
  scale: number;
  fontScale: number;
} => {
  const { width, height, scale, fontScale } = Dimensions.get('window');
  return { width, height, scale, fontScale };
};

// ── Orientation Helpers ──────────────────────────────────────────────────────
export const isLandscape = (width: number, height: number): boolean => width > height;
export const isPortrait = (width: number, height: number): boolean => width <= height;

// Border radius lives solely in src/constants/radius.ts — the byte-identical
// duplicate export that used to live here (imported nowhere) has been removed
// per plans/you-are-a-senior-majestic-swing.md §4/§7 Phase 1.

// ── Accessibility ──────────────────────────────────────────────────────────
// Hard floor for any interactive control's touch target (WCAG 2.5.5 / iOS HIG
// / Material both land on 44dp). Baked into Button/Chip/icon-button
// primitives via hitSlop where the visual size is smaller (§4/§6).
export const MIN_TOUCH_TARGET = 44;

// ── Percentage Layout Helpers ─────────────────────────────────────────────────
// Returns a percentage string for use in style objects.
// Note: React Native accepts percentage strings natively (e.g. '85%').

export const percentageWidth = (pct: number): string => `${pct}%`;
export const percentageHeight = (pct: number): string => `${pct}%`;

// Type aliases are exported inline where declared above.
