// File: src/constants/Colors.ts
// "Vault Blue" design system — a cool, confident palette built for a security
// vault, not a consumer fintech app. See plans/you-are-a-senior-majestic-swing.md §4.

// Category icon tints used across file-type badges/icons — identical across
// light/dark per the design spec, applied at ~10% opacity as the chip
// background. This is a standalone export, NOT a member of ThemeColors — it
// does not vary per theme/palette, so it is not subject to the "every field
// mandatory" check below and must be maintained deliberately.
export const CategoryTint = {
  images: '#2E6FEA',
  videos: '#E0455B',
  docs: '#16A374',
  audio: '#D97706',
  apps: '#7C5CE0',
  other: '#64748B',
};

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceHover: string;
  surfaceElevated: string;
  navBar: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  onPrimary: string;
  secondary: string;
  border: string;
  borderLight: string;
  error: string;
  warning: string;
  success: string;
  info: string;
  shadow: string;
  glass: string;
  fabBg: string;
  fabText: string;

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
}

// Phase 6 (§7): the deprecated dashboardX*/accent aliases that used to live
// here — kept through Phases 1-4 only so not-yet-migrated call sites stayed
// compiling — are removed now that a grep confirms zero remaining
// references anywhere in src/. Every consumer reads the real-schema field
// names (background, surface, secondary, etc.) directly.
const lightBase: ThemeColors = {
  background: '#F3F5F8',
  surface: '#FFFFFF',
  surfaceHover: '#E9EDF2',
  surfaceElevated: '#FFFFFF',
  navBar: 'rgba(243, 245, 248, 0.92)',
  text: '#0B1220',
  textSecondary: '#334155',
  // Phase 5 (§6 WCAG AA sweep): darkened from #64748B, which measured
  // 4.36:1 against `background` — just under the 4.5:1 body-text floor.
  textMuted: '#617187',
  primary: '#1D4ED8',
  primaryLight: '#3B66E0',
  primaryDark: '#1739A8',
  onPrimary: '#FFFFFF',
  secondary: '#0E9F6E',
  border: '#DCE3EC',
  borderLight: '#E9EEF4',
  error: '#DC2626',
  // Phase 5 (§6 WCAG AA sweep): darkened from #D97706, which measured
  // 2.92:1 against `background` — just under the 3:1 non-text floor.
  warning: '#D27306',
  success: '#16A34A',
  info: '#475569',
  shadow: 'rgba(15, 23, 42, 0.10)',
  glass: 'rgba(243, 245, 248, 0.72)',
  fabBg: '#1D4ED8',
  fabText: '#FFFFFF',
  vaultSurface: '#FFFFFF',
  vaultIconBg: '#EEF2F8',
  vaultTextMuted: '#64748B',
  vaultSectionText: '#475569',
  vaultAddFileBg: '#1D4ED8',
  vaultFolderBadgeBg: '#E8EEFA',
  vaultFolderIcon: '#D97706',
  vaultSelectBg: '#E3EAFB',
  vaultSelectBorder: '#1D4ED8',
  vaultPurgeBg: '#FCE8E8',
  vaultPurgeText: '#DC2626',
  vaultTrashIcon: '#DC2626',
};

const darkBase: ThemeColors = {
  background: '#0B0F14',
  surface: '#141A22',
  surfaceHover: '#1B222C',
  surfaceElevated: '#1B222C',
  navBar: 'rgba(11, 15, 20, 0.92)',
  text: '#F1F5F9',
  textSecondary: '#C3CCD8',
  textMuted: '#8A97A8',
  primary: '#3B66E0',
  primaryLight: '#5C82F0',
  primaryDark: '#274BB8',
  onPrimary: '#FFFFFF',
  secondary: '#16C48C',
  border: '#29323D',
  borderLight: '#202832',
  error: '#F16065',
  warning: '#F0A93F',
  success: '#34D399',
  info: '#93A3B8',
  shadow: 'rgba(0, 0, 0, 0.45)',
  glass: 'rgba(20, 26, 34, 0.72)',
  fabBg: '#3B66E0',
  fabText: '#FFFFFF',
  vaultSurface: '#141A22',
  vaultIconBg: '#1B222C',
  vaultTextMuted: '#8A97A8',
  vaultSectionText: '#A6B1BF',
  vaultAddFileBg: '#3B66E0',
  vaultFolderBadgeBg: '#2A2412',
  vaultFolderIcon: '#F0A93F',
  vaultSelectBg: '#1B2540',
  vaultSelectBorder: '#3B66E0',
  vaultPurgeBg: '#33191B',
  vaultPurgeText: '#F16065',
  vaultTrashIcon: '#F16065',
};

