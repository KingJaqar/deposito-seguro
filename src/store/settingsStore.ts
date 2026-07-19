// File: src/store/settingsStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { SecureCrypto } from '../security/crypto';
import { DisguiseMode, DisguiseIconTheme, EncryptionKeyMetadata, AccessKeyMetadata, AuthKey, GridListView, ThemeMode } from '../types';
import { sanitizeSecureStoreKey } from '../utils/secureStoreKey';

interface SettingsState {
  themeMode: ThemeMode;
  disguiseMode: DisguiseMode;
  viewMode: GridListView;
  autoLockDuration: number;
  encryptionDefault: boolean;
  accentColor: string;
  fontSizeMultiplier: number;
  screenshotProtection: boolean;
  clipboardClearEnabled: boolean;
  fakeCrashEnabled: boolean;
  showHiddenFiles: boolean;
  disguiseAppName: string;
  disguiseIconTheme: DisguiseIconTheme;
  accessKeys: AccessKeyMetadata[];
  encryptionKeys: EncryptionKeyMetadata[];
  authKey: AuthKey | null;

  hydrateSettings: () => Promise<void>;
  updateSetting: (key: SettingsSettingKey, val: unknown) => Promise<void>;
  createAccessKey: (label: string, password: string, description?: string) => Promise<AccessKeyMetadata | null>;
  accessKeyExists: (label: string) => boolean;
  deleteAccessKey: (accessKeyId: string) => Promise<'deleted' | 'in-use' | 'not-found'>;
  updateAccessKey: (accessKeyId: string, options: { label?: string; description?: string; password?: string }) => Promise<boolean>;
  createEncryptionKey: (name: string, customKey?: string, description?: string) => Promise<EncryptionKeyMetadata | null>;
  encryptionKeyExists: (name: string) => boolean;
  deleteEncryptionKey: (keyId: string) => Promise<'deleted' | 'in-use' | 'not-found'>;
  setAuthKey: (password: string, hint?: string) => void;
  verifyAuthKey: (password: string) => boolean;
  changeAuthKey: (currentPassword: string, newPassword: string) => boolean;
  updateAuthKeyHint: (hint: string) => void;
  deleteAuthKeyHint: () => void;
  lockTransientMemory: () => void;
}

const SETTINGS_KEY = sanitizeSecureStoreKey('@vault_settings');
const ACCESS_KEY_PREFIX = 'access_key_';
const ENCRYPTION_KEY_PREFIX = 'encryption_key_';

const SECURE_STORE_TIMEOUT = 5000;

const withSecureStoreTimeout = async <T>(promise: Promise<T>): Promise<T | null> => {
  return Promise.race([
    promise,
    new Promise<T | null>((resolve) => setTimeout(() => resolve(null), SECURE_STORE_TIMEOUT)),
  ]);
};

const getSecureKeyPath = (id: string, prefix: string) => sanitizeSecureStoreKey(id, prefix);

