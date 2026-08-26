/**
 * Phase 0 baseline smoke test for authStore (see plans/deposito-seguro-audit-report.md §20).
 * Mocks expo-secure-store (jest.setup.js) so this runs without a device.
 */
import { PIN_LOCKOUT_KEY, useAuthStore } from '../authStore';
import { MAX_PASSWORD_ATTEMPTS, useLockoutStore } from '../lockoutStore';

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isConfigured: false,
      isAuthenticated: false,
      securityHint: '',
      pinLength: 6,
      isLoading: false,
    });
    useLockoutStore.setState({ attempts: {}, lockouts: {}, isHydrated: true });
  });

  it('checkSetup reports not configured when nothing is stored', async () => {
    await useAuthStore.getState().checkSetup();
    expect(useAuthStore.getState().isConfigured).toBe(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('initializeVault stores a PIN and authenticates the session', async () => {
    const ok = await useAuthStore.getState().initializeVault('123456', 'hint');
    expect(ok).toBe(true);
    expect(useAuthStore.getState().isConfigured).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('authenticate succeeds with the correct PIN and fails with a wrong one', async () => {
    await useAuthStore.getState().initializeVault('123456', 'hint');
    useAuthStore.setState({ isAuthenticated: false });

    expect(await useAuthStore.getState().authenticate('000000')).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    expect(await useAuthStore.getState().authenticate('123456')).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('checkSetup reports configured after a vault has been initialized', async () => {
    await useAuthStore.getState().initializeVault('123456', 'hint');
    useAuthStore.setState({ isConfigured: false });

    await useAuthStore.getState().checkSetup();
    expect(useAuthStore.getState().isConfigured).toBe(true);
  });

  it('locks out after MAX_PASSWORD_ATTEMPTS wrong PINs, even with the correct PIN (S-1)', async () => {
    await useAuthStore.getState().initializeVault('123456', 'hint');
    useAuthStore.setState({ isAuthenticated: false });

    for (let i = 0; i < MAX_PASSWORD_ATTEMPTS; i++) {
      expect(await useAuthStore.getState().authenticate('000000')).toBe(false);
    }
    expect(useLockoutStore.getState().isLockedOut(PIN_LOCKOUT_KEY)).toBe(true);

    // Locked out now — even the correct PIN is rejected until the lockout expires.
    expect(await useAuthStore.getState().authenticate('123456')).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('resets the attempt counter on a successful authenticate', async () => {
    await useAuthStore.getState().initializeVault('123456', 'hint');
    useAuthStore.setState({ isAuthenticated: false });

    await useAuthStore.getState().authenticate('000000');
    await useAuthStore.getState().authenticate('123456');
    expect(useLockoutStore.getState().isLockedOut(PIN_LOCKOUT_KEY)).toBe(false);
    // The failed-attempt counter should have been cleared by the success,
    // not merely left one short of the lockout threshold.
    const result = useLockoutStore.getState().recordFailedAttempt(PIN_LOCKOUT_KEY);
    expect(result.newAttempts).toBe(1);
    useLockoutStore.getState().resetAttempts(PIN_LOCKOUT_KEY);
  });
});
