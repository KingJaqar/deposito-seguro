// Item 15 (plans/what-are-the-next-jaunty-deer.md): shared render wrapper for
// component tests. useTheme()/useThemeColors() already fall back to sane
// defaults without a provider (see ThemeContext.tsx's useTheme — a real
// fallback, not a test convenience), so this wrapper isn't strictly required
// for every component, but wrapping consistently keeps tests representative
// of the real tree (src/app/_layout.tsx wraps the whole app in
// CustomThemeProvider) and avoids re-deriving this per test file.
import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react-native';
import { CustomThemeProvider } from '../contexts/ThemeContext';

function AllProviders({ children }: { children: React.ReactNode }) {
  return <CustomThemeProvider>{children}</CustomThemeProvider>;
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export * from '@testing-library/react-native';
