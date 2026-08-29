// File: src/services/storage.ts
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { SecureCrypto } from '../security/crypto';
import { remuxVideoLossless } from '../utils/videoRemux';

const VAULT_DIR = `${FileSystem.documentDirectory}vault_sandbox/`;

const webVaultStorage = new Map<string, string>();

export class StorageService {
  static async initializeSystemDirectories() {
    if (Platform.OS === 'web') {
      return;
    }
    const info = await FileSystem.getInfoAsync(VAULT_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(VAULT_DIR, { intermediates: true });
    }
  }

  static async copyToSandbox(sourceUri: string, filename: string): Promise<string> {
    if (Platform.OS === 'web') {
      return `/web-vault/${filename}`;
    }
    const dest = `${VAULT_DIR}${filename}`;
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
    return dest;
  }

  /**
   * Best-effort lossless remux for a freshly-imported video (see
   * src/utils/videoRemux.ts for why this exists — some source files leave
   * ExoPlayer unable to seek them without it). Must run on the plaintext
   * sandbox copy BEFORE encryption, since it's a real MediaExtractor read of
   * the file's bytes, not something that can operate on ciphertext.
   *
   * On success, the pre-remux original is deleted and the remuxed file's
   * path is returned. On any failure — wrong platform, Expo Go/no native
   * module yet, or the native remux itself erroring on some unusual file —
   * this falls back to `localPath` unchanged, so a remux problem never
   * blocks an import outright (import behaves exactly as it did before this
   * feature existed).
   */
  static async remuxVideoIfPossible(localPath: string, mimeType: string): Promise<string> {
    if (Platform.OS === 'web' || !mimeType.startsWith('video/')) return localPath;

    const outputPath = `${localPath}.remuxed.mp4`;
    const didRemux = await remuxVideoLossless(localPath, outputPath);
    if (!didRemux) return localPath;

    try {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    } catch (e) {
      console.error('Failed to remove pre-remux original file:', e);
    }
    return outputPath;
  }

  static async removeSandboxFile(localPath: string) {
    if (!localPath) return;
    if (Platform.OS === 'web') {
      const fileName = localPath.startsWith('/web-vault/') ? localPath.replace('/web-vault/', '') : localPath;
      webVaultStorage.delete(fileName);
      webVaultStorage.delete(localPath);
      webVaultStorage.delete(`/web-vault/${fileName}`);
      return;
    }
    try {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    } catch {
      return;
    }

  }

  /**
   * Real AES-256-CBC + HMAC-SHA256 (Encrypt-then-MAC) file encryption — see
   * src/security/crypto.ts. Replaces the previous single-byte-repeating-key
   * XOR cipher (Finding S-3). Output is base64/`.` only, so it's safe to
   * write as UTF8 text (the old XOR-over-base64 approach could produce
   * invalid UTF8 byte sequences and silently corrupt data).
   *
   * S-11 remediation (plans/deposito-seguro-audit-report-2026-08-28.md §10):
   * `encryptionKey` used to be optional, silently falling back to
   * `fileData.split('').reverse().join('')` — a trivially-reversible
   * transform that produced a `.enc`-suffixed file visually indistinguishable
   * from a genuinely encrypted one. `encryptionKey` is now required; callers
   * must resolve a real key before calling this (or skip calling it entirely
   * for files that aren't meant to be encrypted).
   */
  static async encryptSandboxFile(localPath: string, encryptionKey: string): Promise<string> {
    if (!encryptionKey) {
      throw new Error('encryptionKey is required: encryptSandboxFile must not be called without one');
    }
    if (Platform.OS === 'web') {
      return localPath;
    }
    const fileData = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
    const transformed = await SecureCrypto.encrypt(fileData, encryptionKey);
    const encryptedPath = `${localPath}.enc`;
    await FileSystem.writeAsStringAsync(encryptedPath, transformed, { encoding: FileSystem.EncodingType.UTF8 });
    await FileSystem.deleteAsync(localPath, { idempotent: true });
    return encryptedPath;
  }