// AMOLED: same hue direction as dark, true-black surfaces. Per §4, every
// Card-primitive pairs its shadow with a permanent hairline border here
// specifically because shadow alone is nearly invisible against true black.
const amoledBase: ThemeColors = {
  background: '#000000',
  surface: '#0D0D0D',
  surfaceHover: '#161616',
  surfaceElevated: '#161616',
  navBar: 'rgba(0, 0, 0, 0.94)',
  text: '#F1F5F9',
  textSecondary: '#C3CCD8',
  textMuted: '#8A97A8',
  primary: '#3B66E0',
  primaryLight: '#5C82F0',
  primaryDark: '#274BB8',
  onPrimary: '#FFFFFF',
  secondary: '#16C48C',
  border: '#222222',
  borderLight: '#1A1A1A',
  error: '#F16065',
  warning: '#F0A93F',
  success: '#34D399',
  info: '#93A3B8',
  shadow: 'rgba(0, 0, 0, 0.6)',
  glass: 'rgba(13, 13, 13, 0.72)',
  fabBg: '#3B66E0',
  fabText: '#FFFFFF',
  vaultSurface: '#0D0D0D',
  vaultIconBg: '#161616',
  vaultTextMuted: '#8A97A8',
  vaultSectionText: '#A6B1BF',
  vaultAddFileBg: '#3B66E0',
  vaultFolderBadgeBg: '#241F0F',
  vaultFolderIcon: '#F0A93F',
  vaultSelectBg: '#16203A',
  vaultSelectBorder: '#3B66E0',
  vaultPurgeBg: '#2A1517',
  vaultPurgeText: '#F16065',
  vaultTrashIcon: '#F16065',
};

// Calculator-disguise palette — CONFIRMED DEAD CODE, DO NOT WIRE UP.
// login.tsx's isCalc branch hardcodes its own CALC_* constants and never
// reads from Palette.calculator or useTheme() at all (see plans/
// you-are-a-senior-majestic-swing.md §1). This entry exists only so
// ThemeColors stays fully populated across all 6 palette keys; wiring it up
// would theme the disguise and break its "looks like an ordinary calculator"
// guarantee. Kept as its own inert identity, not reprojected onto Vault Blue.
const calculatorBase: ThemeColors = {
  background: '#17171C',
  surface: '#2A2A2A',
  surfaceHover: '#333333',
  surfaceElevated: '#333333',
  navBar: 'rgba(23, 23, 28, 0.92)',
  text: '#FFFFFF',
  textSecondary: '#C8C8D8',
  textMuted: '#A1A1A6',
  primary: '#FF9F0A',
  primaryLight: '#FFB340',
  primaryDark: '#CC7A00',
  onPrimary: '#17171C',
  secondary: '#FF9F0A',
  border: '#404040',
  borderLight: '#4A4A4A',
  error: '#FF453A',
  warning: '#FF9F0A',
  success: '#30D158',
  info: '#A1A1A6',
  shadow: 'rgba(0, 0, 0, 0.3)',
  glass: 'rgba(42, 42, 42, 0.72)',
  fabBg: '#FF9F0A',
  fabText: '#17171C',
  vaultSurface: '#2A2A2A',
  vaultIconBg: '#333333',
  vaultTextMuted: '#A1A1A6',
  vaultSectionText: '#A1A1A6',
  vaultAddFileBg: '#FF9F0A',
  vaultFolderBadgeBg: '#3A3520',
  vaultFolderIcon: '#FFB340',
  vaultSelectBg: '#333333',
  vaultSelectBorder: '#FF9F0A',
  vaultPurgeBg: '#3A2024',
  vaultPurgeText: '#FF5A60',
  vaultTrashIcon: '#FF5A60',
};

