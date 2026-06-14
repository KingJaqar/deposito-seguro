import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { StorageService } from '../services/storage';
import { FileMetadata, FolderMetadata, VaultState } from '../types';
import { SecureCrypto } from '../security/crypto';

interface VaultStoreActions extends VaultState {
  hydrateVault: () => Promise<void>;
  createFolder: (name: string, color: string, icon: string, isEncrypted: boolean) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  importFile: (sourceUri: string, targetFolderId: string, fileName: string, mimeType: string, size: number, encrypt: boolean) => Promise<void>;
  toggleFavorite: (fileId: string) => Promise<void>;
  softDeleteFile: (fileId: string) => Promise<void>;
  restoreFileFromTrash: (fileId: string) => Promise<void>;
  permanentlyDeleteFile: (fileId: string) => Promise<void>;
  clearEverythingState: () => void;
}

export const useVaultStore = create<VaultStoreActions>((set, get) => ({
  folders: [],
  files: [],
  hydrateVault: async () => {
    try {
      await StorageService.initializeSystemDirectories();
      const foldersRaw = await AsyncStorage.getItem('@vault_folders');
      const filesRaw = await AsyncStorage.getItem('@vault_files');
      set({
        folders: foldersRaw ? JSON.parse(foldersRaw) : [],
        files: filesRaw ? JSON.parse(filesRaw) : []
      });
    } catch (e) {
      console.error('Vault store context compilation failure', e);
    }
  },
  createFolder: async (name, color, icon, isEncrypted) => {
    const newFolder: FolderMetadata = {
      id: SecureCrypto.generateUUID(),
      name,
      color,
      icon,
      isEncrypted,
      createdAt: Date.now()
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
  importFile: async (sourceUri, targetFolderId, fileName, mimeType, size, encrypt) => {
    const targetId = SecureCrypto.generateUUID();
    const sandboxFilename = `${targetId}_${fileName}`;
    
    const internalPath = await StorageService.copyToSandbox(sourceUri, sandboxFilename);
    let finalPath = internalPath;

    if (encrypt) {
      finalPath = await StorageService.encryptSandboxFile(internalPath);
    }

    const newFile: FileMetadata = {
      id: targetId,
      folderId: targetFolderId,
      name: fileName,
      size,
      mimeType,
      localPath: finalPath,
      isEncrypted: encrypt,
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
      
      // Check if original folder exists, create Restored Files folder if not
      let targetFolderId = targetFile.folderId;
      const folderExists = state.folders.some(f => f.id === targetFile.folderId);
      
      if (!folderExists) {
        // Find or create Restored Files folder
        let restoredFolder = state.folders.find(f => f.name === 'Restored Files');
        if (!restoredFolder) {
          const restoredFolderId = SecureCrypto.generateUUID();
          restoredFolder = {
            id: restoredFolderId,
            name: 'Restored Files',
            color: '#34C759',
            icon: 'folder',
            isEncrypted: false,
            createdAt: Date.now()
          };
          state.folders.push(restoredFolder);
        }
        targetFolderId = restoredFolder.id;
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
      await StorageService.removeSandboxFile(targetFile.localPath);
    }
    set((state) => {
      const files = state.files.filter(f => f.id !== fileId);
      AsyncStorage.setItem('@vault_files', JSON.stringify(files)).catch(e => console.error(e));
      return { files };
    });
  },
  clearEverythingState: () => set({ folders: [], files: [] })
}));