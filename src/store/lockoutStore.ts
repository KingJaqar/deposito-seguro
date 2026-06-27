/**
 * Persistent lockout state store
 * Prevents brute-force attacks by maintaining attempt counts across modal close/reopen
 */
import { create } from 'zustand';

interface LockoutState {
  // Key format: `${targetType}:${targetId}` e.g., "file:abc123"
  attempts: Record<string, number>;
  lockouts: Record<string, number>; // timestamp when lockout expires
  
  recordFailedAttempt: (key: string) => { newAttempts: number; remaining: number; isLockedOut: boolean };
  resetAttempts: (key: string) => void;
  isLockedOut: (key: string) => boolean;
  getRemainingLockoutTime: (key: string) => number;
  clearAll: () => void;
}

export const MAX_PASSWORD_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 30000; // 30 seconds

export const useLockoutStore = create<LockoutState>((set, get) => ({
  attempts: {},
  lockouts: {},

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
    
    set((state) => ({
      attempts: { ...state.attempts, [key]: newAttempts },
      lockouts: newLockouts,
    }));
    
    return { newAttempts, remaining, isLockedOut };
  },

  resetAttempts: (key: string) => {
    set((state) => {
      const newAttempts = { ...state.attempts };
      delete newAttempts[key];
      const newLockouts = { ...state.lockouts };
      delete newLockouts[key];
      return { attempts: newAttempts, lockouts: newLockouts };
    });
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
  },
}));