/**
 * Phase 0 baseline smoke test for vaultStore (see plans/deposito-seguro-audit-report.md §20).
 * Mocks @react-native-async-storage/async-storage (jest.setup.js) so this runs without a device.
 */
import { useVaultStore } from '../vaultStore';
import { useSettingsStore } from '../settingsStore';

// Deliberately plain functions, not jest.fn(impl) — jest-expo's preset sets
// `resetMocks: true`, which strips mockImplementations (even ones set at
// creation time) between every test (see jest.setup.js for the same lesson
// learned on the expo-secure-store mock).
jest.mock('../../services/storage', () => ({
  StorageService: {
    initializeSystemDirectories: async () => {},
    copyToSandbox: async (_uri: string, name: string) => `/vault/${name}`,
    removeSandboxFile: async () => {},
    copySandboxFile: async () => {},
    encryptSandboxFile: async (path: string) => `${path}.enc`,
    decryptSandboxFile: async (path: string) => path.replace('.enc', ''),
  },
}));

describe('vaultStore', () => {
  beforeEach(() => {
    useVaultStore.setState({ folders: [], files: [] });
    useSettingsStore.setState({ accessKeys: [], encryptionKeys: [] });
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

    it('reports landedInFallbackFolder=true and reroutes into "Restored Files" when the original folder was deleted', async () => {
      await useVaultStore.getState().createFolder('Home');
      const folderId = useVaultStore.getState().folders[0].id;
      await useVaultStore.getState().importFile('/src/a.jpg', folderId, 'a.jpg', 'image/jpeg', 10, false);
      const fileId = useVaultStore.getState().files[0].id;
      await useVaultStore.getState().softDeleteFile(fileId);
      await useVaultStore.getState().deleteFolder(folderId);

      const result = await useVaultStore.getState().restoreFileFromTrash(fileId);
      expect(result.landedInFallbackFolder).toBe(true);
      const restoredFolder = useVaultStore.getState().folders.find(f => f.name === 'Restored Files');
      expect(restoredFolder).toBeDefined();
      expect(useVaultStore.getState().files.find(f => f.id === fileId)!.folderId).toBe(restoredFolder!.id);
    });
  });
});
