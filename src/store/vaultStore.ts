// File: src/store/vaultStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { SecureCrypto } from '../security/crypto';
import { StorageService } from '../services/storage';
import { extractApkIcon } from '../services/apkIconExtractor';
import { ClipboardItem, EncryptionKeyMetadata, FileMetadata, FolderMetadata, PasteResult, UndoInfo, VaultState } from '../types';
import { useSettingsStore } from './settingsStore';
import { Alert, Platform } from 'react-native';
import { MAX_NAME_LENGTH, clampNameLength } from '../constants/naming';
import { formatBytes } from '../constants/storageLimits';

/**
 * Thrown by importFile/copyFileToFolder when completing the operation would
 * push total vault usage past the user's configured storageLimitBytes
 * (settingsStore — see src/constants/storageLimits.ts). Callers can
 * `instanceof`-check this to show a specific "storage limit reached" message
 * instead of the generic import-failure alert.
 */
export class StorageLimitExceededError extends Error {
  constructor(
    public readonly limitBytes: number,
    public readonly usedBytes: number,
    public readonly incomingBytes: number
  ) {
    super(
      `Importing this would use ${usedBytes + incomingBytes} bytes, over the ${limitBytes} byte vault storage limit.`
    );
    this.name = 'StorageLimitExceededError';
  }
}

