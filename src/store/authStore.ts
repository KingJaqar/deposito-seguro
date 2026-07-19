import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { SecureCrypto } from '../security/crypto';
import { sanitizeSecureStoreKey } from '../utils/secureStoreKey';

interface AuthState {
  isConfigured: boolean;
  isAuthenticated: boolean;
  securityHint: string;
  pinLength: number;
  lastActiveTimestamp: number;
  isLoading: boolean;
  checkSetup: () => Promise<void>;
  initializeVault: (password: string, hint: string) => Promise<boolean>;
  authenticate: (password: string) => Promise<boolean>;
  terminateSession: () => void;
  updateActivity: () => void;
  updateSecurityHint: (hint: string) => Promise<void>;
  deleteSecurityHint: () => Promise<void>;
}

const isWeb = Platform.OS === 'web';

// Sanitized SecureStore keys
const SECURE_KEYS = {
  MASTER_PASSWORD_HASH: sanitizeSecureStoreKey('MASTER_PASSWORD_HASH'),
  MASTER_PASSWORD_SALT: sanitizeSecureStoreKey('MASTER_PASSWORD_SALT'),
  SECURITY_HINT: sanitizeSecureStoreKey('SECURITY_HINT'),
  PIN_LENGTH: sanitizeSecureStoreKey('PIN_LENGTH'),
};

const SECURE_STORE_TIMEOUT = 5000;

const withSecureStoreTimeout = async <T>(promise: Promise<T>): Promise<T | null> => {
  return Promise.race([
    promise,
    new Promise<T | null>((resolve) => setTimeout(() => resolve(null), SECURE_STORE_TIMEOUT)),
  ]);
};

export const useAuthStore = create<AuthState>((set, get) => ({
  isConfigured: false,
  isAuthenticated: false,
  securityHint: '',
  pinLength: 6,
  lastActiveTimestamp: Date.now(),
  isLoading: false,
  checkSetup: async () => {
    set({ isLoading: true });
    try {
      const pHash = isWeb
        ? await AsyncStorage.getItem('MASTER_PASSWORD_HASH')
        : await withSecureStoreTimeout(SecureStore.getItemAsync(SECURE_KEYS.MASTER_PASSWORD_HASH));
      const hint = isWeb
        ? await AsyncStorage.getItem('SECURITY_HINT')
        : await withSecureStoreTimeout(SecureStore.getItemAsync(SECURE_KEYS.SECURITY_HINT));
      const pinLenRaw = isWeb
        ? await AsyncStorage.getItem('PIN_LENGTH')
        : await withSecureStoreTimeout(SecureStore.getItemAsync(SECURE_KEYS.PIN_LENGTH));
      const pinLen = pinLenRaw ? parseInt(pinLenRaw, 10) : 6;
      set({ isConfigured: !!pHash, securityHint: hint || '', pinLength: Number.isFinite(pinLen) && pinLen > 0 ? pinLen : 6, isLoading: false });
    } catch (e) {
      console.error('checkSetup error', e);
      set({ isLoading: false });
    }
  },
  initializeVault: async (password, hint) => {
    try {
      const salt = await SecureCrypto.generateSaltAsync();
      const hash = await SecureCrypto.hashPassword(password, salt);
      if (isWeb) {
        await AsyncStorage.setItem('MASTER_PASSWORD_HASH', hash);
        await AsyncStorage.setItem('MASTER_PASSWORD_SALT', salt);
        await AsyncStorage.setItem('SECURITY_HINT', hint);
        await AsyncStorage.setItem('PIN_LENGTH', String(password.length));
      } else {
        await SecureStore.setItemAsync(SECURE_KEYS.MASTER_PASSWORD_HASH, hash);
        await SecureStore.setItemAsync(SECURE_KEYS.MASTER_PASSWORD_SALT, salt);
        await SecureStore.setItemAsync(SECURE_KEYS.SECURITY_HINT, hint);
        await SecureStore.setItemAsync(SECURE_KEYS.PIN_LENGTH, String(password.length));
      }
      set({ isConfigured: true, isAuthenticated: true, securityHint: hint, pinLength: password.length, lastActiveTimestamp: Date.now() });
      return true;
    } catch {
      return false;
    }
  },
  authenticate: async (password) => {
    try {
      const storedHash = isWeb
        ? await AsyncStorage.getItem('MASTER_PASSWORD_HASH')
        : await SecureStore.getItemAsync(SECURE_KEYS.MASTER_PASSWORD_HASH);
      const salt = isWeb
        ? await AsyncStorage.getItem('MASTER_PASSWORD_SALT')
        : await SecureStore.getItemAsync(SECURE_KEYS.MASTER_PASSWORD_SALT);
      if (!storedHash || !salt) return false;
      const verifyHash = await SecureCrypto.hashPassword(password, salt);
      if (verifyHash === storedHash) {
        set({ isAuthenticated: true, lastActiveTimestamp: Date.now() });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
  updateSecurityHint: async (hint) => {
    try {
      if (isWeb) {
        await AsyncStorage.setItem('SECURITY_HINT', hint);
      } else {
        await SecureStore.setItemAsync(SECURE_KEYS.SECURITY_HINT, hint);
      }
      set({ securityHint: hint });
    } catch (e) {
      console.error('updateSecurityHint error', e);
    }
  },
  deleteSecurityHint: async () => {
    try {
      if (isWeb) {
        await AsyncStorage.removeItem('SECURITY_HINT');
      } else {
        await SecureStore.deleteItemAsync(SECURE_KEYS.SECURITY_HINT);
      }
      set({ securityHint: '' });
    } catch (e) {
      console.error('deleteSecurityHint error', e);
    }
  },
  terminateSession: () => set({ isAuthenticated: false }),
  updateActivity: () => set({ lastActiveTimestamp: Date.now() })
}));
