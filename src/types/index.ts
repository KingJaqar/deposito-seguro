// File: src/types/index.ts
export type ThemeMode = 'light' | 'dark' | 'amoled';
export type DisguiseMode = 'default' | 'calculator' | 'notes' | 'utility';
export type DisguiseIconTheme = 'default' | 'white' | 'orange' | 'red';
export type GridListView = 'list' | 'small-icons' | 'medium-icons' | 'large-icons';

export interface AccessKeyMetadata {
  id: string;
  label: string;
  description?: string;
  password: string;
  fingerprint: string;
  createdAt: number;
}

// Legacy encryption key type for backward compatibility
export interface EncryptionKeyMetadata {
  id: string;
  name: string;
  description?: string;
  key: string;
  fingerprint: string;
  createdAt: number;
}

export interface FolderMetadata {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  /**
   * undefined/'folder' = today's regular vault/subfolder (no migration
   * needed for old data — `undefined !== 'album'` naturally reads as a
   * regular folder everywhere). 'album' = a root-only, media-only
   * container (see plans/album implementation plan.md) — can never have a
   * parentId, enforced at creation (vaultStore.createFolder) and at every
   * paste/move site that could otherwise give it one.
   */
  type?: 'folder' | 'album';
  // Access key fields
  hasAccessKey?: boolean;
  accessKeyId?: string;
  // Legacy encryption fields for backward compatibility
  isEncrypted?: boolean;
  encryptionKeyId?: string;
  isFavorite: boolean;
  isPersonalFavoritesFolder: boolean;
  parentId?: string;
  createdAt: number;
  // Trash 3-segment plan §1 — mirrors FileMetadata's isTrash/deletedAt.
  // Applies uniformly to folders and albums (an album is just
  // FolderMetadata with type: 'album').
  isTrash?: boolean;
  deletedAt?: number;
  /**
   * True only when this folder was trashed as a side effect of an ancestor's
   * deleteFolder cascade — never set on the folder the user actually invoked
   * deleteFolder on. Lets restoreFolderFromTrash tell "swept in by a parent's
   * cascade" apart from "the user independently trashed this folder on its
   * own" (e.g. a subfolder deleted on its own before its parent was later
   * also deleted): only cascade-flagged descendants are pulled back in when
   * an ancestor is restored, and only transitively — a descendant is
   * restored only if every folder between it and the restore target is also
   * flagged, so restoring an ancestor never resurrects a branch the user
   * independently, deliberately trashed. See vaultStore.ts's deleteFolder/
   * restoreFolderFromTrash and their file-level equivalent below.
   */
  trashedByFolderCascade?: boolean;
  /**
   * Path to a user-picked cover image (downscaled the same way as
   * FileMetadata.iconPath), stored unencrypted like an album's auto-derived
   * cover — see plans/custom folders and album thumbnail implementation
   * plan.md's Context note. When set, this always wins over any
   * default/auto-derived thumbnail (root/sub folder generic icon, or an
   * album's own most-recent-media cover).
   */
  customThumbnailPath?: string;
}

export interface FileMetadata {
  id: string;
  folderId: string;
  name: string;
  size: number;
  mimeType: string;
  localPath: string;
  /**
   * Cache path to a small preview image extracted at import time,
   * independent of `localPath` — currently only populated for .apk files
   * (see src/services/apkIconExtractor.ts), which get the real app launcher
   * icon here instead of the generic Smartphone glyph.
   *
   * S-12 remediation: this used to always stay plaintext even when the file
   * body was marked encrypted, revealing which app was hidden to anyone
   * with filesystem access. When `iconEncrypted` is true, this path points
   * to ciphertext (same key as the file body) and must be decrypted before
   * rendering — see src/hooks/useFileThumbnailUri.ts.
   */
  iconPath?: string;
  /** True if `iconPath` above points to ciphertext, not a plaintext PNG. Only meaningful when `iconPath` is set. */
  iconEncrypted?: boolean;
  // Access key fields
  hasAccessKey?: boolean;
  accessKeyId?: string;
  // Legacy encryption fields for backward compatibility
  isEncrypted?: boolean;
  encryptionKeyId?: string;
  isFavorite: boolean;
  isTrash: boolean;
  importedAt: number;
  deletedAt?: number;
  /**
   * Device-local runtime flag set by vaultStore.reconcileMissingPayloads():
   * true when this file's metadata exists but its on-disk payload
   * (`localPath`) is gone — e.g. lost to the pre-fix image-viewer deletion
   * bug, or a sandbox wipe. Lets the UI show an honest "file no longer on
   * this device" state instead of the misleading "corrupted / decryption key
   * missing" load error. Cleared automatically if the payload reappears
   * (e.g. after a backup restore).
   */
  isMissing?: boolean;
  /** File-level counterpart to FolderMetadata.trashedByFolderCascade — see there. */
  trashedByFolderCascade?: boolean;
}

export interface ClipboardItem {
  mode: 'copy' | 'cut';
  sourceFolderId: string | null;
  folderIds: string[];
  fileIds: string[];
}

export interface PasteResult {
  pastedFiles: number;
  pastedFolders: number;
}

export interface UndoInfo {
  folders: { id: string; parentId: string | undefined }[];
  files: { id: string; folderId: string }[];
}

export interface VaultState {
  folders: FolderMetadata[];
  files: FileMetadata[];
  clipboard: ClipboardItem | null;
  undoInfo: UndoInfo | null;
  pasteInProgress: boolean;
  _isVaultHydrated: boolean;
  _vaultHydrationError: string | null;
}
