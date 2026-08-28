// File: src/store/vaultStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { SecureCrypto } from '../security/crypto';
import { StorageService } from '../services/storage';
import { ClipboardItem, EncryptionKeyMetadata, FileMetadata, FolderMetadata, PasteResult, UndoInfo, VaultState } from '../types';
import { useSettingsStore } from './settingsStore';
import { Alert } from 'react-native';
import { MAX_NAME_LENGTH, clampNameLength } from '../constants/naming';

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
  restoreFileFromTrash: (fileId: string) => Promise<{ landedInFallbackFolder: boolean }>;
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
  copyToClipboard: (folderIds: string[], fileIds: string[], sourceFolderId: string | null) => void;
  cutToClipboard: (folderIds: string[], fileIds: string[], sourceFolderId: string | null) => void;
  pasteFromClipboard: (targetFolderId: string, onProgress?: (current: number, total: number) => void) => Promise<PasteResult>;
  clearClipboard: () => void;
  getFolderDescendants: (folderId: string) => FolderMetadata[];
  copyFileToFolder: (sourceFile: FileMetadata, targetFolderId: string, uniqueName?: (base: string) => string) => Promise<FileMetadata>;
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

const removeFilePayload = async (file: FileMetadata) => {
  if (!file.localPath) return;
  await StorageService.removeSandboxFile(file.localPath);
};

const getEncryptionKey = (keyId?: string) => {
  if (!keyId) return undefined;
  return useSettingsStore.getState().encryptionKeys.find((k: EncryptionKeyMetadata) => k.id === keyId);
};

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
  const usedBytes = currentFiles.reduce((sum, f) => sum + (f.size || 0), 0);
  // AES-256-CBC+HMAC output (src/security/crypto.ts) is base64 (~4/3 the raw
  // bytes) plus a small fixed IV/MAC overhead — pad the pre-encryption
  // estimate so the limit isn't quietly exceeded by ciphertext growth.
  const projectedBytes = encrypt ? Math.ceil(incomingBytes * 1.4) : incomingBytes;
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
    workingPath = await StorageService.decryptSandboxFile(file.localPath, oldKey?.key);
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
  getVaultUsageBytes: () => get().files.reduce((sum, f) => sum + (f.size || 0), 0),
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
    await commitVaultState(set, (state) => {
      const folders = state.folders.filter(f => f.id !== folderId);
      const files = state.files.map(f => f.folderId === folderId ? { ...f, isTrash: true, deletedAt: Date.now() } : f);
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
    // I-2: only mark a file as encrypted when encryption actually ran, not
    // merely because it was requested — previously `isEncrypted: encrypt`
    // was set unconditionally, so a resolution failure (missing key) left
    // a plaintext file wearing a false "encrypted" badge.
    let didEncrypt = false;

    if (encrypt && encryptionKeyId) {
      const encryptionKey = useSettingsStore.getState().encryptionKeys.find((k: EncryptionKeyMetadata) => k.id === encryptionKeyId)?.key;
      if (encryptionKey) {
        finalPath = await StorageService.encryptSandboxFile(remuxedPath, encryptionKey);
        didEncrypt = true;
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

      const files = state.files.map(f =>
        f.id === fileId ? { ...f, isTrash: false, deletedAt: undefined, folderId: targetFolderId } : f
      );

      return { folders, files };
    });

    return { landedInFallbackFolder: !!targetFile && !originalFolderExists };
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
    await commitVaultState(set, (state) => ({
      folders: state.folders.map(f => f.id === folderId ? { ...f, parentId: newParentId } : f)
    }));
  },
  renameFile: async (fileId, newName) => {
    const clampedName = clampNameLength(newName);
    await commitVaultState(set, (state) => ({
      files: state.files.map(f => f.id === fileId ? { ...f, name: clampedName } : f)
    }));
  },
  moveFileToFolder: async (fileId, targetFolderId) => {
    await commitVaultState(set, (state) => ({
      files: state.files.map(f => f.id === fileId ? { ...f, folderId: targetFolderId } : f)
    }));
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
      nextLocalPath = await encryptFileWithKey(currentFile, keyId);
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
        decryptedPath = await StorageService.decryptSandboxFile(currentFile.localPath, encryptionKey.key);
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
    }
  },

  copyToClipboard: (folderIds: string[], fileIds: string[], sourceFolderId: string | null) => {
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
    get().persistClipboard();
  },

  cutToClipboard: (folderIds: string[], fileIds: string[], sourceFolderId: string | null) => {
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
    get().persistClipboard();
  },

  clearClipboard: () => {
    set({ clipboard: null, undoInfo: null });
    get().persistClipboard();
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
        const newFiles: FileMetadata[] = [];

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
            const copiedFile = await get().copyFileToFolder(file, newId, uniqueName);
            newFiles.push(copiedFile);
          }

          return newId;
        };

        const topLevelFiles = srcFiles.filter(f => clipboard.fileIds.includes(f.id) && f.folderId === targetFolderId && !f.isTrash);
        const orphanFiles = srcFiles.filter(f => clipboard.fileIds.includes(f.id) && !clipboard.folderIds.includes(f.folderId) && f.folderId !== targetFolderId);

        for (const file of topLevelFiles) {
          const copied = await get().copyFileToFolder(file, targetFolderId, uniqueName);
          newFiles.push(copied);
          pastedFiles++;
          onProgress?.(pastedFiles + pastedFolders, clipboard.fileIds.length + clipboard.folderIds.length);
        }

        for (const file of orphanFiles) {
          const copied = await get().copyFileToFolder(file, targetFolderId, uniqueName);
          newFiles.push(copied);
          pastedFiles++;
          onProgress?.(pastedFiles + pastedFolders, clipboard.fileIds.length + clipboard.folderIds.length);
        }

        const topLevelFolders = srcFolders.filter(f => clipboard.folderIds.includes(f.id) && !clipboard.folderIds.includes(f.parentId || ''));

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
      console.error('Paste failed', e);
      Alert.alert('Paste Failed', 'An error occurred during paste. Please try again.');
    } finally {
      set({ pasteInProgress: false });
    }

    return { pastedFiles, pastedFolders };
  },

  copyFileToFolder: async (sourceFile: FileMetadata, targetFolderId: string, uniqueName?: (base: string) => string): Promise<FileMetadata> => {
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

    const newFile: FileMetadata = {
      ...sourceFile,
      id: newId,
      name: finalName,
      folderId: targetFolderId,
      localPath: newLocalPath ?? sourceFile.localPath ?? '',
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

    const copied = await get().copyFileToFolder(file, file.folderId, uniqueName);
    await commitVaultState(set, (state) => ({ files: [...state.files, copied] }));
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
        });
        newFiles.push(copiedFile);
      }

      return newId;
    };

    await createFolderCopy(folder, parentId);

    await commitVaultState(set, (state) => ({
      folders: [...state.folders, ...newFolders],
      files: [...state.files, ...newFiles],
    }));
  },
}));
