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
}

export interface FileMetadata {
  id: string;
  folderId: string;
  name: string;
  size: number;
  mimeType: string;
  localPath: string;
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