interface VaultStoreActions extends VaultState {
  hydrateVault: () => Promise<void>;
  isVaultHydrated: () => boolean;
  /**
   * Verifies each file's on-disk payload still exists and flags the ones
   * whose bytes are gone (`isMissing`), so the UI can show an honest "file
   * no longer on this device" state instead of a misleading load error. Runs
   * automatically after hydration; safe to call again (e.g. after a restore),
   * where it clears the flag on any file whose payload reappeared.
   */
  reconcileMissingPayloads: () => Promise<void>;
  /** Sum of every file's recorded size, trashed items included (their bytes still occupy the sandbox until permanently deleted/shredded). Used for both the Storage settings display and limit enforcement below. */
  getVaultUsageBytes: () => number;
  createFolder: (name: string, color?: string, icon?: string, isEncrypted?: boolean, parentId?: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  importFile: (sourceUri: string, targetFolderId: string, fileName: string, mimeType: string, size: number, encrypt: boolean, encryptionKeyId?: string) => Promise<void>;
  toggleFavorite: (fileId: string) => Promise<void>;
  toggleFolderFavorite: (folderId: string, markFavorite?: boolean) => Promise<void>;
  softDeleteFile: (fileId: string) => Promise<void>;
  restoreFileFromTrash: (fileId: string) => Promise<{ landedInFallbackFolder: boolean; folderId?: string; filePreservedAccessKey: boolean }>;
  permanentlyDeleteFile: (fileId: string) => Promise<void>;
  permanentlyDeleteFiles: (fileIds: string[]) => Promise<void>;
  clearEverythingState: () => void;
  renameFolder: (folderId: string, newName: string) => Promise<void>;
  moveFolder: (folderId: string, newParentId: string | undefined) => Promise<void>;
  renameFile: (fileId: string, newName: string) => Promise<void>;
  moveFileToFolder: (fileId: string, targetFolderId: string) => Promise<void>;
  exportFileToDevice: (fileId: string) => Promise<string | null>;
  exportFolderFiles: (folderId: string) => Promise<string[]>;
  // Clipboard actions
  copyToClipboard: (folderIds: string[], fileIds: string[], sourceFolderId: string | null) => Promise<void>;
  cutToClipboard: (folderIds: string[], fileIds: string[], sourceFolderId: string | null) => Promise<void>;
  pasteFromClipboard: (targetFolderId: string, onProgress?: (current: number, total: number) => void) => Promise<PasteResult>;
  clearClipboard: () => Promise<void>;
  getFolderDescendants: (folderId: string) => FolderMetadata[];
  copyFileToFolder: (sourceFile: FileMetadata, targetFolderId: string, uniqueName?: (base: string) => string, options?: { skipLimitCheck?: boolean }) => Promise<FileMetadata>;
  undoLastCut: () => Promise<void>;
  clearUndoInfo: () => void;
  persistClipboard: () => Promise<void>;
  duplicateFile: (fileId: string) => Promise<void>;
  duplicateFolder: (folderId: string) => Promise<void>;
  // Access Key methods
  assignFolderAccessKey: (folderId: string, passwordId: string) => Promise<void>;
  assignFileAccessKey: (fileId: string, passwordId: string) => Promise<void>;
  removeFolderAccessKey: (folderId: string) => Promise<void>;
  removeFileAccessKey: (fileId: string) => Promise<void>;
  // Legacy encryption methods (kept for backward compatibility)
  assignFolderEncryptionKey: (folderId: string, keyId: string) => Promise<void>;
  assignFileEncryptionKey: (fileId: string, keyId: string) => Promise<void>;
  removeFolderEncryptionKey: (folderId: string) => Promise<void>;
  removeFileEncryptionKey: (fileId: string) => Promise<void>;
  toggleFolderEncryption: (folderId: string) => Promise<void>;
  shredFolder: (folderId: string, onProgress?: (current: number, total: number) => void) => Promise<void>;
  shredFile: (fileId: string) => Promise<void>;
  shredMultipleFiles: (fileIds: string[], onProgress?: (current: number, total: number) => void) => Promise<void>;
  shredAllFilesInFolder: (folderId: string, onProgress?: (current: number, total: number) => void) => Promise<void>;
  shredMultipleFolders: (folderIds: string[]) => Promise<void>;
  createPersonalFavoritesFolder: (name: string) => Promise<void>;
  addToPersonalFavoritesFolder: (folderId: string) => Promise<void>;
}

const ASYNC_STORAGE_TIMEOUT = 5000;

const withAsyncStorageTimeout = async <T>(promise: Promise<T>): Promise<T | null> => {
  return Promise.race([
    promise,
    new Promise<T | null>((resolve) => setTimeout(() => resolve(null), ASYNC_STORAGE_TIMEOUT)),
  ]);
};

const processSequentially = async (items: string[], action: (id: string) => Promise<void>, onProgress?: (current: number, total: number) => void) => {
    for (let i = 0; i < items.length; i++) {
      onProgress?.(i + 1, items.length);
      await action(items[i]);
    }
  };

/**
 * Appends " (2)", " (3)", ... to `baseName` until it no longer collides with
 * `existingNames` — the same disambiguation copy/paste already applies via
 * its own inline uniqueName() closure, factored out here so moveFolder/
 * moveFileToFolder can apply it too instead of silently allowing two
 * identically-named siblings after a move.
 */
const dedupeName = (baseName: string, existingNames: Set<string>): string => {
  if (!existingNames.has(baseName)) return baseName;
  let counter = 2;
  let name = `${baseName} (${counter})`;
  while (existingNames.has(name)) {
    counter++;
    name = `${baseName} (${counter})`;
  }
  return name;
};

/** Same as dedupeName, but keeps a file's extension at the end — "photo (2).jpg", not "photo.jpg (2)". */
const dedupeFileName = (name: string, existingNames: Set<string>): string => {
  if (!existingNames.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const base = dot > 0 ? name.slice(0, dot) : name;
  let counter = 2;
  let candidate = `${base} (${counter})${ext}`;
  while (existingNames.has(candidate)) {
    counter++;
    candidate = `${base} (${counter})${ext}`;
  }
  return candidate;
};

const removeFilePayload = async (file: FileMetadata) => {
  if (file.iconPath) {
    await StorageService.removeSandboxFile(file.iconPath);
  }
  if (!file.localPath) return;
  await StorageService.removeSandboxFile(file.localPath);
};

const getEncryptionKey = (keyId?: string) => {
  if (!keyId) return undefined;
  return useSettingsStore.getState().encryptionKeys.find((k: EncryptionKeyMetadata) => k.id === keyId);
};

// AES-256-CBC+HMAC output (src/security/crypto.ts) is base64 (~4/3 the raw
// bytes) plus a small fixed IV/MAC overhead — pad the pre-encryption
// estimate so the limit isn't quietly exceeded by ciphertext growth.
const projectedFileBytes = (size: number, encrypt: boolean) => encrypt ? Math.ceil(size * 1.4) : size;

/**
 * Storage-limit accounting fix (found auditing item 2/I-22's own follow-up,
 * plans/what-are-the-next-jaunty-deer.md): `FileMetadata.size` is always the
 * original *pre-encryption* byte count — set once in importFile from the
 * picker's `asset.size`, never touched again by encryption or re-keying (see
 * encryptFileWithKey above). `projectedFileBytes` above pads for ciphertext
 * growth, but only when checking the *incoming* file — once that file is
 * committed, summing raw `f.size` for it going forward silently drops the
 * ~40% overhead back out of the running total. Every encrypted file that
 * lands permanently erodes the safety margin the padding exists to
 * provide, so a vault of encrypted files can end up meaningfully over its
 * configured limit in real disk bytes despite every individual check
 * passing. Fix: apply the same projection to already-committed files when
 * summing "used", not just to the one being checked — "used" and "about to
 * use" must be computed on the same basis or the padding is pointless.
 * Shared by assertWithinStorageLimit, assertBatchWithinStorageLimit, and
 * getVaultUsageBytes (the number shown against the limit in
 * settings/storage.tsx) — those three must never diverge, or the progress
 * bar shows headroom an import then gets rejected for lacking.
 */
const committedFileBytes = (f: FileMetadata) => projectedFileBytes(f.size || 0, !!f.isEncrypted);

/**
 * Storage-limit enforcement, shared by importFile (bringing external content
 * in) and copyFileToFolder (paste-copy / duplicate — the other way vault
 * usage grows). Throws StorageLimitExceededError instead of returning a
 * boolean so callers can't accidentally ignore it the way a false-y return
 * value invites.
 */
const assertWithinStorageLimit = (currentFiles: FileMetadata[], incomingBytes: number, encrypt: boolean) => {
  const limit = useSettingsStore.getState().storageLimitBytes;
  if (limit === null) return; // Unlimited.
  const usedBytes = currentFiles.reduce((sum, f) => sum + committedFileBytes(f), 0);
  const projectedBytes = projectedFileBytes(incomingBytes, encrypt);
  if (usedBytes + projectedBytes > limit) {
    throw new StorageLimitExceededError(limit, usedBytes, projectedBytes);
  }
};

/**
 * I-22 follow-up (plans/what-are-the-next-jaunty-deer.md item 2's own
 * post-implementation gap): duplicateFolder and pasteFromClipboard's
 * copy-mode both copy *multiple* files through copyFileToFolder but only
 * commitVaultState once, at the end of the whole batch. If each file's
 * limit check independently compares against `get().files`, none of them
 * sees the bytes the others in the same batch are about to add — a folder
 * of 10×200MB files against a 1GB limit passes every individual check
 * (each sees 0 committed usage) and lands at 2GB actual usage. Callers that
 * copy more than one file in one logical operation must sum the whole
 * batch's projected bytes and check it here, once, up front — then pass
 * `skipLimitCheck: true` to every copyFileToFolder call in that batch so
 * per-call checks (correct for the single-item case) don't redundantly
 * re-run against the stale pre-batch total.
 */
const assertBatchWithinStorageLimit = (currentFiles: FileMetadata[], incoming: { size: number; encrypted: boolean }[]) => {
  const limit = useSettingsStore.getState().storageLimitBytes;
  if (limit === null) return; // Unlimited.
  const usedBytes = currentFiles.reduce((sum, f) => sum + committedFileBytes(f), 0);
  const projectedBytes = incoming.reduce((sum, f) => sum + projectedFileBytes(f.size, f.encrypted), 0);
  if (usedBytes + projectedBytes > limit) {
    throw new StorageLimitExceededError(limit, usedBytes, projectedBytes);
  }
};

const encryptFileWithKey = async (file: FileMetadata, keyId: string) => {
  const encryptionKey = getEncryptionKey(keyId);
  if (!file.localPath || !encryptionKey) return file.localPath;

  let workingPath = file.localPath;
  if (file.isEncrypted && file.encryptionKeyId !== keyId) {
    const oldKey = getEncryptionKey(file.encryptionKeyId);
    // S-11: decryptSandboxFile now requires a real key rather than silently
    // falling back to a reversible transform — surface *why* re-keying
    // failed (deleted key, or keys transiently blanked by
    // settingsStore.lockTransientMemory()) instead of letting a generic
    // "encryptionKey is required" bubble up from inside StorageService.
    if (!oldKey?.key) {
      throw new Error(`Cannot re-key file ${file.id}: its current encryption key (${file.encryptionKeyId}) is unavailable`);
    }
    workingPath = await StorageService.decryptSandboxFile(file.localPath, oldKey.key);
  }

  const finalPath = file.isEncrypted && file.encryptionKeyId === keyId
    ? file.localPath
    : await StorageService.encryptSandboxFile(workingPath, encryptionKey.key);

  if (finalPath !== file.localPath) {
    await StorageService.removeSandboxFile(file.localPath);
  }

  return finalPath;
};

/**
 * I-11 remediation (plans/deposito-seguro-audit-report.md §11/§20): every
 * mutation used to fire `AsyncStorage.setItem(...).catch(console.error)`
 * without awaiting it, so `await store.someAction()` could resolve before
 * the write even landed — a write failure was silently swallowed and
 * in-memory state could desync from disk with zero indication to the
 * caller. `commitVaultState` applies the in-memory update immediately (so
 * the UI stays responsive) and then awaits the corresponding AsyncStorage
 * write(s), throwing if they fail so an awaiting caller's existing
 * try/catch (e.g. folder/[id].tsx's import flow) can surface a real error
 * instead of silently believing the mutation persisted.
 */
const persistFolders = async (folders: FolderMetadata[]): Promise<void> => {
  try {
    await AsyncStorage.setItem('@vault_folders', JSON.stringify(folders));
  } catch (e) {
    console.error('Failed to persist folders', e);
    throw e;
  }
};

const persistFiles = async (files: FileMetadata[]): Promise<void> => {
  try {
    await AsyncStorage.setItem('@vault_files', JSON.stringify(files));
  } catch (e) {
    console.error('Failed to persist files', e);
    throw e;
  }
};

type VaultPatch = { folders?: FolderMetadata[]; files?: FileMetadata[] };
type VaultSetFn = (updater: (state: VaultStoreActions) => VaultPatch) => void;

/**
 * Dedupes `base` against `existingNames` by appending " (2)", " (3)", ... —
 * while keeping the final name within MAX_NAME_LENGTH. The base is clamped
 * first so a maximally-long name still leaves room for the counter suffix.
 */
function uniqueClampedName(base: string, existingNames: Set<string>): string {
  const trimmedBase = clampNameLength(base);
  if (!existingNames.has(trimmedBase)) return trimmedBase;
  let counter = 2;
  let candidate: string;
  do {
    const suffix = ` (${counter})`;
    candidate = clampNameLength(trimmedBase.slice(0, MAX_NAME_LENGTH - suffix.length)) + suffix;
    counter++;
  } while (existingNames.has(candidate));
  return candidate;
}

const commitVaultState = async (set: VaultSetFn, updater: (state: VaultStoreActions) => VaultPatch): Promise<VaultPatch> => {
  let patch: VaultPatch = {};
  set((state) => {
    patch = updater(state);
    return patch;
  });
  const writes: Promise<void>[] = [];
  if (patch.folders) writes.push(persistFolders(patch.folders));
  if (patch.files) writes.push(persistFiles(patch.files));
  if (writes.length > 0) {
    await Promise.all(writes);
  }
  return patch;
};

export const useVaultStore = create<VaultStoreActions>((set, get) => ({
  folders: [],
  files: [],
  clipboard: null,
  undoInfo: null,
  pasteInProgress: false,
  _isVaultHydrated: false,
  _vaultHydrationError: null as string | null,
  isVaultHydrated: () => get()._isVaultHydrated,
  getVaultUsageBytes: () => get().files.reduce((sum, f) => sum + committedFileBytes(f), 0),
  hydrateVault: async () => {
    const state = get();
    if (state._isVaultHydrated) return;
    set({ _isVaultHydrated: false, _vaultHydrationError: null });
    try {
      await StorageService.initializeSystemDirectories();
      const foldersRaw = await withAsyncStorageTimeout(AsyncStorage.getItem('@vault_folders'));
      const filesRaw = await withAsyncStorageTimeout(AsyncStorage.getItem('@vault_files'));
      const clipboardRaw = await withAsyncStorageTimeout(AsyncStorage.getItem('@vault_clipboard'));
      set({
        folders: foldersRaw ? JSON.parse(foldersRaw) : [],
        files: filesRaw ? JSON.parse(filesRaw) : [],
        clipboard: clipboardRaw ? JSON.parse(clipboardRaw) : null,
        _isVaultHydrated: true,
        _vaultHydrationError: null,
      });
    } catch (e) {
      console.error('Vault store context compilation failure', e);
      set({ _isVaultHydrated: true, _vaultHydrationError: 'Vault hydration failed' });
    }
    // Fire-and-forget so startup isn't blocked on stat-ing every payload; the
    // UI updates once missing files are flagged.
    get().reconcileMissingPayloads().catch((e) => console.error('Payload reconciliation failed', e));
  },
  reconcileMissingPayloads: async () => {
    const files = get().files;
    if (files.length === 0) return;

    const checks = await Promise.all(
      files.map(async (f) => ({ id: f.id, exists: f.localPath ? await StorageService.fileExists(f.localPath) : false }))
    );
    const existsById = new Map(checks.map((c) => [c.id, c.exists]));

    // Only touch files we actually checked, and only persist if something
    // changed — avoids clobbering a concurrent mutation and needless writes.
    const changed = get().files.some((f) => existsById.has(f.id) && !!f.isMissing === existsById.get(f.id));
    if (!changed) return;

    await commitVaultState(set, (state) => ({
      files: state.files.map((f) => {
        if (!existsById.has(f.id)) return f;
        const missing = !existsById.get(f.id);
        return !!f.isMissing === missing ? f : { ...f, isMissing: missing };
      }),
    }));
  },
  createFolder: async (name, color, icon, isEncrypted, parentId) => {
    const folderName = clampNameLength(name?.trim() || 'New Folder');
    const { folders } = get();
    const existingNames = new Set(folders.map(f => f.name));
    const uniqueName = uniqueClampedName(folderName, existingNames);
    const newFolder: FolderMetadata = {
      id: SecureCrypto.generateUUID(),
      name: uniqueName,
      color,
      icon,
      isEncrypted,
      isFavorite: false,
      isPersonalFavoritesFolder: false,
      createdAt: Date.now(),
      parentId
    };
    await commitVaultState(set, (state) => ({ folders: [...state.folders, newFolder] }));
  },
  deleteFolder: async (folderId) => {
    // I-12: this is the only place folder metadata is ever discarded
    // (FolderMetadata has no isTrash/deletedAt of its own — folders are
    // removed outright, never trashed), so it's also the only place a file
    // can lose the protection it was inheriting purely from its parent
    // folder's access-key lock. assignFolderEncryptionKey/
    // removeFolderEncryptionKey already cascade real encryption onto every
    // child file's own isEncrypted/encryptionKeyId (I-9), so a file is never
    // relying on folder-only encryption — but assignFolderAccessKey/
    // removeFolderAccessKey (above) only ever touch the folder's own
    // fields. A file with no access key of its own is protected purely by
    // "must unlock this folder to browse into it", which deleting the
    // folder erases. Snapshot that gate onto the file's own hasAccessKey/
    // accessKeyId in the same update that trashes it, so it survives even
    // though the folder itself is gone by the time restoreFileFromTrash
    // runs — covers both orderings (file trashed earlier, folder deleted
    // now; or this cascade trashing the file for the first time).
    await commitVaultState(set, (state) => {
      const folder = state.folders.find(f => f.id === folderId);
      const folders = state.folders.filter(f => f.id !== folderId);

      // I-12 follow-up (found in re-verification, same disposition as the
      // I-22 batch-check gap above: a completion gap in an already-"done"
      // item, fixed in place rather than filed separately): the original
      // fix only checked the deleted folder's *own* hasAccessKey, not its
      // ancestor chain. assignFolderAccessKey never cascades onto child
      // folders, so a file with no key of its own, sitting in an unlocked
      // folder nested under a *locked* grandparent, was still only reachable
      // by unlocking that grandparent — deleting the unlocked immediate
      // parent (a completely ordinary action, independent of ever touching
      // the locked ancestor) erases that gate just as surely as deleting the
      // locked folder itself would, and the single-level check missed it.
      // Walk the chain and inherit the nearest lock found, if any.
      let inheritedAccessKeyId: string | undefined;
      let cursor = folder;
      const visited = new Set<string>();
      while (cursor && !visited.has(cursor.id)) {
        visited.add(cursor.id);
        if (cursor.hasAccessKey && cursor.accessKeyId) {
          inheritedAccessKeyId = cursor.accessKeyId;
          break;
        }
        cursor = cursor.parentId ? state.folders.find(f => f.id === cursor!.parentId) : undefined;
      }

      const files = state.files.map(f => {
        if (f.folderId !== folderId) return f;
        const inheritsAccessKey = !f.hasAccessKey && !f.accessKeyId && !!inheritedAccessKeyId;
        return {
          ...f,
          isTrash: true,
          deletedAt: Date.now(),
          ...(inheritsAccessKey ? { hasAccessKey: true, accessKeyId: inheritedAccessKeyId } : {}),
        };
      });
      return { folders, files };
    });
  },
  importFile: async (sourceUri, targetFolderId, fileName, mimeType, size, encrypt, encryptionKeyId) => {
    // Checked before any file I/O — no point copying bytes into the sandbox
    // just to have to delete them again on rejection.
    assertWithinStorageLimit(get().files, size, encrypt && !!encryptionKeyId);

    const targetId = SecureCrypto.generateUUID();
    const sandboxFilename = `${targetId}_${fileName}`;

    const internalPath = await StorageService.copyToSandbox(sourceUri, sandboxFilename);
    // Best-effort lossless remux (video files only, Android only — see
    // StorageService.remuxVideoIfPossible / src/utils/videoRemux.ts) so the
    // stored file always has a valid, seekable duration/index regardless of
    // what the original container declared. Must happen before encryption —
    // it's a real read of the plaintext bytes. No-ops (returns internalPath
    // unchanged) for non-video files, other platforms, or if the native
    // module isn't available/fails.
    const remuxedPath = await StorageService.remuxVideoIfPossible(internalPath, mimeType);
    let finalPath = remuxedPath;

    // Best-effort real app-icon extraction for .apk imports (see
    // src/services/apkIconExtractor.ts) — must run on the plaintext sandbox
    // copy before any encryption below, since it needs to unzip the actual
    // file bytes. Never blocks the import: a non-APK, a web build, or an
    // extraction failure all just leave iconPath undefined and the grid
    // falls back to the generic app glyph.
    let iconPath: string | undefined;
    const isApk = mimeType === 'application/vnd.android.package-archive' || fileName.toLowerCase().endsWith('.apk');
    if (isApk && Platform.OS !== 'web') {
      iconPath = (await extractApkIcon(remuxedPath, `${remuxedPath}.icon.png`)) ?? undefined;
    }
    // I-2: only mark a file as encrypted when encryption actually ran, not
    // merely because it was requested — previously `isEncrypted: encrypt`
    // was set unconditionally, so a resolution failure (missing key) left
    // a plaintext file wearing a false "encrypted" badge.
    let didEncrypt = false;
    let iconEncrypted = false;

    if (encrypt && encryptionKeyId) {
      const encryptionKey = useSettingsStore.getState().encryptionKeys.find((k: EncryptionKeyMetadata) => k.id === encryptionKeyId)?.key;
      if (encryptionKey) {
        finalPath = await StorageService.encryptSandboxFile(remuxedPath, encryptionKey);
        didEncrypt = true;

        // S-12: encrypt the extracted icon under the same key, so an
        // encrypted .apk doesn't leak its real launcher icon in plaintext.
        // encryptSandboxFile now throws without a key (S-11) rather than
        // silently falling back — only reachable here when `encryptionKey`
        // is confirmed present, matching didEncrypt's own success gate.
        // Best-effort: an icon-encrypt failure never fails the import
        // itself (mirrors extractApkIcon's own never-throws contract) —
        // worst case the icon just falls back to the generic app glyph
        // rather than blocking an otherwise-successful encrypted import.
        if (iconPath) {
          try {
            iconPath = await StorageService.encryptSandboxFile(iconPath, encryptionKey);
            iconEncrypted = true;
          } catch (err) {
            console.error('Failed to encrypt app icon cache, falling back to generic icon:', err);
            await StorageService.removeSandboxFile(iconPath);
            iconPath = undefined;
          }
        }
      }
    }

    const newFile: FileMetadata = {
      id: targetId,
      folderId: targetFolderId,
      // Display name only — sandboxFilename above keeps the untruncated
      // fileName so the extension isn't lost off the end of a long name.
      name: clampNameLength(fileName),
      size,
      mimeType,
      localPath: finalPath,
      iconPath,
      iconEncrypted,
      isEncrypted: didEncrypt,
      encryptionKeyId: didEncrypt ? encryptionKeyId : undefined,
      isFavorite: false,
      isTrash: false,
      importedAt: Date.now()
    };

    await commitVaultState(set, (state) => ({ files: [...state.files, newFile] }));
  },
  toggleFavorite: async (fileId) => {
    await commitVaultState(set, (state) => ({
      files: state.files.map(f => f.id === fileId ? { ...f, isFavorite: !f.isFavorite } : f)
    }));
  },
  toggleFolderFavorite: async (folderId, markFavorite?: boolean) => {
    await commitVaultState(set, (state) => ({
      folders: state.folders.map(f => f.id === folderId ? { ...f, isFavorite: markFavorite ?? !f.isFavorite } : f)
    }));
  },
  softDeleteFile: async (fileId) => {
    await commitVaultState(set, (state) => ({
      files: state.files.map(f => f.id === fileId ? { ...f, isTrash: true, deletedAt: Date.now() } : f)
    }));
  },
  restoreFileFromTrash: async (fileId) => {
    // I-12: report when the file's original folder no longer exists (it
    // lands in the auto-created, unprotected "Restored Files" folder
    // instead) so the caller can warn the user that whatever protection
    // the original folder had is not carried forward — that folder's
    // metadata is gone by this point, so there is nothing to actually
    // "carry forward" from; the honest fix is surfacing this, not
    // pretending it was preserved.
    const targetFile = get().files.find(f => f.id === fileId);
    const originalFolderExists = !!targetFile && get().folders.some(f => f.id === targetFile.folderId);
    // Set inside the commitVaultState updater below, whose closure runs
    // synchronously against the latest state — read back afterward so the
    // caller (e.g. trash.tsx's restore toast) knows exactly which folder
    // the file actually landed in, without duplicating this resolution.
    let resolvedFolderId: string | undefined;

    await commitVaultState(set, (state) => {
      const targetFile = state.files.find(f => f.id === fileId);
      if (!targetFile) return {};

      let targetFolderId = targetFile.folderId;
      let folders = state.folders;
      const folderExists = state.folders.some(f => f.id === targetFile.folderId);

      if (!folderExists) {
        let restoredFolder = state.folders.find(f => f.name === 'Restored Files');
        if (!restoredFolder) {
          restoredFolder = {
            id: SecureCrypto.generateUUID(),
            name: 'Restored Files',
            color: '#34C759',
            icon: 'folder',
            isEncrypted: false,
            isFavorite: false,
            isPersonalFavoritesFolder: false,
            createdAt: Date.now()
          };
          folders = [...state.folders, restoredFolder];
        }
        targetFolderId = restoredFolder.id;
      }

      resolvedFolderId = targetFolderId;

      const files = state.files.map(f =>
        f.id === fileId ? { ...f, isTrash: false, deletedAt: undefined, folderId: targetFolderId } : f
      );

      return { folders, files };
    });

    // I-12: hasAccessKey/accessKeyId are never cleared anywhere in this
    // function, so a lock snapshotted onto the file by deleteFolder's
    // cascade (or one the file always had of its own) rides through the
    // restore untouched — report it so the UI can say the file is still
    // protected instead of defaulting to "unprotected" just because it
    // landed in the unprotected fallback folder.
    const restoredFile = get().files.find(f => f.id === fileId);
    return {
      landedInFallbackFolder: !!targetFile && !originalFolderExists,
      folderId: resolvedFolderId,
      filePreservedAccessKey: !!(restoredFile?.hasAccessKey && restoredFile?.accessKeyId),
    };
  },
  permanentlyDeleteFile: async (fileId) => {
    const targetFile = get().files.find(f => f.id === fileId);
    if (targetFile) {
      await removeFilePayload(targetFile);
    }
    await commitVaultState(set, (state) => ({
      files: state.files.filter(f => f.id !== fileId)
    }));
  },
  permanentlyDeleteFiles: async (fileIds) => {
    const { files } = get();

    for (const fileId of fileIds) {
      const targetFile = files.find(f => f.id === fileId);
      if (targetFile) {
        await removeFilePayload(targetFile);
      }
    }

    await commitVaultState(set, (state) => ({
      files: state.files.filter(f => !fileIds.includes(f.id))
    }));
  },
  clearEverythingState: () => set({ folders: [], files: [] }),
  renameFolder: async (folderId, newName) => {
    const clampedName = clampNameLength(newName);
    await commitVaultState(set, (state) => ({
      folders: state.folders.map(f => f.id === folderId ? { ...f, name: clampedName } : f)
    }));
  },
  moveFolder: async (folderId, newParentId) => {
    await commitVaultState(set, (state) => {
      const folder = state.folders.find(f => f.id === folderId);
      if (!folder) return {};
      const siblingNames = new Set(
        state.folders.filter(f => f.parentId === newParentId && f.id !== folderId).map(f => f.name)
      );
      const name = dedupeName(folder.name, siblingNames);
      return {
        folders: state.folders.map(f => f.id === folderId ? { ...f, parentId: newParentId, name } : f)
      };
    });
  },
  renameFile: async (fileId, newName) => {
    const clampedName = clampNameLength(newName);
    await commitVaultState(set, (state) => ({
      files: state.files.map(f => f.id === fileId ? { ...f, name: clampedName } : f)
    }));
  },
  moveFileToFolder: async (fileId, targetFolderId) => {
    await commitVaultState(set, (state) => {
      const file = state.files.find(f => f.id === fileId);
      if (!file) return {};
      const siblingNames = new Set(
        state.files.filter(f => f.folderId === targetFolderId && f.id !== fileId && !f.isTrash).map(f => f.name)
      );
      const name = dedupeFileName(file.name, siblingNames);
      return {
        files: state.files.map(f => f.id === fileId ? { ...f, folderId: targetFolderId, name } : f)
      };
    });
  },
  exportFileToDevice: async (fileId) => {
    const file = get().files.find(f => f.id === fileId);
    if (!file) return null;

    try {
      let path = file.localPath;
      if (file.isEncrypted && file.encryptionKeyId) {
        const encryptionKey = useSettingsStore.getState().encryptionKeys.find((k: EncryptionKeyMetadata) => k.id === file.encryptionKeyId)?.key;
        if (encryptionKey) {
          path = await StorageService.decryptSandboxFile(file.localPath, encryptionKey);
        }
      }
      return path;
    } catch (e) {
      console.error('Export failed', e);
      return null;
    }
  },
  shredFile: async (fileId) => {
    const targetFile = get().files.find(f => f.id === fileId);
    if (targetFile) {
      await removeFilePayload(targetFile);
      await commitVaultState(set, (state) => ({
        files: state.files.filter(f => f.id !== fileId)
      }));
    }
  },
  shredMultipleFiles: async (fileIds, onProgress) => {
    const { files } = get();
    await processSequentially(fileIds, async (fileId) => {
      const targetFile = files.find(f => f.id === fileId);
      if (targetFile) {
        await removeFilePayload(targetFile);
        await commitVaultState(set, (state) => ({
          files: state.files.filter(f => f.id !== fileId)
        }));
      }
    }, onProgress);
  },
  shredAllFilesInFolder: async (folderId, onProgress) => {
    const { files } = get();
    const folderFiles = files.filter(f => f.folderId === folderId && !f.isTrash);
    await processSequentially(folderFiles.map(f => f.id), async (fileId) => {
      const targetFile = files.find(f => f.id === fileId);
      if (targetFile) {
        await removeFilePayload(targetFile);
        await commitVaultState(set, (state) => ({
          files: state.files.filter(f => f.id !== fileId)
        }));
      }
    }, onProgress);
  },
  shredFolder: async (folderId, onProgress) => {
    const { files } = get();
    const folderFiles = files.filter(f => f.folderId === folderId);

    await processSequentially(folderFiles.map(f => f.id), async (fileId) => {
      const targetFile = files.find(f => f.id === fileId);
      if (targetFile) {
        await removeFilePayload(targetFile);
      }
    }, onProgress);

    await commitVaultState(set, (state) => ({
      files: state.files.filter(f => f.folderId !== folderId),
      folders: state.folders.filter(f => f.id !== folderId),
    }));
  },
  exportFolderFiles: async (folderId) => {
    const { files } = get();
    const folderFiles = files.filter(f => f.folderId === folderId && !f.isTrash);
    const exportedPaths: string[] = [];

    for (const file of folderFiles) {
      try {
        let path = file.localPath;
        if (file.isEncrypted && file.encryptionKeyId) {
          const encryptionKey = useSettingsStore.getState().encryptionKeys.find((k: EncryptionKeyMetadata) => k.id === file.encryptionKeyId)?.key;
          if (encryptionKey) {
            path = await StorageService.decryptSandboxFile(file.localPath, encryptionKey);
          }
        }
        exportedPaths.push(path);
      } catch (e) {
        console.error('Export failed for file', file.id, e);
      }
    }
    return exportedPaths;
  },
  assignFolderAccessKey: async (folderId, passwordId) => {
    const passwordExists = useSettingsStore.getState().accessKeys.some((p) => p.id === passwordId);
    if (!passwordExists) return;

    await commitVaultState(set, (state) => ({
      folders: state.folders.map(f => f.id === folderId ? { ...f, hasAccessKey: true, accessKeyId: passwordId } : f)
    }));
  },
  assignFileAccessKey: async (fileId, passwordId) => {
    const passwordExists = useSettingsStore.getState().accessKeys.some((p) => p.id === passwordId);
    if (!passwordExists) return;

    await commitVaultState(set, (state) => ({
      files: state.files.map(f => f.id === fileId ? { ...f, hasAccessKey: true, accessKeyId: passwordId } : f)
    }));
  },
  removeFolderAccessKey: async (folderId) => {
    await commitVaultState(set, (state) => ({
      folders: state.folders.map(f => f.id === folderId ? { ...f, hasAccessKey: false, accessKeyId: undefined } : f)
    }));
  },
  removeFileAccessKey: async (fileId) => {
    await commitVaultState(set, (state) => ({
      files: state.files.map(f => f.id === fileId ? { ...f, hasAccessKey: false, accessKeyId: undefined } : f)
    }));
  },
  assignFolderEncryptionKey: async (folderId, keyId) => {
    const keyExists = useSettingsStore.getState().encryptionKeys.some((k: EncryptionKeyMetadata) => k.id === keyId);
    if (!keyExists) return;

    // I-9: previously this only flipped the folder's own metadata flags —
    // files already inside the folder kept whatever encryption state they
    // had, so a folder's 🔐 badge could misrepresent its contents. Cascade
    // real encryption to every non-trashed file in the folder, the same
    // way removeFolderEncryptionKey already cascades decryption.
    const { files } = get();
    const folderFiles = files.filter(f => f.folderId === folderId && !f.isTrash);
    const newPaths = new Map<string, string>();

    for (const file of folderFiles) {
      try {
        const nextPath = await encryptFileWithKey(file, keyId);
        if (nextPath) newPaths.set(file.id, nextPath);
      } catch (err) {
        console.error(`Failed to encrypt file ${file.id} while assigning folder encryption key:`, err);
      }
    }

    await commitVaultState(set, (state) => ({
      folders: state.folders.map(f => f.id === folderId ? { ...f, isEncrypted: true, encryptionKeyId: keyId } : f),
      files: state.files.map(f => {
        if (f.folderId !== folderId || f.isTrash) return f;
        const nextPath = newPaths.get(f.id);
        return { ...f, isEncrypted: true, encryptionKeyId: keyId, localPath: nextPath ?? f.localPath };
      }),
    }));
  },
  assignFileEncryptionKey: async (fileId, keyId) => {
    const keyExists = useSettingsStore.getState().encryptionKeys.some((k: EncryptionKeyMetadata) => k.id === keyId);
    if (!keyExists) return;

    const currentFile = get().files.find(f => f.id === fileId);
    let nextLocalPath = currentFile?.localPath;
    if (currentFile) {
      // S-11: encryptFileWithKey can now throw (missing/unavailable key on
      // re-key) instead of silently corrupting via the old reversal
      // fallback — mirror assignFolderEncryptionKey's per-file try/catch so
      // that failure surfaces as a logged error, not an unhandled rejection.
      try {
        nextLocalPath = await encryptFileWithKey(currentFile, keyId);
      } catch (err) {
        console.error(`Failed to assign encryption key to file ${fileId}:`, err);
        return;
      }
    }

    await commitVaultState(set, (state) => ({
      files: state.files.map(f => f.id === fileId ? { ...f, isEncrypted: true, encryptionKeyId: keyId, localPath: nextLocalPath ?? f.localPath } : f)
    }));
  },
  removeFolderEncryptionKey: async (folderId) => {
    const { files } = get();
    const folderFiles = files.filter(f => f.folderId === folderId && f.isEncrypted);
    const decryptedPaths: { fileId: string; decryptedPath: string }[] = [];

    for (const file of folderFiles) {
      const encryptionKey = getEncryptionKey(file.encryptionKeyId);
      if (encryptionKey?.key && file.localPath) {
        try {
          const decryptedPath = await StorageService.decryptSandboxFile(file.localPath, encryptionKey.key);
          decryptedPaths.push({ fileId: file.id, decryptedPath });
        } catch (err) {
          console.error(`Failed to decrypt file ${file.id} during folder encryption removal:`, err);
        }
      }
    }

    await commitVaultState(set, (state) => {
      const updatedFiles = state.files.map(f => {
        const decrypted = decryptedPaths.find(d => d.fileId === f.id);
        if (decrypted) {
          return { ...f, isEncrypted: false, encryptionKeyId: undefined, localPath: decrypted.decryptedPath };
        }
        if (f.folderId === folderId) {
          return { ...f, isEncrypted: false, encryptionKeyId: undefined };
        }
        return f;
      });
      const updatedFolders = state.folders.map(f =>
        f.id === folderId ? { ...f, isEncrypted: false, encryptionKeyId: undefined } : f
      );
      return { files: updatedFiles, folders: updatedFolders };
    });

    for (const { decryptedPath } of decryptedPaths) {
      await StorageService.removeSandboxFile(decryptedPath).catch(e => console.error(e));
    }
  },
  removeFileEncryptionKey: async (fileId) => {
    const currentFile = get().files.find(f => f.id === fileId);
    let decryptedPath = currentFile?.localPath;
    if (currentFile?.isEncrypted && currentFile.encryptionKeyId) {
      const encryptionKey = getEncryptionKey(currentFile.encryptionKeyId);
      if (encryptionKey?.key && currentFile.localPath) {
        // S-11 follow-up: decryptSandboxFile can throw for reasons besides a
        // missing key (e.g. an HMAC/integrity failure on a corrupted .enc
        // file) — mirror removeFolderEncryptionKey's per-file try/catch
        // above so that surfaces as a logged, aborted removal instead of an
        // unhandled rejection. No live UI caller today (this store action
        // has none), but it's exported on the public store interface, same
        // gap this diff's own S-11 pass closed at every other decrypt call
        // site.
        try {
          decryptedPath = await StorageService.decryptSandboxFile(currentFile.localPath, encryptionKey.key);
        } catch (err) {
          console.error(`Failed to decrypt file ${fileId} during file encryption removal:`, err);
          return;
        }
      }
    }

    await commitVaultState(set, (state) => ({
      files: state.files.map(f => f.id === fileId ? { ...f, isEncrypted: false, encryptionKeyId: undefined, localPath: decryptedPath ?? f.localPath } : f)
    }));
  },
  toggleFolderEncryption: async (folderId) => {
    // I-10: previously recomputed `isEncrypted` as `Boolean(encryptionKeyId)`
    // — a deterministic function of state that can't be "toggled", not an
    // actual flip. Now genuinely alternates the flag when a key is present
    // (and can't be turned on without one).
    await commitVaultState(set, (state) => ({
      folders: state.folders.map(f => {
        if (f.id !== folderId) return f;
        if (!f.encryptionKeyId) return { ...f, isEncrypted: false };
        return { ...f, isEncrypted: !f.isEncrypted };
      })
    }));
  },
  createPersonalFavoritesFolder: async (name) => {
    const folderName = clampNameLength(name?.trim() || 'New Folder');
    const { folders } = get();
    const existingNames = new Set(folders.map(f => f.name));
    const uniqueName = uniqueClampedName(folderName, existingNames);
    const newFolder: FolderMetadata = {
      id: SecureCrypto.generateUUID(),
      name: uniqueName,
      isEncrypted: false,
      isFavorite: true,
      isPersonalFavoritesFolder: true,
      createdAt: Date.now()
    };
    await commitVaultState(set, (state) => ({ folders: [...state.folders, newFolder] }));
  },
  addToPersonalFavoritesFolder: async (folderId) => {
    const pf = get().folders.find(f => f.isPersonalFavoritesFolder);
    if (!pf) return;
    await commitVaultState(set, (state) => ({
      folders: state.folders.map(f => f.id === folderId ? { ...f, parentId: pf.id, isFavorite: true } : f)
    }));
  },
  shredMultipleFolders: async (folderIds) => {
    const { files } = get();
    const filesToDelete = files.filter(f => folderIds.includes(f.folderId));

    for (const file of filesToDelete) {
      await removeFilePayload(file);
    }

    await commitVaultState(set, (state) => ({
      folders: state.folders.filter(f => !folderIds.includes(f.id)),
      files: state.files.filter(f => !folderIds.includes(f.folderId)),
    }));
  },

  getFolderDescendants: (folderId: string): FolderMetadata[] => {
    const descendants: FolderMetadata[] = [];
    const folders = get().folders;
    const queue = [folderId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = folders.filter(f => f.parentId === currentId);
      descendants.push(...children);
      queue.push(...children.map(c => c.id));
    }
    return descendants;
  },

  // I-11 residual: this used to swallow every failure internally, so
  // `await persistClipboard()` always resolved even when the write failed —
  // in-memory `clipboard` state could silently desync from what's on disk.
  // Rethrows now, mirroring persistFolders/persistFiles above; its three
  // callers below own the catch (see their own comments for why the catch
  // lives there and not further up at the ~10+ UI call sites that invoke
  // them fire-and-forget).
  persistClipboard: async () => {
    const clipboard = get().clipboard;
    try {
      if (clipboard) {
        await AsyncStorage.setItem('@vault_clipboard', JSON.stringify(clipboard));
      } else {
        await AsyncStorage.removeItem('@vault_clipboard');
      }
    } catch (e) {
      console.error('Failed to persist clipboard', e);
      throw e;
    }
  },

  copyToClipboard: async (folderIds: string[], fileIds: string[], sourceFolderId: string | null) => {
    const allFolderIds = new Set<string>(folderIds);
    const allFileIds = new Set<string>(fileIds);
    const folders = get().folders;
    const files = get().files;

    for (const folderId of folderIds) {
      const descendants = get().getFolderDescendants(folderId);
      descendants.forEach(d => allFolderIds.add(d.id));
      descendants.forEach(d => {
        const folderFiles = files.filter(f => f.folderId === d.id && !f.isTrash);
        folderFiles.forEach(f => allFileIds.add(f.id));
      });
    }

    const clipboard: ClipboardItem = {
      mode: 'copy',
      sourceFolderId,
      folderIds: Array.from(allFolderIds),
      fileIds: Array.from(allFileIds),
    };

    set({ clipboard });
    // I-11 residual: persistClipboard now throws instead of swallowing —
    // caught right here rather than propagated to this function's ~10+
    // fire-and-forget UI call sites (search/favorites/dashboard/folder
    // .tsx's context-menu and toolbar copy/cut actions call this
    // synchronously, no await, no .catch of their own). In-memory
    // `clipboard` state above is already set and paste already works for
    // the rest of this session regardless — the only thing a failed write
    // here costs is the clipboard not surviving an app kill, which doesn't
    // justify plumbing a rethrow through every caller. Logged clearly so
    // it's not silent, just not user-facing for this low-stakes a failure.
    try {
      await get().persistClipboard();
    } catch (e) {
      console.error('Failed to persist clipboard after copy (clipboard will not survive an app restart):', e);
    }
  },

  cutToClipboard: async (folderIds: string[], fileIds: string[], sourceFolderId: string | null) => {
    const allFolderIds = new Set<string>(folderIds);
    const allFileIds = new Set<string>(fileIds);

    for (const folderId of folderIds) {
      const descendants = get().getFolderDescendants(folderId);
      descendants.forEach(d => allFolderIds.add(d.id));
      descendants.forEach(d => {
        const folderFiles = get().files.filter(f => f.folderId === d.id && !f.isTrash);
        folderFiles.forEach(f => allFileIds.add(f.id));
      });
    }

    const clipboard: ClipboardItem = {
      mode: 'cut',
      sourceFolderId,
      folderIds: Array.from(allFolderIds),
      fileIds: Array.from(allFileIds),
    };

    set({ clipboard });
    // Same rationale as copyToClipboard's identical catch just above.
    try {
      await get().persistClipboard();
    } catch (e) {
      console.error('Failed to persist clipboard after cut (clipboard will not survive an app restart):', e);
    }
  },

  clearClipboard: async () => {
    set({ clipboard: null, undoInfo: null });
    // Same rationale as copyToClipboard's identical catch above.
    try {
      await get().persistClipboard();
    } catch (e) {
      console.error('Failed to persist clipboard-clear (a stale clipboard entry may reappear after an app restart):', e);
    }
  },

  undoLastCut: async () => {
    const { undoInfo } = get();
    if (!undoInfo) return;

    await commitVaultState(set, (state) => {
      const restoredFolders = state.folders.map(f => {
        const undoFolder = undoInfo.folders.find(u => u.id === f.id);
        if (undoFolder) {
          return { ...f, parentId: undoFolder.parentId };
        }
        return f;
      });

      const restoredFiles = state.files.map(f => {
        const undoFile = undoInfo.files.find(u => u.id === f.id);
        if (undoFile) {
          return { ...f, folderId: undoFile.folderId };
        }
        return f;
      });

      return { folders: restoredFolders, files: restoredFiles };
    });
    set({ undoInfo: null });

    get().clearClipboard();
  },

  clearUndoInfo: () => set({ undoInfo: null }),

  pasteFromClipboard: async (targetFolderId: string, onProgress?: (current: number, total: number) => void): Promise<PasteResult> => {
    const clipboard = get().clipboard;
    if (!clipboard) return { pastedFiles: 0, pastedFolders: 0 };

    if (get().pasteInProgress) return { pastedFiles: 0, pastedFolders: 0 };
    set({ pasteInProgress: true });

    let pastedFiles = 0;
    let pastedFolders = 0;
    // I-22 follow-up: hoisted out of the copy-mode branch below so the
    // outer catch can clean up any physical copies already made before a
    // later file in the same batch failed (see the cleanup comment in the
    // catch block). Stays empty, and the cleanup a no-op, for cut mode.
    const newFiles: FileMetadata[] = [];

    try {
      const targetFolder = get().folders.find(f => f.id === targetFolderId);
      if (!targetFolder) {
        Alert.alert('Error', 'Target folder not found.');
        return { pastedFiles: 0, pastedFolders: 0 };
      }

      const { folders: srcFolders, files: srcFiles } = get();

      // Check for circular references in cut mode
      if (clipboard.mode === 'cut') {
        for (const folderId of clipboard.folderIds) {
          const descendants = get().getFolderDescendants(folderId);
          if (descendants.some(d => d.id === targetFolderId)) {
            Alert.alert('Invalid Move', 'Cannot move a folder into its own subfolder.');
            set({ pasteInProgress: false });
            return { pastedFiles: 0, pastedFolders: 0 };
          }
        }
      }

      const existingNames = new Set(
        get().folders
          .filter(f => f.parentId === targetFolderId)
          .map(f => f.name)
      );

      const uniqueName = (baseName: string): string => {
        let name = baseName;
        let counter = 2;
        while (existingNames.has(name)) {
          name = `${baseName} (${counter})`;
          counter++;
        }
        existingNames.add(name);
        return name;
      };

      if (clipboard.mode === 'copy') {
        const folderIdToNewId = new Map<string, string>();
        const newFolders: FolderMetadata[] = [];

        // I-22 follow-up: recurses the same clipboard.folderIds/fileIds
        // filters createFolderCopy below applies, purely to enumerate (not
        // copy) every file this paste will touch, so the whole batch can be
        // validated in one assertBatchWithinStorageLimit call before any
        // byte is copied. See that function's doc comment for why a
        // per-file check here would miss the batch's own running total.
        const collectPasteFiles = (sourceFolder: FolderMetadata): FileMetadata[] => {
          const subfolders = srcFolders.filter(f => f.parentId === sourceFolder.id && clipboard.folderIds.includes(f.id));
          const nested = subfolders.flatMap(collectPasteFiles);
          const folderFiles = srcFiles.filter(f => f.folderId === sourceFolder.id && !f.isTrash && clipboard.fileIds.includes(f.id));
          return [...nested, ...folderFiles];
        };

        const createFolderCopy = async (sourceFolder: FolderMetadata, parentId: string | undefined): Promise<string> => {
          const newId = SecureCrypto.generateUUID();
          folderIdToNewId.set(sourceFolder.id, newId);

          const newFolder: FolderMetadata = {
            ...sourceFolder,
            id: newId,
            name: uniqueName(sourceFolder.name),
            parentId,
            createdAt: Date.now(),
          };

          newFolders.push(newFolder);

          const subfolders = srcFolders.filter(f => f.parentId === sourceFolder.id && clipboard.folderIds.includes(f.id));
          for (const sub of subfolders) {
            await createFolderCopy(sub, newId);
          }

          const folderFiles = srcFiles.filter(f => f.folderId === sourceFolder.id && !f.isTrash && clipboard.fileIds.includes(f.id));
          for (const file of folderFiles) {
            // skipLimitCheck: whole batch validated up front below.
            const copiedFile = await get().copyFileToFolder(file, newId, uniqueName, { skipLimitCheck: true });
            newFiles.push(copiedFile);
          }

          return newId;
        };

        const topLevelFiles = srcFiles.filter(f => clipboard.fileIds.includes(f.id) && f.folderId === targetFolderId && !f.isTrash);
        const orphanFiles = srcFiles.filter(f => clipboard.fileIds.includes(f.id) && !clipboard.folderIds.includes(f.folderId) && f.folderId !== targetFolderId);
        const topLevelFolders = srcFolders.filter(f => clipboard.folderIds.includes(f.id) && !clipboard.folderIds.includes(f.parentId || ''));

        // I-22 follow-up: single batch check covering every file this paste
        // will copy — top-level files, orphaned files, and every file
        // nested under the folders being pasted — before any copy starts.
        const filesToCopy = [...topLevelFiles, ...orphanFiles, ...topLevelFolders.flatMap(collectPasteFiles)];
        assertBatchWithinStorageLimit(get().files, filesToCopy.map(f => ({ size: f.size, encrypted: !!f.isEncrypted })));

        for (const file of topLevelFiles) {
          const copied = await get().copyFileToFolder(file, targetFolderId, uniqueName, { skipLimitCheck: true });
          newFiles.push(copied);
          pastedFiles++;
          onProgress?.(pastedFiles + pastedFolders, clipboard.fileIds.length + clipboard.folderIds.length);
        }

        for (const file of orphanFiles) {
          const copied = await get().copyFileToFolder(file, targetFolderId, uniqueName, { skipLimitCheck: true });
          newFiles.push(copied);
          pastedFiles++;
          onProgress?.(pastedFiles + pastedFolders, clipboard.fileIds.length + clipboard.folderIds.length);
        }

        for (const folder of topLevelFolders) {
          await createFolderCopy(folder, targetFolderId);
          pastedFolders++;
          onProgress?.(pastedFiles + pastedFolders, clipboard.fileIds.length + clipboard.folderIds.length);
        }

        // Batch write to storage
        await commitVaultState(set, (state) => ({
          folders: [...state.folders, ...newFolders],
          files: [...state.files, ...newFiles],
        }));

      } else if (clipboard.mode === 'cut') {
        const undoFolders = clipboard.folderIds.map(id => {
          const f = srcFolders.find(f => f.id === id);
          return { id, parentId: f?.parentId };
        }).filter((f): f is { id: string; parentId: string | undefined } => !!f);

        const undoFiles = clipboard.fileIds.map(id => {
          const f = srcFiles.find(f => f.id === id);
          return { id, folderId: f?.folderId };
        }).filter((f): f is { id: string; folderId: string } => !!f);

        for (const fileId of clipboard.fileIds) {
          await get().moveFileToFolder(fileId, targetFolderId);
          pastedFiles++;
          onProgress?.(pastedFiles + pastedFolders, clipboard.fileIds.length + clipboard.folderIds.length);
        }

        for (const folderId of clipboard.folderIds) {
          await get().moveFolder(folderId, targetFolderId);
          pastedFolders++;
          onProgress?.(pastedFiles + pastedFolders, clipboard.fileIds.length + clipboard.folderIds.length);
        }

        set({ undoInfo: { folders: undoFolders, files: undoFiles } });
        get().clearClipboard();
      }
    } catch (e) {
      // I-22 follow-up: copy-mode's commitVaultState never ran (it's the
      // last line of that branch), so any file already physically copied
      // to disk earlier in this batch before a later one failed is
      // orphaned — real bytes on disk, no metadata entry. newFiles is
      // hoisted to the outer scope above specifically so this can reach
      // it; it's empty (a no-op) when the failure happened during cut mode.
      await Promise.all(newFiles.map(f => removeFilePayload(f).catch(() => {})));

      // I-22: copyFileToFolder (paste-copy's underlying call, above) can now
      // throw StorageLimitExceededError — give it the same specific message
      // duplicateFile/duplicateFolder and the import flow (folder/[id].tsx)
      // show, instead of folding it into the generic paste-failure alert.
      if (e instanceof StorageLimitExceededError) {
        Alert.alert(
          'Storage Limit Reached',
          `This vault is capped at ${formatBytes(e.limitBytes)}. It's currently using ${formatBytes(e.usedBytes)}, and pasting this needs ${formatBytes(e.incomingBytes)} more. Raise the limit in Settings → Storage, or free up space first.`
        );
      } else {
        console.error('Paste failed', e);
        Alert.alert('Paste Failed', 'An error occurred during paste. Please try again.');
      }
    } finally {
      set({ pasteInProgress: false });
    }

    return { pastedFiles, pastedFolders };
  },

  copyFileToFolder: async (sourceFile: FileMetadata, targetFolderId: string, uniqueName?: (base: string) => string, options?: { skipLimitCheck?: boolean }): Promise<FileMetadata> => {
    // I-22: this is the single choke point for paste-copy and duplicateFile
    // (the "other way vault usage grows" per this file's own doc comment on
    // assertWithinStorageLimit above) — previously only importFile enforced
    // the limit, so copy/paste/duplicate could exceed it indefinitely.
    // Checked before any byte copy, same as importFile.
    //
    // skipLimitCheck: multi-file batch callers (duplicateFolder,
    // pasteFromClipboard's copy mode) already ran assertBatchWithinStorageLimit
    // once for the whole batch before starting — re-running this per-call
    // check here would compare against the stale pre-batch `get().files`
    // total and miss what the batch's own earlier copies are about to add.
    if (!options?.skipLimitCheck) {
      assertWithinStorageLimit(get().files, sourceFile.size, !!sourceFile.isEncrypted);
    }

    const newId = SecureCrypto.generateUUID();
    const ext = sourceFile.localPath?.includes('.') ? sourceFile.localPath.slice(sourceFile.localPath.lastIndexOf('.')) : '';
    const baseName = sourceFile.name.replace(ext, '');
    const finalName = uniqueName ? uniqueName(baseName) + ext : sourceFile.name;
    const newLocalPath = sourceFile.localPath
      ? `${sourceFile.localPath.replace(ext, '')}_copy_${newId}${ext}`
      : undefined;

    if (sourceFile.localPath) {
      try {
        await StorageService.copySandboxFile(sourceFile.localPath, newLocalPath || sourceFile.localPath);
      } catch (e) {
        console.error('Failed to copy sandbox file', e);
      }
    }

    // The extracted app icon (see apkIconExtractor) must get its own copy
    // too, not just a shared reference to sourceFile.iconPath — otherwise
    // permanently deleting either the original or this copy (removeFilePayload
    // deletes file.iconPath unconditionally) would leave the other's icon
    // file missing.
    let newIconPath: string | undefined;
    if (sourceFile.iconPath) {
      // S-12: when the icon is encrypted, iconPath ends in `.enc` — the
      // suffix must land at the *end* of the copy's path too (not have
      // `_copy_<id>` appended after it), or decryptSandboxFile's suffix-
      // anchored `.enc` check (storage.ts) won't recognize this copy as
      // encrypted and will decrypt it back onto itself, corrupting it.
      // Mirrors newLocalPath's own ext-preserving naming just above.
      const iconExt = sourceFile.iconPath.includes('.') ? sourceFile.iconPath.slice(sourceFile.iconPath.lastIndexOf('.')) : '';
      newIconPath = iconExt
        ? `${sourceFile.iconPath.slice(0, -iconExt.length)}_copy_${newId}${iconExt}`
        : `${sourceFile.iconPath}_copy_${newId}`;
      try {
        await StorageService.copySandboxFile(sourceFile.iconPath, newIconPath);
      } catch (e) {
        console.error('Failed to copy app icon file', e);
        newIconPath = undefined;
      }
    }

    const newFile: FileMetadata = {
      ...sourceFile,
      id: newId,
      name: finalName,
      folderId: targetFolderId,
      localPath: newLocalPath ?? sourceFile.localPath ?? '',
      iconPath: newIconPath,
      // Keep this consistent with iconPath: if the icon copy failed above,
      // don't leave a stale iconEncrypted:true dangling on an undefined path.
      iconEncrypted: newIconPath ? sourceFile.iconEncrypted : false,
      isTrash: false,
      deletedAt: undefined,
      importedAt: Date.now(),
    };

    return newFile;
  },

  duplicateFile: async (fileId: string) => {
    const file = get().files.find(f => f.id === fileId);
    if (!file) return;

    const existingNames = new Set(
      get().files.filter(f => f.folderId === file.folderId && !f.isTrash).map(f => f.name)
    );

    const uniqueName = (baseName: string): string => {
      const ext = baseName.includes('.') ? baseName.slice(baseName.lastIndexOf('.')) : '';
      const nameWithoutExt = baseName.replace(ext, '');
      let name = baseName;
      let counter = 2;
      while (existingNames.has(name)) {
        name = `${nameWithoutExt} (${counter})${ext}`;
        counter++;
      }
      existingNames.add(name);
      return name;
    };

    // I-22: copyFileToFolder can now throw StorageLimitExceededError (and
    // duplicateFile is called fire-and-forget from every UI call site, with
    // no try/catch of its own — dashboard.tsx/favorites.tsx/folder/[id].tsx/
    // search.tsx all do `duplicateFile(file.id)` without awaiting) — an
    // uncaught rejection here would be a straight regression (same lesson
    // as item 6/I-11: a newly-thrown error needs a catch at every call site
    // it can now reach, not just at the throw site).
    try {
      const copied = await get().copyFileToFolder(file, file.folderId, uniqueName);
      await commitVaultState(set, (state) => ({ files: [...state.files, copied] }));
    } catch (e) {
      if (e instanceof StorageLimitExceededError) {
        Alert.alert(
          'Storage Limit Reached',
          `This vault is capped at ${formatBytes(e.limitBytes)}. It's currently using ${formatBytes(e.usedBytes)}, and duplicating this file needs ${formatBytes(e.incomingBytes)} more. Raise the limit in Settings → Storage, or free up space first.`
        );
        return;
      }
      console.error('Failed to duplicate file:', e);
      Alert.alert('Duplicate Failed', 'Could not duplicate this file. Please try again.');
    }
  },

  duplicateFolder: async (folderId: string) => {
    const folder = get().folders.find(f => f.id === folderId);
    if (!folder) return;

    const parentId = folder.parentId;
    const existingNames = new Set(
      get().folders.filter(f => f.parentId === parentId).map(f => f.name)
    );

    const uniqueName = (baseName: string): string => {
      let name = baseName;
      let counter = 2;
      while (existingNames.has(name)) {
        name = `${baseName} (${counter})`;
        counter++;
      }
      existingNames.add(name);
      return name;
    };

    const folderIdToNewId = new Map<string, string>();
    const newFolders: FolderMetadata[] = [];
    const newFiles: FileMetadata[] = [];

    const { folders: srcFolders, files: srcFiles } = get();

    const createFolderCopy = async (sourceFolder: FolderMetadata, newParentId: string | undefined): Promise<string> => {
      const newId = SecureCrypto.generateUUID();
      folderIdToNewId.set(sourceFolder.id, newId);

      const newFolder: FolderMetadata = {
        ...sourceFolder,
        id: newId,
        name: uniqueName(sourceFolder.name),
        parentId: newParentId,
        createdAt: Date.now(),
      };

      newFolders.push(newFolder);

      const subfolders = srcFolders.filter(f => f.parentId === sourceFolder.id);
      for (const sub of subfolders) {
        await createFolderCopy(sub, newId);
      }

      const folderFiles = srcFiles.filter(f => f.folderId === sourceFolder.id && !f.isTrash);
      for (const file of folderFiles) {
        // skipLimitCheck: the whole subtree's bytes are validated as one
        // batch below, before this recursion starts — see assertBatchWithinStorageLimit's
        // own doc comment for why a per-file check here would be wrong.
        const copiedFile = await get().copyFileToFolder(file, newId, (base) => {
          const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
          const nameWithoutExt = base.replace(ext, '');
          let name = base;
          let counter = 2;
          const siblingNames = new Set(
            srcFiles.filter(f => f.folderId === newId && !f.isTrash).map(f => f.name)
          );
          while (siblingNames.has(name)) {
            name = `${nameWithoutExt} (${counter})${ext}`;
            counter++;
          }
          return name;
        }, { skipLimitCheck: true });
        newFiles.push(copiedFile);
      }

      return newId;
    };

    // I-22 follow-up: validate the *entire* subtree's projected bytes in one
    // batch check before copying a single byte, rather than letting each
    // file check itself against the pre-batch committed total (see
    // assertBatchWithinStorageLimit's doc comment above for why the
    // per-file version misses a multi-file batch's own running total).
    const filesToCopy: FileMetadata[] = [];
    const collectFilesToCopy = (sourceFolder: FolderMetadata) => {
      srcFolders.filter(f => f.parentId === sourceFolder.id).forEach(collectFilesToCopy);
      filesToCopy.push(...srcFiles.filter(f => f.folderId === sourceFolder.id && !f.isTrash));
    };
    collectFilesToCopy(folder);

    // Same rationale as duplicateFile just above: createFolderCopy calls
    // copyFileToFolder per file, which can now throw StorageLimitExceededError,
    // and duplicateFolder is likewise called fire-and-forget from every UI
    // call site (dashboard.tsx/favorites.tsx/folder/[id].tsx/search.tsx).
    try {
      assertBatchWithinStorageLimit(get().files, filesToCopy.map(f => ({ size: f.size, encrypted: !!f.isEncrypted })));

      await createFolderCopy(folder, parentId);

      await commitVaultState(set, (state) => ({
        folders: [...state.folders, ...newFolders],
        files: [...state.files, ...newFiles],
      }));
    } catch (e) {
      // I-22 follow-up: createFolderCopy only ever pushes copied entries
      // into newFiles/newFolders — commitVaultState above is what actually
      // lands them in the store, and it never runs on this path. Without
      // this cleanup, any file already physically copied to disk before a
      // later file in the same batch tripped the limit (or copySandboxFile
      // itself threw) would be orphaned: real bytes on disk, no metadata
      // entry pointing at them, no future sweep to catch them (item 9's
      // boot sweep only targets decrypt-to-temp files, not this).
      await Promise.all(newFiles.map(f => removeFilePayload(f).catch(() => {})));

      if (e instanceof StorageLimitExceededError) {
        Alert.alert(
          'Storage Limit Reached',
          `This vault is capped at ${formatBytes(e.limitBytes)}. It's currently using ${formatBytes(e.usedBytes)}, and duplicating this folder needs ${formatBytes(e.incomingBytes)} more. Raise the limit in Settings → Storage, or free up space first.`
        );
        return;
      }
      console.error('Failed to duplicate folder:', e);
      Alert.alert('Duplicate Failed', 'Could not duplicate this folder. Please try again.');
    }
  },
}));
