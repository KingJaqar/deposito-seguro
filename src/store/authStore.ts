import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { SecureCrypto } from '../security/crypto';
import { sanitizeSecureStoreKey } from '../utils/secureStoreKey';

interface AuthState {
  isConfigured: boolean;
  isAuthenticated: boolean;
  securityHint: string;
  lastActiveTimestamp: number;
  checkSetup: () => Promise<void>;
  initializeVault: (password: string, hint: string) => Promise<boolean>;
  authenticate: (password: string) => Promise<boolean>;
  terminateSession: () => void;
  updateActivity: () => void;
}

const isWeb = typeof window !== 'undefined';

// Sanitized SecureStore keys
const SECURE_KEYS = {
  MASTER_PASSWORD_HASH: sanitizeSecureStoreKey('MASTER_PASSWORD_HASH'),
  MASTER_PASSWORD_SALT: sanitizeSecureStoreKey('MASTER_PASSWORD_SALT'),
  SECURITY_HINT: sanitizeSecureStoreKey('SECURITY_HINT'),
};

export const useAuthStore = create<AuthState>((set, get) => ({
  isConfigured: false,
  isAuthenticated: false,
  securityHint: '',
  lastActiveTimestamp: Date.now(),
  checkSetup: async () => {
    try {
      const pHash = isWeb 
        ? await AsyncStorage.getItem('MASTER_PASSWORD_HASH') 
        : await SecureStore.getItemAsync(SECURE_KEYS.MASTER_PASSWORD_HASH);
      const hint = isWeb
        ? await AsyncStorage.getItem('SECURITY_HINT')
        : await SecureStore.getItemAsync(SECURE_KEYS.SECURITY_HINT);
      set({ isConfigured: !!pHash, securityHint: hint || '' });
    } catch (e) {
      console.error('checkSetup error', e);
    }
  },
  initializeVault: async (password, hint) => {
    try {
      const salt = SecureCrypto.generateSalt();
      const hash = await SecureCrypto.hashPassword(password, salt);
      if (isWeb) {
        await AsyncStorage.setItem('MASTER_PASSWORD_HASH', hash);
        await AsyncStorage.setItem('MASTER_PASSWORD_SALT', salt);
        await AsyncStorage.setItem('SECURITY_HINT', hint);
      } else {
        await SecureStore.setItemAsync(SECURE_KEYS.MASTER_PASSWORD_HASH, hash);
        await SecureStore.setItemAsync(SECURE_KEYS.MASTER_PASSWORD_SALT, salt);
        await SecureStore.setItemAsync(SECURE_KEYS.SECURITY_HINT, hint);
      }
      set({ isConfigured: true, isAuthenticated: true, securityHint: hint, lastActiveTimestamp: Date.now() });
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
  terminateSession: () => set({ isAuthenticated: false }),
  updateActivity: () => set({ lastActiveTimestamp: Date.now() })
}));