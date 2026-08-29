/**
 * Item 15 (plans/what-are-the-next-jaunty-deer.md): rendered-behavior
 * coverage for the onboarding wizard's entry screen — one of the "3 newest
 * major features" the audit report calls out as having zero component
 * coverage. Covers the real, non-visual logic this screen owns: calling
 * checkSetup() on mount, the loading/timeout guard, and the
 * isConfigured/isAuthenticated auto-redirect effect.
 *
 * useAuthStore is the real store with `checkSetup` swapped for a
 * controllable jest.fn() per test, rather than driving it through real
 * SecureStore reads — the redirect *effect* is what this screen owns and
 * is what's under test here, not checkSetup's own persistence logic (that
 * belongs to authStore's own test file).
 */
import React from 'react';
import { router } from 'expo-router';
import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../../test-utils/renderWithProviders';
import { useAuthStore } from '../../../store/authStore';
import OnboardingScreen from '../onboarding';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

describe('OnboardingScreen (onboarding wizard step 1: overview)', () => {
  const baselineState = useAuthStore.getState();

  beforeEach(() => {
    useAuthStore.setState({
      ...baselineState,
      isConfigured: false,
      isAuthenticated: false,
      isLoading: false,
      checkSetup: jest.fn(async () => {}),
    });
    (router.replace as jest.Mock).mockClear();
    (router.push as jest.Mock).mockClear();
  });

  it('calls checkSetup on mount', () => {
    renderWithProviders(<OnboardingScreen />);
    expect(useAuthStore.getState().checkSetup).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state while isLoading is true and setup has not timed out', () => {
    useAuthStore.setState({ isLoading: true, checkSetup: jest.fn(() => new Promise(() => {})) });
    renderWithProviders(<OnboardingScreen />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('shows the feature overview and CTA once loading resolves for a fresh (unconfigured) install', async () => {
    renderWithProviders(<OnboardingScreen />);
    await waitFor(() => expect(screen.getByText('Create master key')).toBeTruthy());
    expect(screen.getByText('No account required')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('pressing "Create master key" navigates to registration', async () => {
    renderWithProviders(<OnboardingScreen />);
    await waitFor(() => screen.getByText('Create master key'));
    fireEvent.press(screen.getByText('Create master key'));
    expect(router.push).toHaveBeenCalledWith('/(auth)/register');
  });

  it('redirects to the dashboard once setup resolves already configured and authenticated', async () => {
    useAuthStore.setState({ isConfigured: true, isAuthenticated: true, isLoading: false, checkSetup: jest.fn(async () => {}) });
    renderWithProviders(<OnboardingScreen />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(main)/dashboard'));
  });

  it('redirects to the lock screen when configured but not authenticated', async () => {
    useAuthStore.setState({ isConfigured: true, isAuthenticated: false, isLoading: false, checkSetup: jest.fn(async () => {}) });
    renderWithProviders(<OnboardingScreen />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(auth)/lock'));
  });

  it('falls back to showing content after the 8s setup timeout even if isLoading never resolves', () => {
    jest.useFakeTimers();
    try {
      useAuthStore.setState({ isLoading: true, checkSetup: jest.fn(() => new Promise(() => {})) });
      renderWithProviders(<OnboardingScreen />);
      expect(screen.getByText('Loading…')).toBeTruthy();

      act(() => {
        jest.advanceTimersByTime(8000);
      });

      expect(screen.getByText('Create master key')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});
