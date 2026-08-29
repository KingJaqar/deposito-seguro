// File: src/services/backupService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import { Platform } from 'react-native';
import { SecureCrypto } from '../security/crypto';
import { useSettingsStore } from '../store/settingsStore';
import { useVaultStore } from '../store/vaultStore';
import { AccessKeyMetadata, EncryptionKeyMetadata, FileMetadata, FolderMetadata } from '../types';

export interface BackupManifest {
  version: string;
  timestamp: number;
  appName: string;
  appVersion: string;
  vaultStructure: {
    folders: FolderMetadata[];
    files: FileMetadata[];
  };
  settings: {
    encryptionDefault: boolean;
    autoLockDuration: number;
    themeMode: string;
    disguiseMode: string;
  };
  statistics: {
    totalFiles: number;
    totalFolders: number;
    encryptedFiles: number;
    totalSize: number;
  };
  /**
   * Phase 3 — full portable backup (plans/deposito-seguro-audit-report.md
   * §20): the real access-key/encryption-key SECRET values (not just their
   * ids, as before), AES-256-CBC+HMAC-encrypted under a key derived (PBKDF2)
   * from a user-supplied backup passphrase. Absent when the user chose not
   * to set a backup passphrase — in that case, protected content still
   * won't be decryptable after a restore onto a device that doesn't already
   * have the same keys in SecureStore (same limitation the app always had).
   */
  keyMaterial?: {
    salt: string;
    ciphertext: string;
  };
}

export interface BackupResult {
  success: boolean;
  backupPath?: string;
  backupName?: string;
  fileSize?: number;
  error?: string;
  validation?: {
    zipExists: boolean;
    sizeGreaterThanZero: boolean;
    manifestExists: boolean;
  };
}

export interface RestoreResult {
  success: boolean;
  restoredFiles?: number;
  restoredFolders?: number;
  error?: string;
  /** True if the manifest carried encrypted key material but no/incorrect passphrase was supplied to unlock it. */
  needsPassphrase?: boolean;
}

export interface BackupEstimate {
  totalFiles: number;
  totalSize: number;
  estimatedZipSize: number;
}

/** A folder handle returned by pickBackupFolder(): either an Android SAF directory URI, or a plain iOS sandbox path. */
export interface BackupFolderHandle {
  uri: string;
  isSAF: boolean;
  /** Human-readable label for UI display (SAF URIs are not user-friendly). */
  label: string;
}

export class EnhancedBackupService {
  private static readonly BACKUP_FOLDER_NAME = 'Deposito Seguro Backup Files';
  private static readonly BACKUP_PREFIX = 'DepoS_Backup_';
  private static readonly BACKUP_EXTENSION = '.zip';
  private static readonly MANIFEST_FILENAME = 'manifest.json';
  private static readonly BACKUP_VERSION = '2.0.0';

  private static backupPermissionGranted: boolean | null = null;

  // Step 1: Request Permissions
  static async requestStoragePermission(): Promise<boolean> {
    if (Platform.OS === 'web' || Platform.OS === 'ios') {
      // iOS backups stay inside the app sandbox (Documents dir) — no OS
      // permission is needed there. Android's SAF folder picker itself is
      // the permission grant (requestDirectoryPermissionsAsync), so this
      // legacy MediaLibrary permission is only relevant as a pre-flight
      // check before showing the picker.
      return true;
    }

    if (this.backupPermissionGranted !== null) {
      return this.backupPermissionGranted;
    }

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      this.backupPermissionGranted = status === 'granted';
    } catch (e) {
      // S-10: fail closed, not open — an unexpected error negotiating
      // permission is a denial, not an authorization.
      console.warn('Permission request failed, denying access by default', e);
      this.backupPermissionGranted = false;
    }

