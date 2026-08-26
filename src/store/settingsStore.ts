// File: src/store/settingsStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { SecureCrypto } from '../security/crypto';
import { DisguiseMode, DisguiseIconTheme, EncryptionKeyMetadata, AccessKeyMetadata, GridListView, ThemeMode } from '../types';
import { sanitizeSecureStoreKey } from '../utils/secureStoreKey';
import { DEFAULT_STORAGE_LIMIT_BYTES } from '../constants/storageLimits';

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
  /** Max total vault size in bytes the user has chosen to allow, or null for Unlimited. See src/constants/storageLimits.ts. */
  storageLimitBytes: number | null;
  accessKeys: AccessKeyMetadata[];
  encryptionKeys: EncryptionKeyMetadata[];
  isHydrated: boolean;
  hydrationError: string | null;

  hydrateSettings: () => Promise<void>;
  updateSetting: (key: SettingsSettingKey, val: unknown) => Promise<void>;
  createAccessKey: (label: string, password: string, description?: string) => Promise<AccessKeyMetadata | null>;
  accessKeyExists: (label: string) => boolean;
  deleteAccessKey: (accessKeyId: string) => Promise<'deleted' | 'in-use' | 'not-found'>;
  updateAccessKey: (accessKeyId: string, options: { label?: string; description?: string; password?: string }) => Promise<boolean>;
  createEncryptionKey: (name: string, customKey?: string, description?: string) => Promise<EncryptionKeyMetadata | null>;
  encryptionKeyExists: (name: string) => boolean;
  deleteEncryptionKey: (keyId: string) => Promise<'deleted' | 'in-use' | 'not-found'>;
  restoreKeysFromBackup: (accessKeys: AccessKeyMetadata[], encryptionKeys: EncryptionKeyMetadata[]) => Promise<void>;
  lockTransientMemory: () => void;
}

const SETTINGS_KEY = sanitizeSecureStoreKey('@vault_settings');
const ACCESS_KEY_PREFIX = 'access_key_';
const ENCRYPTION_KEY_PREFIX = 'encryption_key_';

const SECURE_STORE_TIMEOUT = 5000;
const ASYNC_STORAGE_TIMEOUT = 5000;

const withSecureStoreTimeout = async <T>(promise: Promise<T>): Promise<T | null> => {
  return Promise.race([
    promise,
    new Promise<T | null>((resolve) => setTimeout(() => resolve(null), SECURE_STORE_TIMEOUT)),
  ]);
};

