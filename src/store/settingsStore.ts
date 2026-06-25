// File: src/store/settingsStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { SecureCrypto } from '../security/crypto';
import { DisguiseMode, EncryptionKeyMetadata, GridListView, ThemeMode } from '../types';
import { sanitizeSecureStoreKey } from '../utils/secureStoreKey';

interface SettingsState {
  // ── Existing fields ──────────────────────────────────────────────────────
  themeMode: ThemeMode;
  disguiseMode: DisguiseMode;
  viewMode: GridListView;
  autoLockDuration: number;   // milliseconds; 0 = disabled
  biometricsEnabled: boolean;
  encryptionDefault: boolean;
  accentColor: string;
  fontSizeMultiplier: number;

  // ── New vault-specific fields ─────────────────────────────────────────────
  screenshotProtection: boolean;   // prevent screen capture
  clipboardClearEnabled: boolean;  // auto-wipe clipboard after copy
  fakeCrashEnabled: boolean;       // show fake crash on wrong PIN
  showHiddenFiles: boolean;        // reveal hidden/dot files in directory
  encryptionKeys: EncryptionKeyMetadata[];

  // ── Actions ───────────────────────────────────────────────────────────────
  hydrateSettings: () => Promise<void>;
  updateSetting: <K extends keyof Omit<SettingsState, 'hydrateSettings' | 'updateSetting' | 'createEncryptionKey' | 'deleteEncryptionKey'>>(
    key: K,
    val: SettingsState[K]
  ) => Promise<void>;
  createEncryptionKey: (name: string, customKey?: string, description?: string) => Promise<EncryptionKeyMetadata | null>;
  encryptionKeyExists: (name: string) => boolean;
  deleteEncryptionKey: (keyId: string) => Promise<'deleted' | 'in-use' | 'not-found'>;
}

const SETTINGS_KEY = sanitizeSecureStoreKey('@vault_settings');
const ENCRYPTION_KEY_PREFIX = 'encryption_key_';

const getSecureKeyPath = (keyId: string) => sanitizeSecureStoreKey(keyId, ENCRYPTION_KEY_PREFIX);

const loadEncryptionKeyValues = async (encryptionKeys: EncryptionKeyMetadata[]) => {
  const loadedKeys: EncryptionKeyMetadata[] = [];
  for (const key of encryptionKeys) {
    const storedValue = await SecureStore.getItemAsync(getSecureKeyPath(key.id));
    loadedKeys.push(storedValue ? { ...key, key: storedValue, fingerprint: SecureCrypto.fingerprint(storedValue) } : key);
  }
  return loadedKeys;
};

// All persisted keys in one place — keeps AsyncStorage.setItem in sync
const PERSIST_KEYS: (keyof Omit<SettingsState, 'hydrateSettings' | 'updateSetting' | 'createEncryptionKey' | 'deleteEncryptionKey'>)[] = [
  'themeMode',
  'disguiseMode',
  'viewMode',
  'autoLockDuration',
  'biometricsEnabled',
  'encryptionDefault',
  'accentColor',
  'fontSizeMultiplier',
  'screenshotProtection',
  'clipboardClearEnabled',
  'fakeCrashEnabled',
  'showHiddenFiles',
  'encryptionKeys',
];

