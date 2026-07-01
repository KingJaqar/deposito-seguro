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

  vaultSurface: string;
  vaultIconBg: string;
  vaultTextMuted: string;
  vaultSectionText: string;
  vaultAddFileBg: string;
  vaultFolderBadgeBg: string;
  vaultFolderIcon: string;
  vaultSelectBg: string;
  vaultSelectBorder: string;
  vaultPurgeBg: string;
  vaultPurgeText: string;
  vaultTrashIcon: string;

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
    background: '#F5EFE0',
    backgroundGradientStart: '#F5EFE0',
    backgroundGradientEnd: '#EDE5D5',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    text: '#0F172A',
    textSecondary: '#334155',
    textMuted: '#64748B',
    primary: '#5162FF',
    primaryLight: '#6366F1',
    primaryDark: '#3B3FB8',
    border: '#E2DDD5',
    borderLight: '#EDE8E0',
    accent: '#A8C7E0',
    error: '#EF4444',
    success: '#22C55E',
    warning: '#F59E0B',
    shadow: 'rgba(15, 23, 42, 0.08)',
    glass: 'rgba(245, 239, 224, 0.72)',
    vaultSurface: '#FFFFFF',
    vaultIconBg: '#F5EFE0',
    vaultTextMuted: '#64748B',
    vaultSectionText: '#475569',
    vaultAddFileBg: '#5162FF',
    vaultFolderBadgeBg: '#F5F0E6',
    vaultFolderIcon: '#F59E0B',
    vaultSelectBg: '#E8E8FF',
    vaultSelectBorder: '#5162FF',
    vaultPurgeBg: '#FEE2E2',
    vaultPurgeText: '#DC2626',
    vaultTrashIcon: '#DC2626',

    // ── Dashboard redesign tokens (light mode) ──────────────────────────────
    dashboardBg: '#F5EFE0',
    dashboardSurface: '#FFFFFF',
    dashboardSurfaceHover: '#EFE9DA',
    dashboardAccent: '#A8C7E0',
    dashboardText: '#0F172A',
    dashboardTextMuted: 'rgba(15, 23, 42, 0.55)',
    dashboardBorder: 'rgba(15, 23, 42, 0.10)',
    dashboardNavBar: 'rgba(245, 239, 224, 0.92)',
    fabBg: '#0F172A',
    fabText: '#FFFFFF',
  },
  dark: {
    background: '#000000',
    backgroundGradientStart: '#0A0A0A',
    backgroundGradientEnd: '#000000',
    surface: '#2A2A2A',
    surfaceElevated: '#333333',
    text: '#FFFFFF',
    textSecondary: '#C8C8D8',
    textMuted: '#8E8EA0',
    primary: '#5E66F6',
    primaryLight: '#7B79F0',
    primaryDark: '#4A48C0',
    border: '#404040',
    borderLight: '#4A4A4A',
    accent: '#00D4AA',
    error: '#E56E73',
    success: '#30D158',
    warning: '#FF9F0A',
    shadow: 'rgba(0,0,0,0.4)',
    glass: 'rgba(42,42,42,0.72)',
    vaultSurface: '#2A2A2A',
    vaultIconBg: '#333333',
    vaultTextMuted: '#8E8EA0',
    vaultSectionText: '#A1A1A6',
    vaultAddFileBg: '#5E66F6',
    vaultFolderBadgeBg: '#3A3520',
    vaultFolderIcon: '#E09626',
    vaultSelectBg: '#2A2A2A',
    vaultSelectBorder: '#5E66F6',
    vaultPurgeBg: '#3A2024',
    vaultPurgeText: '#E56E73',
    vaultTrashIcon: '#E56E73',

    // ── Dashboard redesign tokens (dark mode) ───────────────────────────────
    dashboardBg: '#000000',
    dashboardSurface: '#2A2A2A',
    dashboardSurfaceHover: '#333333',
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
    surface: '#2A2A2A',
    surfaceElevated: '#333333',
    text: '#FFFFFF',
    textSecondary: '#C8C8D8',
    textMuted: '#8E8EA0',
    primary: '#5E66F6',
    primaryLight: '#7B79F0',
    primaryDark: '#4A48C0',
    border: '#404040',
    borderLight: '#4A4A4A',
    accent: '#00D4AA',
    error: '#E56E73',
    success: '#30D158',
    warning: '#FF9F0A',
    shadow: 'rgba(0,0,0,0.6)',
    glass: 'rgba(42,42,42,0.72)',
    vaultSurface: '#2A2A2A',
    vaultIconBg: '#333333',
    vaultTextMuted: '#8E8EA0',
    vaultSectionText: '#A1A1A6',
    vaultAddFileBg: '#5E66F6',
    vaultFolderBadgeBg: '#3A3520',
    vaultFolderIcon: '#E09626',
    vaultSelectBg: '#2A2A2A',
    vaultSelectBorder: '#5E66F6',
    vaultPurgeBg: '#3A2024',
    vaultPurgeText: '#E56E73',
    vaultTrashIcon: '#E56E73',
  },
  calculator: {
    background: '#17171C',
    backgroundGradientStart: '#1C1C22',
    backgroundGradientEnd: '#17171C',
    surface: '#2A2A2A',
    surfaceElevated: '#333333',
    text: '#FFFFFF',
    textSecondary: '#C8C8D8',
    textMuted: '#A1A1A6',
    primary: '#FF9F0A',
    primaryLight: '#FFB340',
    primaryDark: '#CC7A00',
    border: '#404040',
    borderLight: '#4A4A4A',
    accent: '#FF9F0A',
    error: '#FF453A',
    success: '#30D158',
    warning: '#FF9F0A',
    shadow: 'rgba(0,0,0,0.3)',
    glass: 'rgba(42,42,42,0.72)',
    vaultSurface: '#2A2A2A',
    vaultIconBg: '#333333',
    vaultTextMuted: '#A1A1A6',
    vaultSectionText: '#A1A1A6',
    vaultAddFileBg: '#5162FF',
    vaultFolderBadgeBg: '#3A3520',
    vaultFolderIcon: '#F59E0B',
    vaultSelectBg: '#2A2A2A',
    vaultSelectBorder: '#5162FF',
    vaultPurgeBg: '#3A2024',
    vaultPurgeText: '#FF5A60',
    vaultTrashIcon: '#FF5A60',
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
    vaultSurface: '#F2F2F7',
    vaultIconBg: '#E5E5EA',
    vaultTextMuted: '#8E8E93',
    vaultSectionText: '#6E6E73',
    vaultAddFileBg: '#5162FF',
    vaultFolderBadgeBg: '#F5F0E6',
    vaultFolderIcon: '#F59E0B',
    vaultSelectBg: '#E8E8FF',
    vaultSelectBorder: '#5162FF',
    vaultPurgeBg: '#FFEBEC',
    vaultPurgeText: '#FF453A',
    vaultTrashIcon: '#FF453A',
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
    vaultSurface: '#F2F2F7',
    vaultIconBg: '#E5E5EA',
    vaultTextMuted: '#627D98',
    vaultSectionText: '#33658A',
    vaultAddFileBg: '#5162FF',
    vaultFolderBadgeBg: '#F5F0E6',
    vaultFolderIcon: '#F59E0B',
    vaultSelectBg: '#E8E8FF',
    vaultSelectBorder: '#5162FF',
    vaultPurgeBg: '#FFEBEC',
    vaultPurgeText: '#D32F2F',
    vaultTrashIcon: '#D32F2F',
  },
};