// File: src/store/vaultStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { SecureCrypto } from '../security/crypto';
import { StorageService } from '../services/storage';
import { extractApkIcon } from '../services/apkIconExtractor';
import { extractImageThumbnail, extractVideoThumbnail } from '../services/mediaThumbnailExtractor';
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

/**
 * Thrown by importFile/copyFileToFolder when the target folder is an album
 * (FolderMetadata.type === 'album') and the incoming file isn't a photo or
 * video — albums are media-only. Callers catch this the same way they
 * already catch StorageLimitExceededError above.
 */
export class AlbumMediaOnlyError extends Error {
  constructor(
    public readonly fileName: string,
    public readonly mimeType: string
  ) {
    super(`"${fileName}" can't be added to an album — only photos and videos are allowed.`);
    this.name = 'AlbumMediaOnlyError';
  }
}

interface VaultStoreActions extends VaultState {
  hydrateVault: () => Promise<void>;
  replaceVaultStateFromRestore: (folders: FolderMetadata[], files: FileMetadata[]) => void;
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
  createFolder: (name: string, color?: string, icon?: string, isEncrypted?: boolean, parentId?: string, type?: 'folder' | 'album') => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  importFile: (sourceUri: string, targetFolderId: string, fileName: string, mimeType: string, size: number, encrypt: boolean, encryptionKeyId?: string) => Promise<void>;
  toggleFavorite: (fileId: string) => Promise<void>;
  toggleFolderFavorite: (folderId: string, markFavorite?: boolean) => Promise<void>;
  softDeleteFile: (fileId: string) => Promise<void>;
  restoreFileFromTrash: (fileId: string) => Promise<{ landedInFallbackFolder: boolean; folderId?: string; filePreservedAccessKey: boolean }>;
  /** Bulk restoreFileFromTrash (trash 3-segment plan §2c) — computes one shared dated fallback folder for the whole batch instead of one per file, applied in a single commitVaultState. */
  restoreFilesFromTrash: (fileIds: string[]) => Promise<{ fileId: string; landedInFallbackFolder: boolean; folderId?: string; filePreservedAccessKey: boolean }[]>;
  /** Restores a trashed folder (or album) and its entire trashed descendant subtree together, all-or-nothing. Reachability is checked only for the target's own parent — descendants are covered by being restored in the same call. */
  restoreFolderFromTrash: (folderId: string) => Promise<{ landedInFallbackFolder: boolean; parentId?: string }>;
  /** Bulk restoreFolderFromTrash — same shared-fallback-folder batching as restoreFilesFromTrash. */
  restoreFoldersFromTrash: (folderIds: string[]) => Promise<{ folderId: string; landedInFallbackFolder: boolean; parentId?: string }[]>;
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
  /**
   * "Add to Album…" quick action (plan §7, Phase 6) — copies a single file
   * into an album via copyFileToFolder (the same chokepoint paste-copy and
   * duplicateFile already share, so the album-media-only guard and storage
   * limit check both apply here for free), then commits the copy the same
   * way duplicateFile does (copyFileToFolder itself never persists — every
   * caller owns its own commitVaultState). Unlike duplicateFile, this
   * rethrows StorageLimitExceededError/AlbumMediaOnlyError instead of
   * alerting internally: the caller is MoveVaultModalWrapper, which already
   * owns a single "how do I report this failure" spot for the whole
   * move/add-to-album flow (see its own onMove catch) — alerting here too
   * would double up.
   */
  addFileToAlbum: (fileId: string, albumId: string) => Promise<void>;
  // Access Key methods
  assignFolderAccessKey: (folderId: string, passwordId: string) => Promise<void>;
  assignFileAccessKey: (fileId: string, passwordId: string) => Promise<void>;
  removeFolderAccessKey: (folderId: string) => Promise<void>;
  removeFileAccessKey: (fileId: string) => Promise<void>;
  /**
   * plans/custom folders and album thumbnail implementation plan.md — lets
   * a user override a root folder/subfolder/album's thumbnail with a picked
   * image, unencrypted like an album's own auto-derived cover (see the
   * plan's Context note). Always wins over any default/auto-derived visual.
   */
  setFolderThumbnail: (folderId: string, sourceUri: string) => Promise<void>;
  clearFolderThumbnail: (folderId: string) => Promise<void>;
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

/**
 * BFS walk of every descendant folder of `folderId` (children, grandchildren,
 * ...) given an explicit folders array — the pure function `getFolderDescendants`
 * (the store action below) and every cascade-trash/cascade-shred/cascade-restore
 * action in this file share, so a `commitVaultState` updater can compute a
 * subtree against the exact `state.folders` it was handed rather than racing
 * `get().folders` from inside its own closure.
 */
const collectDescendantFolders = (folders: FolderMetadata[], folderId: string): FolderMetadata[] => {
  const descendants: FolderMetadata[] = [];
  const queue = [folderId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = folders.filter(f => f.parentId === currentId);
    descendants.push(...children);
    queue.push(...children.map(c => c.id));
  }
  return descendants;
};

/**
 * Trash 3-segment plan §2a: generalizes deleteFolder's original single-walk
 * "inherit the nearest locked ancestor's key" logic (see the I-12/I-12-follow-up
 * comments this replaced) so it can be resolved once per folder in a whole
 * subtree being cascade-trashed, not just for the top-level target. A
 * folder's own hasAccessKey/accessKeyId wins if set; otherwise the walk
 * continues up through parentId. `resolved` memoizes folders already
 * resolved earlier in the same batch (their nearest key is reused instead of
 * re-walked) — since deleteFolder resolves the target before its descendants,
 * a descendant's walk up through the target (or a nearer already-resolved
 * descendant) short-circuits immediately. `visiting` guards against a
 * corrupt/circular parentId chain the same way getFolderPathLabel's own
 * visited set does.
 */
const resolveNearestAccessKeyId = (
  folder: FolderMetadata | undefined,
  foldersById: Map<string, FolderMetadata>,
  resolved: Map<string, string | undefined>,
  visiting: Set<string> = new Set()
): string | undefined => {
  if (!folder) return undefined;
  if (resolved.has(folder.id)) return resolved.get(folder.id);
  if (visiting.has(folder.id)) return undefined; // circular parentId — treat as no inherited key
  visiting.add(folder.id);

  let result: string | undefined;
  if (folder.hasAccessKey && folder.accessKeyId) {
    result = folder.accessKeyId;
  } else if (folder.parentId) {
    result = resolveNearestAccessKeyId(foldersById.get(folder.parentId), foldersById, resolved, visiting);
  }
  resolved.set(folder.id, result);
  return result;
};

/**
 * Trash 3-segment plan §2c: the unified "would restoring here strand the
 * item outside normal browsing" check — true whether the container was
 * permanently deleted (shredded, so the id no longer resolves at all) or is
 * simply still sitting in trash itself (present, but `isTrash: true`, so
 * every "live folder" listing in the app already hides it — restoring into
 * it would make the restored item unreachable too). `undefined`/root is
 * always reachable. Guards against a corrupt/circular parentId chain by
 * treating it as unreachable rather than looping forever.
 */
const isContainerUnreachable = (containerId: string | undefined, folders: FolderMetadata[]): boolean => {
  if (!containerId) return false;
  const byId = new Map(folders.map(f => [f.id, f]));
  const visited = new Set<string>();
  let current = byId.get(containerId);
  if (!current) return true; // shredded — no longer resolves at all
  while (current) {
    if (visited.has(current.id)) return true; // circular chain — treat as broken
    visited.add(current.id);
    if (current.isTrash) return true; // container (or an ancestor) is itself trashed
    if (!current.parentId) return false; // reached root without hitting trash — reachable
    const parent: FolderMetadata | undefined = byId.get(current.parentId);
    if (!parent) return true; // a link in the chain is missing
    current = parent;
  }
  return false;
};

/**
 * Trash 3-segment plan §2d: replaces the old static `'Restored Files'`
 * lookup/create with a freshly dated name built from the current moment
 * (matching trash.tsx's `formatDeletedAt` style, with seconds added for
 * extra collision safety). One is created per store-action call (single or
 * bulk) and reused for every item that call restores into.
 *
 * The per-call UUID `id` is always unique on its own, but two restores
 * landing in the same wall-clock second (a fast double-tap, or two bulk
 * actions moments apart) would otherwise produce two *root-level* folders
 * with the identical displayed name, which reads as a bug even though both
 * work correctly. Run the name through the same sibling-dedup every other
 * folder-creation path already applies (createFolder/moveFolder/
 * moveFileToFolder) — callers pass the current root-level folder names.
 */
const buildDatedFallbackFolder = (existingRootNames: Set<string>): FolderMetadata => {
  const label = new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return {
    id: SecureCrypto.generateUUID(),
    name: uniqueClampedName(`Restored Files – ${label}`, existingRootNames),
    color: '#34C759',
    icon: 'folder',
    isEncrypted: false,
    isFavorite: false,
    isPersonalFavoritesFolder: false,
    createdAt: Date.now(),
    type: 'folder',
  };
};

/**
 * Trash 3-segment plan §2c revision: the set of folder ids that must be
 * restored alongside `rootId` when it's restored via restoreFolderFromTrash.
 * Always includes `rootId` itself (the explicit restore target, restored
 * regardless of its own trashedByFolderCascade flag — whatever the caller
 * asked to restore, gets restored). A descendant is pulled in only if EVERY
 * folder on the path from `rootId` down to it is flagged
 * trashedByFolderCascade: true — i.e. the whole branch was swept in by a
 * cascade, never independently trashed by the user partway down. The moment
 * a branch hits a folder that was trashed on its own (flag false/undefined),
 * that branch is excluded entirely and left exactly as it was: still
 * trashed, still reachable only from Trash, with its existing parentId (no
 * reparenting) — restoring an ancestor must never resurrect a subtree the
 * user deliberately, independently trashed. This is what
 * `collectDescendantFolders` (used by deleteFolder/shredFolder, which
 * legitimately want the FULL subtree regardless of flags) is not.
 */
const collectCascadeRestorableSubtree = (folders: FolderMetadata[], rootId: string): Set<string> => {
  const restorable = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = folders.filter(f => f.parentId === currentId);
    for (const child of children) {
      if (child.trashedByFolderCascade) {
        restorable.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return restorable;
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

/** True for a root-only, media-only album folder — see FolderMetadata.type. */
const isAlbumFolder = (folder?: FolderMetadata) => folder?.type === 'album';

/** True for a photo/video mimeType — the only content an album may hold. */
const isMediaMimeType = (mimeType?: string) => !!mimeType && (mimeType.startsWith('image/') || mimeType.startsWith('video/'));

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

const logVaultDiagnostic = (event: string, details: Record<string, unknown> = {}) => {
  // Temporary Phase 0 diagnostics. Keep this development-only and never log
  // passphrases, keys, file contents, or source/sandbox paths.
  if (__DEV__ && process.env.NODE_ENV !== 'test') {
    console.info(`[VaultDiag] ${event}`, details);
  }
};

let vaultHydrationPromise: Promise<void> | null = null;
let waitForVaultHydration: (() => Promise<void>) | null = null;
let vaultHydrationGeneration = 0;

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
  // Every metadata mutation must start from the hydrated snapshot. This also
  // covers restore/folder actions triggered during the first cold render, not
  // only the document-picker import path.
  if (waitForVaultHydration) {
    await waitForVaultHydration();
  }
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
  replaceVaultStateFromRestore: (folders, files) => {
    // Invalidate any cold-start read that is still waiting on AsyncStorage.
    // A restore is the newer source of truth and must win when that read
    // eventually completes.
    vaultHydrationGeneration += 1;
    set({ folders, files, _isVaultHydrated: true, _vaultHydrationError: null });
  },
  hydrateVault: async () => {
    const state = get();
    if (state._isVaultHydrated) return;
    if (vaultHydrationPromise) return vaultHydrationPromise;

    const hydrationGeneration = vaultHydrationGeneration;
    vaultHydrationPromise = (async () => {
      logVaultDiagnostic('hydration:start', {
        fileCountInMemory: get().files.length,
        folderCountInMemory: get().folders.length,
      });
      set({ _isVaultHydrated: false, _vaultHydrationError: null });
      try {
        await StorageService.initializeSystemDirectories();
        const foldersRaw = await withAsyncStorageTimeout(AsyncStorage.getItem('@vault_folders'));
        const filesRaw = await withAsyncStorageTimeout(AsyncStorage.getItem('@vault_files'));
        const clipboardRaw = await withAsyncStorageTimeout(AsyncStorage.getItem('@vault_clipboard'));
        if (hydrationGeneration !== vaultHydrationGeneration) return;
        set({
          folders: foldersRaw ? JSON.parse(foldersRaw) : [],
          files: filesRaw ? JSON.parse(filesRaw) : [],
          clipboard: clipboardRaw ? JSON.parse(clipboardRaw) : null,
          _isVaultHydrated: true,
          _vaultHydrationError: null,
        });
        logVaultDiagnostic('hydration:complete', {
          fileCount: get().files.length,
          folderCount: get().folders.length,
        });
      } catch (e) {
        if (hydrationGeneration !== vaultHydrationGeneration) return;
        console.error('Vault store context compilation failure', e);
        set({ _isVaultHydrated: true, _vaultHydrationError: 'Vault hydration failed' });
        logVaultDiagnostic('hydration:failed');
      }
      // Fire-and-forget so startup isn't blocked on stat-ing every payload; the
      // UI updates once missing files are flagged.
      get().reconcileMissingPayloads().catch((e) => console.error('Payload reconciliation failed', e));
    })().finally(() => {
      vaultHydrationPromise = null;
    });

    return vaultHydrationPromise;
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
  createFolder: async (name, color, icon, isEncrypted, parentId, type) => {
    const folderName = clampNameLength(name?.trim() || 'New Folder');
    const { folders } = get();
    const existingNames = new Set(folders.map(f => f.name));
    const uniqueName = uniqueClampedName(folderName, existingNames);
    const resolvedType = type ?? 'folder';
    const newFolder: FolderMetadata = {
      id: SecureCrypto.generateUUID(),
      name: uniqueName,
      color,
      icon,
      isEncrypted,
      isFavorite: false,
      isPersonalFavoritesFolder: false,
      createdAt: Date.now(),
      type: resolvedType,
      // Hard-enforced here, not just left to callers: an album can never
      // have a parent, regardless of what parentId was passed in.
      parentId: resolvedType === 'album' ? undefined : parentId
    };
    await commitVaultState(set, (state) => ({ folders: [...state.folders, newFolder] }));
  },
  deleteFolder: async (folderId) => {
    // Trash 3-segment plan §2a: real soft-delete over the folder AND its
    // entire descendant subtree, replacing the old hard-delete. Folder
    // records are never removed by this action anymore — only
    // shredFolder/shredMultipleFolders (permanent delete) do that. This also
    // fixes the orphaned-subfolder-files bug: previously only the target
    // folder's *direct* files were trashed, leaving files in a nested
    // subfolder unreachable (never trashed, never browsable) once the
    // subfolder's own parent was gone.
    //
    // I-12 (access-key inheritance): a file with no access key of its own is
    // protected purely by "must unlock this folder to browse into it", which
    // trashing the folder (now hiding it from every live listing, same as
    // deleting used to) erases just as surely. Snapshot that gate onto the
    // file's own hasAccessKey/accessKeyId in the same update that trashes
    // it. I-12 follow-up: must run per descendant, not once for the
    // top-level folder — each descendant folder needs its own inherited-lock
    // resolution (its own ancestor chain, which passes up through the target
    // folder into the same external ancestors), not just the target's.
    //
    // Cascade-vs-independent trash review fix: a descendant folder or file
    // that is ALREADY isTrash (independently trashed by the user at some
    // earlier point, before this cascade ever reached it) is left completely
    // untouched here — not re-stamped with `deletedAt: now`, and critically
    // not marked `trashedByFolderCascade`. Without this, restoring the
    // target folder later would silently resurrect items the user
    // deliberately, separately trashed beforehand (e.g. a photo trashed
    // individually inside a folder that only later itself got trashed and
    // restored) — the two "why is this trashed" reasons would be
    // indistinguishable. Only items this call actually trashes just now get
    // `trashedByFolderCascade: true` (descendants) so restoreFolderFromTrash
    // knows they're safe to pull back in; the explicit target folder itself
    // is never flagged (it's the thing the user actually asked to delete,
    // not a side effect of deleting something else).
    await commitVaultState(set, (state) => {
      const target = state.folders.find(f => f.id === folderId);
      if (!target || target.isTrash) return {}; // not found, or already trashed — nothing to cascade

      const descendantFolders = collectDescendantFolders(state.folders, folderId);
      const subtreeIds = new Set<string>([folderId, ...descendantFolders.map(f => f.id)]);
      const untouchedDescendantIds = new Set<string>(descendantFolders.filter(f => !f.isTrash).map(f => f.id));
      const now = Date.now();

      // Access-key resolution runs over the WHOLE subtree, including any
      // already-trashed descendant folder — its own files still need the
      // inherited-lock snapshot below even though the folder's own
      // isTrash/deletedAt/trashedByFolderCascade are left alone (its
      // "must unlock this folder to browse into it" protection is
      // disappearing right along with the rest of the subtree, regardless of
      // whether that particular folder happened to already be trashed).
      const foldersById = new Map(state.folders.map(f => [f.id, f]));
      const resolved = new Map<string, string | undefined>();
      const accessKeyByFolderId = new Map<string, string | undefined>();
      for (const fid of subtreeIds) {
        accessKeyByFolderId.set(fid, resolveNearestAccessKeyId(foldersById.get(fid), foldersById, resolved));
      }

      const folders = state.folders.map(f => {
        if (f.id === folderId) return { ...f, isTrash: true, deletedAt: now };
        if (untouchedDescendantIds.has(f.id)) return { ...f, isTrash: true, deletedAt: now, trashedByFolderCascade: true };
        return f;
      });

      const files = state.files.map(f => {
        if (!subtreeIds.has(f.folderId)) return f;
        const inheritedAccessKeyId = accessKeyByFolderId.get(f.folderId);
        const inheritsAccessKey = !f.hasAccessKey && !f.accessKeyId && !!inheritedAccessKeyId;
        const accessKeyPatch = inheritsAccessKey ? { hasAccessKey: true, accessKeyId: inheritedAccessKeyId } : {};
        if (f.isTrash) {
          // Already trashed independently (softDeleteFile, before this
          // cascade reached its folder) — preserve its own isTrash/
          // deletedAt/trashedByFolderCascade so restoreFolderFromTrash never
          // resurrects it, but still snapshot the access key it would
          // otherwise silently lose.
          return { ...f, ...accessKeyPatch };
        }
        return {
          ...f,
          isTrash: true,
          deletedAt: now,
          trashedByFolderCascade: true,
          ...accessKeyPatch,
        };
      });
      return { folders, files };
    });
  },
  importFile: async (sourceUri, targetFolderId, fileName, mimeType, size, encrypt, encryptionKeyId) => {
    // Imports can be triggered immediately after the native picker returns.
    // Finish the one shared hydration pass first so its older AsyncStorage
    // snapshot cannot replace this import's newer in-memory state.
    await get().hydrateVault();
    const fileCountBefore = get().files.length;
    logVaultDiagnostic('import:start', { fileCountBefore });

    // Album guard: checked before any file I/O, same reasoning as the
    // storage-limit check just below — no point copying bytes into the
    // sandbox just to reject the import a moment later.
    const targetFolder = get().folders.find(f => f.id === targetFolderId);
    if (isAlbumFolder(targetFolder) && !isMediaMimeType(mimeType)) {
      throw new AlbumMediaOnlyError(fileName, mimeType);
    }

    // Checked before any file I/O — no point copying bytes into the sandbox
    // just to have to delete them again on rejection.
    assertWithinStorageLimit(get().files, size, encrypt && !!encryptionKeyId);

    const targetId = SecureCrypto.generateUUID();
    const sandboxFilename = `${targetId}_${fileName}`;
    const createdPaths = new Set<string>();
    let metadataCommitted = false;

    try {
      const internalPath = await StorageService.copyToSandbox(sourceUri, sandboxFilename);
      createdPaths.add(internalPath);
      if (!(await StorageService.fileExists(internalPath))) {
        throw new Error('Imported payload was not written to the vault sandbox');
      }

      // Best-effort lossless remux (video files only, Android only — see
      // StorageService.remuxVideoIfPossible / src/utils/videoRemux.ts) so the
      // stored file always has a valid, seekable duration/index regardless of
      // what the original container declared. Must happen before encryption —
      // it's a real read of the plaintext bytes. No-ops (returns internalPath
      // unchanged) for non-video files, other platforms, or if the native
      // module isn't available/fails.
      if (mimeType.startsWith('video/')) createdPaths.add(`${internalPath}.remuxed.mp4`);
      const remuxedPath = await StorageService.remuxVideoIfPossible(internalPath, mimeType);
      createdPaths.add(remuxedPath);
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
    // Real thumbnail generation for images/videos (plan §1a) — same slot,
    // same before-encryption timing, and same never-blocks-import contract
    // as the .apk icon extraction just above, just gated on the file being
    // media instead of being an .apk. Fixes video tiles rendering as broken
    // images (no <Image> can decode video bytes) and avoids decoding a
    // full-resolution photo just to render a small grid tile. Because this
    // sets iconPath in the same slot the .apk path already does, the
    // encryption block right below needs no changes: it already encrypts
    // whatever iconPath holds at this point with no awareness of why it was
    // set.
      const isMedia = mimeType.startsWith('image/') || mimeType.startsWith('video/');
      if (isMedia && Platform.OS !== 'web') {
        const thumbOutputPath = `${remuxedPath}.thumb.jpg`;
        iconPath = (mimeType.startsWith('video/')
          ? await extractVideoThumbnail(remuxedPath, thumbOutputPath)
          : await extractImageThumbnail(remuxedPath, thumbOutputPath)) ?? undefined;
      }
      if (iconPath) createdPaths.add(iconPath);
      if (iconPath && !(await StorageService.fileExists(iconPath))) {
        await StorageService.removeSandboxFile(iconPath);
        iconPath = undefined;
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
          createdPaths.add(`${remuxedPath}.enc`);
          finalPath = await StorageService.encryptSandboxFile(remuxedPath, encryptionKey);
          createdPaths.add(finalPath);
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
              createdPaths.add(`${iconPath}.enc`);
              iconPath = await StorageService.encryptSandboxFile(iconPath, encryptionKey);
              createdPaths.add(iconPath);
              iconEncrypted = true;
            } catch (err) {
              console.error('Failed to encrypt app icon cache, falling back to generic icon:', err);
              await StorageService.removeSandboxFile(iconPath);
              iconPath = undefined;
            }
          }
        }
      }

      if (!(await StorageService.fileExists(finalPath))) {
        throw new Error('Imported payload was not written to the vault sandbox');
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
      metadataCommitted = true;
      logVaultDiagnostic('import:complete', {
        fileCountBefore,
        fileCountAfter: get().files.length,
      });
    } catch (error) {
      if (!metadataCommitted) {
        set((state) => ({ files: state.files.filter((file) => file.id !== targetId) }));
        await persistFiles(get().files).catch(() => {});
      }
      await Promise.all([...createdPaths].map((path) => StorageService.removeSandboxFile(path)));
      throw error;
    }
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
    // I-12: report when the file's original folder is unreachable (shredded,
    // or itself still sitting in trash — trash 3-segment plan §2c widens
    // this from a simple existence check to isContainerUnreachable, since a
    // folder can now be soft-deleted and still technically "exist") — it
    // lands in a freshly dated fallback folder instead, so the caller can
    // warn the user that whatever protection the original folder had is not
    // carried forward.
    const targetFileBefore = get().files.find(f => f.id === fileId);
    const wasUnreachable = !!targetFileBefore && isContainerUnreachable(targetFileBefore.folderId, get().folders);
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

      if (isContainerUnreachable(targetFile.folderId, state.folders)) {
        const rootNames = new Set(state.folders.filter(f => !f.parentId).map(f => f.name));
        const fallbackFolder = buildDatedFallbackFolder(rootNames);
        folders = [...state.folders, fallbackFolder];
        targetFolderId = fallbackFolder.id;
      }

      resolvedFolderId = targetFolderId;

      const files = state.files.map(f =>
        f.id === fileId ? { ...f, isTrash: false, deletedAt: undefined, folderId: targetFolderId, trashedByFolderCascade: undefined } : f
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
      landedInFallbackFolder: wasUnreachable,
      folderId: resolvedFolderId,
      filePreservedAccessKey: !!(restoredFile?.hasAccessKey && restoredFile?.accessKeyId),
    };
  },
  restoreFilesFromTrash: async (fileIds) => {
    // Trash 3-segment plan §2c: same isContainerUnreachable/fallback logic
    // as restoreFileFromTrash, but computes ONE shared dated fallback folder
    // for the whole batch (if any file needs it) instead of one per file,
    // applied inside a single commitVaultState.
    const results = new Map<string, { landedInFallbackFolder: boolean; folderId?: string; filePreservedAccessKey: boolean }>();

    await commitVaultState(set, (state) => {
      let folders = state.folders;
      let fallbackFolder: FolderMetadata | undefined;

      const files = state.files.map(f => {
        if (!fileIds.includes(f.id)) return f;

        const unreachable = isContainerUnreachable(f.folderId, state.folders);
        let targetFolderId = f.folderId;
        if (unreachable) {
          if (!fallbackFolder) {
            const rootNames = new Set(folders.filter(fo => !fo.parentId).map(fo => fo.name));
            fallbackFolder = buildDatedFallbackFolder(rootNames);
            folders = [...folders, fallbackFolder];
          }
          targetFolderId = fallbackFolder.id;
        }

        results.set(f.id, {
          landedInFallbackFolder: unreachable,
          folderId: targetFolderId,
          filePreservedAccessKey: !!(f.hasAccessKey && f.accessKeyId),
        });

        return { ...f, isTrash: false, deletedAt: undefined, folderId: targetFolderId, trashedByFolderCascade: undefined };
      });

      return { folders, files };
    });

    return fileIds.map(fileId => ({
      fileId,
      ...(results.get(fileId) ?? { landedInFallbackFolder: false, filePreservedAccessKey: false }),
    }));
  },
  restoreFolderFromTrash: async (folderId) => {
    // Trash 3-segment plan §2c: restores the target folder (or album)
    // together with the part of its trashed descendant subtree that was
    // only trashed as a side effect of deleteFolder's cascade — mirroring
    // deleteFolder's own cascade in reverse. Reachability is checked only
    // for the target folder's own parent (cascade-flagged descendants are
    // covered by being restored in the same call, so they never
    // independently trigger the fallback) — if unreachable, only the target
    // folder itself is reparented into a dated fallback folder;
    // cascade-restored descendants keep their existing parentId pointing at
    // the target, correct since that part of the subtree moves together.
    // Albums (parentId always undefined) never hit the fallback path —
    // isContainerUnreachable(undefined, ...) is always false, so they always
    // restore straight to root.
    //
    // Cascade-vs-independent trash review fix: a descendant that was
    // independently, separately trashed by the user (not merely swept up by
    // this or an ancestor's cascade — trashedByFolderCascade is
    // false/undefined) is NOT restored here, and neither is anything below
    // it — see collectCascadeRestorableSubtree. It stays trashed, still only
    // reachable from Trash, exactly as the user left it.
    const targetBefore = get().folders.find(f => f.id === folderId);
    const wasUnreachable = !!targetBefore && isContainerUnreachable(targetBefore.parentId, get().folders);
    let resolvedParentId: string | undefined;

    await commitVaultState(set, (state) => {
      const target = state.folders.find(f => f.id === folderId);
      if (!target) return {};

      const restorableIds = collectCascadeRestorableSubtree(state.folders, folderId);

      let folders = state.folders;
      let newParentId = target.parentId;

      if (isContainerUnreachable(target.parentId, state.folders)) {
        const rootNames = new Set(state.folders.filter(f => !f.parentId).map(f => f.name));
        const fallbackFolder = buildDatedFallbackFolder(rootNames);
        folders = [...folders, fallbackFolder];
        newParentId = fallbackFolder.id;
      }

      resolvedParentId = newParentId;

      folders = folders.map(f => {
        if (!restorableIds.has(f.id)) return f;
        const restored = { ...f, isTrash: false, deletedAt: undefined, trashedByFolderCascade: undefined };
        return f.id === folderId ? { ...restored, parentId: newParentId } : restored;
      });

      const files = state.files.map(f =>
        restorableIds.has(f.folderId) && f.trashedByFolderCascade
          ? { ...f, isTrash: false, deletedAt: undefined, trashedByFolderCascade: undefined }
          : f
      );

      return { folders, files };
    });

    return { landedInFallbackFolder: wasUnreachable, parentId: resolvedParentId };
  },
  restoreFoldersFromTrash: async (folderIds) => {
    // Trash 3-segment plan §2c: same shared-fallback-folder batching as
    // restoreFilesFromTrash, one call covering multiple folders/albums —
    // and, per folder, the same independently-trashed-descendant exclusion
    // as the single-item restoreFolderFromTrash above (see
    // collectCascadeRestorableSubtree).
    const results = new Map<string, { landedInFallbackFolder: boolean; parentId?: string }>();

    await commitVaultState(set, (state) => {
      // Bug fix (post-plan review): reachability and cascade-membership used
      // to be recomputed against `folders` as it was progressively mutated by
      // earlier iterations of this same loop. That made a bulk restore
      // order-dependent: if a folder and its own cascade-trashed descendant
      // were both selected and the descendant happened to be processed
      // first, its parent still looked trashed (not yet restored) so it got
      // shunted into a brand-new fallback folder — permanently splitting the
      // subtree once the ancestor was restored afterward. Selection order
      // comes from tap order / UUID tie-breaking, so this was a coin-flip on
      // the single most natural bulk-recovery action ("Select All → Restore
      // Selected" in Trash → Folders).
      //
      // Fix: compute everything up front against an immutable snapshot of
      // the pre-restore state, and treat every folder this batch will end up
      // restoring (explicit targets plus their cascade-restorable
      // descendants) as already "restored" for reachability purposes,
      // regardless of which one is processed first below.
      const originalFolders = state.folders;
      let folders = state.folders;
      let files = state.files;
      let fallbackFolder: FolderMetadata | undefined;

      const restorableByFolderId = new Map<string, Set<string>>();
      const batchRestoredIds = new Set<string>();
      for (const folderId of folderIds) {
        if (!originalFolders.some(f => f.id === folderId)) continue;
        const restorableIds = collectCascadeRestorableSubtree(originalFolders, folderId);
        restorableByFolderId.set(folderId, restorableIds);
        for (const id of restorableIds) batchRestoredIds.add(id);
      }

      const isUnreachableForBatch = (containerId: string | undefined): boolean => {
        if (!containerId) return false;
        const byId = new Map(originalFolders.map(f => [f.id, f]));
        const visited = new Set<string>();
        let current = byId.get(containerId);
        if (!current) return true; // shredded — no longer resolves at all
        while (current) {
          if (visited.has(current.id)) return true; // circular chain — treat as broken
          visited.add(current.id);
          if (current.isTrash && !batchRestoredIds.has(current.id)) return true;
          if (!current.parentId) return false; // reached root without hitting trash — reachable
          const parent: FolderMetadata | undefined = byId.get(current.parentId);
          if (!parent) return true; // a link in the chain is missing
          current = parent;
        }
        return false;
      };

      for (const folderId of folderIds) {
        const target = originalFolders.find(f => f.id === folderId);
        if (!target) continue;

        const restorableIds = restorableByFolderId.get(folderId)!;

        const unreachable = isUnreachableForBatch(target.parentId);
        let newParentId = target.parentId;
        if (unreachable) {
          if (!fallbackFolder) {
            const rootNames = new Set(folders.filter(f => !f.parentId).map(f => f.name));
            fallbackFolder = buildDatedFallbackFolder(rootNames);
            folders = [...folders, fallbackFolder];
          }
          newParentId = fallbackFolder.id;
        }

        results.set(folderId, { landedInFallbackFolder: unreachable, parentId: newParentId });

        folders = folders.map(f => {
          if (!restorableIds.has(f.id)) return f;
          const restored = { ...f, isTrash: false, deletedAt: undefined, trashedByFolderCascade: undefined };
          return f.id === folderId ? { ...restored, parentId: newParentId } : restored;
        });

        files = files.map(f =>
          restorableIds.has(f.folderId) && f.trashedByFolderCascade
            ? { ...f, isTrash: false, deletedAt: undefined, trashedByFolderCascade: undefined }
            : f
        );
      }

      return { folders, files };
    });

    return folderIds.map(folderId => ({
      folderId,
      ...(results.get(folderId) ?? { landedInFallbackFolder: false }),
    }));
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
    // Trash 3-segment plan §2b: cascade fix — previously only removed the
    // one folder record and its *direct* files, leaking dangling
    // subfolder/file metadata. Now walks the full descendant subtree first.
    // Deliberately ignores trashedByFolderCascade/isTrash on every
    // descendant and file — unlike restoreFolderFromTrash, "permanently
    // delete" doesn't get to leave part of the subtree behind, and this
    // action is not exclusively a Trash-screen operation: dashboard.tsx,
    // favorites.tsx, search.tsx, and VaultContentsScreen.tsx all also wire
    // it directly to a "Delete Permanently" option on *live* (non-trashed)
    // folders, skipping Trash entirely — so it must be able to remove a
    // subtree that's a mix of trashed and never-trashed items.
    const { files, folders } = get();
    const subtreeIds = new Set<string>([folderId, ...collectDescendantFolders(folders, folderId).map(f => f.id)]);
    const folderFiles = files.filter(f => subtreeIds.has(f.folderId));

    await processSequentially(folderFiles.map(f => f.id), async (fileId) => {
      const targetFile = files.find(f => f.id === fileId);
      if (targetFile) {
        await removeFilePayload(targetFile);
      }
    }, onProgress);

    // Clean up every folder-in-the-subtree's own custom thumbnail file
    // before dropping its record — otherwise it's an orphaned file on
    // disk with nothing left pointing at it.
    const foldersToShred = folders.filter(f => subtreeIds.has(f.id));
    await Promise.all(
      foldersToShred
        .filter(f => f.customThumbnailPath)
        .map(f => StorageService.removeSandboxFile(f.customThumbnailPath!).catch(() => {}))
    );

    await commitVaultState(set, (state) => ({
      files: state.files.filter(f => !subtreeIds.has(f.folderId)),
      folders: state.folders.filter(f => !subtreeIds.has(f.id)),
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
  setFolderThumbnail: async (folderId, sourceUri) => {
    const folder = get().folders.find(f => f.id === folderId);
    if (!folder) return;

    let newThumbnailPath: string;
    if (Platform.OS === 'web') {
      // StorageService.copyToSandbox is a synthetic no-op on web — it
      // returns a `/web-vault/...` placeholder with no bytes reachable
      // from it, since nothing resolves that placeholder back to real
      // content at <Image> render time (a pre-existing gap shared by every
      // other web thumbnail in this app, e.g. importFile's own iconPath
      // slot). Use the picker's own URI directly instead: on web this is
      // already a real, renderable blob:/data: URI, and there's no
      // persistent app-private filesystem on web to copy it into anyway.
      newThumbnailPath = sourceUri;
    } else {
      // Copy into the sandbox first so extractImageThumbnail has a stable,
      // VAULT_DIR-anchored path to derive its output path from — same
      // reason importFile copies before extracting (see its own comment).
      const rawPath = await StorageService.copyToSandbox(sourceUri, `${SecureCrypto.generateUUID()}_folder_thumb_src`);
      const thumbOutputPath = `${rawPath}.thumb.jpg`;
      const extracted = await extractImageThumbnail(rawPath, thumbOutputPath);
      if (extracted) {
        await StorageService.removeSandboxFile(rawPath); // intermediate full-res copy, superseded by the downscaled output
        newThumbnailPath = extracted;
      } else {
        // Extraction failed: fall back to the raw copy itself rather than
        // failing the whole action — matches importFile's own never-blocks
        // contract for this exact failure mode, just applied to a required
        // field here (a folder thumbnail has no "generic icon iconPath
        // slot" to silently leave empty the way importFile's iconPath does
        // — the user explicitly asked to set one, so the fallback is the
        // plain image instead of the downscaled one, never an error).
        newThumbnailPath = rawPath;
      }
    }

    // Revision note (plan review pass): a prior version of this action fired
    // `LayoutAnimation.configureNext` here, right before the commit below.
    // Reverted — LayoutAnimation is a *global* next-layout-commit animation,
    // not scoped to this one tile, and this codebase already has documented,
    // hard-won precedent that it stutters on anything heavier than a couple
    // of rows (see SectionHeaderToggle.tsx's header comment, which is why
    // CollapsibleSection was rewritten off LayoutAnimation onto Reanimated).
    // A folder/album tile whose thumbnail just changed almost always lives
    // inside exactly the kind of grid that comment warns about
    // (VaultContentsScreen's virtualized SectionList grid, dashboard's grid,
    // etc.), so the global-recompute risk is real, not theoretical. The
    // crossfade now lives in GridTile.tsx/ListRow.tsx instead — a per-tile
    // Reanimated opacity tween keyed off `thumbnailUri` changing, matching
    // this app's actual established pattern (useScreenEnterAnimation.ts) —
    // so the store no longer touches any animation API at all.

    // Race fix (atomic version): read-the-previous-value-and-decide happens
    // INSIDE this synchronous updater callback, which zustand's set() runs
    // in one uninterrupted tick — not as a separate `get()` call before an
    // `await`. A prior version of this fix re-read customThumbnailPath just
    // before this call but still left an await (the reduceMotion check
    // above) between that read and the actual commit; two calls whose reads
    // both land in that window before either commits would both see the
    // same stale "previous" value and orphan one file. Reading and writing
    // in the same synchronous callback removes the window entirely: no
    // matter how many setFolderThumbnail/clearFolderThumbnail calls overlap
    // on this folder, whichever commits second always sees the first call's
    // just-written value as "previous" (or the folder's absence, if it was
    // deleted out from under this flow), because there is no await between
    // reading state and writing it.
    let previousThumbnailPath: string | undefined;
    let folderStillExists = true;
    await commitVaultState(set, (state) => {
      const target = state.folders.find(f => f.id === folderId);
      if (!target) {
        folderStillExists = false;
        return {};
      }
      previousThumbnailPath = target.customThumbnailPath;
      return {
        folders: state.folders.map(f => f.id === folderId ? { ...f, customThumbnailPath: newThumbnailPath } : f)
      };
    });
    if (!folderStillExists) {
      // Folder was deleted between entry and commit — the file we just
      // produced (extracted thumbnail or raw copy) has nothing to attach to.
      await StorageService.removeSandboxFile(newThumbnailPath);
      return;
    }
    if (previousThumbnailPath) {
      await StorageService.removeSandboxFile(previousThumbnailPath);
    }
  },
  clearFolderThumbnail: async (folderId) => {
    const folder = get().folders.find(f => f.id === folderId);
    if (!folder?.customThumbnailPath) return;
    // No animation call here — see setFolderThumbnail's revision note above;
    // the crossfade now lives in GridTile.tsx/ListRow.tsx, keyed off
    // `thumbnailUri` changing, not triggered from the store.
    //
    // Same atomic race fix as setFolderThumbnail above: read-then-decide
    // happens inside the synchronous updater, not via a separate get() call
    // before this point. A concurrent setFolderThumbnail could have written
    // a new path during whatever this function awaits before reaching the
    // commit; reading fresh inside the updater (not before it) means this
    // only clears/removes whatever is actually committed at the moment this
    // callback runs, never a stale snapshot from before any earlier await.
    let removedPath: string | undefined;
    await commitVaultState(set, (state) => {
      const target = state.folders.find(f => f.id === folderId);
      if (!target?.customThumbnailPath) return {};
      removedPath = target.customThumbnailPath;
      return {
        folders: state.folders.map(f => f.id === folderId ? { ...f, customThumbnailPath: undefined } : f)
      };
    });
    if (removedPath) {
      await StorageService.removeSandboxFile(removedPath);
    }
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
    // Trash 3-segment plan §2b: same cascade fix as shredFolder, applied to
    // every folder in the batch.
    const { files, folders } = get();
    const allFolderIds = new Set<string>(folderIds);
    for (const folderId of folderIds) {
      collectDescendantFolders(folders, folderId).forEach(d => allFolderIds.add(d.id));
    }
    const filesToDelete = files.filter(f => allFolderIds.has(f.folderId));

    for (const file of filesToDelete) {
      await removeFilePayload(file);
    }

    // Clean up every folder-in-the-batch's own custom thumbnail file
    // before dropping its record — same reasoning as shredFolder's own
    // pass just above in this file.
    const foldersToShred = folders.filter(f => allFolderIds.has(f.id));
    await Promise.all(
      foldersToShred
        .filter(f => f.customThumbnailPath)
        .map(f => StorageService.removeSandboxFile(f.customThumbnailPath!).catch(() => {}))
    );

    await commitVaultState(set, (state) => ({
      folders: state.folders.filter(f => !allFolderIds.has(f.id)),
      files: state.files.filter(f => !allFolderIds.has(f.folderId)),
    }));
  },

  getFolderDescendants: (folderId: string): FolderMetadata[] => {
    return collectDescendantFolders(get().folders, folderId);
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
      // Pre-existing bug fix, found while adding the album guards below:
      // targetFolderId is '' for a paste to the vault root (see
      // dashboard.tsx/favorites.tsx/search.tsx's handlePasteToRoot), which
      // never matches any real folder id — so this lookup unconditionally
      // failed and silently no-op'd every "Paste Here" at the root, on
      // every screen that offers one. Only treat a *non-root* target that
      // fails to resolve as an error; a root paste has no targetFolder by
      // definition, not a missing one.
      const targetFolder = targetFolderId ? get().folders.find(f => f.id === targetFolderId) : undefined;
      if (targetFolderId && !targetFolder) {
        Alert.alert('Error', 'Target folder not found.');
        return { pastedFiles: 0, pastedFolders: 0 };
      }

      const { folders: srcFolders, files: srcFiles } = get();

      // Files-to-root guard (follow-up to the targetFolder fix above):
      // FileMetadata.folderId is a required field — there is no modeled
      // concept of a "root file" the way FolderMetadata.parentId models a
      // root folder via `undefined`. This already matches the Move picker's
      // own rule (MoveVaultModal only ever offers "Root (Move to top
      // level)" for a folder move, never a file move — see its own comment
      // on that Pressable). Before the targetFolder fix above, a root paste
      // always died at "Target folder not found" first, so this case was
      // unreachable; now that root pastes actually run, both copy-mode's
      // topLevelFiles/orphanFiles loops and cut-mode's moveFileToFolder loop
      // below would otherwise silently write `folderId: ''` — a dangling
      // reference to a folder that doesn't exist. Reject the whole paste
      // instead — same whole-batch-rejection shape as the album guards
      // below, rather than silently dropping just the files and pasting
      // any folders in the same clipboard on their own. Only trips when
      // the target is root *and* the clipboard actually holds files; a
      // folders-only paste to root is unaffected.
      if (!targetFolderId && clipboard.fileIds.length > 0) {
        Alert.alert("Can't Paste Here", "Files can't be pasted to the vault root — pick a folder first.");
        set({ pasteInProgress: false });
        return { pastedFiles: 0, pastedFolders: 0 };
      }

      // Album guard 1 (target-is-an-album): a nicer whole-batch UX layer on
      // top of copyFileToFolder's own per-call guard above, mirroring this
      // codebase's existing dual-layer pattern for storage limits
      // (assertBatchWithinStorageLimit pre-flight + assertWithinStorageLimit
      // inside each individual op).
      if (isAlbumFolder(targetFolder)) {
        if (clipboard.folderIds.length > 0) {
          Alert.alert("Can't Paste Here", "Albums can only contain photos and videos — folders can't be pasted here.");
          set({ pasteInProgress: false });
          return { pastedFiles: 0, pastedFolders: 0 };
        }
        const nonMediaFile = clipboard.fileIds
          .map(id => srcFiles.find(f => f.id === id))
          .find((f): f is FileMetadata => !!f && !isMediaMimeType(f.mimeType));
        if (nonMediaFile) {
          Alert.alert("Can't Paste Here", `"${nonMediaFile.name}" can't be added to an album — only photos and videos are allowed.`);
          set({ pasteInProgress: false });
          return { pastedFiles: 0, pastedFolders: 0 };
        }
      }

      // Album guard 2 (pasted-item-is-an-album, the reverse case): pasting a
      // copied album anywhere but the vault root would give it a parentId,
      // silently breaking the "albums are always root" invariant that
      // dashboard.tsx's rootFolders/subFolders split, useFileSystemQuery,
      // and vaultSections.ts's splitAlbums all assume holds unconditionally.
      // Pasting to the root (targetFolderId falsy) stays allowed. No UI path
      // can put an album into clipboard.folderIds today (no long-press
      // bulk-select on album tiles, no per-item copy/cut entry on an
      // album's own menu) — this is defense-in-depth for a future UI
      // addition, not a v1-reachable flow.
      if (targetFolderId) {
        const pastedAlbum = clipboard.folderIds
          .map(id => srcFolders.find(f => f.id === id))
          .find((f): f is FolderMetadata => isAlbumFolder(f));
        if (pastedAlbum) {
          Alert.alert("Can't Paste Here", `"${pastedAlbum.name}" is an album and can't be nested inside another folder.`);
          set({ pasteInProgress: false });
          return { pastedFiles: 0, pastedFolders: 0 };
        }
      }

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

      // Same root-vs-non-root normalization as the targetFolder lookup fix
      // above: a root folder's real parentId is `undefined`, not `''`, so
      // comparing directly against targetFolderId here previously computed
      // an empty set for every root paste — dead code until that lookup
      // bug was fixed, since a root paste never reached this line before.
      const existingNames = new Set(
        get().folders
          .filter(f => targetFolderId ? f.parentId === targetFolderId : !f.parentId)
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

          // Give the copy its own thumbnail file rather than a shared path
          // — otherwise permanently deleting either the original or this
          // paste-copy (shredFolder/shredMultipleFolders delete a folder's
          // customThumbnailPath unconditionally) would leave the other's
          // thumbnail file missing. Mirrors copyFileToFolder's identical
          // fix for FileMetadata.iconPath just below in this file.
          let newThumbnailPath: string | undefined;
          if (sourceFolder.customThumbnailPath) {
            const ext = sourceFolder.customThumbnailPath.includes('.')
              ? sourceFolder.customThumbnailPath.slice(sourceFolder.customThumbnailPath.lastIndexOf('.'))
              : '';
            newThumbnailPath = ext
              ? `${sourceFolder.customThumbnailPath.slice(0, -ext.length)}_copy_${newId}${ext}`
              : `${sourceFolder.customThumbnailPath}_copy_${newId}`;
            try {
              await StorageService.copySandboxFile(sourceFolder.customThumbnailPath, newThumbnailPath);
            } catch (e) {
              console.error('Failed to copy folder thumbnail', e);
              newThumbnailPath = undefined;
            }
          }

          const newFolder: FolderMetadata = {
            ...sourceFolder,
            id: newId,
            name: uniqueName(sourceFolder.name),
            parentId,
            createdAt: Date.now(),
            customThumbnailPath: newThumbnailPath,
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
          // Root paste normalization: targetFolderId is '' for the vault
          // root (see dashboard.tsx's handlePasteToRoot), but a root
          // folder's real parentId is `undefined`, never ''. Matters most
          // for a pasted album, which must land with no parentId at all —
          // not just a falsy one — to hold the "albums are always root"
          // invariant the rest of the app assumes.
          await createFolderCopy(folder, targetFolderId || undefined);
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
          // Same root normalization as copy-mode's createFolderCopy call
          // above: moveFolder's own UI call sites (dashboard.tsx et al.)
          // already pass `destinationFolderId ?? undefined` for a root
          // move — matching that convention here instead of leaving a
          // cut-and-pasted-to-root folder with parentId: '' rather than
          // properly unset.
          await get().moveFolder(folderId, targetFolderId || undefined);
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
      } else if (e instanceof AlbumMediaOnlyError) {
        // Defense-in-depth fallback: the pre-flight guards above should
        // already catch every case this could trip through today's UI, but
        // copyFileToFolder's own per-call guard is the real enforcement
        // layer, so give it the same friendly message if it's ever reached.
        Alert.alert("Can't Paste Here", e.message);
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

    // Album guard: this is the single lowest-level primitive already shared
    // by paste-copy, duplicateFile, and duplicateFolder's recursive copy —
    // the right chokepoint to enforce "an album can only ever hold photos
    // and videos" regardless of which of those three paths is calling it.
    const targetFolder = get().folders.find(f => f.id === targetFolderId);
    if (isAlbumFolder(targetFolder) && !isMediaMimeType(sourceFile.mimeType)) {
      throw new AlbumMediaOnlyError(sourceFile.name, sourceFile.mimeType);
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

    // Bug fixed here (see addFileToAlbum's comment for the full story):
    // copyFileToFolder strips sourceFile.name's extension itself before
    // calling this callback with the extension-less baseName, so a callback
    // that re-parses *its own argument* for an extension never finds one —
    // the collision check then compares an extension-less candidate against
    // extension-having existingNames and never matches. Fixed by computing
    // the final unique name up front via dedupeFileName (extension-aware)
    // against the file's own name, then handing copyFileToFolder a trivial
    // callback that returns that name's already-computed base.
    const desiredName = dedupeFileName(file.name, existingNames);
    const desiredExt = desiredName.includes('.') ? desiredName.slice(desiredName.lastIndexOf('.')) : '';
    const desiredBase = desiredExt ? desiredName.slice(0, -desiredExt.length) : desiredName;
    const uniqueName = () => desiredBase;

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

      // Give the copy its own thumbnail file rather than a shared path —
      // same rationale as pasteFromClipboard's identical fix above, and
      // copyFileToFolder's existing fix for FileMetadata.iconPath.
      let newThumbnailPath: string | undefined;
      if (sourceFolder.customThumbnailPath) {
        const ext = sourceFolder.customThumbnailPath.includes('.')
          ? sourceFolder.customThumbnailPath.slice(sourceFolder.customThumbnailPath.lastIndexOf('.'))
          : '';
        newThumbnailPath = ext
          ? `${sourceFolder.customThumbnailPath.slice(0, -ext.length)}_copy_${newId}${ext}`
          : `${sourceFolder.customThumbnailPath}_copy_${newId}`;
        try {
          await StorageService.copySandboxFile(sourceFolder.customThumbnailPath, newThumbnailPath);
        } catch (e) {
          console.error('Failed to copy folder thumbnail', e);
          newThumbnailPath = undefined;
        }
      }

      const newFolder: FolderMetadata = {
        ...sourceFolder,
        id: newId,
        name: uniqueName(sourceFolder.name),
        parentId: newParentId,
        createdAt: Date.now(),
        isTrash: false,
        deletedAt: undefined,
        trashedByFolderCascade: undefined,
        customThumbnailPath: newThumbnailPath,
      };

      newFolders.push(newFolder);

      // A trashed subfolder isn't a live part of this folder's contents — it's
      // waiting in Trash for the user to restore or permanently delete
      // independently of its (live) parent. Duplicating the parent must not
      // resurrect it as a phantom trashed node under a brand-new parent that
      // was never actually deleted (mirrors the !isTrash filter on files
      // below).
      const subfolders = srcFolders.filter(f => f.parentId === sourceFolder.id && !f.isTrash);
      for (const sub of subfolders) {
        await createFolderCopy(sub, newId);
      }

      const folderFiles = srcFiles.filter(f => f.folderId === sourceFolder.id && !f.isTrash);
      for (const file of folderFiles) {
        // skipLimitCheck: the whole subtree's bytes are validated as one
        // batch below, before this recursion starts — see assertBatchWithinStorageLimit's
        // own doc comment for why a per-file check here would be wrong.
        // Same fix as duplicateFile above, applied here (see addFileToAlbum's
        // comment for the full story): copyFileToFolder hands this callback
        // an already extension-less baseName, so re-parsing `base` for an
        // extension here always found none, and the collision check never
        // matched a real sibling collision. Compute the final unique name
        // up front with dedupeFileName (extension-aware) against the
        // source file's own name, then return just that name's base.
        const siblingNames = new Set(
          srcFiles.filter(f => f.folderId === newId && !f.isTrash).map(f => f.name)
        );
        const desiredName = dedupeFileName(file.name, siblingNames);
        const desiredExt = desiredName.includes('.') ? desiredName.slice(desiredName.lastIndexOf('.')) : '';
        const desiredBase = desiredExt ? desiredName.slice(0, -desiredExt.length) : desiredName;
        const copiedFile = await get().copyFileToFolder(file, newId, () => desiredBase, { skipLimitCheck: true });
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

  addFileToAlbum: async (fileId, albumId) => {
    const file = get().files.find(f => f.id === fileId);
    if (!file) return;

    // Dedupe against the destination album's existing names — a same-named
    // file already in the album shouldn't silently collide.
    //
    // Bug found while adding this (verified against duplicateFile, which
    // has the identical shape): copyFileToFolder strips sourceFile.name's
    // extension itself before calling the uniqueName callback it's given
    // (`uniqueName(baseName) + ext`, where baseName is already
    // extension-less) — a callback that re-parses its own argument for an
    // extension (as duplicateFile's inline closure and this one's first
    // draft both did) is comparing an extension-less candidate against
    // extension-having existingNames, so it can never actually detect a
    // collision. Fixed here by using the file's own extension-aware
    // dedupeFileName helper (already correct, already used by
    // moveFileToFolder above) to decide the *final* name up front, then
    // handing copyFileToFolder a callback that just returns that name's
    // already-computed base — letting copyFileToFolder re-append the same
    // extension it always would. (duplicateFile and duplicateFolder's
    // createFolderCopy had this same latent bug — since fixed there too,
    // using this same pattern.)
    const existingNames = new Set(
      get().files.filter(f => f.folderId === albumId && !f.isTrash).map(f => f.name)
    );
    const desiredName = dedupeFileName(file.name, existingNames);
    const desiredExt = desiredName.includes('.') ? desiredName.slice(desiredName.lastIndexOf('.')) : '';
    const desiredBase = desiredExt ? desiredName.slice(0, -desiredExt.length) : desiredName;

    // copyFileToFolder already carries the album-media-only guard (§1) and
    // the storage-limit check — both surface as thrown errors here rather
    // than an internal Alert, so the caller (MoveVaultModalWrapper's onMove
    // handler) can show one tailored message instead of two competing ones.
    const copied = await get().copyFileToFolder(file, albumId, () => desiredBase);
    await commitVaultState(set, (state) => ({ files: [...state.files, copied] }));
  },
}));

// Installed after the store exists so commitVaultState can serialize every
// persistent mutation behind the same single-flight hydration pass.
waitForVaultHydration = () => {
  const state = useVaultStore.getState();
  return state._isVaultHydrated ? Promise.resolve() : state.hydrateVault();
};
