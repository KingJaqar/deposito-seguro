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
   */
  static async encryptSandboxFile(localPath: string, encryptionKey?: string): Promise<string> {
    if (Platform.OS === 'web') {
      return localPath;
    }
    const fileData = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
    const transformed = encryptionKey
      ? await SecureCrypto.encrypt(fileData, encryptionKey)
      : fileData.split('').reverse().join('');
    const encryptedPath = `${localPath}.enc`;
    await FileSystem.writeAsStringAsync(encryptedPath, transformed, { encoding: FileSystem.EncodingType.UTF8 });
    await FileSystem.deleteAsync(localPath, { idempotent: true });
    return encryptedPath;
  }

  static async decryptSandboxFile(encryptedPath: string, encryptionKey?: string): Promise<string> {
    if (Platform.OS === 'web') {
      return encryptedPath;
    }
    const targetRaw = await FileSystem.readAsStringAsync(encryptedPath, { encoding: FileSystem.EncodingType.UTF8 });
    const inverted = encryptionKey
      ? await SecureCrypto.decrypt(targetRaw, encryptionKey)
      : targetRaw.split('').reverse().join('');
    // Suffix-anchored (not `.replace('.enc', '')`, which could match an
    // earlier occurrence of the substring ".enc" inside the filename itself).
    const originalPath = encryptedPath.endsWith('.enc') ? encryptedPath.slice(0, -4) : encryptedPath;
    await FileSystem.writeAsStringAsync(originalPath, inverted, { encoding: FileSystem.EncodingType.Base64 });
    return originalPath;
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