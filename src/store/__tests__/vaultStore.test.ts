/**
 * Phase 0 baseline smoke test for vaultStore (see plans/deposito-seguro-audit-report.md §20).
 * Mocks @react-native-async-storage/async-storage (jest.setup.js) so this runs without a device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useVaultStore, StorageLimitExceededError } from '../vaultStore';
import { useSettingsStore } from '../settingsStore';
import { StorageService } from '../../services/storage';

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

// S-12: apkIconExtractor does real zip/filesystem work that isn't available
// in this Node test environment — mocked here (deterministic "success" every
// call, mirroring its own real never-throws contract) so importFile's icon-
// encryption logic (which only runs when extraction actually produced an
// iconPath) is exercised the same way it would be for a real .apk import.
jest.mock('../../services/apkIconExtractor', () => ({
  extractApkIcon: async (_apkPath: string, outputPngPath: string) => outputPngPath,
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
});
