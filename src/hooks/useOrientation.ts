// src/hooks/useOrientation.ts
// Standalone hook for screen orientation detection.

import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { isLandscape as detectLandscape, isPortrait as detectPortrait } from '../utils/responsive';

export interface OrientationState {
  isLandscape: boolean;
  isPortrait: boolean;
}

export const useOrientation = (): OrientationState => {
  const { width, height } = useWindowDimensions();

  return useMemo(() => ({
    isLandscape: detectLandscape(width, height),
    isPortrait: detectPortrait(width, height),
  }), [width, height]);
};
