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
  displayScale: number;
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
  deleteAccessKey: (accessKeyId: string) => Promise<'deleted' | 'in-use' | 'not-found' | 'persist-failed'>;
  updateAccessKey: (accessKeyId: string, options: { label?: string; description?: string; password?: string }) => Promise<boolean>;
  createEncryptionKey: (name: string, customKey?: string, description?: string) => Promise<EncryptionKeyMetadata | null>;
  encryptionKeyExists: (name: string) => boolean;
  deleteEncryptionKey: (keyId: string) => Promise<'deleted' | 'in-use' | 'not-found' | 'persist-failed'>;
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

type SettingsSettingKey = 'themeMode' | 'disguiseMode' | 'viewMode' | 'autoLockDuration' | 'encryptionDefault' | 'accentColor' | 'fontSizeMultiplier' | 'displayScale' | 'screenshotProtection' | 'clipboardClearEnabled' | 'fakeCrashEnabled' | 'showHiddenFiles' | 'disguiseAppName' | 'disguiseIconTheme' | 'storageLimitBytes' | 'accessKeys' | 'encryptionKeys';

const PERSIST_KEYS: SettingsSettingKey[] = [
  'themeMode',
  'disguiseMode',
  'viewMode',
  'autoLockDuration',
  'encryptionDefault',
  'accentColor',
  'fontSizeMultiplier',
  'displayScale',
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

/**
 * I-11 residual (plans/deposito-seguro-audit-report-2026-08-28.md §11/§20,
 * plans/what-are-the-next-jaunty-deer.md item 6): this used to fire
 * AsyncStorage.setItem(...).catch(console.error) without ever awaiting it —
 * every one of this store's mutations called it from inside a synchronous
 * zustand `set()` updater and returned immediately, so a caller's `await
 * store.updateSetting(...)` resolved before the write even landed. Now
 * mirrors vaultStore.ts's persistFolders/persistFiles: rethrows on failure
 * so an awaiting caller (via commitSettingsState below) can see it.
 */
async function persistSnapshot(state: SettingsState): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(buildPersistSnapshot(state)));
  } catch (err) {
    console.error('Settings persist error:', err);
    throw err;
  }
}

type SettingsPatch = Partial<SettingsState>;
type SettingsSetFn = (updater: (state: SettingsState) => SettingsPatch) => void;

/**
 * Mirrors vaultStore.ts's commitVaultState: applies the in-memory `set()`
 * update immediately (UI stays responsive), then awaits the AsyncStorage
 * write against the merged post-update state, rethrowing on failure so the
 * caller's own try/catch can surface it rather than silently believing the
 * setting persisted. `get` is used (not the patch alone) because
 * persistSnapshot needs the *full* settings snapshot, not just the changed
 * keys — the persisted blob is one JSON object per plan item 6's design.
 */
