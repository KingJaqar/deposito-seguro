/**
 * Phase 0 baseline smoke test for vaultStore (see plans/deposito-seguro-audit-report.md §20).
 * Mocks @react-native-async-storage/async-storage (jest.setup.js) so this runs without a device.
 */
import { useVaultStore, StorageLimitExceededError } from '../vaultStore';
import { useSettingsStore } from '../settingsStore';

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
    copyToSandbox: async (_uri: string, name: string) => `/vault/${name}`,
    remuxVideoIfPossible: async (path: string) => path,
    removeSandboxFile: async () => {},
    copySandboxFile: async () => {},
    encryptSandboxFile: async (path: string) => `${path}.enc`,
    decryptSandboxFile: async (path: string) => path.replace('.enc', ''),
    fileExists: async (path: string) => mockExistingPaths.has(path),
  },
}));

describe('vaultStore', () => {
  beforeEach(() => {
    useVaultStore.setState({ folders: [], files: [] });
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
});