const withAsyncStorageTimeout = async <T>(promise: Promise<T>): Promise<T | null> => {
  return Promise.race([
    promise,
    new Promise<T | null>((resolve) => setTimeout(() => resolve(null), ASYNC_STORAGE_TIMEOUT)),
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

type SettingsSettingKey = 'themeMode' | 'disguiseMode' | 'viewMode' | 'autoLockDuration' | 'encryptionDefault' | 'accentColor' | 'fontSizeMultiplier' | 'screenshotProtection' | 'clipboardClearEnabled' | 'fakeCrashEnabled' | 'showHiddenFiles' | 'disguiseAppName' | 'disguiseIconTheme' | 'storageLimitBytes' | 'accessKeys' | 'encryptionKeys';

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
  'storageLimitBytes',
  'accessKeys',
  'encryptionKeys',
];

/**
 * Builds the AsyncStorage snapshot for the settings store.
 *
 * S-2 remediation: `accessKeys`/`encryptionKeys` carry a raw secret
 * (`password`/`key`) that must live ONLY in SecureStore. Previously this
 * function (inlined at every call site) persisted those secrets into
 * AsyncStorage's plaintext JSON blob too — a duplicate, weaker-guarantee
 * copy of the same secret, extractable via `adb backup`-style tooling.
 * `loadAccessKeyValues`/`loadEncryptionKeyValues` already re-hydrate the
 * real secret from SecureStore on load, so redacting it here loses nothing.
 */
function buildPersistSnapshot(state: SettingsState): Partial<SettingsState> {
  const snapshot = PERSIST_KEYS.reduce((acc, k) => {
    (acc as Record<string, unknown>)[k] = (state as unknown as Record<string, unknown>)[k];
    return acc;
  }, {} as Partial<SettingsState>);
  if (snapshot.accessKeys) {
    snapshot.accessKeys = snapshot.accessKeys.map((ak) => ({ ...ak, password: '' }));
  }
  if (snapshot.encryptionKeys) {
    snapshot.encryptionKeys = snapshot.encryptionKeys.map((ek) => ({ ...ek, key: '' }));
  }
  return snapshot;
}

function persistSnapshot(state: SettingsState) {
  AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(buildPersistSnapshot(state))).catch(
    (err) => console.error('Settings persist error:', err)
  );
}

export const useSettingsStore = create<SettingsState>((set) => ({
  themeMode: 'dark',
  disguiseMode: 'default',
  viewMode: 'list',
  autoLockDuration: 60000,
  encryptionDefault: false,
  accentColor: '#0A84FF',
  fontSizeMultiplier: 1.0,
  // S-9: default to on — a vault app should protect screenshots/recent-apps
  // thumbnails out of the box, not require the user to discover and enable it.
  screenshotProtection: true,
  clipboardClearEnabled: false,
  fakeCrashEnabled: false,
  showHiddenFiles: false,
  disguiseAppName: 'Calculator',
  disguiseIconTheme: 'default',
  storageLimitBytes: DEFAULT_STORAGE_LIMIT_BYTES,
  accessKeys: [],
  encryptionKeys: [],
  isHydrated: false,
  hydrationError: null,

  hydrateSettings: async () => {
    const state = useSettingsStore.getState();
    if (state.isHydrated) return;

    set({ isHydrated: false, hydrationError: null });
    try {
      const stored = await withAsyncStorageTimeout(AsyncStorage.getItem(SETTINGS_KEY));
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<SettingsState>;
        const accessKeys = parsed.accessKeys ? await loadAccessKeyValues(parsed.accessKeys) : [];
        const encryptionKeys = parsed.encryptionKeys ? await loadEncryptionKeyValues(parsed.encryptionKeys) : [];
        set((state) => ({ ...state, ...parsed, accessKeys, encryptionKeys, isHydrated: true, hydrationError: null }));
      } else {
        set({ isHydrated: true, hydrationError: null });
      }
    } catch (e) {
      console.error('Settings store failed hydration sequence.', e);
      set({ isHydrated: true, hydrationError: 'Settings hydration failed' });
    }
  },

  updateSetting: async (key, val) => {
    set((state) => {
      const updated = { ...state, [key]: val };
      persistSnapshot(updated);
      return updated;
    });
  },

  createAccessKey: async (label, password, description) => {
    const normalizedLabel = label.trim();
    const id = SecureCrypto.generateUUID();

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
      persistSnapshot({ ...state, accessKeys });
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
        persistSnapshot({ ...state, accessKeys });
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
      persistSnapshot({ ...state, accessKeys });
      SecureStore.setItemAsync(getSecureKeyPath(accessKey.id, ACCESS_KEY_PREFIX), updatedPassword).catch(
        (err) => console.error('Access key secure storage error:', err)
      );
      updated = true;
      return { accessKeys };
    });
    return updated;
  },

  createEncryptionKey: async (name, customKey, description) => {
    const normalizedLabel = name.trim();
    const id = SecureCrypto.generateUUID();
    const key = await SecureCrypto.generateEncryptionKey(customKey);

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
      persistSnapshot({ ...state, encryptionKeys });
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
        persistSnapshot({ ...state, encryptionKeys });
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
  /**
   * Restores access/encryption key metadata AND their real secret values
   * from a decrypted backup (Phase 3 — full portable backup, see
   * plans/deposito-seguro-audit-report.md §20). Writes each raw secret to
   * SecureStore (never AsyncStorage — consistent with S-2) and updates
   * in-memory + the (redacted) AsyncStorage snapshot the same way every
   * other mutation in this store does.
   */
  restoreKeysFromBackup: async (accessKeys, encryptionKeys) => {
    await Promise.all([
      ...accessKeys.map((ak) =>
        SecureStore.setItemAsync(getSecureKeyPath(ak.id, ACCESS_KEY_PREFIX), ak.password).catch((err) =>
          console.error('Restore: failed to write access key to SecureStore', err)
        )
      ),
      ...encryptionKeys.map((ek) =>
        SecureStore.setItemAsync(getSecureKeyPath(ek.id, ENCRYPTION_KEY_PREFIX), ek.key).catch((err) =>
          console.error('Restore: failed to write encryption key to SecureStore', err)
        )
      ),
    ]);
    set((state) => {
      const updated = { ...state, accessKeys, encryptionKeys };
      persistSnapshot(updated);
      return updated;
    });
  },
  lockTransientMemory: () => {
    set((state) => ({
      encryptionKeys: state.encryptionKeys.map(k => ({ ...k, key: '' })),
      accessKeys: state.accessKeys.map(k => ({ ...k, password: '' })),
    }));
  },
}));