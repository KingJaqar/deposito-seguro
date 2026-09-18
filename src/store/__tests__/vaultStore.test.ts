/**
 * Phase 0 baseline smoke test for vaultStore (see plans/deposito-seguro-audit-report.md §20).
 * Mocks @react-native-async-storage/async-storage (jest.setup.js) so this runs without a device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { useVaultStore, StorageLimitExceededError, AlbumMediaOnlyError } from '../vaultStore';
import { useSettingsStore } from '../settingsStore';
import { StorageService } from '../../services/storage';
// Deliberately `require`, not `import * as` — under this project's Babel
// CommonJS interop, `import * as X` on a plain (non-`__esModule`) jest.mock
// factory object produces a COPY of the exports, not a live reference to the
// same module.exports object vaultStore.ts's own `import { extractImageThumbnail }`
// resolves against. Spying on that copy silently does nothing to the
// function vaultStore.ts actually calls — found while writing the
// extraction-failure-fallback test below, which returned the real (mocked)
// success path no matter what `mockResolvedValueOnce` was queued. `require`
// returns the exact same object every import site sees.
const MediaThumbnailExtractor = require('../../services/mediaThumbnailExtractor') as typeof import('../../services/mediaThumbnailExtractor');

// Deliberately plain functions, not jest.fn(impl) — jest-expo's preset sets
// `resetMocks: true`, which strips mockImplementations (even ones set at
// creation time) between every test (see jest.setup.js for the same lesson
// learned on the expo-secure-store mock).
// Paths the mocked filesystem "contains". Tests mutate this to simulate a
// payload being present or gone. `mock`-prefixed so jest lets the (hoisted)
// jest.mock factory close over it.
const mockExistingPaths = new Set<string>();

jest.mock('../../services/storage', () => ({
  StorageService: {
    initializeSystemDirectories: async () => {},
    copyToSandbox: async (_uri: string, name: string) => {
      const path = `/vault/${name}`;
      mockExistingPaths.add(path);
      return path;
    },
    remuxVideoIfPossible: async (path: string) => path,
    removeSandboxFile: async () => {},
    copySandboxFile: async () => {},
    encryptSandboxFile: async (path: string) => {
      const encryptedPath = `${path}.enc`;
      mockExistingPaths.delete(path);
      mockExistingPaths.add(encryptedPath);
      return encryptedPath;
    },
    decryptSandboxFile: async (path: string) => path.replace('.enc', ''),
    fileExists: async (path: string) => mockExistingPaths.has(path),
  },
}));

// S-12: apkIconExtractor does real zip/filesystem work that isn't available
// in this Node test environment — mocked here (deterministic "success" every
// call, mirroring its own real never-throws contract) so importFile's icon-
// encryption logic (which only runs when extraction actually produced an
// iconPath) is exercised the same way it would be for a real .apk import.
jest.mock('../../services/apkIconExtractor', () => ({
  extractApkIcon: async (_apkPath: string, outputPngPath: string) => {
    mockExistingPaths.add(outputPngPath);
    return outputPngPath;
  },
}));

// Album plan §1a: same deterministic "success" every call, same reasoning
// as the apkIconExtractor mock above — expo-image-manipulator/
// expo-video-thumbnails do real native/filesystem work unavailable in this
// Node test environment, but importFile's iconPath-setting logic (which
// only runs when extraction actually produced a path) should still be
// exercised for every image/video import, not skipped.
jest.mock('../../services/mediaThumbnailExtractor', () => ({
  extractImageThumbnail: async (_imagePath: string, outputPath: string) => {
    mockExistingPaths.add(outputPath);
    return outputPath;
  },
  extractVideoThumbnail: async (_videoPath: string, outputPath: string) => {
    mockExistingPaths.add(outputPath);
    return outputPath;
  },
}));

describe('vaultStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useVaultStore.setState({ folders: [], files: [], _isVaultHydrated: true, _vaultHydrationError: null });
    useSettingsStore.setState({ accessKeys: [], encryptionKeys: [] });
    mockExistingPaths.clear();
  });

  it('starts empty', () => {
    expect(useVaultStore.getState().folders).toEqual([]);
    expect(useVaultStore.getState().files).toEqual([]);
  });

  it('createFolder adds a folder to state', async () => {
    await useVaultStore.getState().createFolder('My Folder');
    const { folders } = useVaultStore.getState();
    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe('My Folder');
  });

  it('clearEverythingState empties both folders and files', () => {
    useVaultStore.setState({
      folders: [{ id: '1', name: 'x' } as never],
      files: [{ id: '1', name: 'y' } as never],
    });
    useVaultStore.getState().clearEverythingState();
    expect(useVaultStore.getState().folders).toEqual([]);
    expect(useVaultStore.getState().files).toEqual([]);
  });

  it('waits for in-flight hydration before importing so the snapshot cannot clobber the import', async () => {
    const persistedFile = {
      id: 'persisted-file',
      folderId: 'folder-1',
      name: 'existing.txt',
      size: 10,
      mimeType: 'text/plain',
      localPath: '/vault/existing.txt',
      isEncrypted: false,
      isFavorite: false,
      isTrash: false,
      importedAt: 1,
    };
    await AsyncStorage.setItem('@vault_files', JSON.stringify([persistedFile]));

    let releaseFilesRead!: () => void;
    const filesRead = new Promise<void>((resolve) => { releaseFilesRead = resolve; });
    const originalGetItem = (AsyncStorage.getItem as jest.Mock).getMockImplementation();
    const getItemSpy = jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async (key) => {
      if (key === '@vault_files') {
        await filesRead;
        return JSON.stringify([persistedFile]);
      }
      return null;
    });

    try {
      useVaultStore.setState({ folders: [], files: [], _isVaultHydrated: false, _vaultHydrationError: null });
      const hydration = useVaultStore.getState().hydrateVault();
      const importPromise = useVaultStore.getState().importFile(
        '/picker/new.txt',
        'folder-1',
        'new.txt',
        'text/plain',
        20,
        false,
      );

      await Promise.resolve();
      expect(useVaultStore.getState().files).toHaveLength(0);

      releaseFilesRead();
      await Promise.all([hydration, importPromise]);

      expect(useVaultStore.getState().files.map((file) => file.name)).toEqual(['existing.txt', 'new.txt']);
    } finally {
      // Keep AsyncStorage's mock implementation alive for the later clipboard
      // persistence tests; restoring a spy over a jest mock can restore its
      // intentionally empty resetMocks state instead of the storage mock.
      if (originalGetItem) getItemSpy.mockImplementation(originalGetItem);
    }
  });

  describe('I-2: importFile only marks isEncrypted when encryption actually ran', () => {
    it('stays plaintext when encrypt is requested but the key id does not resolve', async () => {
      await useVaultStore.getState().importFile('/src/photo.jpg', 'folder-1', 'photo.jpg', 'image/jpeg', 100, true, 'nonexistent-key-id');
      const file = useVaultStore.getState().files[0];
      expect(file.isEncrypted).toBe(false);
      expect(file.encryptionKeyId).toBeUndefined();
    });

    it('marks isEncrypted true when the key actually resolves and encryption runs', async () => {
      useSettingsStore.setState({
        encryptionKeys: [{ id: 'key-1', name: 'k', key: 'raw-key', fingerprint: 'fp', createdAt: Date.now() }],
      });
      await useVaultStore.getState().importFile('/src/photo.jpg', 'folder-1', 'photo.jpg', 'image/jpeg', 100, true, 'key-1');
      const file = useVaultStore.getState().files[0];
      expect(file.isEncrypted).toBe(true);
      expect(file.encryptionKeyId).toBe('key-1');
      expect(file.localPath.endsWith('.enc')).toBe(true);
    });
  });

  describe('S-12: importFile encrypts the extracted .apk icon cache alongside the file body', () => {
    const APK_MIME = 'application/vnd.android.package-archive';

    it('leaves the icon plaintext when the file itself is not encrypted', async () => {
      await useVaultStore.getState().importFile('/src/app.apk', 'folder-1', 'app.apk', APK_MIME, 100, false);
      const file = useVaultStore.getState().files[0];
      expect(file.iconPath).toBeDefined();
      expect(file.iconPath?.endsWith('.enc')).toBe(false);
      expect(file.iconEncrypted).toBe(false);
    });

    it('encrypts the icon under the same key once the file body encryption actually succeeds', async () => {
      useSettingsStore.setState({
        encryptionKeys: [{ id: 'key-1', name: 'k', key: 'raw-key', fingerprint: 'fp', createdAt: Date.now() }],
      });
      await useVaultStore.getState().importFile('/src/app.apk', 'folder-1', 'app.apk', APK_MIME, 100, true, 'key-1');
      const file = useVaultStore.getState().files[0];
      expect(file.isEncrypted).toBe(true);
      expect(file.iconPath).toBeDefined();
      expect(file.iconPath?.endsWith('.enc')).toBe(true);
      expect(file.iconEncrypted).toBe(true);
    });

    it('leaves the icon plaintext (and unmarked) when encrypt is requested but the key id does not resolve', async () => {
      // Mirrors the existing I-2 case above: didEncrypt stays false, and the
      // icon-encrypt branch is gated on the same successful key resolution.
      await useVaultStore.getState().importFile('/src/app.apk', 'folder-1', 'app.apk', APK_MIME, 100, true, 'nonexistent-key-id');
      const file = useVaultStore.getState().files[0];
      expect(file.isEncrypted).toBe(false);
      expect(file.iconPath?.endsWith('.enc')).toBe(false);
      expect(file.iconEncrypted).toBe(false);
    });
  });

  describe('I-9: assignFolderEncryptionKey cascades to files in the folder', () => {
    it('encrypts existing non-trashed files in the folder', async () => {
      useSettingsStore.setState({
        encryptionKeys: [{ id: 'key-1', name: 'k', key: 'raw-key', fingerprint: 'fp', createdAt: Date.now() }],
      });
      await useVaultStore.getState().createFolder('Secrets');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 10, false);

      await useVaultStore.getState().assignFolderEncryptionKey(folderId, 'key-1');

      const folder = useVaultStore.getState().folders.find(f => f.id === folderId)!;
      const file = useVaultStore.getState().files.find(f => f.folderId === folderId)!;
      expect(folder.isEncrypted).toBe(true);
      expect(file.isEncrypted).toBe(true);
      expect(file.encryptionKeyId).toBe('key-1');
      expect(file.localPath.endsWith('.enc')).toBe(true);
    });
  });

  describe('I-10: toggleFolderEncryption is a real toggle', () => {
    it('alternates isEncrypted when a key is assigned', async () => {
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;
      useVaultStore.setState({
        folders: useVaultStore.getState().folders.map(f => f.id === folderId ? { ...f, encryptionKeyId: 'key-1', isEncrypted: true } : f),
      });

      await useVaultStore.getState().toggleFolderEncryption(folderId);
      expect(useVaultStore.getState().folders.find(f => f.id === folderId)!.isEncrypted).toBe(false);

      await useVaultStore.getState().toggleFolderEncryption(folderId);
      expect(useVaultStore.getState().folders.find(f => f.id === folderId)!.isEncrypted).toBe(true);
    });

    it('cannot be turned on without an assigned key', async () => {
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().toggleFolderEncryption(folderId);
      expect(useVaultStore.getState().folders.find(f => f.id === folderId)!.isEncrypted).toBe(false);
    });
  });

  describe('I-12: restoreFileFromTrash reports when the original folder is gone', () => {
    it('reports landedInFallbackFolder=false when the original folder still exists', async () => {
      await useVaultStore.getState().createFolder('Home');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 10, false);
      const fileId = useVaultStore.getState().files[0].id;
      await useVaultStore.getState().softDeleteFile(fileId);

      const result = await useVaultStore.getState().restoreFileFromTrash(fileId);
      expect(result.landedInFallbackFolder).toBe(false);
      expect(useVaultStore.getState().files.find(f => f.id === fileId)!.folderId).toBe(folderId);
    });

    it('reports landedInFallbackFolder=true and reroutes into a dated "Restored Files – ..." folder when the original folder is trashed', async () => {
      // Trash 3-segment plan §2a/§2d: deleteFolder is now a soft-delete (the
      // folder record still exists, just isTrash: true) and the fallback
      // folder's name is a freshly dated one instead of the old static
      // 'Restored Files' — unreachability is now isContainerUnreachable
      // (a trashed-but-still-present parent counts), not mere non-existence.
      await useVaultStore.getState().createFolder('Home');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 10, false);
      const fileId = useVaultStore.getState().files[0].id;
      await useVaultStore.getState().softDeleteFile(fileId);
      await useVaultStore.getState().deleteFolder(folderId);

      // The original folder still exists in state — just trashed.
      expect(useVaultStore.getState().folders.find(f => f.id === folderId)!.isTrash).toBe(true);

      const result = await useVaultStore.getState().restoreFileFromTrash(fileId);
      expect(result.landedInFallbackFolder).toBe(true);
      const restoredFolder = useVaultStore.getState().folders.find(f => f.name.startsWith('Restored Files'));
      expect(restoredFolder).toBeDefined();
      expect(restoredFolder!.id).not.toBe(folderId);
      expect(useVaultStore.getState().files.find(f => f.id === fileId)!.folderId).toBe(restoredFolder!.id);
    });

    it('deleteFolder snapshots the folder\'s access key onto a file that had none of its own (file trashed before the folder is deleted)', async () => {
      useSettingsStore.setState({
        accessKeys: [{ id: 'pw-1', label: 'p', password: 'secret', fingerprint: 'fp', createdAt: Date.now() }],
      });
      await useVaultStore.getState().createFolder('Locked');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().assignFolderAccessKey(folderId, 'pw-1');
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 10, false);
      const fileId = useVaultStore.getState().files[0].id;
      expect(useVaultStore.getState().files[0].hasAccessKey).toBeFalsy();

      await useVaultStore.getState().softDeleteFile(fileId);
      await useVaultStore.getState().deleteFolder(folderId);

      const trashedFile = useVaultStore.getState().files.find(f => f.id === fileId)!;
      expect(trashedFile.hasAccessKey).toBe(true);
      expect(trashedFile.accessKeyId).toBe('pw-1');

      const result = await useVaultStore.getState().restoreFileFromTrash(fileId);
      expect(result.landedInFallbackFolder).toBe(true);
      expect(result.filePreservedAccessKey).toBe(true);
      const restoredFile = useVaultStore.getState().files.find(f => f.id === fileId)!;
      expect(restoredFile.hasAccessKey).toBe(true);
      expect(restoredFile.accessKeyId).toBe('pw-1');
    });

    it('deleteFolder snapshots the access key even when it cascades the file into trash itself (folder deleted while the file was still active)', async () => {
      useSettingsStore.setState({
        accessKeys: [{ id: 'pw-1', label: 'p', password: 'secret', fingerprint: 'fp', createdAt: Date.now() }],
      });
      await useVaultStore.getState().createFolder('Locked');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().assignFolderAccessKey(folderId, 'pw-1');
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 10, false);
      const fileId = useVaultStore.getState().files[0].id;

      await useVaultStore.getState().deleteFolder(folderId);

      const trashedFile = useVaultStore.getState().files.find(f => f.id === fileId)!;
      expect(trashedFile.isTrash).toBe(true);
      expect(trashedFile.hasAccessKey).toBe(true);
      expect(trashedFile.accessKeyId).toBe('pw-1');
    });

    it('does not overwrite a file\'s own access key with the folder\'s on delete', async () => {
      useSettingsStore.setState({
        accessKeys: [
          { id: 'pw-folder', label: 'f', password: 'secret', fingerprint: 'fp1', createdAt: Date.now() },
          { id: 'pw-file', label: 'o', password: 'secret2', fingerprint: 'fp2', createdAt: Date.now() },
        ],
      });
      await useVaultStore.getState().createFolder('Locked');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().assignFolderAccessKey(folderId, 'pw-folder');
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 10, false);
      const fileId = useVaultStore.getState().files[0].id;
      await useVaultStore.getState().assignFileAccessKey(fileId, 'pw-file');

      await useVaultStore.getState().deleteFolder(folderId);

      const trashedFile = useVaultStore.getState().files.find(f => f.id === fileId)!;
      expect(trashedFile.accessKeyId).toBe('pw-file');
    });

    it('I-12 follow-up: inherits an access key from a locked GRANDPARENT folder when the unlocked immediate parent is the one deleted', async () => {
      useSettingsStore.setState({
        accessKeys: [{ id: 'pw-1', label: 'p', password: 'secret', fingerprint: 'fp', createdAt: Date.now() }],
      });
      await useVaultStore.getState().createFolder('Locked');
      const lockedId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().assignFolderAccessKey(lockedId, 'pw-1');
      await useVaultStore.getState().createFolder('Sub', undefined, undefined, undefined, lockedId);
      const subId = useVaultStore.getState().folders.find(f => f.name === 'Sub')!.id;
      // Sub itself is never locked directly — only reachable by first
      // unlocking Locked. The old single-level check only looked at
      // Sub.hasAccessKey (false) and missed this entirely.
      expect(useVaultStore.getState().folders.find(f => f.id === subId)!.hasAccessKey).toBeFalsy();

      await useVaultStore.getState().importFile('/src/a.jpg', subId, 'a.jpg', 'image/jpeg', 10, false);
      const fileId = useVaultStore.getState().files[0].id;

      // Delete the unlocked immediate parent, not the locked grandparent —
      // an entirely ordinary action that never touches Locked directly.
      await useVaultStore.getState().deleteFolder(subId);

      const trashedFile = useVaultStore.getState().files.find(f => f.id === fileId)!;
      expect(trashedFile.isTrash).toBe(true);
      expect(trashedFile.hasAccessKey).toBe(true);
      expect(trashedFile.accessKeyId).toBe('pw-1');
    });
  });

  describe('Trash 3-segment plan §2a/§2b/§2c: folder cascade trash/shred/restore', () => {
    it('deleteFolder cascades isTrash onto a nested subfolder AND that subfolder\'s own files (orphan-bug fix)', async () => {
      await useVaultStore.getState().createFolder('Root');
      const rootId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().createFolder('Sub', undefined, undefined, undefined, rootId);
      const subId = useVaultStore.getState().folders.find(f => f.name === 'Sub')!.id;
      await useVaultStore.getState().importFile('/src/a.jpg', subId, 'a.jpg', 'image/jpeg', 10, false);
      const fileId = useVaultStore.getState().files[0].id;

      await useVaultStore.getState().deleteFolder(rootId);

      const state = useVaultStore.getState();
      expect(state.folders.find(f => f.id === rootId)!.isTrash).toBe(true);
      expect(state.folders.find(f => f.id === subId)!.isTrash).toBe(true);
      // Both folder records still exist (soft-delete, not removed).
      expect(state.folders).toHaveLength(2);
      // The subfolder's own file — previously orphaned (never trashed) — is
      // now trashed too.
      expect(state.files.find(f => f.id === fileId)!.isTrash).toBe(true);
    });

    it('shredFolder cascades permanent removal onto every descendant folder and file', async () => {
      await useVaultStore.getState().createFolder('Root');
      const rootId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().createFolder('Sub', undefined, undefined, undefined, rootId);
      const subId = useVaultStore.getState().folders.find(f => f.name === 'Sub')!.id;
      await useVaultStore.getState().importFile('/src/a.jpg', rootId, 'a.jpg', 'image/jpeg', 10, false);
      await useVaultStore.getState().importFile('/src/b.jpg', subId, 'b.jpg', 'image/jpeg', 10, false);

      await useVaultStore.getState().shredFolder(rootId);

      const state = useVaultStore.getState();
      expect(state.folders).toHaveLength(0);
      expect(state.files).toHaveLength(0);
    });

    it('shredMultipleFolders cascades permanent removal across a batch of folders and their descendants', async () => {
      await useVaultStore.getState().createFolder('A');
      const aId = useVaultStore.getState().folders.find(f => f.name === 'A')!.id;
      await useVaultStore.getState().createFolder('A-Sub', undefined, undefined, undefined, aId);
      const aSubId = useVaultStore.getState().folders.find(f => f.name === 'A-Sub')!.id;
      await useVaultStore.getState().createFolder('B');
      const bId = useVaultStore.getState().folders.find(f => f.name === 'B')!.id;
      await useVaultStore.getState().importFile('/src/a.jpg', aSubId, 'a.jpg', 'image/jpeg', 10, false);
      await useVaultStore.getState().importFile('/src/b.jpg', bId, 'b.jpg', 'image/jpeg', 10, false);

      await useVaultStore.getState().shredMultipleFolders([aId, bId]);

      const state = useVaultStore.getState();
      expect(state.folders).toHaveLength(0);
      expect(state.files).toHaveLength(0);
    });

    it('restoreFolderFromTrash restores a whole trashed subtree together, back to its original location', async () => {
      await useVaultStore.getState().createFolder('Root');
      const rootId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().createFolder('Sub', undefined, undefined, undefined, rootId);
      const subId = useVaultStore.getState().folders.find(f => f.name === 'Sub')!.id;
      await useVaultStore.getState().importFile('/src/a.jpg', subId, 'a.jpg', 'image/jpeg', 10, false);
      const fileId = useVaultStore.getState().files[0].id;

      await useVaultStore.getState().deleteFolder(rootId);
      const result = await useVaultStore.getState().restoreFolderFromTrash(rootId);

      expect(result.landedInFallbackFolder).toBe(false);
      expect(result.parentId).toBeUndefined(); // Root's own parent (root of vault) is unchanged.
      const state = useVaultStore.getState();
      expect(state.folders.find(f => f.id === rootId)!.isTrash).toBe(false);
      expect(state.folders.find(f => f.id === subId)!.isTrash).toBe(false);
      expect(state.folders.find(f => f.id === subId)!.parentId).toBe(rootId);
      expect(state.files.find(f => f.id === fileId)!.isTrash).toBe(false);
    });

    it('restoreFolderFromTrash lands a subfolder in a dated fallback folder when its trashed parent is not also being restored', async () => {
      await useVaultStore.getState().createFolder('Root');
      const rootId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().createFolder('Sub', undefined, undefined, undefined, rootId);
      const subId = useVaultStore.getState().folders.find(f => f.name === 'Sub')!.id;

      await useVaultStore.getState().deleteFolder(rootId); // trashes both Root and Sub

      // Restore Sub alone — Root is still trashed, so Sub's parent is unreachable.
      const result = await useVaultStore.getState().restoreFolderFromTrash(subId);
      expect(result.landedInFallbackFolder).toBe(true);

      const state = useVaultStore.getState();
      const sub = state.folders.find(f => f.id === subId)!;
      expect(sub.isTrash).toBe(false);
      expect(sub.parentId).not.toBe(rootId);
      const fallback = state.folders.find(f => f.id === sub.parentId);
      expect(fallback).toBeDefined();
      expect(fallback!.name.startsWith('Restored Files')).toBe(true);
      // Root itself is untouched — still trashed.
      expect(state.folders.find(f => f.id === rootId)!.isTrash).toBe(true);
    });

    it('restoreFoldersFromTrash shares one dated fallback folder across a batch', async () => {
      await useVaultStore.getState().createFolder('A');
      const aId = useVaultStore.getState().folders.find(f => f.name === 'A')!.id;
      await useVaultStore.getState().createFolder('B');
      const bId = useVaultStore.getState().folders.find(f => f.name === 'B')!.id;
      await useVaultStore.getState().createFolder('A-Sub', undefined, undefined, undefined, aId);
      const aSubId = useVaultStore.getState().folders.find(f => f.name === 'A-Sub')!.id;
      await useVaultStore.getState().createFolder('B-Sub', undefined, undefined, undefined, bId);
      const bSubId = useVaultStore.getState().folders.find(f => f.name === 'B-Sub')!.id;

      await useVaultStore.getState().deleteFolder(aId);
      await useVaultStore.getState().deleteFolder(bId);

      // Restore only the subfolders — their trashed parents (A, B) are not
      // being restored in this call, so both need the fallback.
      const results = await useVaultStore.getState().restoreFoldersFromTrash([aSubId, bSubId]);
      expect(results.every(r => r.landedInFallbackFolder)).toBe(true);
      const aSubParent = results.find(r => r.folderId === aSubId)!.parentId;
      const bSubParent = results.find(r => r.folderId === bSubId)!.parentId;
      expect(aSubParent).toBe(bSubParent); // one shared fallback folder for the whole batch

      const fallbackFolders = useVaultStore.getState().folders.filter(f => f.name.startsWith('Restored Files'));
      expect(fallbackFolders).toHaveLength(1);
    });

    it('restoreFilesFromTrash shares one dated fallback folder across a batch of files', async () => {
      await useVaultStore.getState().createFolder('A');
      const aId = useVaultStore.getState().folders.find(f => f.name === 'A')!.id;
      await useVaultStore.getState().createFolder('B');
      const bId = useVaultStore.getState().folders.find(f => f.name === 'B')!.id;
      await useVaultStore.getState().importFile('/src/a.jpg', aId, 'a.jpg', 'image/jpeg', 10, false);
      const fileAId = useVaultStore.getState().files[0].id;
      await useVaultStore.getState().importFile('/src/b.jpg', bId, 'b.jpg', 'image/jpeg', 10, false);
      const fileBId = useVaultStore.getState().files.find(f => f.name === 'b.jpg')!.id;
      await useVaultStore.getState().softDeleteFile(fileAId);
      await useVaultStore.getState().softDeleteFile(fileBId);
      await useVaultStore.getState().deleteFolder(aId);
      await useVaultStore.getState().deleteFolder(bId);

      const results = await useVaultStore.getState().restoreFilesFromTrash([fileAId, fileBId]);
      expect(results.every(r => r.landedInFallbackFolder)).toBe(true);
      expect(results[0].folderId).toBe(results[1].folderId); // one shared fallback folder

      const fallbackFolders = useVaultStore.getState().folders.filter(f => f.name.startsWith('Restored Files'));
      expect(fallbackFolders).toHaveLength(1);
    });

    it('restoreFoldersFromTrash keeps a subtree together regardless of which order its folders are selected in (order-dependence regression)', async () => {
      // Parent and its own cascade-trashed child are both selected for
      // restore in the same call. Whichever order they're processed in must
      // not matter: the child must land back under the restored parent, not
      // in its own new fallback folder.
      await useVaultStore.getState().createFolder('Parent');
      const parentId = useVaultStore.getState().folders.find(f => f.name === 'Parent')!.id;
      await useVaultStore.getState().createFolder('Child', undefined, undefined, undefined, parentId);
      const childId = useVaultStore.getState().folders.find(f => f.name === 'Child')!.id;

      await useVaultStore.getState().deleteFolder(parentId); // cascades onto Child too

      // Child-before-parent: the order that previously triggered the split.
      const results = await useVaultStore.getState().restoreFoldersFromTrash([childId, parentId]);

      expect(results.every(r => !r.landedInFallbackFolder)).toBe(true);
      const fallbackFolders = useVaultStore.getState().folders.filter(f => f.name.startsWith('Restored Files'));
      expect(fallbackFolders).toHaveLength(0);

      const restoredParent = useVaultStore.getState().folders.find(f => f.id === parentId)!;
      const restoredChild = useVaultStore.getState().folders.find(f => f.id === childId)!;
      expect(restoredParent.isTrash).toBe(false);
      expect(restoredParent.parentId).toBeUndefined();
      expect(restoredChild.isTrash).toBe(false);
      expect(restoredChild.parentId).toBe(parentId); // still nested under Parent, not split off
    });
  });

  describe('Cascade-vs-independent trash review fix: restoring a folder must not resurrect items the user independently, separately trashed', () => {
    it('restoreFolderFromTrash leaves a file the user individually trashed BEFORE the folder was ever deleted still in the trash', async () => {
      await useVaultStore.getState().createFolder('Vacation');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/keep.jpg', folderId, 'keep.jpg', 'image/jpeg', 10, false);
      const keepId = useVaultStore.getState().files.find(f => f.name === 'keep.jpg')!.id;
      await useVaultStore.getState().importFile('/src/junk.jpg', folderId, 'junk.jpg', 'image/jpeg', 10, false);
      const junkId = useVaultStore.getState().files.find(f => f.name === 'junk.jpg')!.id;

      // User deliberately trashes one photo on its own, well before ever
      // touching the containing folder.
      await useVaultStore.getState().softDeleteFile(junkId);
      const junkDeletedAtBeforeCascade = useVaultStore.getState().files.find(f => f.id === junkId)!.deletedAt;

      // Later, the whole folder gets trashed (cascading onto `keep.jpg`,
      // which was still live) and then restored.
      await useVaultStore.getState().deleteFolder(folderId);
      await useVaultStore.getState().restoreFolderFromTrash(folderId);

      const state = useVaultStore.getState();
      // The folder and the file that was only ever cascade-trashed are back.
      expect(state.folders.find(f => f.id === folderId)!.isTrash).toBe(false);
      expect(state.files.find(f => f.id === keepId)!.isTrash).toBe(false);
      // The independently-trashed file stays exactly as the user left it —
      // still trashed, with its original deletion timestamp untouched.
      const junk = state.files.find(f => f.id === junkId)!;
      expect(junk.isTrash).toBe(true);
      expect(junk.deletedAt).toBe(junkDeletedAtBeforeCascade);
      expect(junk.trashedByFolderCascade).toBeFalsy();
    });

    it('restoreFolderFromTrash leaves an independently-trashed SUBFOLDER (and everything under it) behind, even when restoring an ancestor several levels up', async () => {
      await useVaultStore.getState().createFolder('Root');
      const rootId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().createFolder('Mid', undefined, undefined, undefined, rootId);
      const midId = useVaultStore.getState().folders.find(f => f.name === 'Mid')!.id;
      await useVaultStore.getState().createFolder('IndependentlyTrashed', undefined, undefined, undefined, midId);
      const indieId = useVaultStore.getState().folders.find(f => f.name === 'IndependentlyTrashed')!.id;
      await useVaultStore.getState().importFile('/src/a.jpg', indieId, 'a.jpg', 'image/jpeg', 10, false);
      const fileInIndieId = useVaultStore.getState().files[0].id;

      // User trashes the deepest subfolder on its own first...
      await useVaultStore.getState().deleteFolder(indieId);
      // ...then, separately, trashes the whole Root/Mid tree above it.
      await useVaultStore.getState().deleteFolder(rootId);

      // Restoring Root should bring Mid back, but NOT the independently
      // trashed subfolder (or its file) sitting underneath it.
      const result = await useVaultStore.getState().restoreFolderFromTrash(rootId);
      expect(result.landedInFallbackFolder).toBe(false);

      const state = useVaultStore.getState();
      expect(state.folders.find(f => f.id === rootId)!.isTrash).toBe(false);
      expect(state.folders.find(f => f.id === midId)!.isTrash).toBe(false);
      // Independently trashed subtree: untouched, still trashed, still
      // parented under Mid (no reparenting into a fallback folder either —
      // it was never part of this restore).
      const indie = state.folders.find(f => f.id === indieId)!;
      expect(indie.isTrash).toBe(true);
      expect(indie.parentId).toBe(midId);
      expect(state.files.find(f => f.id === fileInIndieId)!.isTrash).toBe(true);
    });

    it('deleteFolder never overwrites the deletedAt of a file that was already independently trashed', async () => {
      await useVaultStore.getState().createFolder('Folder');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 10, false);
      const fileId = useVaultStore.getState().files[0].id;
      await useVaultStore.getState().softDeleteFile(fileId);
      const originalDeletedAt = useVaultStore.getState().files.find(f => f.id === fileId)!.deletedAt;

      await new Promise(r => setTimeout(r, 5));
      await useVaultStore.getState().deleteFolder(folderId);

      expect(useVaultStore.getState().files.find(f => f.id === fileId)!.deletedAt).toBe(originalDeletedAt);
    });

    it('buildDatedFallbackFolder dedupes its name against existing root folders instead of creating two visually-identical folders', async () => {
      await useVaultStore.getState().createFolder('A');
      const aId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', aId, 'a.jpg', 'image/jpeg', 10, false);
      const fileAId = useVaultStore.getState().files[0].id;
      await useVaultStore.getState().deleteFolder(aId);
      const first = await useVaultStore.getState().restoreFileFromTrash(fileAId);

      await useVaultStore.getState().createFolder('B');
      const bId = useVaultStore.getState().folders.find(f => f.name === 'B')!.id;
      await useVaultStore.getState().importFile('/src/b.jpg', bId, 'b.jpg', 'image/jpeg', 10, false);
      const fileBId = useVaultStore.getState().files.find(f => f.name === 'b.jpg')!.id;
      await useVaultStore.getState().deleteFolder(bId);

      // Force the same displayed name as the first fallback folder by
      // freezing Date so the label collides, simulating two restores inside
      // the same wall-clock second.
      const realToLocaleString = Date.prototype.toLocaleString;
      const firstFolder = useVaultStore.getState().folders.find(f => f.id === first.folderId)!;
      jest.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function (this: Date, ...args: any[]) {
        return firstFolder.name.replace('Restored Files – ', '');
      });
      try {
        const second = await useVaultStore.getState().restoreFileFromTrash(fileBId);
        const secondFolder = useVaultStore.getState().folders.find(f => f.id === second.folderId)!;
        expect(secondFolder.id).not.toBe(firstFolder.id);
        expect(secondFolder.name).not.toBe(firstFolder.name);
        expect(secondFolder.name.startsWith(firstFolder.name)).toBe(true); // "... (2)" style suffix
      } finally {
        Date.prototype.toLocaleString = realToLocaleString;
      }
    });
  });

  describe('I-11 residual: clipboard persistence durability on a simulated AsyncStorage failure', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('persists normally when AsyncStorage succeeds', async () => {
      await useVaultStore.getState().copyToClipboard([], ['file-1'], null);

      expect(useVaultStore.getState().clipboard).toEqual({ mode: 'copy', sourceFolderId: null, folderIds: [], fileIds: ['file-1'] });
      const stored = JSON.parse((await AsyncStorage.getItem('@vault_clipboard')) as string);
      expect(stored.fileIds).toEqual(['file-1']);
    });

    it('copyToClipboard swallows a persist failure: in-memory clipboard state still applies, no rejection reaches the caller', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

      await expect(useVaultStore.getState().copyToClipboard([], ['file-1'], null)).resolves.toBeUndefined();

      expect(useVaultStore.getState().clipboard?.fileIds).toEqual(['file-1']);
    });

    it('clearClipboard swallows a persist failure the same way', async () => {
      await useVaultStore.getState().copyToClipboard([], ['file-1'], null);
      jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('disk full'));

      await expect(useVaultStore.getState().clearClipboard()).resolves.toBeUndefined();

      expect(useVaultStore.getState().clipboard).toBeNull();
    });
  });

  describe('reconcileMissingPayloads flags files whose on-disk payload is gone', () => {
    const mkFile = (id: string, localPath: string, extra: Partial<import('../../types').FileMetadata> = {}) =>
      ({ id, folderId: 'f', name: id, size: 10, mimeType: 'image/jpeg', localPath, isFavorite: false, isTrash: false, importedAt: 0, ...extra }) as import('../../types').FileMetadata;

    it('marks a file isMissing when its payload does not exist, and leaves present ones untouched', async () => {
      mockExistingPaths.add('/vault/present.jpg');
      useVaultStore.setState({
        files: [mkFile('present', '/vault/present.jpg'), mkFile('gone', '/vault/gone.jpg')],
      });

      await useVaultStore.getState().reconcileMissingPayloads();

      const byId = Object.fromEntries(useVaultStore.getState().files.map(f => [f.id, f]));
      expect(byId.present.isMissing).toBeFalsy();
      expect(byId.gone.isMissing).toBe(true);
    });

    it('clears a stale isMissing flag once the payload reappears (e.g. after restore)', async () => {
      useVaultStore.setState({ files: [mkFile('back', '/vault/back.jpg', { isMissing: true })] });
      mockExistingPaths.add('/vault/back.jpg');

      await useVaultStore.getState().reconcileMissingPayloads();

      expect(useVaultStore.getState().files[0].isMissing).toBe(false);
    });

    it('is a no-op (no state change) when every flag is already correct', async () => {
      mockExistingPaths.add('/vault/here.jpg');
      const files = [mkFile('here', '/vault/here.jpg')];
      useVaultStore.setState({ files });

      await useVaultStore.getState().reconcileMissingPayloads();

      // Same array reference back means no write/rebuild happened.
      expect(useVaultStore.getState().files).toBe(files);
    });
  });

  describe('Storage limit threshold (settings-driven import cap)', () => {
    afterEach(() => {
      useSettingsStore.setState({ storageLimitBytes: null });
    });

    it('getVaultUsageBytes sums every file, trashed items included', async () => {
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 100, false);
      await useVaultStore.getState().importFile('/src/b.jpg', folderId, 'b.jpg', 'image/jpeg', 250, false);
      const [fileA] = useVaultStore.getState().files;
      await useVaultStore.getState().softDeleteFile(fileA.id);

      // Trashed bytes still occupy the sandbox until permanently deleted/shredded.
      expect(useVaultStore.getState().getVaultUsageBytes()).toBe(350);
    });

    it('allows an import that fits under the configured limit', async () => {
      useSettingsStore.setState({ storageLimitBytes: 1000 });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;

      await expect(
        useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 999, false)
      ).resolves.toBeUndefined();
      expect(useVaultStore.getState().files).toHaveLength(1);
    });

    it('rejects an import that would exceed the configured limit, without touching the filesystem or vault state', async () => {
      useSettingsStore.setState({ storageLimitBytes: 1000 });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;

      await expect(
        useVaultStore.getState().importFile('/src/big.mp4', folderId, 'big.mp4', 'video/mp4', 1001, false)
      ).rejects.toBeInstanceOf(StorageLimitExceededError);
      // Nothing should have been written to vault state on rejection.
      expect(useVaultStore.getState().files).toHaveLength(0);
    });

    it('rejects once existing usage plus the new file would cross the limit', async () => {
      useSettingsStore.setState({ storageLimitBytes: 1000 });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 700, false);

      await expect(
        useVaultStore.getState().importFile('/src/b.jpg', folderId, 'b.jpg', 'image/jpeg', 400, false)
      ).rejects.toBeInstanceOf(StorageLimitExceededError);
      expect(useVaultStore.getState().files).toHaveLength(1);
    });

    it('pads the projected size for encrypted imports so ciphertext growth cannot silently cross the limit', async () => {
      useSettingsStore.setState({
        storageLimitBytes: 1000,
        encryptionKeys: [{ id: 'key-1', name: 'k', key: 'raw-key', fingerprint: 'fp', createdAt: Date.now() }],
      });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;

      // 800 raw bytes, encrypted -> projected ~1120 bytes (1.4x), over the 1000-byte limit.
      await expect(
        useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 800, true, 'key-1')
      ).rejects.toBeInstanceOf(StorageLimitExceededError);
      expect(useVaultStore.getState().files).toHaveLength(0);
    });

    it('never blocks imports when the limit is Unlimited (null)', async () => {
      useSettingsStore.setState({ storageLimitBytes: null });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;

      await expect(
        useVaultStore.getState().importFile('/src/huge.mp4', folderId, 'huge.mp4', 'video/mp4', 999_999_999, false)
      ).resolves.toBeUndefined();
      expect(useVaultStore.getState().files).toHaveLength(1);
    });
  });

  describe('I-22: copy/paste/duplicate respects the storage limit (previously only importFile enforced it)', () => {
    it('copyFileToFolder rejects a copy that would exceed the configured limit', async () => {
      useSettingsStore.setState({ storageLimitBytes: 1000 });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 900, false);
      const [sourceFile] = useVaultStore.getState().files;

      // Copying a 900-byte file when 900 is already used would land at 1800,
      // over the 1000-byte limit.
      await expect(
        useVaultStore.getState().copyFileToFolder(sourceFile, folderId)
      ).rejects.toBeInstanceOf(StorageLimitExceededError);
      expect(useVaultStore.getState().files).toHaveLength(1);
    });

    it('copyFileToFolder allows a copy that fits under the limit', async () => {
      useSettingsStore.setState({ storageLimitBytes: 1000 });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 200, false);
      const [sourceFile] = useVaultStore.getState().files;

      await expect(
        useVaultStore.getState().copyFileToFolder(sourceFile, folderId, (base) => `${base} (copy)`)
      ).resolves.toEqual(expect.objectContaining({ name: expect.stringContaining('copy') }));
    });

    it('duplicateFile does not grow vault state when the duplicate would exceed the limit', async () => {
      useSettingsStore.setState({ storageLimitBytes: 1000 });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 900, false);
      const [fileToDuplicate] = useVaultStore.getState().files;

      // duplicateFile catches StorageLimitExceededError internally (shows an
      // Alert instead of rejecting) — asserting on state, not a rejection,
      // is the correct way to observe the limit was actually enforced.
      await expect(useVaultStore.getState().duplicateFile(fileToDuplicate.id)).resolves.toBeUndefined();
      expect(useVaultStore.getState().files).toHaveLength(1);
    });

    it('duplicateFile grows vault state by one when the duplicate fits under the limit', async () => {
      useSettingsStore.setState({ storageLimitBytes: 1000 });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 200, false);
      const [fileToDuplicate] = useVaultStore.getState().files;

      await useVaultStore.getState().duplicateFile(fileToDuplicate.id);
      expect(useVaultStore.getState().files).toHaveLength(2);
    });

    it('duplicateFile names the copy "a (2).jpg", not a second "a.jpg" (regression: copyFileToFolder already strips the extension before calling uniqueName, so re-parsing baseName for an extension inside the closure always found none and missed the collision)', async () => {
      useSettingsStore.setState({ storageLimitBytes: 10000 });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 200, false);
      const [fileToDuplicate] = useVaultStore.getState().files;

      await useVaultStore.getState().duplicateFile(fileToDuplicate.id);

      const names = useVaultStore.getState().files.map(f => f.name).sort();
      expect(names).toEqual(['a (2).jpg', 'a.jpg']);
    });
  });

  describe('I-22 follow-up: batch storage-limit checks catch what a per-file check misses', () => {
    const mkFile = (id: string, folderId: string, size: number) =>
      ({ id, folderId, name: id, size, mimeType: 'image/jpeg', localPath: `/vault/${id}.jpg`, isFavorite: false, isTrash: false, importedAt: 0 }) as import('../../types').FileMetadata;

    it('duplicateFolder blocks a multi-file duplicate whose combined bytes exceed the limit even though each file fits individually', async () => {
      useSettingsStore.setState({ storageLimitBytes: 2000 });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;
      useVaultStore.setState({
        files: [mkFile('a', folderId, 400), mkFile('b', folderId, 400), mkFile('c', folderId, 400)],
      });

      // Baseline usage is 1200 (the 3 originals, which stay put). Duplicating
      // all 3 needs another 1200, landing at 2400 — over the 2000 limit. But
      // each individual copy's own check in isolation (1200 + 400 = 1600)
      // would pass: that's the bug — the old per-file check, run once per
      // file with a single commit at the end of the batch, never saw the
      // other two copies already "added" earlier in this same operation.
      await useVaultStore.getState().duplicateFolder(folderId);

      // Blocked before any copy landed: still exactly the 1 original folder
      // and 3 original files, no partial duplicate sitting in state.
      expect(useVaultStore.getState().folders).toHaveLength(1);
      expect(useVaultStore.getState().files).toHaveLength(3);
    });

    it('duplicateFolder preserves the copied file\'s extension-qualified name (regression guard for the same uniqueName/copyFileToFolder extension-parsing bug fixed in duplicateFile)', async () => {
      useSettingsStore.setState({ storageLimitBytes: 10000 });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 200, false);

      await useVaultStore.getState().duplicateFolder(folderId);

      const copiedFolderId = useVaultStore.getState().folders.find(f => f.id !== folderId)!.id;
      const copiedFile = useVaultStore.getState().files.find(f => f.folderId === copiedFolderId)!;
      expect(copiedFile.name).toBe('a.jpg');
    });

    it('duplicateFolder excludes a trashed subfolder from the copy (regression: used to carry a phantom isTrash folder onto a parent that was never deleted)', async () => {
      await useVaultStore.getState().createFolder('Parent');
      const parentId = useVaultStore.getState().folders.find(f => f.name === 'Parent')!.id;
      await useVaultStore.getState().createFolder('TrashedSub', undefined, undefined, undefined, parentId);
      const trashedSubId = useVaultStore.getState().folders.find(f => f.name === 'TrashedSub')!.id;
      await useVaultStore.getState().createFolder('LiveSub', undefined, undefined, undefined, parentId);

      // Trash the subfolder on its own — Parent itself is never deleted.
      await useVaultStore.getState().deleteFolder(trashedSubId);

      await useVaultStore.getState().duplicateFolder(parentId);

      const duplicateParent = useVaultStore.getState().folders.find(f => f.name === 'Parent (2)')!;
      const duplicateChildren = useVaultStore.getState().folders.filter(f => f.parentId === duplicateParent.id);
      expect(duplicateChildren.map(f => f.name)).toEqual(['LiveSub']); // no phantom TrashedSub copy
      expect(duplicateChildren.every(f => !f.isTrash)).toBe(true);
    });

    it('pasteFromClipboard (copy mode) blocks a multi-file paste whose combined bytes exceed the limit even though each file fits individually', async () => {
      useSettingsStore.setState({ storageLimitBytes: 2000 });
      await useVaultStore.getState().createFolder('Source');
      await useVaultStore.getState().createFolder('Target');
      const sourceFolderId = useVaultStore.getState().folders.find(f => f.name === 'Source')!.id;
      const targetFolderId = useVaultStore.getState().folders.find(f => f.name === 'Target')!.id;
      useVaultStore.setState({
        files: [mkFile('a', sourceFolderId, 400), mkFile('b', sourceFolderId, 400), mkFile('c', sourceFolderId, 400)],
      });

      // Same shape of bug as duplicateFolder above, via the paste-copy path
      // instead: baseline 1200 + one file (400) passes per-file, but the
      // full 3-file paste needs 1200 more, landing at 2400 > 2000.
      await useVaultStore.getState().copyToClipboard([], ['a', 'b', 'c'], sourceFolderId);
      await useVaultStore.getState().pasteFromClipboard(targetFolderId);

      // Blocked: nothing landed in the target folder.
      expect(useVaultStore.getState().files.filter(f => f.folderId === targetFolderId)).toHaveLength(0);
      expect(useVaultStore.getState().files).toHaveLength(3);
    });

    it('performs zero physical copies when the batch check fails (checked before copying starts, not cleaned up after)', async () => {
      const copySpy = jest.spyOn(StorageService, 'copySandboxFile');

      useSettingsStore.setState({ storageLimitBytes: 2000 });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;
      useVaultStore.setState({
        files: [mkFile('a', folderId, 400), mkFile('b', folderId, 400), mkFile('c', folderId, 400)],
      });

      // assertBatchWithinStorageLimit runs before createFolderCopy starts,
      // so a batch that's going to be rejected never touches
      // StorageService at all — no wasted disk I/O, and nothing for the
      // catch block's orphan-cleanup (copyFileToFolder's own internal
      // copy failures are swallowed-and-logged, not rethrown, so that
      // cleanup is defense-in-depth for a future change to that contract,
      // not something this particular path exercises today).
      await useVaultStore.getState().duplicateFolder(folderId);

      expect(copySpy).not.toHaveBeenCalled();
    });
  });

  describe('Storage-limit accounting: committed encrypted files count their real (post-encryption) footprint', () => {
    // FileMetadata.size is always the pre-encryption byte count (set once at
    // import from the picker's asset.size, never updated by encryption or
    // re-keying). projectedFileBytes pads for ~1.4x ciphertext growth, but
    // only prospectively for the file currently being checked — summing raw
    // f.size for files already committed silently drops that padding back
    // out, letting real disk usage run ahead of the configured limit as
    // encrypted files accumulate. These tests fail against the old
    // `sum + (f.size || 0)` accounting and pass against committedFileBytes.
    afterEach(() => {
      useSettingsStore.setState({ storageLimitBytes: null });
    });

    it('getVaultUsageBytes projects overhead for an already-committed encrypted file, not just its raw size', async () => {
      useSettingsStore.setState({
        encryptionKeys: [{ id: 'key-1', name: 'k', key: 'raw-key', fingerprint: 'fp', createdAt: Date.now() }],
      });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 100, false);
      await useVaultStore.getState().importFile('/src/b.jpg', folderId, 'b.jpg', 'image/jpeg', 200, true, 'key-1');

      // 100 raw (unencrypted) + ceil(200 * 1.4) = 100 + 280 = 380, not the
      // naive 100 + 200 = 300 a size-only sum would report.
      expect(useVaultStore.getState().getVaultUsageBytes()).toBe(380);
    });

    it('rejects a later import once an already-committed encrypted file\'s real footprint is what crosses the limit', async () => {
      useSettingsStore.setState({
        storageLimitBytes: 1000,
        encryptionKeys: [{ id: 'key-1', name: 'k', key: 'raw-key', fingerprint: 'fp', createdAt: Date.now() }],
      });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;

      // 700 raw, encrypted -> projected 980, comfortably under 1000 on its own.
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 700, true, 'key-1');
      expect(useVaultStore.getState().files).toHaveLength(1);

      // A naive size-only sum would see 700 (raw) + 50 = 750, well under the
      // limit. The real committed footprint is 980, so 980 + 50 = 1030 is over.
      await expect(
        useVaultStore.getState().importFile('/src/b.jpg', folderId, 'b.jpg', 'image/jpeg', 50, false)
      ).rejects.toBeInstanceOf(StorageLimitExceededError);
      expect(useVaultStore.getState().files).toHaveLength(1);
    });

    it('duplicateFile is blocked by an existing encrypted file\'s own real footprint, not its raw size', async () => {
      useSettingsStore.setState({
        storageLimitBytes: 1500,
        encryptionKeys: [{ id: 'key-1', name: 'k', key: 'raw-key', fingerprint: 'fp', createdAt: Date.now() }],
      });
      await useVaultStore.getState().createFolder('F');
      const folderId = useVaultStore.getState().folders[0].id;

      // 600 raw, encrypted -> projected 840. Duplicating needs another ~840.
      // Naive size-only accounting: 600 + 840 = 1440, under 1500 -> would
      // wrongly allow it, landing at a real ~1680 bytes on disk. Correct
      // accounting: 840 (existing) + 840 (copy) = 1680, over 1500 -> blocked.
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 600, true, 'key-1');
      const [fileToDuplicate] = useVaultStore.getState().files;

      await expect(useVaultStore.getState().duplicateFile(fileToDuplicate.id)).resolves.toBeUndefined();
      expect(useVaultStore.getState().files).toHaveLength(1);
    });
  });

  describe('pasteFromClipboard: root-paste bug fixes (pre-existing, found while adding the album guards)', () => {
    it('copy-mode: pasting a folder to root lands it with parentId undefined, not the empty-string target id', async () => {
      await useVaultStore.getState().createFolder('Sub');
      const subId = useVaultStore.getState().folders[0].id;

      await useVaultStore.getState().copyToClipboard([subId], [], null);
      const result = await useVaultStore.getState().pasteFromClipboard('');

      expect(result.pastedFolders).toBe(1);
      const copy = useVaultStore.getState().folders.find(f => f.id !== subId)!;
      expect(copy.parentId).toBeUndefined();
    });

    it('cut-mode: moving (cut + paste) a folder to root lands it with parentId undefined', async () => {
      await useVaultStore.getState().createFolder('Parent');
      const parentId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().createFolder('Child', undefined, undefined, undefined, parentId);
      const childId = useVaultStore.getState().folders.find(f => f.name === 'Child')!.id;

      await useVaultStore.getState().cutToClipboard([childId], [], parentId);
      const result = await useVaultStore.getState().pasteFromClipboard('');

      expect(result.pastedFolders).toBe(1);
      expect(useVaultStore.getState().folders.find(f => f.id === childId)!.parentId).toBeUndefined();
    });

    it('rejects pasting files to root in copy mode — no file ends up with a dangling empty folderId', async () => {
      await useVaultStore.getState().createFolder('Docs');
      const docsId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', docsId, 'a.jpg', 'image/jpeg', 10, false);
      const fileId = useVaultStore.getState().files[0].id;

      await useVaultStore.getState().copyToClipboard([], [fileId], docsId);
      const result = await useVaultStore.getState().pasteFromClipboard('');

      expect(result).toEqual({ pastedFiles: 0, pastedFolders: 0 });
      expect(useVaultStore.getState().files).toHaveLength(1);
      expect(useVaultStore.getState().files.some(f => f.folderId === '')).toBe(false);
    });

    it('rejects moving (cut + paste) files to root — the original file stays exactly where it was', async () => {
      await useVaultStore.getState().createFolder('Docs');
      const docsId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', docsId, 'a.jpg', 'image/jpeg', 10, false);
      const fileId = useVaultStore.getState().files[0].id;

      await useVaultStore.getState().cutToClipboard([], [fileId], docsId);
      const result = await useVaultStore.getState().pasteFromClipboard('');

      expect(result).toEqual({ pastedFiles: 0, pastedFolders: 0 });
      expect(useVaultStore.getState().files.find(f => f.id === fileId)!.folderId).toBe(docsId);
    });

    it('rejects the whole batch when a root paste mixes a folder with files — the folder is not pasted on its own either', async () => {
      await useVaultStore.getState().createFolder('Docs');
      const docsId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().createFolder('Sub', undefined, undefined, undefined, docsId);
      const subId = useVaultStore.getState().folders.find(f => f.name === 'Sub')!.id;
      await useVaultStore.getState().importFile('/src/a.jpg', docsId, 'a.jpg', 'image/jpeg', 10, false);
      const fileId = useVaultStore.getState().files[0].id;

      await useVaultStore.getState().copyToClipboard([subId], [fileId], docsId);
      const result = await useVaultStore.getState().pasteFromClipboard('');

      expect(result).toEqual({ pastedFiles: 0, pastedFolders: 0 });
      // Still exactly the 2 original folders (Docs, Sub) — no copy of Sub landed at root.
      expect(useVaultStore.getState().folders).toHaveLength(2);
    });

    it('a folders-only paste to root is unaffected by the files-to-root guard', async () => {
      await useVaultStore.getState().createFolder('Sub');
      const subId = useVaultStore.getState().folders[0].id;

      await useVaultStore.getState().copyToClipboard([subId], [], null);
      const result = await useVaultStore.getState().pasteFromClipboard('');

      expect(result.pastedFolders).toBe(1);
    });
  });

  describe('Album feature (plans/album implementation plan.md, Phase 1)', () => {
    const createAlbum = async (name = 'Photos') => {
      await useVaultStore.getState().createFolder(name, undefined, undefined, undefined, undefined, 'album');
      return useVaultStore.getState().folders.find(f => f.name === name)!.id;
    };

    it('createFolder(..., "album") yields a root-only record with type "album", even when a parentId is passed', async () => {
      await useVaultStore.getState().createFolder('Parent');
      const parentId = useVaultStore.getState().folders[0].id;

      await useVaultStore.getState().createFolder('Nested Album', undefined, undefined, undefined, parentId, 'album');
      const album = useVaultStore.getState().folders.find(f => f.name === 'Nested Album')!;
      expect(album.type).toBe('album');
      expect(album.parentId).toBeUndefined();
    });

    it('createFolder without a type still defaults to "folder" (existing callers unaffected)', async () => {
      await useVaultStore.getState().createFolder('Plain');
      expect(useVaultStore.getState().folders[0].type).toBe('folder');
    });

    describe('importFile enforces media-only content in an album', () => {
      it('throws AlbumMediaOnlyError for a non-media file targeting an album', async () => {
        const albumId = await createAlbum();

        await expect(
          useVaultStore.getState().importFile('/src/doc.pdf', albumId, 'doc.pdf', 'application/pdf', 10, false)
        ).rejects.toBeInstanceOf(AlbumMediaOnlyError);
        expect(useVaultStore.getState().files).toHaveLength(0);
      });

      it('succeeds for a media file targeting an album', async () => {
        const albumId = await createAlbum();

        await expect(
          useVaultStore.getState().importFile('/src/a.jpg', albumId, 'a.jpg', 'image/jpeg', 10, false)
        ).resolves.toBeUndefined();
        expect(useVaultStore.getState().files).toHaveLength(1);
      });

      it('still allows any file type into a plain folder (unaffected)', async () => {
        await useVaultStore.getState().createFolder('Docs');
        const folderId = useVaultStore.getState().folders[0].id;

        await expect(
          useVaultStore.getState().importFile('/src/doc.pdf', folderId, 'doc.pdf', 'application/pdf', 10, false)
        ).resolves.toBeUndefined();
      });
    });

    describe('copyFileToFolder enforces media-only content in an album (paste-copy/duplicate chokepoint)', () => {
      it('throws AlbumMediaOnlyError copying a non-media file into an album', async () => {
        await useVaultStore.getState().createFolder('Docs');
        const docsId = useVaultStore.getState().folders[0].id;
        await useVaultStore.getState().importFile('/src/doc.pdf', docsId, 'doc.pdf', 'application/pdf', 10, false);
        const [sourceFile] = useVaultStore.getState().files;
        const albumId = await createAlbum();

        await expect(
          useVaultStore.getState().copyFileToFolder(sourceFile, albumId)
        ).rejects.toBeInstanceOf(AlbumMediaOnlyError);
        expect(useVaultStore.getState().files).toHaveLength(1);
      });

      it('succeeds copying a media file into an album', async () => {
        await useVaultStore.getState().createFolder('Docs');
        const docsId = useVaultStore.getState().folders[0].id;
        await useVaultStore.getState().importFile('/src/a.jpg', docsId, 'a.jpg', 'image/jpeg', 10, false);
        const [sourceFile] = useVaultStore.getState().files;
        const albumId = await createAlbum();

        await expect(
          useVaultStore.getState().copyFileToFolder(sourceFile, albumId)
        ).resolves.toEqual(expect.objectContaining({ folderId: albumId }));
      });
    });

    describe('pasteFromClipboard guard 1: album-as-paste-target (whole-batch UX layer on top of copyFileToFolder\'s guard)', () => {
      it('rejects pasting a non-media file into an album, leaving it empty', async () => {
        await useVaultStore.getState().createFolder('Docs');
        const docsId = useVaultStore.getState().folders[0].id;
        await useVaultStore.getState().importFile('/src/doc.pdf', docsId, 'doc.pdf', 'application/pdf', 10, false);
        const fileId = useVaultStore.getState().files[0].id;
        const albumId = await createAlbum();

        await useVaultStore.getState().copyToClipboard([], [fileId], docsId);
        const result = await useVaultStore.getState().pasteFromClipboard(albumId);

        expect(result).toEqual({ pastedFiles: 0, pastedFolders: 0 });
        expect(useVaultStore.getState().files.filter(f => f.folderId === albumId)).toHaveLength(0);
      });

      it('rejects pasting a folder into an album, even one that only contains media', async () => {
        await useVaultStore.getState().createFolder('Docs');
        const docsId = useVaultStore.getState().folders[0].id;
        await useVaultStore.getState().createFolder('Sub', undefined, undefined, undefined, docsId);
        const subId = useVaultStore.getState().folders.find(f => f.name === 'Sub')!.id;
        const albumId = await createAlbum();

        await useVaultStore.getState().copyToClipboard([subId], [], docsId);
        const result = await useVaultStore.getState().pasteFromClipboard(albumId);

        expect(result).toEqual({ pastedFiles: 0, pastedFolders: 0 });
        expect(useVaultStore.getState().folders.filter(f => f.parentId === albumId)).toHaveLength(0);
      });

      it('allows pasting a media file into an album', async () => {
        await useVaultStore.getState().createFolder('Docs');
        const docsId = useVaultStore.getState().folders[0].id;
        await useVaultStore.getState().importFile('/src/a.jpg', docsId, 'a.jpg', 'image/jpeg', 10, false);
        const fileId = useVaultStore.getState().files[0].id;
        const albumId = await createAlbum();

        await useVaultStore.getState().copyToClipboard([], [fileId], docsId);
        const result = await useVaultStore.getState().pasteFromClipboard(albumId);

        expect(result.pastedFiles).toBe(1);
        expect(useVaultStore.getState().files.filter(f => f.folderId === albumId)).toHaveLength(1);
      });
    });

    describe('pasteFromClipboard guard 2: pasted-item-is-an-album (reverse case, defense-in-depth)', () => {
      it('rejects pasting a copied album into a plain folder, which would give it a parentId', async () => {
        const albumId = await createAlbum();
        await useVaultStore.getState().createFolder('Target');
        const targetId = useVaultStore.getState().folders.find(f => f.name === 'Target')!.id;

        await useVaultStore.getState().copyToClipboard([albumId], [], null);
        const result = await useVaultStore.getState().pasteFromClipboard(targetId);

        expect(result).toEqual({ pastedFiles: 0, pastedFolders: 0 });
        // No copy was created — still exactly the one original album.
        expect(useVaultStore.getState().folders.filter(f => f.type === 'album')).toHaveLength(1);
      });

      it('rejects pasting a copied album into another album', async () => {
        const albumId = await createAlbum('Photos');
        const otherAlbumId = await createAlbum('Trips');

        await useVaultStore.getState().copyToClipboard([albumId], [], null);
        const result = await useVaultStore.getState().pasteFromClipboard(otherAlbumId);

        expect(result).toEqual({ pastedFiles: 0, pastedFolders: 0 });
        expect(useVaultStore.getState().folders.filter(f => f.type === 'album')).toHaveLength(2);
      });

      it('allows pasting a copied album into the vault root', async () => {
        const albumId = await createAlbum();

        await useVaultStore.getState().copyToClipboard([albumId], [], null);
        const result = await useVaultStore.getState().pasteFromClipboard('');

        expect(result.pastedFolders).toBe(1);
        const albums = useVaultStore.getState().folders.filter(f => f.type === 'album');
        expect(albums).toHaveLength(2);
        expect(albums.every(a => !a.parentId)).toBe(true);
      });
    });

    it('duplicateFolder on an album preserves type "album" on the copy (regression guard — already true via the existing spread)', async () => {
      const albumId = await createAlbum();

      await useVaultStore.getState().duplicateFolder(albumId);

      const albums = useVaultStore.getState().folders.filter(f => f.type === 'album');
      expect(albums).toHaveLength(2);
      expect(albums.every(a => !a.parentId)).toBe(true);
    });

    describe('addFileToAlbum ("Add to Album…" quick action, plan §7, Phase 6)', () => {
      it('copies a media file into the album, leaving the original in place', async () => {
        await useVaultStore.getState().createFolder('Docs');
        const docsId = useVaultStore.getState().folders[0].id;
        await useVaultStore.getState().importFile('/src/a.jpg', docsId, 'a.jpg', 'image/jpeg', 10, false);
        const sourceFile = useVaultStore.getState().files[0];
        const albumId = await createAlbum();

        await useVaultStore.getState().addFileToAlbum(sourceFile.id, albumId);

        const { files } = useVaultStore.getState();
        expect(files).toHaveLength(2);
        expect(files.find(f => f.id === sourceFile.id)?.folderId).toBe(docsId);
        expect(files.some(f => f.folderId === albumId && f.id !== sourceFile.id)).toBe(true);
      });

      it('throws AlbumMediaOnlyError for a non-media file, adding nothing (copyFileToFolder\'s own guard)', async () => {
        await useVaultStore.getState().createFolder('Docs');
        const docsId = useVaultStore.getState().folders[0].id;
        await useVaultStore.getState().importFile('/src/doc.pdf', docsId, 'doc.pdf', 'application/pdf', 10, false);
        const sourceFile = useVaultStore.getState().files[0];
        const albumId = await createAlbum();

        await expect(
          useVaultStore.getState().addFileToAlbum(sourceFile.id, albumId)
        ).rejects.toBeInstanceOf(AlbumMediaOnlyError);
        expect(useVaultStore.getState().files).toHaveLength(1);
      });

      it('dedupes the name against the destination album\'s existing files, not the source folder\'s', async () => {
        await useVaultStore.getState().createFolder('Docs');
        const docsId = useVaultStore.getState().folders[0].id;
        await useVaultStore.getState().importFile('/src/a.jpg', docsId, 'a.jpg', 'image/jpeg', 10, false);
        const sourceFile = useVaultStore.getState().files[0];
        const albumId = await createAlbum();
        await useVaultStore.getState().importFile('/src/a.jpg', albumId, 'a.jpg', 'image/jpeg', 10, false);

        await useVaultStore.getState().addFileToAlbum(sourceFile.id, albumId);

        const albumFiles = useVaultStore.getState().files.filter(f => f.folderId === albumId);
        expect(albumFiles).toHaveLength(2);
        expect(albumFiles.map(f => f.name).sort()).toEqual(['a (2).jpg', 'a.jpg']);
      });

      it('rejects when the copy would exceed the configured storage limit (copyFileToFolder\'s own check)', async () => {
        await useVaultStore.getState().createFolder('Docs');
        const docsId = useVaultStore.getState().folders[0].id;
        await useVaultStore.getState().importFile('/src/a.jpg', docsId, 'a.jpg', 'image/jpeg', 1000, false);
        const sourceFile = useVaultStore.getState().files[0];
        const albumId = await createAlbum();
        useSettingsStore.setState({ storageLimitBytes: 500 });

        await expect(
          useVaultStore.getState().addFileToAlbum(sourceFile.id, albumId)
        ).rejects.toBeInstanceOf(StorageLimitExceededError);
        expect(useVaultStore.getState().files.filter(f => f.folderId === albumId)).toHaveLength(0);
      });
    });
  });

  describe('Custom folder/album thumbnails (plans/custom folders and album thumbnail implementation plan.md)', () => {
    it('setFolderThumbnail sets customThumbnailPath on the right folder', async () => {
      await useVaultStore.getState().createFolder('A');
      await useVaultStore.getState().createFolder('B');
      const aId = useVaultStore.getState().folders.find(f => f.name === 'A')!.id;
      const bId = useVaultStore.getState().folders.find(f => f.name === 'B')!.id;

      await useVaultStore.getState().setFolderThumbnail(aId, '/picker/cover.jpg');

      const { folders } = useVaultStore.getState();
      expect(folders.find(f => f.id === aId)!.customThumbnailPath).toBeTruthy();
      expect(folders.find(f => f.id === bId)!.customThumbnailPath).toBeUndefined();
    });

    it('setFolderThumbnail called twice on the same folder removes the first path once the second call resolves', async () => {
      const removeSpy = jest.spyOn(StorageService, 'removeSandboxFile');
      await useVaultStore.getState().createFolder('A');
      const folderId = useVaultStore.getState().folders[0].id;

      await useVaultStore.getState().setFolderThumbnail(folderId, '/picker/first.jpg');
      const firstPath = useVaultStore.getState().folders[0].customThumbnailPath!;
      await useVaultStore.getState().setFolderThumbnail(folderId, '/picker/second.jpg');
      const secondPath = useVaultStore.getState().folders[0].customThumbnailPath!;

      expect(secondPath).not.toBe(firstPath);
      expect(removeSpy).toHaveBeenCalledWith(firstPath);
    });

    it('clearFolderThumbnail unsets the field and removes the file', async () => {
      const removeSpy = jest.spyOn(StorageService, 'removeSandboxFile');
      await useVaultStore.getState().createFolder('A');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().setFolderThumbnail(folderId, '/picker/cover.jpg');
      const path = useVaultStore.getState().folders[0].customThumbnailPath!;

      await useVaultStore.getState().clearFolderThumbnail(folderId);

      expect(useVaultStore.getState().folders[0].customThumbnailPath).toBeUndefined();
      expect(removeSpy).toHaveBeenCalledWith(path);
    });

    it('clearFolderThumbnail on a folder with no thumbnail is a no-op', async () => {
      await useVaultStore.getState().createFolder('A');
      const folderId = useVaultStore.getState().folders[0].id;

      await expect(useVaultStore.getState().clearFolderThumbnail(folderId)).resolves.toBeUndefined();
      expect(useVaultStore.getState().folders[0].customThumbnailPath).toBeUndefined();
    });

    it('duplicateFolder gives the copy its own customThumbnailPath, not a shared reference', async () => {
      await useVaultStore.getState().createFolder('A');
      const sourceId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().setFolderThumbnail(sourceId, '/picker/cover.jpg');
      const sourcePath = useVaultStore.getState().folders[0].customThumbnailPath!;

      await useVaultStore.getState().duplicateFolder(sourceId);

      const copy = useVaultStore.getState().folders.find(f => f.id !== sourceId)!;
      expect(copy.customThumbnailPath).toBeTruthy();
      expect(copy.customThumbnailPath).not.toBe(sourcePath);
    });

    it('pasteFromClipboard (copy mode) gives the pasted copy its own customThumbnailPath, not a shared reference', async () => {
      await useVaultStore.getState().createFolder('A');
      const sourceId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().setFolderThumbnail(sourceId, '/picker/cover.jpg');
      const sourcePath = useVaultStore.getState().folders[0].customThumbnailPath!;

      await useVaultStore.getState().copyToClipboard([sourceId], [], null);
      await useVaultStore.getState().pasteFromClipboard('');

      const copy = useVaultStore.getState().folders.find(f => f.id !== sourceId)!;
      expect(copy.customThumbnailPath).toBeTruthy();
      expect(copy.customThumbnailPath).not.toBe(sourcePath);
    });

    it('shredFolder removes the thumbnail file for every folder in the shredded subtree', async () => {
      const removeSpy = jest.spyOn(StorageService, 'removeSandboxFile');
      await useVaultStore.getState().createFolder('Root');
      const rootId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().createFolder('Sub', undefined, undefined, undefined, rootId);
      const subId = useVaultStore.getState().folders.find(f => f.name === 'Sub')!.id;
      await useVaultStore.getState().setFolderThumbnail(rootId, '/picker/root.jpg');
      await useVaultStore.getState().setFolderThumbnail(subId, '/picker/sub.jpg');
      const rootPath = useVaultStore.getState().folders.find(f => f.id === rootId)!.customThumbnailPath!;
      const subPath = useVaultStore.getState().folders.find(f => f.id === subId)!.customThumbnailPath!;

      await useVaultStore.getState().shredFolder(rootId);

      expect(useVaultStore.getState().folders).toHaveLength(0);
      expect(removeSpy).toHaveBeenCalledWith(rootPath);
      expect(removeSpy).toHaveBeenCalledWith(subPath);
    });

    it('shredMultipleFolders removes the thumbnail file for every folder across the batch', async () => {
      const removeSpy = jest.spyOn(StorageService, 'removeSandboxFile');
      await useVaultStore.getState().createFolder('A');
      const aId = useVaultStore.getState().folders.find(f => f.name === 'A')!.id;
      await useVaultStore.getState().createFolder('B');
      const bId = useVaultStore.getState().folders.find(f => f.name === 'B')!.id;
      await useVaultStore.getState().setFolderThumbnail(aId, '/picker/a.jpg');
      await useVaultStore.getState().setFolderThumbnail(bId, '/picker/b.jpg');
      const aPath = useVaultStore.getState().folders.find(f => f.id === aId)!.customThumbnailPath!;
      const bPath = useVaultStore.getState().folders.find(f => f.id === bId)!.customThumbnailPath!;

      await useVaultStore.getState().shredMultipleFolders([aId, bId]);

      expect(useVaultStore.getState().folders).toHaveLength(0);
      expect(removeSpy).toHaveBeenCalledWith(aPath);
      expect(removeSpy).toHaveBeenCalledWith(bPath);
    });

    describe('web platform fallback (copyToSandbox is a no-op there — see Store section)', () => {
      const originalOS = Platform.OS;
      afterEach(() => {
        Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
      });

      it('uses the picker URI directly, without copying or extracting, on web', async () => {
        const copySpy = jest.spyOn(StorageService, 'copyToSandbox');
        const extractSpy = jest.spyOn(MediaThumbnailExtractor, 'extractImageThumbnail');
        Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });

        await useVaultStore.getState().createFolder('A');
        const folderId = useVaultStore.getState().folders[0].id;
        await useVaultStore.getState().setFolderThumbnail(folderId, 'blob:web-picker-uri');

        expect(useVaultStore.getState().folders[0].customThumbnailPath).toBe('blob:web-picker-uri');
        expect(copySpy).not.toHaveBeenCalled();
        expect(extractSpy).not.toHaveBeenCalled();
      });
    });

    it('falls back to the raw sandbox copy when extraction fails (extractImageThumbnail returns falsy)', async () => {
      jest.spyOn(MediaThumbnailExtractor, 'extractImageThumbnail').mockResolvedValueOnce(null as unknown as string);
      await useVaultStore.getState().createFolder('A');
      const folderId = useVaultStore.getState().folders[0].id;

      await useVaultStore.getState().setFolderThumbnail(folderId, '/picker/cover.jpg');

      const path = useVaultStore.getState().folders[0].customThumbnailPath;
      expect(path).toBeTruthy();
      expect(path).not.toContain('.thumb.jpg');
    });

    it('two overlapping setFolderThumbnail calls on the same folder never orphan the losing call\'s committed thumbnail', async () => {
      const removeSpy = jest.spyOn(StorageService, 'removeSandboxFile');
      const copySpy = jest.spyOn(StorageService, 'copyToSandbox');
      await useVaultStore.getState().createFolder('A');
      const folderId = useVaultStore.getState().folders[0].id;
      const callsBefore = copySpy.mock.calls.length;

      const call1 = useVaultStore.getState().setFolderThumbnail(folderId, '/picker/one.jpg');
      const call2 = useVaultStore.getState().setFolderThumbnail(folderId, '/picker/two.jpg');
      await Promise.all([call1, call2]);

      // NOTE on why this can't just check "was removeSandboxFile called with
      // something other than finalPath": setFolderThumbnail ALWAYS calls
      // removeSandboxFile on its own intermediate raw sandbox copy after a
      // successful extraction (see the Store section), for both calls,
      // regardless of any race outcome. That call alone would satisfy a
      // weaker assertion even with the original, buggy entry-snapshot code —
      // it doesn't prove the *losing call's actual committed thumbnail path*
      // was cleaned up. So we derive each call's real extracted-thumbnail
      // path directly from the copyToSandbox mock's recorded arguments.
      // Take only the LAST two calls, not calls[0]/calls[1] — this spy
      // object is shared (never restored) with earlier tests in this file,
      // and resetMocks clears its default call-through implementation's
      // *behavior* reset semantics but not, empirically, its accumulated
      // .mock.calls history from a prior test's spy reference; slicing from
      // the end keeps this assertion correct regardless. Call order still
      // mirrors invocation order here — both calls reach their first
      // `await StorageService.copyToSandbox(...)` synchronously, before
      // either can yield.
      const [thisCall1, thisCall2] = copySpy.mock.calls.slice(callsBefore);
      const thumbPath1 = `/vault/${thisCall1[1]}.thumb.jpg`;
      const thumbPath2 = `/vault/${thisCall2[1]}.thumb.jpg`;

      const finalPath = useVaultStore.getState().folders[0].customThumbnailPath!;
      expect([thumbPath1, thumbPath2]).toContain(finalPath);
      const losingPath = finalPath === thumbPath1 ? thumbPath2 : thumbPath1;

      // The losing call's own committed thumbnail must have been cleaned up
      // — not left as an orphaned, unreferenced file. Against the
      // await-gap version of the fix (previous value read before the
      // reduceMotion await, not atomically with the commit), this assertion
      // fails because the losing call's path is never removed by anyone.
      expect(removeSpy).toHaveBeenCalledWith(losingPath);
    });
  });
});
