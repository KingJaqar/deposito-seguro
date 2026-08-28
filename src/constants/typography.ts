// src/constants/typography.ts
// Named type scale — replaces scattered magic-number font sizes with one
// source of truth. Sizes are base points; every consumer routes them through
// useTheme().font() so the existing getFontScale() clamp (0.875–1.25x) and
// tablet scaling still apply. This file only names sizes/weights, it does
// not perform scaling itself.

export interface TypeStyle {
  size: number;
  weight: '400' | '500' | '600' | '700' | '800';
  letterSpacing?: number;
  textTransform?: 'uppercase';
}

export const Type: Record<
  'display' | 'title' | 'headline' | 'subtitle' | 'body' | 'label' | 'caption' | 'eyebrow',
  TypeStyle
> = {
  display: { size: 32, weight: '800' },
  title: { size: 24, weight: '800' },
  headline: { size: 19, weight: '800' },
  subtitle: { size: 16, weight: '700' },
  body: { size: 14, weight: '500' },
  label: { size: 13, weight: '600' },
  caption: { size: 12, weight: '600' },
  eyebrow: { size: 11, weight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
};

export type TypeKey = keyof typeof Type;