  /** See encryptSandboxFile's S-11 note — `encryptionKey` is required here too. */
  static async decryptSandboxFile(encryptedPath: string, encryptionKey: string): Promise<string> {
    if (!encryptionKey) {
      throw new Error('encryptionKey is required: decryptSandboxFile must not be called without one');
    }
    if (Platform.OS === 'web') {
      return encryptedPath;
    }
    const targetRaw = await FileSystem.readAsStringAsync(encryptedPath, { encoding: FileSystem.EncodingType.UTF8 });
    const inverted = await SecureCrypto.decrypt(targetRaw, encryptionKey);
    // Suffix-anchored (not `.replace('.enc', '')`, which could match an
    // earlier occurrence of the substring ".enc" inside the filename itself).
    const originalPath = encryptedPath.endsWith('.enc') ? encryptedPath.slice(0, -4) : encryptedPath;
    await FileSystem.writeAsStringAsync(originalPath, inverted, { encoding: FileSystem.EncodingType.Base64 });
    return originalPath;
  }

  /**
   * Boot-time sweep for orphaned plaintext temp files (plans/what-are-the-
   * next-jaunty-deer.md item 9, closing the §8.2 gap the 2026-08-28 audit
   * flagged). decryptSandboxFile above always writes its plaintext output to
   * `<encryptedPath minus ".enc">`, *alongside* the still-present ciphertext
   * — every caller (viewer/{document,image,video}.tsx, useFileThumbnailUri)
   * deletes that sibling on unmount, but a crash/force-kill between decrypt
   * and cleanup leaves it sitting on disk indefinitely, with nothing else
   * ever revisiting it.
   *
   * Scans the sandbox directory itself rather than trusting current vault
   * metadata, so a leftover survives even if the file it belonged to was
   * since deleted from the vault entirely: any bare-name entry whose
   * "<name>.enc" sibling still exists in the same directory is, by
   * construction, exactly one of these leftovers — decryptSandboxFile is
   * the only code path that ever produces that pairing.
   *
   * Re-verification note: this doc comment used to also claim the sweep
   * "only ever runs once, at cold boot, before any viewer could possibly be
   * mid-decrypt" as the reason no in-flight use could race against it. That
   * isn't actually enforced anywhere — _layout.tsx's splash-hide has its own
   * 500ms fallback timer independent of this sweep finishing (needed so a
   * hung hydration can't freeze the splash screen forever), and nothing
   * gates screen navigation on the sweep's own completion. If hydration+sweep
   * together outlast that 500ms window on a slow device/large vault, the UI
   * can become navigable while this is still scanning — and a file opened in
   * that window produces the exact same bare-name+".enc"-sibling pairing a
   * genuine orphan has, mid-decrypt.
   *
   * Fixed here, not by touching splash/navigation timing (a deliberate
   * escape hatch for a separate past bug — an indefinitely hanging cold
   * boot — that a hard gate on this sweep would reintroduce): only delete a
   * candidate whose on-disk modification time predates this sweep call. A
   * decrypt that starts anywhere near this race window necessarily writes
   * its plaintext file at (or after) that same moment, so it can never look
   * "old enough" to this check; a true leftover from a prior session is
   * always older by definition. Left-behind files simply get caught on a
   * later boot instead — safe indefinitely, since nothing else ever reads
   * an orphan once its owning viewer has torn down.
   */
  static async sweepOrphanedPlaintextTempFiles(): Promise<void> {
    if (Platform.OS === 'web') return; // Web keeps payloads in-memory; no sandbox dir to sweep.
    const sweepStartedAtSec = Date.now() / 1000;
    const STALENESS_MARGIN_SEC = 5; // clock/timestamp-granularity slack, not a real deadline
    try {
      const info = await FileSystem.getInfoAsync(VAULT_DIR);
      if (!info.exists) return;
      const entries = await FileSystem.readDirectoryAsync(VAULT_DIR);
      const encryptedNames = new Set(entries.filter((name) => name.endsWith('.enc')));
      const candidates = entries.filter((name) => !name.endsWith('.enc') && encryptedNames.has(`${name}.enc`));
      await Promise.all(candidates.map(async (name) => {
        const path = `${VAULT_DIR}${name}`;
        try {
          const fileInfo = await FileSystem.getInfoAsync(path);
          if (!fileInfo.exists) return;
          if (fileInfo.modificationTime > sweepStartedAtSec - STALENESS_MARGIN_SEC) return;
          await FileSystem.deleteAsync(path, { idempotent: true });
        } catch (e) {
          console.error(`Failed to sweep orphaned plaintext temp file "${name}":`, e);
        }
      }));
    } catch (e) {
      console.error('Failed to sweep orphaned plaintext temp files on boot:', e);
    }
  }

