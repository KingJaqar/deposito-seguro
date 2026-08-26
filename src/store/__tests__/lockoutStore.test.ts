/**
 * Smoke tests for lockoutStore's S-5 persistence (see
 * plans/deposito-seguro-audit-report.md §10) — previously in-memory only,
 * reset to zero by force-quitting the app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MAX_PASSWORD_ATTEMPTS, useLockoutStore } from '../lockoutStore';

describe('lockoutStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useLockoutStore.setState({ attempts: {}, lockouts: {}, isHydrated: false });
  });

  it('locks out after MAX_PASSWORD_ATTEMPTS failures', () => {
    let result;
    for (let i = 0; i < MAX_PASSWORD_ATTEMPTS; i++) {
      result = useLockoutStore.getState().recordFailedAttempt('test:key');
    }
    expect(result!.isLockedOut).toBe(true);
    expect(useLockoutStore.getState().isLockedOut('test:key')).toBe(true);
  });

  it('resetAttempts clears both attempts and lockout', () => {
    for (let i = 0; i < MAX_PASSWORD_ATTEMPTS; i++) {
      useLockoutStore.getState().recordFailedAttempt('test:key');
    }
    expect(useLockoutStore.getState().isLockedOut('test:key')).toBe(true);
    useLockoutStore.getState().resetAttempts('test:key');
    expect(useLockoutStore.getState().isLockedOut('test:key')).toBe(false);
  });

  it('survives a simulated app restart via hydrateLockouts (S-5)', async () => {
    for (let i = 0; i < MAX_PASSWORD_ATTEMPTS; i++) {
      useLockoutStore.getState().recordFailedAttempt('vault:pin');
    }
    expect(useLockoutStore.getState().isLockedOut('vault:pin')).toBe(true);

    // Simulate a fresh app process: reset in-memory state, then rehydrate
    // from AsyncStorage the same way _layout.tsx does on startup.
    useLockoutStore.setState({ attempts: {}, lockouts: {}, isHydrated: false });
    expect(useLockoutStore.getState().isLockedOut('vault:pin')).toBe(false); // pre-hydration

    await useLockoutStore.getState().hydrateLockouts();
    expect(useLockoutStore.getState().isLockedOut('vault:pin')).toBe(true); // restored
  });

  it('drops an already-expired persisted lockout on hydration', async () => {
    const past = Date.now() - 1000;
    await AsyncStorage.setItem(
      '@vault_lockouts',
      JSON.stringify({ attempts: { 'vault:pin': 5 }, lockouts: { 'vault:pin': past } })
    );
    useLockoutStore.setState({ attempts: {}, lockouts: {}, isHydrated: false });
    await useLockoutStore.getState().hydrateLockouts();
    expect(useLockoutStore.getState().isLockedOut('vault:pin')).toBe(false);
  });
});
