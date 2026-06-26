// File: src/constants/Colors.ts
// Premium fintech-inspired color palettes with enhanced depth and gradients

// Category icon tints used by the dashboard redesign — identical across light/dark
// per the design spec, applied at ~10% opacity as the chip background.
export const CategoryTint = {
  images: '#3B82F6',
  videos: '#F43F5E',
  docs: '#10B981',
  audio: '#F59E0B',
  apps: '#A855F7',
  other: '#6B7280',
};

export interface ThemeColors {
  background: string;
  backgroundGradientStart: string;
  backgroundGradientEnd: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  border: string;
  borderLight: string;
  accent: string;
  error: string;
  success: string;
  warning: string;
  shadow: string;
  glass: string;

  // Dashboard redesign tokens — optional since only light/dark define them;
  // disguise-mode palettes (calculator/notes/utility) and amoled fall back to
  // the base keys above when these are absent, so nothing ever reads undefined.
  dashboardBg?: string;
  dashboardSurface?: string;
  dashboardSurfaceHover?: string;
  dashboardAccent?: string;
  dashboardText?: string;
  dashboardTextMuted?: string;
  dashboardBorder?: string;
  dashboardNavBar?: string;
  fabBg?: string;
  fabText?: string;
}

export const Palette: Record<'light' | 'dark' | 'amoled' | 'calculator' | 'notes' | 'utility', ThemeColors> = {
  light: {
    background: '#F5F5F7',
    backgroundGradientStart: '#F5F5F7',
    backgroundGradientEnd: '#E8E8ED',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    text: '#1D1D1F',
    textSecondary: '#6E6E73',
    textMuted: '#8E8E93',
    primary: '#007AFF',
    primaryLight: '#007AFF',
    primaryDark: '#0055CC',
    border: '#D2D2D7',
    borderLight: '#E5E5EA',
    accent: '#5856D6',
    error: '#FF3B30',
    success: '#34C759',
    warning: '#FF9500',
    shadow: 'rgba(0,0,0,0.08)',
    glass: 'rgba(255,255,255,0.72)',

    // ── Dashboard redesign tokens (light mode) ──────────────────────────────
    dashboardBg: '#F5EFE0',
    dashboardSurface: '#FFFFFF',
    dashboardSurfaceHover: '#EFE9DA',
    dashboardAccent: '#A8C7E0',
    dashboardText: '#0F172A',
    dashboardTextMuted: 'rgba(15, 23, 42, 0.55)',
    dashboardBorder: 'rgba(15, 23, 42, 0.10)',
    dashboardNavBar: 'rgba(255, 255, 255, 0.92)',
    fabBg: '#0F172A',
    fabText: '#FFFFFF',
  },
  dark: {
    background: '#000000',
    backgroundGradientStart: '#0D0D1A',
    backgroundGradientEnd: '#000000',
    surface: '#141428',
    surfaceElevated: '#1A1A35',
    text: '#FFFFFF',
    textSecondary: '#C8C8D8',
    textMuted: '#8E8EA0',
    primary: '#5E5CE6',
    primaryLight: '#7B79F0',
    primaryDark: '#4A48C0',
    border: '#2A2A45',
    borderLight: '#353555',
    accent: '#00D4AA',
    error: '#FF453A',
    success: '#30D158',
    warning: '#FF9F0A',
    shadow: 'rgba(0,0,0,0.4)',
    glass: 'rgba(20,20,40,0.72)',

    // ── Dashboard redesign tokens (dark mode) ───────────────────────────────
    dashboardBg: '#000000',
    dashboardSurface: '#1A1A1A',
    dashboardSurfaceHover: '#222222',
    dashboardAccent: '#A8C7E0',
    dashboardText: '#F5EFE0',
    dashboardTextMuted: 'rgba(245, 239, 224, 0.55)',
    dashboardBorder: 'rgba(245, 239, 224, 0.12)',
    dashboardNavBar: 'rgba(10, 10, 10, 0.92)',
    fabBg: '#F5EFE0',
    fabText: '#000000',
  },
  amoled: {
    background: '#000000',
    backgroundGradientStart: '#000000',
    backgroundGradientEnd: '#050505',
    surface: '#0D0D0D',
    surfaceElevated: '#141414',
    text: '#FFFFFF',
    textSecondary: '#C8C8D8',
    textMuted: '#8E8EA0',
    primary: '#5E5CE6',
    primaryLight: '#7B79F0',
    primaryDark: '#4A48C0',
    border: '#1A1A1C',
    borderLight: '#252528',
    accent: '#00D4AA',
    error: '#FF453A',
    success: '#30D158',
    warning: '#FF9F0A',
    shadow: 'rgba(0,0,0,0.6)',
    glass: 'rgba(13,13,13,0.72)',
  },
  calculator: {
    background: '#17171C',
    backgroundGradientStart: '#1C1C22',
    backgroundGradientEnd: '#17171C',
    surface: '#2D2D2D',
    surfaceElevated: '#353535',
    text: '#FFFFFF',
    textSecondary: '#C8C8D8',
    textMuted: '#A1A1A6',
    primary: '#FF9F0A',
    primaryLight: '#FFB340',
    primaryDark: '#CC7A00',
    border: '#3A3A3C',
    borderLight: '#454548',
    accent: '#FF9F0A',
    error: '#FF453A',
    success: '#30D158',
    warning: '#FF9F0A',
    shadow: 'rgba(0,0,0,0.3)',
    glass: 'rgba(45,45,45,0.72)',
  },
  notes: {
    background: '#FDFBF7',
    backgroundGradientStart: '#FFFCF5',
    backgroundGradientEnd: '#FDFBF7',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    text: '#2C2A29',
    textSecondary: '#5C5A59',
    textMuted: '#7C7A77',
    primary: '#D4AF37',
    primaryLight: '#E5C55A',
    primaryDark: '#B8941E',
    border: '#E6E2D8',
    borderLight: '#EDE9E0',
    accent: '#D4AF37',
    error: '#CF3A24',
    success: '#26A65B',
    warning: '#E6A016',
    shadow: 'rgba(44,42,41,0.08)',
    glass: 'rgba(255,255,255,0.72)',
  },
  utility: {
    background: '#F0F4F8',
    backgroundGradientStart: '#F5F8FC',
    backgroundGradientEnd: '#F0F4F8',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    text: '#102A43',
    textSecondary: '#33658A',
    textMuted: '#627D98',
    primary: '#1992D4',
    primaryLight: '#3BA8E0',
    primaryDark: '#0D74AD',
    border: '#BCCCDC',
    borderLight: '#D4E0EC',
    accent: '#1992D4',
    error: '#D32F2F',
    success: '#388E3C',
    warning: '#F57C00',
    shadow: 'rgba(16,42,67,0.08)',
    glass: 'rgba(255,255,255,0.72)',
  },
};