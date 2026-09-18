// src/constants/typography.ts
// Named type scale — replaces scattered magic-number font sizes with one
// source of truth. Sizes are base points; every consumer routes them through
// useTheme().font() so the existing getFontScale() clamp (0.875–1.25x) and
// tablet scaling still apply. This file only names sizes/weights, it does
// not perform scaling itself.

export const FontFamily = {
  display: 'ArchivoBlack_400Regular',
  black: 'Archivo_900Black',
  extraBold: 'Archivo_800ExtraBold',
  bold: 'Archivo_700Bold',
  semiBold: 'Archivo_600SemiBold',
  medium: 'Archivo_500Medium',
  regular: 'Archivo_400Regular',
} as const;

export type FontFamilyName = (typeof FontFamily)[keyof typeof FontFamily];

const archivoFamilies = new Set<string>(Object.values(FontFamily));

/** True only for faces registered by the Archivo boot loader. */
export function isArchivoFontFamily(fontFamily: unknown): fontFamily is FontFamilyName {
  return typeof fontFamily === 'string' && archivoFamilies.has(fontFamily);
}

/** Maps React Native's standard/named weights to a concrete bundled face. */
export function archivoFontFamilyForWeight(weight?: string | number): FontFamilyName {
  switch (String(weight ?? '400')) {
    case '900': return FontFamily.black;
    case '800': return FontFamily.extraBold;
    case '700':
    case 'bold': return FontFamily.bold;
    case '600': return FontFamily.semiBold;
    case '500': return FontFamily.medium;
    default: return FontFamily.regular;
  }
}

export interface TypeStyle {
  size: number;
  weight: '400' | '500' | '600' | '700' | '800' | '900';
  fontFamily: FontFamilyName;
  letterSpacing?: number;
  textTransform?: 'uppercase';
}

export const Type: Record<
  'display' | 'title' | 'headline' | 'subtitle' | 'body' | 'label' | 'caption' | 'eyebrow',
  TypeStyle
> = {
  display: { size: 32, weight: '900', fontFamily: FontFamily.display },
  title: { size: 24, weight: '800', fontFamily: FontFamily.extraBold },
  headline: { size: 19, weight: '800', fontFamily: FontFamily.extraBold },
  subtitle: { size: 16, weight: '700', fontFamily: FontFamily.bold },
  body: { size: 14, weight: '500', fontFamily: FontFamily.medium },
  label: { size: 13, weight: '600', fontFamily: FontFamily.semiBold },
  caption: { size: 12, weight: '600', fontFamily: FontFamily.semiBold },
  eyebrow: { size: 11, weight: '700', fontFamily: FontFamily.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
};

export type TypeKey = keyof typeof Type;
