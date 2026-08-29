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

type MockEntry = { isDirectory: boolean; size?: number; modificationTime?: number };

const mockFiles: Record<string, MockEntry> = {};
const mockDirChildren: Record<string, string[]> = {};
let mockFreeDiskBytes = 0;
let mockTotalDiskBytes = 0;

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-doc/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  getInfoAsync: jest.fn(async (path: string) => {
    const entry = mockFiles[path];
    if (!entry) return { exists: false };
    return { exists: true, isDirectory: entry.isDirectory, size: entry.size, modificationTime: entry.modificationTime };
  }),
  readDirectoryAsync: jest.fn(async (path: string) => mockDirChildren[path] || []),
  getFreeDiskStorageAsync: jest.fn(async () => mockFreeDiskBytes),
  getTotalDiskCapacityAsync: jest.fn(async () => mockTotalDiskBytes),
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
  mockTotalDiskBytes = 0;
}

describe('StorageService.getStorageQuotaInfo', () => {
  beforeEach(() => {
    resetMockFs();
    (Platform as unknown as { OS: string }).OS = 'android';
  });

  it('reports zero used bytes when the vault sandbox does not exist yet', async () => {
    mockFreeDiskBytes = 5_000_000;
    mockTotalDiskBytes = 64_000_000_000;
    const quota = await StorageService.getStorageQuotaInfo();
    expect(quota.used).toBe(0);
    expect(quota.free).toBe(5_000_000);
    expect(quota.total).toBe(64_000_000_000);
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

/**
 * S-11 remediation (plans/deposito-seguro-audit-report-2026-08-28.md §10,
 * plans/what-are-the-next-jaunty-deer.md item 3): encryptSandboxFile/
 * decryptSandboxFile used to silently fall back to a trivially-reversible
 * `fileData.split('').reverse().join('')` transform when called without a
 * key. That fallback is gone — both now require a real key and throw
 * without one. This block asserts the throw and a real encrypt/decrypt
 * round-trip against an in-memory fake sandbox (readAsStringAsync/
 * writeAsStringAsync are redirected to a Map so the "file" written by
 * encrypt is actually readable back by decrypt in the same test).
 */
describe('StorageService.encryptSandboxFile / decryptSandboxFile', () => {
  const fakeSandbox = new Map<string, string>();

  beforeEach(() => {
    resetMockFs();
    (Platform as unknown as { OS: string }).OS = 'android';
    fakeSandbox.clear();

    const FileSystem = jest.requireMock('expo-file-system/legacy') as {
      readAsStringAsync: jest.Mock;
      writeAsStringAsync: jest.Mock;
      deleteAsync: jest.Mock;
    };
    FileSystem.writeAsStringAsync.mockImplementation(async (path: string, data: string) => {
      fakeSandbox.set(path, data);
    });
    FileSystem.readAsStringAsync.mockImplementation(async (path: string) => {
      const data = fakeSandbox.get(path);
      if (data === undefined) throw new Error(`no such fake file: ${path}`);
      return data;
    });
    FileSystem.deleteAsync.mockImplementation(async (path: string) => {
      fakeSandbox.delete(path);
    });
  });

  it('encryptSandboxFile throws without a key instead of falling back to a reversible transform', async () => {
    fakeSandbox.set('file:///mock-doc/vault_sandbox/plain.bin', 'ZGF0YQ==');
    await expect(
      StorageService.encryptSandboxFile('file:///mock-doc/vault_sandbox/plain.bin', '' as unknown as string)
    ).rejects.toThrow(/encryptionKey is required/);
  });

  it('decryptSandboxFile throws without a key instead of falling back to a reversible transform', async () => {
    fakeSandbox.set('file:///mock-doc/vault_sandbox/plain.bin.enc', 'anything');
    await expect(
      StorageService.decryptSandboxFile('file:///mock-doc/vault_sandbox/plain.bin.enc', undefined as unknown as string)
    ).rejects.toThrow(/encryptionKey is required/);
  });

  it('round-trips real content through a real key', async () => {
    const path = 'file:///mock-doc/vault_sandbox/real.bin';
    fakeSandbox.set(path, 'aGVsbG8gd29ybGQ='); // base64("hello world")

    const encryptedPath = await StorageService.encryptSandboxFile(path, 'correct-horse-battery-staple');
    expect(encryptedPath).toBe(`${path}.enc`);
    // The stored payload must not be the plaintext base64, or a trivial
    // reversal of it — i.e. it must actually be AES output, not the old
    // fallback in disguise.
    const stored = fakeSandbox.get(encryptedPath)!;
    expect(stored).not.toBe('aGVsbG8gd29ybGQ=');
    expect(stored).not.toBe('aGVsbG8gd29ybGQ='.split('').reverse().join(''));

    const decryptedPath = await StorageService.decryptSandboxFile(encryptedPath, 'correct-horse-battery-staple');
    expect(decryptedPath).toBe(path);
    expect(fakeSandbox.get(decryptedPath)).toBe('aGVsbG8gd29ybGQ=');
  });

  it('decrypting with the wrong key rejects instead of returning garbage', async () => {
    const path = 'file:///mock-doc/vault_sandbox/real2.bin';
    fakeSandbox.set(path, 'aGVsbG8gd29ybGQ=');

    const encryptedPath = await StorageService.encryptSandboxFile(path, 'key-a');
    await expect(StorageService.decryptSandboxFile(encryptedPath, 'key-b')).rejects.toThrow();
  });
});

/**
 * Item 9 (plans/what-are-the-next-jaunty-deer.md, closing the audit's §8.2
 * gap): decryptSandboxFile always writes its plaintext output to
 * "<encryptedPath minus .enc>", alongside the still-present ciphertext. A
 * crash between decrypt and a viewer's own unmount-cleanup leaves that
 * plaintext sibling on disk forever. This sweep is the independent backstop:
 * scans the sandbox directory itself (not vault metadata) for any bare-name
 * entry whose "<name>.enc" sibling still exists, and deletes it.
 */
describe('StorageService.sweepOrphanedPlaintextTempFiles', () => {
  function deleteAsyncMock() {
    return jest.requireMock('expo-file-system/legacy').deleteAsync as jest.Mock;
  }

  // A genuine leftover from a prior session is always older than "now" by
  // definition — far outside the sweep's staleness margin.
  const STALE_MTIME_SEC = () => Date.now() / 1000 - 3600;

  beforeEach(() => {
    resetMockFs();
    (Platform as unknown as { OS: string }).OS = 'android';
    // Despite this suite's own earlier comment about resetMocks stripping
    // implementations between tests, empirically call *history* on this
    // shared mock is not reset automatically (no resetMocks/clearMocks is
    // actually configured — checked package.json's jest block and the
    // jest-expo preset directly) — earlier describe blocks' encrypt/decrypt
    // round-trips call deleteAsync too, so without this, this block's call
    // counts would include their leftovers.
    deleteAsyncMock().mockClear();
  });

  it('is a no-op when the vault sandbox directory does not exist yet', async () => {
    await StorageService.sweepOrphanedPlaintextTempFiles();
    expect(deleteAsyncMock()).not.toHaveBeenCalled();
  });

  it('deletes a bare-name file whose .enc sibling still exists (the leftover pattern)', async () => {
    mockFiles[VAULT_DIR] = { isDirectory: true };
    mockDirChildren[VAULT_DIR] = ['abc123.jpg.enc', 'abc123.jpg'];
    mockFiles[`${VAULT_DIR}abc123.jpg`] = { isDirectory: false, modificationTime: STALE_MTIME_SEC() };

    await StorageService.sweepOrphanedPlaintextTempFiles();

    expect(deleteAsyncMock()).toHaveBeenCalledTimes(1);
    expect(deleteAsyncMock()).toHaveBeenCalledWith(`${VAULT_DIR}abc123.jpg`, { idempotent: true });
  });

  it('leaves the .enc file itself untouched', async () => {
    mockFiles[VAULT_DIR] = { isDirectory: true };
    mockDirChildren[VAULT_DIR] = ['abc123.jpg.enc', 'abc123.jpg'];
    mockFiles[`${VAULT_DIR}abc123.jpg`] = { isDirectory: false, modificationTime: STALE_MTIME_SEC() };

    await StorageService.sweepOrphanedPlaintextTempFiles();

    expect(deleteAsyncMock()).not.toHaveBeenCalledWith(`${VAULT_DIR}abc123.jpg.enc`, expect.anything());
  });

  it('does NOT delete a candidate whose plaintext file was just written — the boot-race guard (regression test: a prior version of this sweep could race an actively-open viewer and delete its just-decrypted plaintext out from under it)', async () => {
    mockFiles[VAULT_DIR] = { isDirectory: true };
    mockDirChildren[VAULT_DIR] = ['fresh.jpg.enc', 'fresh.jpg'];
    // Written "now" — indistinguishable from a decrypt that started
    // concurrently with this very sweep call, not a leftover from a past
    // session.
    mockFiles[`${VAULT_DIR}fresh.jpg`] = { isDirectory: false, modificationTime: Date.now() / 1000 };

    await StorageService.sweepOrphanedPlaintextTempFiles();

    expect(deleteAsyncMock()).not.toHaveBeenCalled();
  });

  it('leaves a genuinely unencrypted file alone (no matching .enc sibling)', async () => {
    mockFiles[VAULT_DIR] = { isDirectory: true };
    mockDirChildren[VAULT_DIR] = ['plain-photo.jpg'];

    await StorageService.sweepOrphanedPlaintextTempFiles();

    expect(deleteAsyncMock()).not.toHaveBeenCalled();
  });

  it('sweeps multiple leftovers in one pass and never touches unrelated files', async () => {
    mockFiles[VAULT_DIR] = { isDirectory: true };
    mockDirChildren[VAULT_DIR] = [
      'a.jpg.enc', 'a.jpg',       // leftover
      'b.png.enc', 'b.png',       // leftover
      'c.mp4.enc',                // still-encrypted, cleanly unopened — no leftover
      'd.gif',                    // genuinely unencrypted
    ];
    mockFiles[`${VAULT_DIR}a.jpg`] = { isDirectory: false, modificationTime: STALE_MTIME_SEC() };
    mockFiles[`${VAULT_DIR}b.png`] = { isDirectory: false, modificationTime: STALE_MTIME_SEC() };

    await StorageService.sweepOrphanedPlaintextTempFiles();

    expect(deleteAsyncMock()).toHaveBeenCalledTimes(2);
    expect(deleteAsyncMock()).toHaveBeenCalledWith(`${VAULT_DIR}a.jpg`, { idempotent: true });
    expect(deleteAsyncMock()).toHaveBeenCalledWith(`${VAULT_DIR}b.png`, { idempotent: true });
  });
});