// Notes decoy skin — its own warm/gold identity (reads as an ordinary notes
// app), not Vault Blue-branded; no Settings entry point exists to reach it
// today (§1), kept correct/complete regardless.
const notesBase: ThemeColors = {
  background: '#FDFBF7',
  surface: '#FFFFFF',
  surfaceHover: '#F5F1E8',
  surfaceElevated: '#FFFFFF',
  navBar: 'rgba(253, 251, 247, 0.92)',
  text: '#2C2A29',
  textSecondary: '#5C5A59',
  // Phase 5 (§6 WCAG AA sweep): darkened from #7C7A77 (4.14:1 vs background).
  textMuted: '#757370',
  // Phase 5 (§6 WCAG AA sweep): darkened from #B8941E, which measured only
  // 2.88:1 against onPrimary white — a real failure, since primary is a
  // Button background paired with white button text (needs 4.5:1 body text).
  primary: '#8C7117',
  primaryLight: '#D4AF37',
  primaryDark: '#8F7217',
  onPrimary: '#FFFFFF',
  secondary: '#26A65B',
  border: '#E6E2D8',
  borderLight: '#EDE9E0',
  error: '#CF3A24',
  // Phase 5 (§6 WCAG AA sweep): darkened from #E6A016 (2.16:1 vs background).
  warning: '#C08512',
  success: '#26A65B',
  info: '#7C7A77',
  shadow: 'rgba(44, 42, 41, 0.08)',
  glass: 'rgba(255, 255, 255, 0.72)',
  fabBg: '#B8941E',
  fabText: '#FFFFFF',
  vaultSurface: '#F2F2F7',
  vaultIconBg: '#E5E5EA',
  vaultTextMuted: '#8E8E93',
  vaultSectionText: '#6E6E73',
  vaultAddFileBg: '#B8941E',
  vaultFolderBadgeBg: '#F5F0E6',
  vaultFolderIcon: '#E6A016',
  vaultSelectBg: '#F1E9D2',
  vaultSelectBorder: '#B8941E',
  vaultPurgeBg: '#FFEBEC',
  vaultPurgeText: '#CF3A24',
  vaultTrashIcon: '#CF3A24',
};

// Utility decoy skin — its own cool-blue identity (reads as an ordinary
// system-utility app); same "no entry point today" caveat as notes (§1).
const utilityBase: ThemeColors = {
  background: '#F0F4F8',
  surface: '#FFFFFF',
  surfaceHover: '#E3EBF2',
  surfaceElevated: '#FFFFFF',
  navBar: 'rgba(240, 244, 248, 0.92)',
  text: '#102A43',
  textSecondary: '#33658A',
  // Phase 5 (§6 WCAG AA sweep): darkened from #627D98 (3.87:1 vs background).
  textMuted: '#5A728B',
  primary: '#0D74AD',
  primaryLight: '#1992D4',
  primaryDark: '#0A5A87',
  onPrimary: '#FFFFFF',
  secondary: '#388E3C',
  border: '#BCCCDC',
  borderLight: '#D4E0EC',
  error: '#D32F2F',
  // Phase 5 (§6 WCAG AA sweep): darkened from #F57C00 (2.45:1 vs background).
  warning: '#D96E00',
  success: '#388E3C',
  info: '#33658A',
  shadow: 'rgba(16, 42, 67, 0.08)',
  glass: 'rgba(255, 255, 255, 0.72)',
  fabBg: '#0D74AD',
  fabText: '#FFFFFF',
  vaultSurface: '#F2F2F7',
  vaultIconBg: '#E5E5EA',
  vaultTextMuted: '#627D98',
  vaultSectionText: '#33658A',
  vaultAddFileBg: '#0D74AD',
  vaultFolderBadgeBg: '#F5F0E6',
  vaultFolderIcon: '#F57C00',
  vaultSelectBg: '#DCEAF5',
  vaultSelectBorder: '#0D74AD',
  vaultPurgeBg: '#FFEBEC',
  vaultPurgeText: '#D32F2F',
  vaultTrashIcon: '#D32F2F',
};

export const Palette: Record<'light' | 'dark' | 'amoled' | 'calculator' | 'notes' | 'utility', ThemeColors> = {
  light: lightBase,
  dark: darkBase,
  amoled: amoledBase,
  calculator: calculatorBase,
  notes: notesBase,
  utility: utilityBase,
};