    return this.backupPermissionGranted;
  }

  /**
   * Real folder picker (I-3 remediation). Android: uses the Storage Access
   * Framework so the user picks an actual OS folder outside the app
   * sandbox — the previous `pickBackupFolder` used `DocumentPicker` (a
   * *file* picker) and treated the chosen file's URI as if it were a
   * folder, which does not work. iOS has no equivalent (apps can't write
   * to arbitrary OS folders outside their sandbox), so it keeps using a
   * folder inside the app's Documents directory, same as before.
   */
  static async pickBackupFolder(): Promise<BackupFolderHandle | null> {
    try {
      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) return null;
        return { uri: permissions.directoryUri, isSAF: true, label: 'Selected folder' };
      }

      // iOS: sandboxed Documents directory.
      const documentsDir = FileSystem.documentDirectory;
      if (!documentsDir) return null;
      const backupFolderPath = `${documentsDir}${this.BACKUP_FOLDER_NAME}/`;
      const dirInfo = await FileSystem.getInfoAsync(backupFolderPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(backupFolderPath, { intermediates: true });
      }
      return { uri: backupFolderPath, isSAF: false, label: this.BACKUP_FOLDER_NAME };
    } catch (e) {
      console.error('Failed to pick backup folder', e);
      return null;
    }
  }

  // Create backup manifest, optionally including encrypted key material.
  static async createBackupManifest(backupPassphrase?: string): Promise<BackupManifest> {
    const vaultState = useVaultStore.getState();
    const settingsState = useSettingsStore.getState();

    const folders = vaultState.folders || [];
    const files = vaultState.files || [];
    const encryptedFiles = files.filter(f => f.isEncrypted).length;
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

    let keyMaterial: BackupManifest['keyMaterial'];
    if (backupPassphrase?.trim()) {
      const salt = await SecureCrypto.generateSaltAsync();
      const derivedKey = await SecureCrypto.hashPassword(backupPassphrase.trim(), salt);
      const payload: { accessKeys: AccessKeyMetadata[]; encryptionKeys: EncryptionKeyMetadata[] } = {
        accessKeys: settingsState.accessKeys,
        encryptionKeys: settingsState.encryptionKeys,
      };
      const payloadBase64 = SecureCrypto.utf8ToBase64(JSON.stringify(payload));
      const ciphertext = await SecureCrypto.encrypt(payloadBase64, derivedKey);
      keyMaterial = { salt, ciphertext };
    }

    return {
      version: this.BACKUP_VERSION,
      timestamp: Date.now(),
      appName: 'Deposito Seguro',
      appVersion: '1.0.0',
      vaultStructure: {
        folders: folders.map(f => ({
          id: f.id,
          name: f.name,
          color: f.color,
          icon: f.icon,
          isEncrypted: f.isEncrypted,
          encryptionKeyId: f.encryptionKeyId,
          hasAccessKey: f.hasAccessKey,
          accessKeyId: f.accessKeyId,
          isFavorite: f.isFavorite,
          isPersonalFavoritesFolder: f.isPersonalFavoritesFolder,
          parentId: f.parentId,
          createdAt: f.createdAt,
        })),
        files: files.map(f => ({
          id: f.id,
          folderId: f.folderId,
          name: f.name,
          size: f.size,
          mimeType: f.mimeType,
          localPath: f.localPath,
          isEncrypted: f.isEncrypted,
          encryptionKeyId: f.encryptionKeyId,
          hasAccessKey: f.hasAccessKey,
          accessKeyId: f.accessKeyId,
          isFavorite: f.isFavorite,
          isTrash: f.isTrash,
          importedAt: f.importedAt,
          deletedAt: f.deletedAt,
        })),
      },
      settings: {
        encryptionDefault: settingsState.encryptionDefault,
        autoLockDuration: settingsState.autoLockDuration,
        themeMode: settingsState.themeMode,
        disguiseMode: settingsState.disguiseMode,
      },
      statistics: {
        totalFiles: files.length,
        totalFolders: folders.length,
        encryptedFiles,
        totalSize,
      },
      keyMaterial,
    };
  }

  // Calculate estimated backup size without creating the backup
  static async calculateBackupSize(): Promise<BackupEstimate> {
    const vaultState = useVaultStore.getState();
    const files = vaultState.files || [];
    const nonTrashFiles = files.filter(f => !f.isTrash);

    const totalFiles = nonTrashFiles.length;
    const totalSize = nonTrashFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    // Real DEFLATE compression on already-mixed (often already-encrypted,
    // low-compressibility) content — still just an estimate shown before
    // the real archive is built.
    const estimatedZipSize = Math.round(totalSize * 0.9);

    return { totalFiles, totalSize, estimatedZipSize };
  }

  /**
   * Builds a real ZIP archive (I-3 remediation — the previous
   * `createZipArchive` just renamed a plain directory to `.zip`, which no
   * standard tool could open) directly from live vault state, and writes it
   * to `folder` (an Android SAF directory or an iOS sandbox path from
   * `pickBackupFolder`). Returns the resulting file's URI.
   */
  static async buildAndWriteZip(
    folder: BackupFolderHandle,
    manifest: BackupManifest,
    onProgress?: (message: string, progress: number) => void
  ): Promise<string> {
    const zip = new JSZip();
    zip.file(this.MANIFEST_FILENAME, JSON.stringify(manifest, null, 2));

    const files = useVaultStore.getState().files.filter(f => !f.isTrash);
    const filesFolder = zip.folder('files')!;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.localPath) {
        try {
          const info = await FileSystem.getInfoAsync(file.localPath);
          if (info.exists) {
            const base64 = await FileSystem.readAsStringAsync(file.localPath, { encoding: FileSystem.EncodingType.Base64 });
            const basename = file.localPath.split('/').pop()!;
            filesFolder.file(basename, base64, { base64: true });
          }
        } catch (e) {
          console.warn(`Failed to add file ${file.id} to backup archive:`, e);
        }
      }
      onProgress?.(`Compressing files: ${i + 1}/${files.length}`, 20 + ((i + 1) / Math.max(files.length, 1)) * 50);
    }

    onProgress?.('Building archive...', 75);
    const zipBase64 = await zip.generateAsync(
      { type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      (metadata) => onProgress?.('Compressing archive...', 75 + metadata.percent * 0.15)
    );

    const filename = `${this.BACKUP_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}${this.BACKUP_EXTENSION}`;

    onProgress?.('Writing backup file...', 92);
    let fileUri: string;
    if (folder.isSAF) {
      fileUri = await FileSystem.StorageAccessFramework.createFileAsync(folder.uri, filename, 'application/zip');
    } else {
      fileUri = `${folder.uri}${filename}`;
    }
    await FileSystem.writeAsStringAsync(fileUri, zipBase64, { encoding: FileSystem.EncodingType.Base64 });

    return fileUri;
  }

  static async validateBackup(backupUri: string): Promise<{ zipExists: boolean; sizeGreaterThanZero: boolean; manifestExists: boolean }> {
    try {
      const info = await FileSystem.getInfoAsync(backupUri);
      const zipExists = info.exists;
      const sizeGreaterThanZero = info.exists && 'size' in info && (info.size || 0) > 0;

      let manifestExists = false;
      if (zipExists) {
        const base64 = await FileSystem.readAsStringAsync(backupUri, { encoding: FileSystem.EncodingType.Base64 });
        const zip = await JSZip.loadAsync(base64, { base64: true });
        manifestExists = !!zip.file(this.MANIFEST_FILENAME);
      }

      return { zipExists, sizeGreaterThanZero, manifestExists };
    } catch {
      return { zipExists: false, sizeGreaterThanZero: false, manifestExists: false };
    }
  }

  static async shareBackup(backupPath: string): Promise<void> {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(backupPath);
    }
  }

  /**
   * Creates a backup in `folder` (from `pickBackupFolder()`), optionally
   * protecting exported access/encryption key secrets under
   * `backupPassphrase` (Phase 3 — full portable backup).
   */
  static async createBackupInFolder(
    folder: BackupFolderHandle,
    backupPassphrase: string | undefined,
    onProgress?: (message: string, progress: number) => void
  ): Promise<BackupResult> {
    try {
      onProgress?.('Requesting storage permissions...', 0);
      const hasPermission = await this.requestStoragePermission();
      if (!hasPermission) {
        return { success: false, error: 'Storage permission denied' };
      }

      onProgress?.('Creating backup manifest...', 5);
      const manifest = await this.createBackupManifest(backupPassphrase);

      onProgress?.('Compressing vault contents...', 15);
      const backupUri = await this.buildAndWriteZip(folder, manifest, onProgress);

      onProgress?.('Validating backup...', 95);
      const validation = await this.validateBackup(backupUri);
      if (!validation.zipExists || !validation.sizeGreaterThanZero || !validation.manifestExists) {
        await FileSystem.deleteAsync(backupUri, { idempotent: true }).catch(() => {});
        return { success: false, error: 'Backup validation failed', validation };
      }

      onProgress?.('Backup complete! Sharing...', 100);
      await this.shareBackup(backupUri).catch(() => {});

      const fileInfo = await FileSystem.getInfoAsync(backupUri);
      const fileSize = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0;

      return { success: true, backupPath: backupUri, backupName: backupUri.split('/').pop(), fileSize, validation };
    } catch (e) {
      console.error('Backup failed:', e);
      return { success: false, error: 'Backup operation failed. Please try again.' };
    }
  }

  /**
   * Restores a backup produced by createBackupInFolder. If the backup
   * carries encrypted key material, `backupPassphrase` must be the same
   * passphrase used to create it — restoring without it (or with the wrong
   * one) still restores the vault structure/files, but access/encryption
   * key secrets are not recovered (existing on-device keys, if any, are
   * left untouched).
   */
  static async restoreBackup(
    backupUri: string,
    backupPassphrase: string | undefined,
    onProgress?: (message: string, progress: number) => void
  ): Promise<RestoreResult> {
    try {
      onProgress?.('Reading backup archive...', 5);
      const zipBase64 = await FileSystem.readAsStringAsync(backupUri, { encoding: FileSystem.EncodingType.Base64 });
      const zip = await JSZip.loadAsync(zipBase64, { base64: true });

      const manifestEntry = zip.file(this.MANIFEST_FILENAME);
      if (!manifestEntry) {
        return { success: false, error: 'Invalid backup: manifest not found' };
      }
      const manifestContent = await manifestEntry.async('string');

      let manifest: BackupManifest;
      try {
        manifest = JSON.parse(manifestContent) as BackupManifest;
        if (!manifest.vaultStructure?.folders || !manifest.vaultStructure?.files) {
          return { success: false, error: 'Invalid backup: corrupted manifest structure' };
        }
      } catch {
        return { success: false, error: 'Invalid backup: corrupted manifest data' };
      }

      onProgress?.('Restoring files...', 30);
      const vaultDir = `${FileSystem.documentDirectory}vault_sandbox/`;
      await FileSystem.makeDirectoryAsync(vaultDir, { intermediates: true });

      const fileEntryNames = Object.keys(zip.files).filter(name => name.startsWith('files/') && !zip.files[name].dir);
      for (let i = 0; i < fileEntryNames.length; i++) {
        const entryName = fileEntryNames[i];
        const base64 = await zip.file(entryName)!.async('base64');
        const destName = entryName.slice('files/'.length);
        await FileSystem.writeAsStringAsync(`${vaultDir}${destName}`, base64, { encoding: FileSystem.EncodingType.Base64 });
        onProgress?.(`Restoring file ${i + 1}/${fileEntryNames.length}`, 30 + ((i + 1) / Math.max(fileEntryNames.length, 1)) * 35);
      }

      // Remap each file's localPath to THIS device's actual sandbox path —
      // the manifest's stored localPath is the originating device/install's
      // absolute path, which will not exist here.
      const remappedFiles = manifest.vaultStructure.files.map(f => {
        if (!f.localPath) return f;
        const basename = f.localPath.split('/').pop()!;
        return { ...f, localPath: `${vaultDir}${basename}` };
      });

      onProgress?.('Restoring vault structure...', 68);
      await AsyncStorage.setItem('@vault_folders', JSON.stringify(manifest.vaultStructure.folders));
      await AsyncStorage.setItem('@vault_files', JSON.stringify(remappedFiles));

      onProgress?.('Restoring settings...', 78);
      await useSettingsStore.getState().updateSetting('encryptionDefault', manifest.settings.encryptionDefault);
      await useSettingsStore.getState().updateSetting('autoLockDuration', manifest.settings.autoLockDuration);

      let needsPassphrase = false;
      if (manifest.keyMaterial) {
        if (!backupPassphrase?.trim()) {
          needsPassphrase = true;
        } else {
          onProgress?.('Decrypting access & encryption keys...', 88);
          let decryptedKeys: { accessKeys: AccessKeyMetadata[]; encryptionKeys: EncryptionKeyMetadata[] } | null = null;
          try {
            const derivedKey = await SecureCrypto.hashPassword(backupPassphrase.trim(), manifest.keyMaterial.salt);
            const payloadBase64 = await SecureCrypto.decrypt(manifest.keyMaterial.ciphertext, derivedKey);
            const payloadJson = SecureCrypto.base64ToUtf8(payloadBase64);
            decryptedKeys = JSON.parse(payloadJson) as {
              accessKeys: AccessKeyMetadata[];
              encryptionKeys: EncryptionKeyMetadata[];
            };
          } catch (e) {
            console.error('Failed to decrypt backup key material (wrong passphrase?)', e);
            needsPassphrase = true;
          }
          // I-11 residual: restoreKeysFromBackup can now throw on an
          // AsyncStorage persist failure (settingsStore.ts's
          // commitSettingsState) — deliberately called outside the decrypt
          // try/catch above, so a persist failure doesn't get misreported as
          // "wrong passphrase" (which would send the user into a confusing
          // passphrase-retry loop for an unrelated storage error). Left
          // uncaught here on purpose: the outer try/catch at the bottom of
          // this function already gives an accurate, if generic, "Restore
          // operation failed" result for this case.
          if (decryptedKeys) {
            await useSettingsStore.getState().restoreKeysFromBackup(decryptedKeys.accessKeys, decryptedKeys.encryptionKeys);
          }
        }
      }

      onProgress?.('Restore complete!', 100);
      return {
        success: true,
        restoredFiles: remappedFiles.length,
        restoredFolders: manifest.vaultStructure.folders.length,
        needsPassphrase,
      };
    } catch (e) {
      console.error('Restore failed:', e);
      return { success: false, error: 'Restore operation failed. Please try again.' };
    }
  }

  /** Lets the user pick a backup file. Kept separate from restoreBackup so the caller can retry with a different passphrase without re-picking the file. */
  static async pickBackupFile(): Promise<string | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/zip',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return null;
      return result.assets[0].uri;
    } catch (e) {
      console.error('Failed to pick backup file', e);
      return null;
    }
  }

  // Import backup from file picker (one-shot convenience wrapper — no passphrase retry).
  static async importBackup(
    backupPassphrase: string | undefined,
    onProgress?: (message: string, progress: number) => void
  ): Promise<RestoreResult> {
    onProgress?.('Select backup file to restore...', 0);
    const backupUri = await this.pickBackupFile();
    if (!backupUri) {
      return { success: false, error: 'Backup selection cancelled' };
    }
    return await this.restoreBackup(backupUri, backupPassphrase, onProgress);
  }
}