const commitSettingsState = async (
  set: SettingsSetFn,
  get: () => SettingsState,
  updater: (state: SettingsState) => SettingsPatch
): Promise<SettingsPatch> => {
  let patch: SettingsPatch = {};
  set((state) => {
    patch = updater(state);
    return patch;
  });
  // An updater returning `{}` (e.g. createAccessKey's/createEncryptionKey's
  // duplicate-label/limit-reached validation rejections) made no actual
  // change to persist — skip the write. Without this, every rejected
  // create still did a full AsyncStorage write, and once persistSnapshot
  // started rethrowing (I-11 residual), a storage failure on that pointless
  // write turned a pure validation no-op into a thrown error the caller had
  // no reason to expect from a rejection path.
  if (Object.keys(patch).length === 0) return patch;
  await persistSnapshot(get());
  return patch;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  themeMode: 'dark',
  disguiseMode: 'default',
  viewMode: 'list',
  autoLockDuration: 60000,
  encryptionDefault: false,
  accentColor: '#0A84FF',
  fontSizeMultiplier: 1.0,
  displayScale: 1.0,
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

  // I-11 residual: persistSnapshot/commitSettingsState now throw on a real
  // AsyncStorage failure instead of silently logging. updateSetting has
  // ~15 fire-and-forget call sites across the app (theme toggles, view
  // mode, font size, disguise options, storage limit...) with no catch of
  // their own — rethrowing here would turn a rare storage hiccup into an
  // unhandled promise rejection at every one of them. commitSettingsState
  // applies the in-memory change before the throwing await, so the toggle
  // still works for this session either way; only surviving an app restart
  // is at risk on failure. Caught and logged here rather than plumbed
  // through every caller — same call vaultStore.ts's own
  // copyToClipboard/cutToClipboard/clearClipboard make for the same reason.
  updateSetting: async (key, val) => {
    try {
      await commitSettingsState(set, get, () => ({ [key]: val } as SettingsPatch));
    } catch (e) {
      console.error(`Failed to persist setting "${key}":`, e);
    }
  },

  // I-11 residual: commitSettingsState can now throw on a persist failure —
  // deliberately left uncaught here. AccessKeyRegistrationModal.tsx and
  // access-keys.tsx already wrap this call in their own try/catch
  // specifically anticipating this (see their own comments).
  createAccessKey: async (label, password, description) => {
    const normalizedLabel = label.trim();
    const id = SecureCrypto.generateUUID();

    let created: AccessKeyMetadata | null = null;
    await commitSettingsState(set, get, (state) => {
      if (state.accessKeys.length >= 20) {
        return {};
      }

      if (state.accessKeys.some(k => k.label.toLowerCase() === normalizedLabel.toLowerCase())) {
        return {};
      }

      const accessKey: AccessKeyMetadata = {
        id: id,
        label: normalizedLabel || 'Untitled Access Key',
        description: description?.trim(),
        password: password,
        fingerprint: SecureCrypto.fingerprint(password),
        createdAt: Date.now(),
      };
      created = accessKey;
      return { accessKeys: [...state.accessKeys, accessKey] };
    });

    // TS can't trace the reassignment inside commitSettingsState's callback
    // across the `await` above, so it narrows `created` no further than its
    // declared union type here — hence the cast (`created` is genuinely
    // AccessKeyMetadata | null at runtime; this doesn't change behavior).
    const createdKey = created as AccessKeyMetadata | null;
    if (createdKey) {
      SecureStore.setItemAsync(getSecureKeyPath(createdKey.id, ACCESS_KEY_PREFIX), password).catch(
        (err) => console.error('Access key secure storage error:', err)
      );
    }

    return created;
  },

  accessKeyExists: (label: string): boolean => {
    const normalizedLabel = label.trim().toLowerCase();
    return useSettingsStore.getState().accessKeys.some((k: AccessKeyMetadata) => k.label.toLowerCase() === normalizedLabel);
  },

  deleteAccessKey: async (accessKeyId) => {
    let inUse: boolean;
    try {
      const [filesRaw, foldersRaw] = await Promise.all([
        AsyncStorage.getItem('@vault_files'),
        AsyncStorage.getItem('@vault_folders'),
      ]);
      const files = filesRaw ? JSON.parse(filesRaw) : [];
      const folders = foldersRaw ? JSON.parse(foldersRaw) : [];
      inUse = files.some((file: any) => file.accessKeyId === accessKeyId) ||
        folders.some((folder: any) => folder.accessKeyId === accessKeyId);
    } catch (e) {
      console.error('Access key in-use check failed', e);
      return 'not-found';
    }

    if (inUse) return 'in-use';

    if (!get().accessKeys.some(k => k.id === accessKeyId)) return 'not-found';

    // I-11 residual follow-up: this used to share one outer try/catch with
    // the in-use check above, both returning 'not-found' on any failure.
    // That conflated "this key never existed" with "the key WAS just
    // removed from in-memory state (commitSettingsState's set() runs before
    // its throwing persist await) but failed to write to disk" — which told
    // the user a just-deleted key "no longer exists" instead of warning
    // them the deletion might not survive an app restart. Split into its
    // own try/catch with a distinct return value so the caller can tell
    // the two apart. Only called once we've already confirmed there's an
    // actual change to make, so a "not found"/"in-use" result never
    // triggers a wasted write.
    try {
      await commitSettingsState(set, get, (state) => ({
        accessKeys: state.accessKeys.filter(k => k.id !== accessKeyId),
      }));
    } catch (e) {
      console.error('Access key deletion failed to persist', e);
      return 'persist-failed';
    }

    SecureStore.deleteItemAsync(getSecureKeyPath(accessKeyId, ACCESS_KEY_PREFIX)).catch(
      (err) => console.error('Access key secure deletion error:', err)
    );

    return 'deleted';
  },

  // I-11 residual: commitSettingsState can now throw on a persist failure —
  // deliberately left uncaught. access-keys.tsx's handleEditConfirm already
  // wraps this call in its own try/catch for exactly this.
  updateAccessKey: async (accessKeyId, options) => {
    const state = get();
    const idx = state.accessKeys.findIndex(ak => ak.id === accessKeyId);
    if (idx === -1) return false;

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

    await commitSettingsState(set, get, () => ({ accessKeys }));

    SecureStore.setItemAsync(getSecureKeyPath(accessKey.id, ACCESS_KEY_PREFIX), updatedPassword).catch(
      (err) => console.error('Access key secure storage error:', err)
    );

    return true;
  },

  // I-11 residual: commitSettingsState can now throw on a persist failure —
  // deliberately left uncaught, matching createAccessKey's contract. This
  // store export currently has no live UI caller (grep-confirmed), same
  // disposition as vaultStore.ts's assignFileEncryptionKey from Phase A —
  // kept consistent with its sibling rather than special-cased.
  createEncryptionKey: async (name, customKey, description) => {
    const normalizedLabel = name.trim();
    const id = SecureCrypto.generateUUID();
    const key = await SecureCrypto.generateEncryptionKey(customKey);

    let created: EncryptionKeyMetadata | null = null;
    await commitSettingsState(set, get, (state) => {
      if (state.encryptionKeys.length >= 20) {
        return {};
      }

      if (state.encryptionKeys.some(k => k.name.toLowerCase() === normalizedLabel.toLowerCase())) {
        return {};
      }

      const encryptionKey: EncryptionKeyMetadata = {
        id: id,
        name: normalizedLabel || 'Untitled Key',
        description: description?.trim(),
        key: key,
        fingerprint: SecureCrypto.fingerprint(key),
        createdAt: Date.now(),
      };
      created = encryptionKey;
      return { encryptionKeys: [...state.encryptionKeys, encryptionKey] };
    });

    // Same TS-narrowing note as createAccessKey's identical cast above.
    const createdKey = created as EncryptionKeyMetadata | null;
    if (createdKey) {
      SecureStore.setItemAsync(getSecureKeyPath(createdKey.id, ENCRYPTION_KEY_PREFIX), key).catch(
        (err) => console.error('Encryption key secure storage error:', err)
      );
    }

    return created;
  },

  encryptionKeyExists: (name: string): boolean => {
    const normalizedLabel = name.trim().toLowerCase();
    return useSettingsStore.getState().encryptionKeys.some((k: EncryptionKeyMetadata) => k.name.toLowerCase() === normalizedLabel);
  },

  deleteEncryptionKey: async (encryptionKeyId) => {
    let inUse: boolean;
    try {
      const [filesRaw, foldersRaw] = await Promise.all([
        AsyncStorage.getItem('@vault_files'),
        AsyncStorage.getItem('@vault_folders'),
      ]);
      const files = filesRaw ? JSON.parse(filesRaw) : [];
      const folders = foldersRaw ? JSON.parse(foldersRaw) : [];
      inUse = files.some((file: any) => file.encryptionKeyId === encryptionKeyId) ||
        folders.some((folder: any) => folder.encryptionKeyId === encryptionKeyId);
    } catch (e) {
      console.error('Encryption key in-use check failed', e);
      return 'not-found';
    }

    if (inUse) return 'in-use';

    if (!get().encryptionKeys.some(k => k.id === encryptionKeyId)) return 'not-found';

    // Same rationale as deleteAccessKey's identical comment above.
    try {
      await commitSettingsState(set, get, (state) => ({
        encryptionKeys: state.encryptionKeys.filter(k => k.id !== encryptionKeyId),
      }));
    } catch (e) {
      console.error('Encryption key deletion failed to persist', e);
      return 'persist-failed';
    }

    SecureStore.deleteItemAsync(getSecureKeyPath(encryptionKeyId, ENCRYPTION_KEY_PREFIX)).catch(
      (err) => console.error('Encryption key secure deletion error:', err)
    );

    return 'deleted';
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
    // I-11 residual: commitSettingsState can now throw on a persist
    // failure — deliberately left uncaught here. backupService.ts's
    // restoreBackup call site keeps this call outside its
    // passphrase-decrypt try/catch specifically so a persist failure
    // surfaces via that function's own outer catch as an accurate "Restore
    // operation failed" instead of a misleading "wrong passphrase" prompt
    // (see that file's own comment on the call site).
    await commitSettingsState(set, get, () => ({ accessKeys, encryptionKeys }));
  },
  /**
   * Wipes decrypted secrets from memory while the app is backgrounded
   * (disguise mode). This blanks `key`/`password` in place rather than
   * deleting anything from SecureStore, so it must also flip `isHydrated`
   * back to false — otherwise `hydrateSettings()`'s early-return (`if
   * (state.isHydrated) return`) leaves every key permanently blank for the
   * rest of the app session. A blank key is falsy — since S-11's
   * remediation, `StorageService.encryptSandboxFile`/`decryptSandboxFile`
   * both throw rather than silently falling back to a reversible transform,
   * so any attempt to touch an encrypted file while the keys are wiped now
   * fails loudly (caught by the calling viewer/store action) instead of
   * reading back as "corrupted" garbage. `authenticate()` in authStore calls
   * `hydrateSettings()` again on unlock, which re-reads the real secrets
   * from SecureStore once this flag says they're needed.
   */
  lockTransientMemory: () => {
    set((state) => ({
      encryptionKeys: state.encryptionKeys.map(k => ({ ...k, key: '' })),
      accessKeys: state.accessKeys.map(k => ({ ...k, password: '' })),
      isHydrated: false,
    }));
  },
}));