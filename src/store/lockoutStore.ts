/**
 * Persistent lockout state store
 * Prevents brute-force attacks by maintaining attempt counts across modal close/reopen
 * AND across a full app restart (S-5 — see plans/deposito-seguro-audit-report.md §10;
 * previously in-memory only, so force-quitting the app reset every lockout to zero).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

interface LockoutState {
  // Key format: `${targetType}:${targetId}` e.g., "file:abc123"
  attempts: Record<string, number>;
  lockouts: Record<string, number>; // timestamp when lockout expires
  isHydrated: boolean;

  hydrateLockouts: () => Promise<void>;
  recordFailedAttempt: (key: string) => { newAttempts: number; remaining: number; isLockedOut: boolean };
  resetAttempts: (key: string) => void;
  isLockedOut: (key: string) => boolean;
  getRemainingLockoutTime: (key: string) => number;
  clearAll: () => void;
}

export const MAX_PASSWORD_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 30000; // 30 seconds

const LOCKOUT_STORAGE_KEY = '@vault_lockouts';

function persist(attempts: Record<string, number>, lockouts: Record<string, number>) {
  AsyncStorage.setItem(LOCKOUT_STORAGE_KEY, JSON.stringify({ attempts, lockouts })).catch((err) =>
    console.error('Lockout persist error:', err)
  );
}

export const useLockoutStore = create<LockoutState>((set, get) => ({
  attempts: {},
  lockouts: {},
  isHydrated: false,

  hydrateLockouts: async () => {
    if (get().isHydrated) return;
    try {
      const stored = await AsyncStorage.getItem(LOCKOUT_STORAGE_KEY);
      if (!stored) {
        set({ isHydrated: true });
        return;
      }
      const parsed = JSON.parse(stored) as { attempts?: Record<string, number>; lockouts?: Record<string, number> };
      const now = Date.now();
      const attempts: Record<string, number> = { ...(parsed.attempts || {}) };
      const lockouts: Record<string, number> = {};
      // Drop already-expired lockouts (and their attempt counts) on load
      // rather than letting a stale lockout linger forever.
      for (const [key, until] of Object.entries(parsed.lockouts || {})) {
        if (typeof until === 'number' && until > now) {
          lockouts[key] = until;
        } else {
          delete attempts[key];
        }
      }
      set({ attempts, lockouts, isHydrated: true });
    } catch (e) {
      console.error('Lockout hydration error:', e);
      set({ isHydrated: true });
    }
  },

  recordFailedAttempt: (key: string) => {
    const now = Date.now();
    const currentAttempts = get().attempts[key] || 0;
    const newAttempts = currentAttempts + 1;
    const remaining = Math.max(0, MAX_PASSWORD_ATTEMPTS - newAttempts);

    let isLockedOut = false;
    const newLockouts = { ...get().lockouts };

    if (newAttempts >= MAX_PASSWORD_ATTEMPTS) {
      newLockouts[key] = now + LOCKOUT_DURATION_MS;
      isLockedOut = true;
    }

    const newAttemptsMap = { ...get().attempts, [key]: newAttempts };
    set({ attempts: newAttemptsMap, lockouts: newLockouts });
    persist(newAttemptsMap, newLockouts);

    return { newAttempts, remaining, isLockedOut };
  },

  resetAttempts: (key: string) => {
    const newAttempts = { ...get().attempts };
    delete newAttempts[key];
    const newLockouts = { ...get().lockouts };
    delete newLockouts[key];
    set({ attempts: newAttempts, lockouts: newLockouts });
    persist(newAttempts, newLockouts);
  },

  isLockedOut: (key: string) => {
    const lockoutUntil = get().lockouts[key];
    if (!lockoutUntil) return false;
    return Date.now() < lockoutUntil;
  },

  getRemainingLockoutTime: (key: string) => {
    const lockoutUntil = get().lockouts[key];
    if (!lockoutUntil) return 0;
    return Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
  },

  clearAll: () => {
    set({ attempts: {}, lockouts: {} });
    persist({}, {});
  },
}));
