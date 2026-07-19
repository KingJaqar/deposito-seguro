// File: src/store/vaultStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { SecureCrypto } from '../security/crypto';
import { StorageService } from '../services/storage';
import { ClipboardItem, EncryptionKeyMetadata, FileMetadata, FolderMetadata, PasteResult, UndoInfo, VaultState } from '../types';
import { useSettingsStore } from './settingsStore';
import { Alert } from 'react-native';

interface VaultStoreActions extends VaultState {
  hydrateVault: () => Promise<void>;
  createFolder: (name: string, color?: string, icon?: string, isEncrypted?: boolean, parentId?: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  importFile: (sourceUri: string, targetFolderId: string, fileName: string, mimeType: string, size: number, encrypt: boolean, encryptionKeyId?: string) => Promise<void>;
  toggleFavorite: (fileId: string) => Promise<void>;
  toggleFolderFavorite: (folderId: string, markFavorite?: boolean) => Promise<void>;
  softDeleteFile: (fileId: string) => Promise<void>;
  restoreFileFromTrash: (fileId: string) => Promise<void>;
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

export const useVaultStore = create<VaultStoreActions>((set, get) => ({
  folders: [],
  files: [],
  clipboard: null,
  undoInfo: null,
  pasteInProgress: false,
  hydrateVault: async () => {
    try {
      await StorageService.initializeSystemDirectories();
      const foldersRaw = await AsyncStorage.getItem('@vault_folders');
      const filesRaw = await AsyncStorage.getItem('@vault_files');
      const clipboardRaw = await AsyncStorage.getItem('@vault_clipboard');
      set({
        folders: foldersRaw ? JSON.parse(foldersRaw) : [],
        files: filesRaw ? JSON.parse(filesRaw) : [],
        clipboard: clipboardRaw ? JSON.parse(clipboardRaw) : null,
      });
    } catch (e) {
      console.error('Vault store context compilation failure', e);
    }
  },
  createFolder: async (name, color, icon, isEncrypted, parentId) => {
    let folderName = name?.trim() || 'New Folder';
    const { folders } = get();
    const existingNames = new Set(folders.map(f => f.name));
    let uniqueName = folderName;
    let counter = 2;
    while (existingNames.has(uniqueName)) {
      uniqueName = `${folderName} (${counter})`;
      counter++;
    }
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
    set((state) => {
      const folders = [...state.folders, newFolder];
      AsyncStorage.setItem('@vault_folders', JSON.stringify(folders)).catch(e => console.error(e));
      return { folders };
    });
  },
  deleteFolder: async (folderId) => {
    set((state) => {
      const folders = state.folders.filter(f => f.id !== folderId);
      const files = state.files.map(f => f.folderId === folderId ? { ...f, isTrash: true, deletedAt: Date.now() } : f);
      AsyncStorage.setItem('@vault_folders', JSON.stringify(folders)).catch(e => console.error(e));
      AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
      return { folders, files };
    });
  },
  importFile: async (sourceUri, targetFolderId, fileName, mimeType, size, encrypt, encryptionKeyId) => {
    const targetId = SecureCrypto.generateUUID();
    const sandboxFilename = `${targetId}_${fileName}`;
    
    const internalPath = await StorageService.copyToSandbox(sourceUri, sandboxFilename);
    let finalPath = internalPath;

    if (encrypt && encryptionKeyId) {
      const encryptionKey = useSettingsStore.getState().encryptionKeys.find((k: EncryptionKeyMetadata) => k.id === encryptionKeyId)?.key;
      if (encryptionKey) {
        finalPath = await StorageService.encryptSandboxFile(internalPath, encryptionKey);
      }
    }

    const newFile: FileMetadata = {
      id: targetId,
      folderId: targetFolderId,
      name: fileName,
      size,
      mimeType,
      localPath: finalPath,
      isEncrypted: encrypt,
      encryptionKeyId,
      isFavorite: false,
      isTrash: false,
      importedAt: Date.now()
    };

    set((state) => {
      const files = [...state.files, newFile];
      AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
      return { files };
    });
  },
  toggleFavorite: async (fileId) => {
    set((state) => {
      const files = state.files.map(f => f.id === fileId ? { ...f, isFavorite: !f.isFavorite } : f);
      AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
      return { files };
    });
  },
  toggleFolderFavorite: async (folderId, markFavorite?: boolean) => {
    set((state) => {
      const folders = state.folders.map(f => f.id === folderId ? { ...f, isFavorite: markFavorite ?? !f.isFavorite } : f);
      AsyncStorage.setItem('@vault_folders', JSON.stringify(folders)).catch(e => console.error(e));
      return { folders };
    });
  },
  softDeleteFile: async (fileId) => {
    set((state) => {
      const files = state.files.map(f => f.id === fileId ? { ...f, isTrash: true, deletedAt: Date.now() } : f);
      AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
      return { files };
    });
  },
  restoreFileFromTrash: async (fileId) => {
    set((state) => {
      const targetFile = state.files.find(f => f.id === fileId);
      if (!targetFile) return state;
      
      let targetFolderId = targetFile.folderId;
      const folderExists = state.folders.some(f => f.id === targetFile.folderId);
      
      if (!folderExists) {
        let restoredFolder = state.folders.find(f => f.name === 'Restored Files');
        if (!restoredFolder) {
          const restoredFolderId = SecureCrypto.generateUUID();
          restoredFolder = {
            id: restoredFolderId,
            name: 'Restored Files',
            color: '#34C759',
            icon: 'folder',
            isEncrypted: false,
            isFavorite: false,
            isPersonalFavoritesFolder: false,
            createdAt: Date.now()
          };
          state.folders.push(restoredFolder!);
        }
        targetFolderId = restoredFolder!.id;
      }
      
      const files = state.files.map(f => 
        f.id === fileId ? { ...f, isTrash: false, deletedAt: undefined, folderId: targetFolderId } : f
      );
      AsyncStorage.setItem('@vault_folders', JSON.stringify(state.folders)).catch(e => console.error(e));
      AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
      return { files, folders: state.folders };
    });
  },
  permanentlyDeleteFile: async (fileId) => {
    const targetFile = get().files.find(f => f.id === fileId);
    if (targetFile) {
      await removeFilePayload(targetFile);
    }
    set((state) => {
      const files = state.files.filter(f => f.id !== fileId);
      AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
      return { files };
    });
  },
  permanentlyDeleteFiles: async (fileIds) => {
    const { files } = get();

    for (const fileId of fileIds) {
      const targetFile = files.find(f => f.id === fileId);
      if (targetFile) {
        await removeFilePayload(targetFile);
      }
    }

    set((state) => {
      const files = state.files.filter(f => !fileIds.includes(f.id));
      AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
      return { files };
    });
  },
  clearEverythingState: () => set({ folders: [], files: [] }),
  renameFolder: async (folderId, newName) => {
    set((state) => {
      const folders = state.folders.map(f => f.id === folderId ? { ...f, name: newName } : f);
      AsyncStorage.setItem('@vault_folders', JSON.stringify(folders)).catch(e => console.error(e));
      return { folders };
    });
  },
  moveFolder: async (folderId, newParentId) => {
    set((state) => {
      const folders = state.folders.map(f => f.id === folderId ? { ...f, parentId: newParentId } : f);
      AsyncStorage.setItem('@vault_folders', JSON.stringify(folders)).catch(e => console.error(e));
      return { folders };
    });
  },
  renameFile: async (fileId, newName) => {
    set((state) => {
      const files = state.files.map(f => f.id === fileId ? { ...f, name: newName } : f);
      AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
      return { files };
    });
  },
  moveFileToFolder: async (fileId, targetFolderId) => {
    set((state) => {
      const files = state.files.map(f => f.id === fileId ? { ...f, folderId: targetFolderId } : f);
      AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
      return { files };
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
      set((state) => {
        const files = state.files.filter(f => f.id !== fileId);
        AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
        return { files };
      });
    }
  },
  shredMultipleFiles: async (fileIds, onProgress) => {
    const { files } = get();
    await processSequentially(fileIds, async (fileId) => {
      const targetFile = files.find(f => f.id === fileId);
      if (targetFile) {
        await removeFilePayload(targetFile);
        set((state) => {
          const updatedFiles = state.files.filter(f => f.id !== fileId);
          AsyncStorage.setItem('@vault_files', JSON.stringify(updatedFiles)).catch(e => console.error(e));
          return { files: updatedFiles };
        });
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
        set((state) => {
          const updatedFiles = state.files.filter(f => f.id !== fileId);
          AsyncStorage.setItem('@vault_files', JSON.stringify(updatedFiles)).catch(e => console.error(e));
          return { files: updatedFiles };
        });
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
    
    set((state) => {
      const updatedFiles = state.files.filter(f => f.folderId !== folderId);
      const updatedFolders = state.folders.filter(f => f.id !== folderId);
      AsyncStorage.setItem('@vault_files', JSON.stringify(updatedFiles)).catch(e => console.error(e));
      AsyncStorage.setItem('@vault_folders', JSON.stringify(updatedFolders)).catch(e => console.error(e));
      return { files: updatedFiles, folders: updatedFolders };
    });
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

    set((state) => {
      const folders = state.folders.map(f => f.id === folderId ? { ...f, hasAccessKey: true, accessKeyId: passwordId } : f);
      AsyncStorage.setItem('@vault_folders', JSON.stringify(folders)).catch(e => console.error(e));
      return { folders };
    });
  },
  assignFileAccessKey: async (fileId, passwordId) => {
    const passwordExists = useSettingsStore.getState().accessKeys.some((p) => p.id === passwordId);
    if (!passwordExists) return;

    set((state) => {
      const files = state.files.map(f => f.id === fileId ? { ...f, hasAccessKey: true, accessKeyId: passwordId } : f);
      AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
      return { files };
    });
  },
  removeFolderAccessKey: async (folderId) => {
    set((state) => {
      const folders = state.folders.map(f => f.id === folderId ? { ...f, hasAccessKey: false, accessKeyId: undefined } : f);
      AsyncStorage.setItem('@vault_folders', JSON.stringify(folders)).catch(e => console.error(e));
      return { folders };
    });
  },
  removeFileAccessKey: async (fileId) => {
    set((state) => {
      const files = state.files.map(f => f.id === fileId ? { ...f, hasAccessKey: false, accessKeyId: undefined } : f);
      AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
      return { files };
    });
  },
  assignFolderEncryptionKey: async (folderId, keyId) => {
    const keyExists = useSettingsStore.getState().encryptionKeys.some((k: EncryptionKeyMetadata) => k.id === keyId);
    if (!keyExists) return;

    set((state) => {
      const folders = state.folders.map(f => f.id === folderId ? { ...f, isEncrypted: true, encryptionKeyId: keyId } : f);
      AsyncStorage.setItem('@vault_folders', JSON.stringify(folders)).catch(e => console.error(e));
      return { folders };
    });
  },
  assignFileEncryptionKey: async (fileId, keyId) => {
    const keyExists = useSettingsStore.getState().encryptionKeys.some((k: EncryptionKeyMetadata) => k.id === keyId);
    if (!keyExists) return;

    const currentFile = get().files.find(f => f.id === fileId);
    let nextLocalPath = currentFile?.localPath;
    if (currentFile) {
      nextLocalPath = await encryptFileWithKey(currentFile, keyId);
    }

    set((state) => {
      const files = state.files.map(f => f.id === fileId ? { ...f, isEncrypted: true, encryptionKeyId: keyId, localPath: nextLocalPath ?? f.localPath } : f);
      AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
      return { files };
    });
  },
  removeFolderEncryptionKey: async (folderId) => {
    const { files, folders } = get();
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

    set((state) => {
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
      AsyncStorage.setItem('@vault_files', JSON.stringify(updatedFiles)).catch(e => console.error(e));
      AsyncStorage.setItem('@vault_folders', JSON.stringify(updatedFolders)).catch(e => console.error(e));
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

    set((state) => {
      const files = state.files.map(f => f.id === fileId ? { ...f, isEncrypted: false, encryptionKeyId: undefined, localPath: decryptedPath ?? f.localPath } : f);
      AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
      return { files };
    });
  },
  toggleFolderEncryption: async (folderId) => {
    set((state) => {
      const folders = state.folders.map(f => f.id === folderId ? { ...f, isEncrypted: Boolean(f.encryptionKeyId) } : f);
      AsyncStorage.setItem('@vault_folders', JSON.stringify(folders)).catch(e => console.error(e));
      return { folders };
    });
  },
  createPersonalFavoritesFolder: async (name) => {
    let folderName = name?.trim() || 'New Folder';
    const { folders } = get();
    const existingNames = new Set(folders.map(f => f.name));
    let uniqueName = folderName;
    let counter = 2;
    while (existingNames.has(uniqueName)) {
      uniqueName = `${folderName} (${counter})`;
      counter++;
    }
    const newFolder: FolderMetadata = {
      id: SecureCrypto.generateUUID(),
      name: uniqueName,
      isEncrypted: false,
      isFavorite: true,
      isPersonalFavoritesFolder: true,
      createdAt: Date.now()
    };
    set((state) => {
      const folders = [...state.folders, newFolder];
      AsyncStorage.setItem('@vault_folders', JSON.stringify(folders)).catch(e => console.error(e));
      return { folders };
    });
  },
  addToPersonalFavoritesFolder: async (folderId) => {
    const pf = get().folders.find(f => f.isPersonalFavoritesFolder);
    if (!pf) return;
    set((state) => {
      const folders = state.folders.map(f => f.id === folderId ? { ...f, parentId: pf.id, isFavorite: true } : f);
      AsyncStorage.setItem('@vault_folders', JSON.stringify(folders)).catch(e => console.error(e));
      return { folders };
    });
  },
  shredMultipleFolders: async (folderIds) => {
    const { files } = get();
    const filesToDelete = files.filter(f => folderIds.includes(f.folderId));

    for (const file of filesToDelete) {
      await removeFilePayload(file);
    }

    set((state) => {
      const remainingFolders = state.folders.filter(f => !folderIds.includes(f.id));
      const remainingFiles = state.files.filter(f => !folderIds.includes(f.folderId));
      
      AsyncStorage.setItem('@vault_folders', JSON.stringify(remainingFolders)).catch(e => console.error(e));
      AsyncStorage.setItem('@vault_files', JSON.stringify(remainingFiles)).catch(e => console.error(e));
      return { folders: remainingFolders, files: remainingFiles };
    });
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

    const { folders, files } = get();

    set((state) => {
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

      AsyncStorage.setItem('@vault_folders', JSON.stringify(restoredFolders)).catch(e => console.error(e));
      AsyncStorage.setItem('@vault_files', JSON.stringify(restoredFiles)).catch(e => console.error(e));

      return { folders: restoredFolders, files: restoredFiles, undoInfo: null };
    });

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
        set((state) => {
          const folders = [...state.folders, ...newFolders];
          const files = [...state.files, ...newFiles];
          AsyncStorage.setItem('@vault_folders', JSON.stringify(folders)).catch(e => console.error(e));
          AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
          return { folders, files };
        });

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

    await get().copyFileToFolder(file, file.folderId, uniqueName);
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

    set((state) => {
      const folders = [...state.folders, ...newFolders];
      const files = [...state.files, ...newFiles];
      AsyncStorage.setItem('@vault_folders', JSON.stringify(folders)).catch(e => console.error(e));
      AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
      return { folders, files };
    });
  },
}));