export const useSettingsStore = create<SettingsState>((set) => ({
  // ── Defaults ──────────────────────────────────────────────────────────────
  themeMode: 'dark',
  disguiseMode: 'default',
  viewMode: 'grid',
  autoLockDuration: 60000,   // 1 min
  biometricsEnabled: false,
  encryptionDefault: false,
  accentColor: '#0A84FF',
  fontSizeMultiplier: 1.0,
  screenshotProtection: false,
  clipboardClearEnabled: false,
  fakeCrashEnabled: false,
  showHiddenFiles: false,
  encryptionKeys: [],

  // ── Hydrate from AsyncStorage on app boot ─────────────────────────────────
  hydrateSettings: async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<SettingsState>;
        const encryptionKeys = parsed.encryptionKeys ? await loadEncryptionKeyValues(parsed.encryptionKeys) : [];
        set((state) => ({ ...state, ...parsed, encryptionKeys }));
      }
    } catch (e) {
      console.error('Settings store failed hydration sequence.', e);
    }
  },

  // ── Persist a single key change ───────────────────────────────────────────
  updateSetting: async (key, val) => {
    set((state) => {
      const updated = { ...state, [key]: val };
      const snapshot = PERSIST_KEYS.reduce((acc, k) => {
        (acc as any)[k] = (updated as any)[k];
        return acc;
      }, {} as Partial<SettingsState>);
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot)).catch(
        (err) => console.error('Settings persist error:', err)
      );
      return updated;
    });
  },
  createEncryptionKey: async (name, customKey, description) => {
    const normalizedName = name.trim();
    
    // Generate salt first if using a custom key phrase
    const salt = customKey?.trim() ? SecureCrypto.generateSalt() : undefined;
    const resolvedKey = await SecureCrypto.generateEncryptionKey(customKey);

    let created: EncryptionKeyMetadata | null = null;
    set((state) => {
      if (state.encryptionKeys.length >= 20) {
        return state;
      }

      if (state.encryptionKeys.some(k => k.name.toLowerCase() === normalizedName.toLowerCase())) {
        return state;
      }

      const encryptionKey: EncryptionKeyMetadata = {
        id: SecureCrypto.generateUUID(),
        name: normalizedName || 'Untitled Key',
        description: description?.trim(),
        key: resolvedKey,
        fingerprint: SecureCrypto.fingerprint(resolvedKey),
        createdAt: Date.now(),
        salt,
      };
      const encryptionKeys = [...state.encryptionKeys, encryptionKey];
      const snapshot = PERSIST_KEYS.reduce((acc, k) => {
        (acc as any)[k] = ({ ...state, encryptionKeys } as any)[k];
        return acc;
      }, {} as Partial<SettingsState>);
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot)).catch(
        (err) => console.error('Settings persist error:', err)
      );
      SecureStore.setItemAsync(getSecureKeyPath(encryptionKey.id), resolvedKey).catch(
        (err) => console.error('Encryption key secure storage error:', err)
      );
      created = encryptionKey;
      return { encryptionKeys };
    });

    return created;
  },
  encryptionKeyExists: (name: string): boolean => {
    const normalizedName = name.trim().toLowerCase();
    return useSettingsStore.getState().encryptionKeys.some((k: EncryptionKeyMetadata) => k.name.toLowerCase() === normalizedName);
  },
  deleteEncryptionKey: async (keyId) => {
    try {
      const [filesRaw, foldersRaw] = await Promise.all([
        AsyncStorage.getItem('@vault_files'),
        AsyncStorage.getItem('@vault_folders'),
      ]);
      const files = filesRaw ? JSON.parse(filesRaw) : [];
      const folders = foldersRaw ? JSON.parse(foldersRaw) : [];
      const inUse = files.some((file: any) => file.encryptionKeyId === keyId) ||
        folders.some((folder: any) => folder.encryptionKeyId === keyId);

      if (inUse) return 'in-use';

      let deleted = false;
      set((state) => {
        const encryptionKeys = state.encryptionKeys.filter(k => k.id !== keyId);
        if (encryptionKeys.length === state.encryptionKeys.length) {
          return state;
        }

        deleted = true;
        const snapshot = PERSIST_KEYS.reduce((acc, k) => {
          (acc as any)[k] = ({ ...state, encryptionKeys } as any)[k];
          return acc;
        }, {} as Partial<SettingsState>);
        AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot)).catch(
          (err) => console.error('Settings persist error:', err)
        );
        SecureStore.deleteItemAsync(getSecureKeyPath(keyId)).catch(
          (err) => console.error('Encryption key secure deletion error:', err)
        );
        return { encryptionKeys };
      });

      return deleted ? 'deleted' : 'not-found';
    } catch (e) {
      console.error('Encryption key deletion failed', e);
      return 'not-found';
    }
  },
}));