  /**
   * True if the file's payload actually exists on this device. Used by
   * vaultStore.reconcileMissingPayloads() to detect metadata whose on-disk
   * bytes are gone. Web keeps payloads in an in-memory map (webVaultStorage),
   * so existence there means "present in that map".
   */
  static async fileExists(localPath: string): Promise<boolean> {
    if (!localPath) return false;
    if (Platform.OS === 'web') {
      const fileName = localPath.startsWith('/web-vault/') ? localPath.replace('/web-vault/', '') : localPath;
      return (await StorageService.getWebFileUri(fileName)) !== null;
    }
    try {
      const info = await FileSystem.getInfoAsync(localPath);
      return info.exists;
    } catch {
      return false;
    }
  }

  static async storeWebFile(uri: string, filename: string): Promise<string> {
    webVaultStorage.set(filename, uri);
    webVaultStorage.set(`/web-vault/${filename}`, uri);
    return `/web-vault/${filename}`;
  }

  static async getWebFileUri(filename: string): Promise<string | null> {
    return webVaultStorage.get(filename) || webVaultStorage.get(`/web-vault/${filename}`) || null;
  }

  static async copySandboxFile(sourcePath: string, destPath: string): Promise<void> {
    if (sourcePath === destPath) {
      return;
    }
    if (Platform.OS === 'web') {
      const content = webVaultStorage.get(sourcePath) || webVaultStorage.get(sourcePath.replace('/web-vault/', '')) || sourcePath;
      webVaultStorage.set(destPath, content);
      return;
    }
    await FileSystem.copyAsync({ from: sourcePath, to: destPath });
  }

  /**
   * I-13 remediation (plans/deposito-seguro-audit-report.md §11): this used
   * to return hardcoded `{ used: 42MB, free: 5GB }` regardless of actual
   * device state. Now reports the real on-disk size of the vault sandbox
   * (recursive walk, since it's the only thing this app can meaningfully
   * call "its" storage usage) and the device's real free space.
   */
  static async getStorageQuotaInfo(): Promise<{ used: number; free: number; total: number }> {
    if (Platform.OS === 'web') {
      let used = 0;
      for (const uri of webVaultStorage.values()) used += uri.length;
      return { used, free: 0, total: 0 };
    }
    try {
      const [used, free, total] = await Promise.all([
        StorageService.getDirectorySize(VAULT_DIR),
        FileSystem.getFreeDiskStorageAsync(),
        FileSystem.getTotalDiskCapacityAsync(),
      ]);
      return { used, free, total };
    } catch (e) {
      console.error('getStorageQuotaInfo failed', e);
      return { used: 0, free: 0, total: 0 };
    }
  }

  private static async getDirectorySize(dirPath: string): Promise<number> {
    const info = await FileSystem.getInfoAsync(dirPath);
    if (!info.exists) return 0;
    if (!info.isDirectory) return info.size ?? 0;

    const entries = await FileSystem.readDirectoryAsync(dirPath);
    const base = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
    const sizes = await Promise.all(
      entries.map((entry) => StorageService.getDirectorySize(`${base}${entry}`))
    );
    return sizes.reduce((sum, size) => sum + size, 0);
  }
}