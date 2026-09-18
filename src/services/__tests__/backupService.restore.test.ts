import JSZip from 'jszip';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedBackupService } from '../backupService';
import { useVaultStore } from '../../store/vaultStore';

const mockFiles = new Map<string, string>();
let mockPickerResult: any = { canceled: true, assets: null };
const mockPickerCalls: any[] = [];

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  getInfoAsync: async (uri: string) => ({ exists: mockFiles.has(uri), size: mockFiles.get(uri)?.length ?? 0, isDirectory: false }),
  readAsStringAsync: async (uri: string) => {
    if (!mockFiles.has(uri)) throw new Error('missing file');
    return mockFiles.get(uri);
  },
  writeAsStringAsync: async (uri: string, contents: string) => {
    mockFiles.set(uri, contents);
  },
  deleteAsync: async (uri: string) => {
    mockFiles.delete(uri);
  },
  makeDirectoryAsync: async () => {},
  copyAsync: async ({ from, to }: { from: string; to: string }) => {
    const contents = mockFiles.get(from);
    if (contents === undefined) throw new Error('missing source');
    mockFiles.set(to, contents);
  },
  readDirectoryAsync: async () => [],
  getFreeDiskStorageAsync: async () => 1_000_000,
  getTotalDiskCapacityAsync: async () => 2_000_000,
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: async () => ({ granted: true, directoryUri: 'content://com.android.externalstorage.documents/tree/primary' }),
    createFileAsync: async () => 'content://com.android.externalstorage.documents/document/backup.zip',
  },
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: async (options: any) => {
    mockPickerCalls.push(options);
    return mockPickerResult;
  },
}));

jest.mock('expo-media-library/legacy', () => ({
  requestPermissionsAsync: async () => ({ status: 'granted' }),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => false,
  shareAsync: async () => {},
}));

const createBackupZip = async (manifest: object, payloads: Record<string, string> = {}) => {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest));
  for (const [name, contents] of Object.entries(payloads)) {
    zip.file(`files/${name}`, contents, { base64: true });
  }
  return zip.generateAsync({ type: 'base64' });
};

describe('EnhancedBackupService.restoreBackup APK validation', () => {
  beforeEach(async () => {
    mockFiles.clear();
    mockPickerResult = { canceled: true, assets: null };
    mockPickerCalls.length = 0;
    await AsyncStorage.clear();
    useVaultStore.setState({ folders: [], files: [], _isVaultHydrated: true, _vaultHydrationError: null });
  });

  it('rejects an old JSON-only backup with an explicit format message', async () => {
    mockFiles.set('content://provider/backup.json', btoa(JSON.stringify({ folders: [], files: [] })));

    await expect(EnhancedBackupService.restoreBackup('content://provider/backup.json', undefined)).resolves.toMatchObject({
      success: false,
      error: 'Unsupported backup format: expected a ZIP containing manifest.json',
    });
  });

  it('rejects a ZIP whose manifest version is unsupported', async () => {
    const zipBase64 = await createBackupZip({ version: '1.0.0', vaultStructure: { folders: [], files: [] } });
    mockFiles.set('content://provider/old.zip', zipBase64);

    await expect(EnhancedBackupService.restoreBackup('content://provider/old.zip', undefined)).resolves.toMatchObject({
      success: false,
      error: 'Unsupported backup version: 1.0.0',
    });
  });

  it('writes payloads before publishing restored metadata to Zustand', async () => {
    const manifest = {
      version: '2.0.0',
      vaultStructure: {
        folders: [],
        files: [{
          id: 'file-1', folderId: 'root', name: 'note.txt', size: 4,
          mimeType: 'text/plain', localPath: '/old/device/file-1_note.txt',
          isFavorite: false, isTrash: false, importedAt: 1,
        }],
      },
    };
    const zipBase64 = await createBackupZip(manifest, { 'file-1_note.txt': 'bm90ZQ==' });
    mockFiles.set('content://provider/valid.zip', zipBase64);

    const result = await EnhancedBackupService.restoreBackup('content://provider/valid.zip', undefined);

    expect(result).toMatchObject({ success: true, restoredFiles: 1, restoredFolders: 0 });
    const restoredFile = useVaultStore.getState().files[0];
    expect(restoredFile.localPath).toMatch(/^file:\/\/\/docs\/vault_sandbox\/restore_/);
    expect(mockFiles.has(restoredFile.localPath)).toBe(true);
  });

  it('keeps restore file picking configured for immediate cache access', async () => {
    mockPickerResult = { canceled: false, assets: [{ uri: 'content://com.google.android.apps.docs.storage/file.zip' }] };

    await expect(EnhancedBackupService.pickBackupFile()).resolves.toBe(mockPickerResult.assets[0].uri);
    expect(mockPickerCalls[0]).toEqual(expect.objectContaining({
      copyToCacheDirectory: true,
      multiple: false,
    }));
  });

  it('creates and validates an empty-vault ZIP through an Android SAF file URI', async () => {
    const result = await EnhancedBackupService.createBackupInFolder({
      uri: 'content://com.android.externalstorage.documents/tree/primary',
      isSAF: true,
      label: 'Selected folder',
    }, undefined);

    expect(result).toMatchObject({
      success: true,
      validation: { zipExists: true, sizeGreaterThanZero: true, manifestExists: true },
    });
    expect(result.backupPath).toBe('content://com.android.externalstorage.documents/document/backup.zip');
  });
});
