// File: src/store/settingsStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { SecureCrypto } from '../security/crypto';
import { DisguiseMode, EncryptionKeyMetadata, FilePasswordMetadata, GridListView, ThemeMode } from '../types';
import { sanitizeSecureStoreKey } from '../utils/secureStoreKey';

interface SettingsState {
  themeMode: ThemeMode;
  disguiseMode: DisguiseMode;
  viewMode: GridListView;
  autoLockDuration: number;
  biometricsEnabled: boolean;
  encryptionDefault: boolean;
  accentColor: string;
  fontSizeMultiplier: number;
  screenshotProtection: boolean;
  clipboardClearEnabled: boolean;
  fakeCrashEnabled: boolean;
  showHiddenFiles: boolean;
  filePasswords: FilePasswordMetadata[];
  encryptionKeys: EncryptionKeyMetadata[];

  hydrateSettings: () => Promise<void>;
  updateSetting: <K extends keyof Omit<SettingsState, 'hydrateSettings' | 'updateSetting' | 'createFilePassword' | 'deleteFilePassword' | 'createEncryptionKey' | 'deleteEncryptionKey' | 'encryptionKeyExists'>>(
    key: K,
    val: SettingsState[K]
  ) => Promise<void>;
  createFilePassword: (label: string, password: string, description?: string) => Promise<FilePasswordMetadata | null>;
  filePasswordExists: (label: string) => boolean;
  deleteFilePassword: (filePasswordId: string) => Promise<'deleted' | 'in-use' | 'not-found'>;
  updateFilePassword: (filePasswordId: string, options: { label?: string; description?: string; password?: string }) => Promise<boolean>;
  createEncryptionKey: (name: string, customKey?: string, description?: string) => Promise<EncryptionKeyMetadata | null>;
  encryptionKeyExists: (name: string) => boolean;
  deleteEncryptionKey: (keyId: string) => Promise<'deleted' | 'in-use' | 'not-found'>;
}

const SETTINGS_KEY = sanitizeSecureStoreKey('@vault_settings');
const FILE_PASSWORD_PREFIX = 'file_password_';
const ENCRYPTION_KEY_PREFIX = 'encryption_key_';

const getSecureKeyPath = (id: string, prefix: string) => sanitizeSecureStoreKey(id, prefix);

const loadFilePasswordValues = async (filePasswords: FilePasswordMetadata[]) => {
  const loadedPasswords: FilePasswordMetadata[] = [];
  for (const fp of filePasswords) {
    const storedValue = await SecureStore.getItemAsync(getSecureKeyPath(fp.id, FILE_PASSWORD_PREFIX));
    loadedPasswords.push(storedValue ? { ...fp, password: storedValue, fingerprint: SecureCrypto.fingerprint(storedValue) } : fp);
  }
  return loadedPasswords;
};

const loadEncryptionKeyValues = async (encryptionKeys: EncryptionKeyMetadata[]) => {
  const loadedKeys: EncryptionKeyMetadata[] = [];
  for (const key of encryptionKeys) {
    const storedValue = await SecureStore.getItemAsync(getSecureKeyPath(key.id, ENCRYPTION_KEY_PREFIX));
    loadedKeys.push(storedValue ? { ...key, key: storedValue, fingerprint: SecureCrypto.fingerprint(storedValue) } : key);
  }
  return loadedKeys;
};

const PERSIST_KEYS: (keyof Omit<SettingsState, 'hydrateSettings' | 'updateSetting' | 'createFilePassword' | 'deleteFilePassword' | 'createEncryptionKey' | 'deleteEncryptionKey' | 'encryptionKeyExists'>)[] = [
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
  'filePasswords',
  'encryptionKeys',
];

