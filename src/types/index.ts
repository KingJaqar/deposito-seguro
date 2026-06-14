export type ThemeMode = 'light' | 'dark' | 'amoled';
export type DisguiseMode = 'default' | 'calculator' | 'notes' | 'utility';
export type GridListView = 'grid' | 'list';

export interface FolderMetadata {
  id: string;
  name: string;
  color: string;
  icon: string;
  isEncrypted: boolean;
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
  isFavorite: boolean;
  isTrash: boolean;
  importedAt: number;
  deletedAt?: number;
}

export interface VaultState {
  folders: FolderMetadata[];
  files: FileMetadata[];
}