const loadAccessKeyValues = async (accessKeys: AccessKeyMetadata[]) => {
  const results = await Promise.allSettled(
    accessKeys.map(async (ak) => {
      const storedValue = await withSecureStoreTimeout(
        SecureStore.getItemAsync(getSecureKeyPath(ak.id, ACCESS_KEY_PREFIX))
      );
      return storedValue
        ? { ...ak, password: storedValue, fingerprint: SecureCrypto.fingerprint(storedValue) }
        : ak;
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<AccessKeyMetadata> => r.status === 'fulfilled')
    .map((r) => r.value);
};

const loadEncryptionKeyValues = async (encryptionKeys: EncryptionKeyMetadata[]) => {
  const results = await Promise.allSettled(
    encryptionKeys.map(async (key) => {
      const storedValue = await withSecureStoreTimeout(
        SecureStore.getItemAsync(getSecureKeyPath(key.id, ENCRYPTION_KEY_PREFIX))
      );
      return storedValue
        ? { ...key, key: storedValue, fingerprint: SecureCrypto.fingerprint(storedValue) }
        : key;
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<EncryptionKeyMetadata> => r.status === 'fulfilled')
    .map((r) => r.value);
};

type SettingsSettingKey = 'themeMode' | 'disguiseMode' | 'viewMode' | 'autoLockDuration' | 'encryptionDefault' | 'accentColor' | 'fontSizeMultiplier' | 'screenshotProtection' | 'clipboardClearEnabled' | 'fakeCrashEnabled' | 'showHiddenFiles' | 'disguiseAppName' | 'disguiseIconTheme' | 'accessKeys' | 'encryptionKeys' | 'authKey';

const PERSIST_KEYS: SettingsSettingKey[] = [
  'themeMode',
  'disguiseMode',
  'viewMode',
  'autoLockDuration',
  'encryptionDefault',
  'accentColor',
  'fontSizeMultiplier',
  'screenshotProtection',
  'clipboardClearEnabled',
  'fakeCrashEnabled',
  'showHiddenFiles',
  'disguiseAppName',
  'disguiseIconTheme',
  'accessKeys',
  'encryptionKeys',
  'authKey',
];

export const useSettingsStore = create<SettingsState>((set) => ({
  themeMode: 'dark',
  disguiseMode: 'default',
  viewMode: 'list',
  autoLockDuration: 60000,
  encryptionDefault: false,
  accentColor: '#0A84FF',
  fontSizeMultiplier: 1.0,
  screenshotProtection: false,
  clipboardClearEnabled: false,
  fakeCrashEnabled: false,
  showHiddenFiles: false,
  disguiseAppName: 'Calculator',
  disguiseIconTheme: 'default',
  accessKeys: [],
  encryptionKeys: [],
  authKey: null,

  hydrateSettings: async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<SettingsState>;
        const accessKeys = parsed.accessKeys ? await loadAccessKeyValues(parsed.accessKeys) : [];
        const encryptionKeys = parsed.encryptionKeys ? await loadEncryptionKeyValues(parsed.encryptionKeys) : [];
        set((state) => ({ ...state, ...parsed, accessKeys, encryptionKeys }));
      }
    } catch (e) {
      console.error('Settings store failed hydration sequence.', e);
    }
  },

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

  createAccessKey: async (label, password, description) => {
    const normalizedLabel = label.trim();
    
    // Generate UUID asynchronously for cryptographic security
    const id = await SecureCrypto.generateUUID();
    
    let created: AccessKeyMetadata | null = null;
    set((state) => {
      if (state.accessKeys.length >= 20) {
        return state;
      }

      if (state.accessKeys.some(k => k.label.toLowerCase() === normalizedLabel.toLowerCase())) {
        return state;
      }

      const accessKey: AccessKeyMetadata = {
        id: id,
        label: normalizedLabel || 'Untitled Access Key',
        description: description?.trim(),
        password: password,
        fingerprint: SecureCrypto.fingerprint(password),
        createdAt: Date.now(),
      };
      const accessKeys = [...state.accessKeys, accessKey];
      const snapshot = PERSIST_KEYS.reduce((acc, k) => {
        (acc as any)[k] = ({ ...state, accessKeys } as any)[k];
        return acc;
      }, {} as Partial<SettingsState>);
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot)).catch(
        (err) => console.error('Settings persist error:', err)
      );
      SecureStore.setItemAsync(getSecureKeyPath(accessKey.id, ACCESS_KEY_PREFIX), password).catch(
        (err) => console.error('Access key secure storage error:', err)
      );
      created = accessKey;
      return { accessKeys };
    });

    return created;
  },

  accessKeyExists: (label: string): boolean => {
    const normalizedLabel = label.trim().toLowerCase();
    return useSettingsStore.getState().accessKeys.some((k: AccessKeyMetadata) => k.label.toLowerCase() === normalizedLabel);
  },

  deleteAccessKey: async (accessKeyId) => {
    try {
      const [filesRaw, foldersRaw] = await Promise.all([
        AsyncStorage.getItem('@vault_files'),
        AsyncStorage.getItem('@vault_folders'),
      ]);
      const files = filesRaw ? JSON.parse(filesRaw) : [];
      const folders = foldersRaw ? JSON.parse(foldersRaw) : [];
      const inUse = files.some((file: any) => file.accessKeyId === accessKeyId) ||
        folders.some((folder: any) => folder.accessKeyId === accessKeyId);

      if (inUse) return 'in-use';

      let deleted = false;
      set((state) => {
        const accessKeys = state.accessKeys.filter(k => k.id !== accessKeyId);
        if (accessKeys.length === state.accessKeys.length) {
          return state;
        }

        deleted = true;
        const snapshot = PERSIST_KEYS.reduce((acc, k) => {
          (acc as any)[k] = ({ ...state, accessKeys } as any)[k];
          return acc;
        }, {} as Partial<SettingsState>);
        AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot)).catch(
          (err) => console.error('Settings persist error:', err)
        );
        SecureStore.deleteItemAsync(getSecureKeyPath(accessKeyId, ACCESS_KEY_PREFIX)).catch(
          (err) => console.error('Access key secure deletion error:', err)
        );
        return { accessKeys };
      });

      return deleted ? 'deleted' : 'not-found';
    } catch (e) {
      console.error('Access key deletion failed', e);
      return 'not-found';
    }
  },

  updateAccessKey: async (accessKeyId, options) => {
    let updated = false;
    set((state) => {
      const idx = state.accessKeys.findIndex(ak => ak.id === accessKeyId);
      if (idx === -1) return state;
      const existing = state.accessKeys[idx];
      const updatedLabel = options.label !== undefined ? options.label.trim() : existing.label;
      const updatedDescription = options.description !== undefined ? options.description.trim() : existing.description;
      const updatedPassword = options.password !== undefined ? options.password : existing.password;
      const accessKey: AccessKeyMetadata = {
        ...existing,
        label: updatedLabel || 'Untitled Access Key',
        description: updatedDescription || undefined,
        password: updatedPassword,
        fingerprint: SecureCrypto.fingerprint(updatedPassword),
        createdAt: existing.createdAt,
      };
      const accessKeys = [...state.accessKeys];
      accessKeys[idx] = accessKey;
      const snapshot = PERSIST_KEYS.reduce((acc, k) => {
        (acc as any)[k] = ({ ...state, accessKeys } as any)[k];
        return acc;
      }, {} as Partial<SettingsState>);
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot)).catch((err) => console.error('Settings persist error:', err));
      SecureStore.setItemAsync(getSecureKeyPath(accessKey.id, ACCESS_KEY_PREFIX), updatedPassword).catch(
        (err) => console.error('Access key secure storage error:', err)
      );
      updated = true;
      return { accessKeys };
    });
    return updated;
  },

  setAuthKey: (password: string, hint?: string) => {
    const authKey: AuthKey = { password, hint };
    set({ authKey });
    const snapshot = { authKey };
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot)).catch(
      (err) => console.error('Settings persist error:', err)
    );
  },

  verifyAuthKey: (password: string): boolean => {
    return useSettingsStore.getState().authKey?.password === password;
  },

  changeAuthKey: (currentPassword: string, newPassword: string): boolean => {
    const current = useSettingsStore.getState().authKey;
    if (!current || current.password !== currentPassword) {
      return false;
    }
    const updatedAuthKey: AuthKey = { password: newPassword, hint: current.hint };
    set({ authKey: updatedAuthKey });
    const snapshot = { authKey: updatedAuthKey };
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot)).catch(
      (err) => console.error('Settings persist error:', err)
    );
    return true;
  },

  updateAuthKeyHint: (hint: string) => {
    const current = useSettingsStore.getState().authKey;
    if (!current) return;
    const updatedAuthKey: AuthKey = { ...current, hint };
    set({ authKey: updatedAuthKey });
    const snapshot = { authKey: updatedAuthKey };
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot)).catch(
      (err) => console.error('Settings persist error:', err)
    );
  },

  deleteAuthKeyHint: () => {
    const current = useSettingsStore.getState().authKey;
    if (!current) return;
    const updatedAuthKey: AuthKey = { ...current, hint: undefined };
    set({ authKey: updatedAuthKey });
    const snapshot = { authKey: updatedAuthKey };
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot)).catch(
      (err) => console.error('Settings persist error:', err)
    );
  },

  createEncryptionKey: async (name, customKey, description) => {
    const normalizedLabel = name.trim();
    
    // Generate UUIDs asynchronously for cryptographic security
    const id = await SecureCrypto.generateUUID();
    const keyId = await SecureCrypto.generateUUID();
    const salt = await SecureCrypto.generateSaltAsync();
    
    const key = customKey || SecureCrypto.xorTransform(keyId, salt);
    
    let created: EncryptionKeyMetadata | null = null;
    set((state) => {
      if (state.encryptionKeys.length >= 20) {
        return state;
      }

      if (state.encryptionKeys.some(k => k.name.toLowerCase() === normalizedLabel.toLowerCase())) {
        return state;
      }

      const encryptionKey: EncryptionKeyMetadata = {
        id: id,
        name: normalizedLabel || 'Untitled Key',
        description: description?.trim(),
        key: key,
        fingerprint: SecureCrypto.fingerprint(key),
        createdAt: Date.now(),
      };
      const encryptionKeys = [...state.encryptionKeys, encryptionKey];
      const snapshot = PERSIST_KEYS.reduce((acc, k) => {
        (acc as any)[k] = ({ ...state, encryptionKeys } as any)[k];
        return acc;
      }, {} as Partial<SettingsState>);
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot)).catch(
        (err) => console.error('Settings persist error:', err)
      );
      SecureStore.setItemAsync(getSecureKeyPath(encryptionKey.id, ENCRYPTION_KEY_PREFIX), key).catch(
        (err) => console.error('Encryption key secure storage error:', err)
      );
      created = encryptionKey;
      return { encryptionKeys };
    });

    return created;
  },

  encryptionKeyExists: (name: string): boolean => {
    const normalizedLabel = name.trim().toLowerCase();
    return useSettingsStore.getState().encryptionKeys.some((k: EncryptionKeyMetadata) => k.name.toLowerCase() === normalizedLabel);
  },

  deleteEncryptionKey: async (encryptionKeyId) => {
    try {
      const [filesRaw, foldersRaw] = await Promise.all([
        AsyncStorage.getItem('@vault_files'),
        AsyncStorage.getItem('@vault_folders'),
      ]);
      const files = filesRaw ? JSON.parse(filesRaw) : [];
      const folders = foldersRaw ? JSON.parse(foldersRaw) : [];
      const inUse = files.some((file: any) => file.encryptionKeyId === encryptionKeyId) ||
        folders.some((folder: any) => folder.encryptionKeyId === encryptionKeyId);

      if (inUse) return 'in-use';

      let deleted = false;
      set((state) => {
        const encryptionKeys = state.encryptionKeys.filter(k => k.id !== encryptionKeyId);
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
        SecureStore.deleteItemAsync(getSecureKeyPath(encryptionKeyId, ENCRYPTION_KEY_PREFIX)).catch(
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
  lockTransientMemory: () => {
    set((state) => ({
      encryptionKeys: state.encryptionKeys.map(k => ({ ...k, key: '' })),
      accessKeys: state.accessKeys.map(k => ({ ...k, password: '' })),
      authKey: state.authKey ? { ...state.authKey, password: '' } : null,
    }));
  },
}));