export const useSettingsStore = create<SettingsState>((set) => ({
  themeMode: 'dark',
  disguiseMode: 'default',
  viewMode: 'grid',
  autoLockDuration: 60000,
  biometricsEnabled: false,
  encryptionDefault: false,
  accentColor: '#0A84FF',
  fontSizeMultiplier: 1.0,
  screenshotProtection: false,
  clipboardClearEnabled: false,
  fakeCrashEnabled: false,
  showHiddenFiles: false,
  filePasswords: [],
  encryptionKeys: [],

  hydrateSettings: async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<SettingsState>;
        const filePasswords = parsed.filePasswords ? await loadFilePasswordValues(parsed.filePasswords) : [];
        const encryptionKeys = parsed.encryptionKeys ? await loadEncryptionKeyValues(parsed.encryptionKeys) : [];
        set((state) => ({ ...state, ...parsed, filePasswords, encryptionKeys }));
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

  createFilePassword: async (label, password, description) => {
    const normalizedLabel = label.trim();
    
    // Generate UUID asynchronously for cryptographic security
    const id = await SecureCrypto.generateUUID();
    
    let created: FilePasswordMetadata | null = null;
    set((state) => {
      if (state.filePasswords.length >= 20) {
        return state;
      }

      if (state.filePasswords.some(k => k.label.toLowerCase() === normalizedLabel.toLowerCase())) {
        return state;
      }

      const filePassword: FilePasswordMetadata = {
        id: id,
        label: normalizedLabel || 'Untitled Password',
        description: description?.trim(),
        password: password,
        fingerprint: SecureCrypto.fingerprint(password),
        createdAt: Date.now(),
      };
      const filePasswords = [...state.filePasswords, filePassword];
      const snapshot = PERSIST_KEYS.reduce((acc, k) => {
        (acc as any)[k] = ({ ...state, filePasswords } as any)[k];
        return acc;
      }, {} as Partial<SettingsState>);
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot)).catch(
        (err) => console.error('Settings persist error:', err)
      );
      SecureStore.setItemAsync(getSecureKeyPath(filePassword.id, FILE_PASSWORD_PREFIX), password).catch(
        (err) => console.error('File password secure storage error:', err)
      );
      created = filePassword;
      return { filePasswords };
    });

    return created;
  },

  filePasswordExists: (label: string): boolean => {
    const normalizedLabel = label.trim().toLowerCase();
    return useSettingsStore.getState().filePasswords.some((k: FilePasswordMetadata) => k.label.toLowerCase() === normalizedLabel);
  },

  deleteFilePassword: async (filePasswordId) => {
    try {
      const [filesRaw, foldersRaw] = await Promise.all([
        AsyncStorage.getItem('@vault_files'),
        AsyncStorage.getItem('@vault_folders'),
      ]);
      const files = filesRaw ? JSON.parse(filesRaw) : [];
      const folders = foldersRaw ? JSON.parse(foldersRaw) : [];
      const inUse = files.some((file: any) => file.filePasswordId === filePasswordId) ||
        folders.some((folder: any) => folder.filePasswordId === filePasswordId);

      if (inUse) return 'in-use';

      let deleted = false;
      set((state) => {
        const filePasswords = state.filePasswords.filter(k => k.id !== filePasswordId);
        if (filePasswords.length === state.filePasswords.length) {
          return state;
        }

        deleted = true;
        const snapshot = PERSIST_KEYS.reduce((acc, k) => {
          (acc as any)[k] = ({ ...state, filePasswords } as any)[k];
          return acc;
        }, {} as Partial<SettingsState>);
        AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot)).catch(
          (err) => console.error('Settings persist error:', err)
        );
        SecureStore.deleteItemAsync(getSecureKeyPath(filePasswordId, FILE_PASSWORD_PREFIX)).catch(
          (err) => console.error('File password secure deletion error:', err)
        );
        return { filePasswords };
      });

      return deleted ? 'deleted' : 'not-found';
    } catch (e) {
      console.error('File password deletion failed', e);
      return 'not-found';
    }
  },

  updateFilePassword: async (filePasswordId, options) => {
    let updated = false;
    set((state) => {
      const idx = state.filePasswords.findIndex(fp => fp.id === filePasswordId);
      if (idx === -1) return state;
      const existing = state.filePasswords[idx];
      const updatedLabel = options.label !== undefined ? options.label.trim() : existing.label;
      const updatedDescription = options.description !== undefined ? options.description.trim() : existing.description;
      const updatedPassword = options.password !== undefined ? options.password : existing.password;
      const filePassword: FilePasswordMetadata = {
        ...existing,
        label: updatedLabel || 'Untitled Password',
        description: updatedDescription || undefined,
        password: updatedPassword,
        fingerprint: SecureCrypto.fingerprint(updatedPassword),
        createdAt: existing.createdAt,
      };
      const filePasswords = [...state.filePasswords];
      filePasswords[idx] = filePassword;
      const snapshot = PERSIST_KEYS.reduce((acc, k) => {
        (acc as any)[k] = ({ ...state, filePasswords } as any)[k];
        return acc;
      }, {} as Partial<SettingsState>);
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshot)).catch((err) => console.error('Settings persist error:', err));
      SecureStore.setItemAsync(getSecureKeyPath(filePassword.id, FILE_PASSWORD_PREFIX), updatedPassword).catch(
        (err) => console.error('File password secure storage error:', err)
      );
      updated = true;
      return { filePasswords };
    });
    return updated;
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
}));