// File: src/types/index.ts
export type ThemeMode = 'light' | 'dark' | 'amoled';
export type DisguiseMode = 'default' | 'calculator' | 'notes' | 'utility';
export type GridListView = 'grid' | 'list';

export interface EncryptionKeyMetadata {
  id: string;
  name: string;
  description?: string;
  key: string;
  fingerprint: string;
  createdAt: number;
  /** Salt used when hashing a custom key phrase. Only present for custom phrase keys. */
  salt?: string;
}

export interface FolderMetadata {
  id: string;
  name: string;
  color?: string;
  icon?: string;
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
  isEncrypted: boolean;
  encryptionKeyId?: string;
  isFavorite: boolean;
  isTrash: boolean;
  importedAt: number;
  deletedAt?: number;
}

export interface VaultState {
  folders: FolderMetadata[];
  files: FileMetadata[];
}