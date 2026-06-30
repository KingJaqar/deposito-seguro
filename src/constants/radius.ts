// src/constants/radius.ts
// Border radius token scale based on a 4px baseline grid.
// Values are automatically scaled up by 1.25x on tablets via getRadius().

export const radius = {
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
} as const;

export type RadiusKey = keyof typeof radius;

export const getRadius = (key: RadiusKey): number => radius[key];
