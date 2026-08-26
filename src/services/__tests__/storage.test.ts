/**
 * Phase 6 test coverage for I-13's real storage-usage reporting (see
 * plans/deposito-seguro-audit-report.md §11/§20). Previously
 * `getStorageQuotaInfo()` returned hardcoded `{ used: 42MB, free: 5GB }`
 * regardless of device state — this exercises the real recursive
 * vault-sandbox directory walk + free-disk-space read against a fake
 * in-memory filesystem, so no real device/expo-file-system native module
 * is needed.
 */
import { Platform } from 'react-native';

type MockEntry = { isDirectory: boolean; size?: number };

const mockFiles: Record<string, MockEntry> = {};
const mockDirChildren: Record<string, string[]> = {};
let mockFreeDiskBytes = 0;

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-doc/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  getInfoAsync: jest.fn(async (path: string) => {
    const entry = mockFiles[path];
    if (!entry) return { exists: false };
    return { exists: true, isDirectory: entry.isDirectory, size: entry.size };
  }),
  readDirectoryAsync: jest.fn(async (path: string) => mockDirChildren[path] || []),
  getFreeDiskStorageAsync: jest.fn(async () => mockFreeDiskBytes),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  writeAsStringAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
}));

// StorageService is imported after the mock above is registered (jest
// hoists jest.mock calls above imports automatically).
import { StorageService } from '../storage';

const VAULT_DIR = 'file:///mock-doc/vault_sandbox/';

function resetMockFs() {
  for (const key of Object.keys(mockFiles)) delete mockFiles[key];
  for (const key of Object.keys(mockDirChildren)) delete mockDirChildren[key];
  mockFreeDiskBytes = 0;
}

describe('StorageService.getStorageQuotaInfo', () => {
  beforeEach(() => {
    resetMockFs();
    (Platform as unknown as { OS: string }).OS = 'android';
  });

  it('reports zero used bytes when the vault sandbox does not exist yet', async () => {
    mockFreeDiskBytes = 5_000_000;
    const quota = await StorageService.getStorageQuotaInfo();
    expect(quota.used).toBe(0);
    expect(quota.free).toBe(5_000_000);
  });

  it('sums real file sizes across the vault sandbox instead of returning a hardcoded value', async () => {
    mockFiles[VAULT_DIR] = { isDirectory: true };
    mockDirChildren[VAULT_DIR] = ['a.enc', 'b.enc', 'c.enc'];
    mockFiles[`${VAULT_DIR}a.enc`] = { isDirectory: false, size: 1000 };
    mockFiles[`${VAULT_DIR}b.enc`] = { isDirectory: false, size: 2500 };
    mockFiles[`${VAULT_DIR}c.enc`] = { isDirectory: false, size: 42 };
    mockFreeDiskBytes = 123_456_789;

    const quota = await StorageService.getStorageQuotaInfo();

    // The old implementation always returned exactly 44040192 (42MB) here —
    // asserting the real sum guards against silently regressing to that.
    expect(quota.used).toBe(1000 + 2500 + 42);
    expect(quota.free).toBe(123_456_789);
  });

  it('recurses into subdirectories', async () => {
    mockFiles[VAULT_DIR] = { isDirectory: true };
    mockDirChildren[VAULT_DIR] = ['sub'];
    mockFiles[`${VAULT_DIR}sub`] = { isDirectory: true };
    mockDirChildren[`${VAULT_DIR}sub`] = ['nested.enc'];
    mockFiles[`${VAULT_DIR}sub/nested.enc`] = { isDirectory: false, size: 777 };

    const quota = await StorageService.getStorageQuotaInfo();
    expect(quota.used).toBe(777);
  });
});
