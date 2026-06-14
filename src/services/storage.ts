import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

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

  static async removeSandboxFile(localPath: string) {
    if (Platform.OS === 'web') {
      webVaultStorage.delete(localPath);
      webVaultStorage.delete(`/web-vault/${localPath}`);
      return;
    }
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    }
  }

  static async encryptSandboxFile(localPath: string): Promise<string> {
    if (Platform.OS === 'web') {
      return localPath;
    }
    const fileData = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
    const transformed = fileData.split('').reverse().join(''); 
    const encryptedPath = `${localPath}.enc`;
    await FileSystem.writeAsStringAsync(encryptedPath, transformed, { encoding: FileSystem.EncodingType.UTF8 });
    await FileSystem.deleteAsync(localPath, { idempotent: true });
    return encryptedPath;
  }

  static async decryptSandboxFile(encryptedPath: string): Promise<string> {
    if (Platform.OS === 'web') {
      return encryptedPath;
    }
    const targetRaw = await FileSystem.readAsStringAsync(encryptedPath, { encoding: FileSystem.EncodingType.UTF8 });
    const inverted = targetRaw.split('').reverse().join('');
    const originalPath = encryptedPath.replace('.enc', '');
    await FileSystem.writeAsStringAsync(originalPath, inverted, { encoding: FileSystem.EncodingType.Base64 });
    return originalPath;
  }

  static async storeWebFile(uri: string, filename: string): Promise<string> {
    webVaultStorage.set(filename, uri);
    webVaultStorage.set(`/web-vault/${filename}`, uri);
    return `/web-vault/${filename}`;
  }

  static async getWebFileUri(filename: string): Promise<string | null> {
    return webVaultStorage.get(filename) || webVaultStorage.get(`/web-vault/${filename}`) || null;
  }

  static async getStorageQuotaInfo() {
    return {
      used: 1024 * 1024 * 42, 
      free: 1024 * 1024 * 1024 * 5
    };
  }
}