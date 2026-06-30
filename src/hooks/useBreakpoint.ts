// src/hooks/useBreakpoint.ts
// Standalone hook for breakpoint and device form-factor detection.

import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  breakpoints,
  isTablet as detectTablet,
  isPhone as detectPhone,
  isSmallPhone as detectSmallPhone,
  getBreakpoint,
  type Breakpoint,
} from '../utils/responsive';

export interface BreakpointState {
  breakpoint: Breakpoint;
  isTablet: boolean;
  isPhone: boolean;
  isSmallPhone: boolean;
}

export const useBreakpoint = (): BreakpointState => {
  const { width } = useWindowDimensions();

  return useMemo(() => ({
    breakpoint: getBreakpoint(width),
    isTablet: detectTablet(width),
    isPhone: detectPhone(width),
    isSmallPhone: detectSmallPhone(width),
  }), [width]);
};
