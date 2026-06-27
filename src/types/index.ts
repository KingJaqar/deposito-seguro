// File: src/types/index.ts
export type ThemeMode = 'light' | 'dark' | 'amoled';
export type DisguiseMode = 'default' | 'calculator' | 'notes' | 'utility';
export type GridListView = 'grid' | 'list';

export interface FilePasswordMetadata {
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
  // File password fields
  hasFilePassword?: boolean;
  filePasswordId?: string;
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
  // File password fields
  hasFilePassword?: boolean;
  filePasswordId?: string;
  // Legacy encryption fields for backward compatibility
  isEncrypted?: boolean;
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
