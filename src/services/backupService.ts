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

const getUriScheme = (uri: string): string => uri.split(':', 1)[0] || 'unknown';

const getUriProvider = (uri: string): string => {
  if (!uri.startsWith('content://')) return 'app-sandbox';
  const authority = uri.slice('content://'.length).split('/', 1)[0];
  return authority || 'unknown';
};

const getUriBasename = (uri: string): string => {
  const withoutQuery = uri.split(/[?#]/, 1)[0];
  return decodeURIComponent(withoutQuery.split('/').pop() || '');
};

const logBackupDiagnostic = (event: string, details: Record<string, unknown> = {}) => {
  // Temporary APK diagnostics. Never include full URIs, passphrases, keys,
  // archive contents, or user-selected filesystem paths.
  if (__DEV__ && process.env.NODE_ENV !== 'test') {
    console.info(`[BackupDiag] ${event}`, details);
  }
};

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
  private static readonly SUPPORTED_BACKUP_VERSIONS = new Set(['2.0.0']);

  private static backupPermissionGranted: boolean | null = null;

  // Step 1: Request Permissions
  static async requestStoragePermission(): Promise<boolean> {
    if (Platform.OS === 'web' || Platform.OS === 'ios' || Platform.OS === 'android') {
      // iOS backups stay inside the app sandbox (Documents dir) — no OS permission needed.
      // Android uses Storage Access Framework (requestDirectoryPermissionsAsync), which handles
      // permissions per selected directory.
      return true;
    }

    if (this.backupPermissionGranted !== null) {
      return this.backupPermissionGranted;
    }

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      this.backupPermissionGranted = status === 'granted';
    } catch (e) {
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
        logBackupDiagnostic('backup:request-directory-permission');
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) return null;
        logBackupDiagnostic('backup:directory-selected', {
          scheme: getUriScheme(permissions.directoryUri),
          provider: getUriProvider(permissions.directoryUri),
        });
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
      logBackupDiagnostic('backup:directory-selected', { scheme: getUriScheme(backupFolderPath), provider: 'app-sandbox' });
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
        // Deliberately NOT in this whitelist: FolderMetadata.customThumbnailPath.
        // A restored folder/album silently reverts to its generic icon /
        // auto-derived cover instead of shipping a dangling path that points
        // at nothing on the new device (the thumbnail file itself is never
        // zipped either — see buildAndWriteZip). Same reasoning as this same
        // whitelist's existing omission of isTrash/deletedAt for folders. See
        // plans/custom folders and album thumbnail implementation plan.md's
        // "Backup/restore" section — don't "fix" this as an oversight.
        folders: folders.map(f => ({
          id: f.id,
          name: f.name,
          color: f.color,
          icon: f.icon,
          type: f.type,
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
          // Bug fix (post-Phase-4 audit, found while re-verifying the plan's
          // §1a real-thumbnail work against backup/restore): iconPath used
          // to be worth skipping here since it was .apk-launcher-icon-only —
          // now that §1a populates it for every imported image/video, an
          // unbacked-up iconPath means a restored vault falls back to
          // useFileThumbnailUri's pre-§1a behavior (file.localPath) for
          // every photo/video, which is flat-out broken (not just slower)
          // for an *encrypted* one — its localPath is ciphertext, the exact
          // bug §1a exists to fix. See buildAndWriteZip below for the
          // matching zip-inclusion fix and restoreFromBackup for the
          // matching localPath-style remap.
          iconPath: f.iconPath,
          iconEncrypted: f.iconEncrypted,
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
    const archiveNames = new Set<string>();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.localPath) {
        const info = await FileSystem.getInfoAsync(file.localPath);
        if (!info.exists) {
          throw new Error('Backup payload is missing for one or more vault files');
        }
        const base64 = await FileSystem.readAsStringAsync(file.localPath, { encoding: FileSystem.EncodingType.Base64 });
        const basename = getUriBasename(file.localPath);
        if (!basename || archiveNames.has(basename)) {
          throw new Error('Backup contains duplicate or invalid payload names');
        }
        archiveNames.add(basename);
        filesFolder.file(basename, base64, { base64: true });
      }
      if (file.iconPath) {
        const iconInfo = await FileSystem.getInfoAsync(file.iconPath);
        if (!iconInfo.exists) {
          throw new Error('Backup thumbnail payload is missing for one or more vault files');
        }
        const iconBase64 = await FileSystem.readAsStringAsync(file.iconPath, { encoding: FileSystem.EncodingType.Base64 });
        const iconBasename = getUriBasename(file.iconPath);
        if (!iconBasename || archiveNames.has(iconBasename)) {
          throw new Error('Backup contains duplicate or invalid payload names');
        }
        archiveNames.add(iconBasename);
        filesFolder.file(iconBasename, iconBase64, { base64: true });
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
    let fileUri: string | undefined;
    try {
      if (folder.isSAF) {
        const baseName = filename.endsWith(this.BACKUP_EXTENSION)
          ? filename.slice(0, -this.BACKUP_EXTENSION.length)
          : filename;
        logBackupDiagnostic('backup:create-file', {
          scheme: getUriScheme(folder.uri),
          provider: getUriProvider(folder.uri),
        });
        fileUri = await FileSystem.StorageAccessFramework.createFileAsync(folder.uri, baseName, 'application/zip');
      } else {
        fileUri = `${folder.uri}${filename}`;
      }
      await FileSystem.writeAsStringAsync(fileUri, zipBase64, { encoding: FileSystem.EncodingType.Base64 });
      logBackupDiagnostic('backup:archive-written', {
        scheme: getUriScheme(fileUri),
        provider: getUriProvider(fileUri),
        archiveSize: Math.round(zipBase64.length * 0.75),
      });
      return fileUri;
    } catch (error) {
      if (fileUri) await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
      throw error;
    }
  }

  static async validateBackup(backupUri: string): Promise<{ zipExists: boolean; sizeGreaterThanZero: boolean; manifestExists: boolean }> {
    try {
      logBackupDiagnostic('backup:validation-start', {
        scheme: getUriScheme(backupUri),
        provider: getUriProvider(backupUri),
      });
      const info = await FileSystem.getInfoAsync(backupUri);
      const zipExists = info.exists;
      let sizeGreaterThanZero = info.exists && 'size' in info && (info.size || 0) > 0;

      let manifestExists = false;
      if (zipExists) {
        const base64 = await FileSystem.readAsStringAsync(backupUri, { encoding: FileSystem.EncodingType.Base64 });
        if (base64 && base64.length > 0) {
          sizeGreaterThanZero = true;
          const zip = await JSZip.loadAsync(base64, { base64: true });
          const manifestEntry = zip.file(this.MANIFEST_FILENAME);
          if (manifestEntry) {
            const manifest = JSON.parse(await manifestEntry.async('string')) as Partial<BackupManifest>;
            manifestExists = this.SUPPORTED_BACKUP_VERSIONS.has(manifest.version || '');
          }
        }
      }

      logBackupDiagnostic('backup:validation-complete', {
        scheme: getUriScheme(backupUri),
        provider: getUriProvider(backupUri),
        archiveSize: 'size' in info && typeof info.size === 'number' ? info.size : undefined,
        manifestExists,
      });

      return { zipExists, sizeGreaterThanZero, manifestExists };
    } catch (e) {
      console.warn('Backup validation check caught error:', e);
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

      const fileInfo = await FileSystem.getInfoAsync(backupUri);
      let fileSize = fileInfo.exists && 'size' in fileInfo && fileInfo.size && fileInfo.size > 0 ? fileInfo.size : 0;
      if (fileSize === 0) {
        try {
          const zipData = await FileSystem.readAsStringAsync(backupUri, { encoding: FileSystem.EncodingType.Base64 });
          fileSize = Math.round(zipData.length * 0.75);
        } catch {
          fileSize = manifest.statistics.totalSize;
        }
      }

      onProgress?.('Backup complete!', 100);

      let backupName = decodeURIComponent(backupUri.split('/').pop() || 'backup.zip');
      if (backupName.includes(':')) {
        backupName = backupName.split(':').pop() || backupName;
      }

      return { success: true, backupPath: backupUri, backupName, fileSize, validation };
    } catch (e: any) {
      console.error('Backup failed:', e);
      return { success: false, error: e?.message ? `Backup operation failed: ${e.message}` : 'Backup operation failed. Please try again.' };
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
    onProgress?: (message: string, progress: number) => void,
    skipKeyMaterial?: boolean
  ): Promise<RestoreResult> {
    const createdPayloadPaths = new Set<string>();
    try {
      logBackupDiagnostic('restore:read-start', {
        scheme: getUriScheme(backupUri),
        provider: getUriProvider(backupUri),
      });
      const backupInfo = await FileSystem.getInfoAsync(backupUri);
      if (!backupInfo.exists) {
        return { success: false, error: 'Selected backup file is not readable' };
      }

      onProgress?.('Reading backup archive...', 5);
      let zipBase64: string;
      try {
        zipBase64 = await FileSystem.readAsStringAsync(backupUri, { encoding: FileSystem.EncodingType.Base64 });
      } catch {
        return { success: false, error: 'Selected backup file is not readable' };
      }

      let zip: JSZip;
      try {
        zip = await JSZip.loadAsync(zipBase64, { base64: true });
      } catch {
        return { success: false, error: 'Unsupported backup format: expected a ZIP containing manifest.json' };
      }

      const manifestEntry = zip.file(this.MANIFEST_FILENAME);
      if (!manifestEntry) {
        return { success: false, error: 'Unsupported backup format: manifest.json was not found' };
      }
      const manifestContent = await manifestEntry.async('string');

      let manifest: BackupManifest;
      try {
        manifest = JSON.parse(manifestContent) as BackupManifest;
        if (!manifest.version) {
          return { success: false, error: 'Unsupported backup format: manifest version is missing' };
        }
        if (!this.SUPPORTED_BACKUP_VERSIONS.has(manifest.version)) {
          return { success: false, error: `Unsupported backup version: ${manifest.version}` };
        }
        if (!Array.isArray(manifest.vaultStructure?.folders) || !Array.isArray(manifest.vaultStructure?.files)) {
          return { success: false, error: 'Invalid backup: corrupted manifest structure' };
        }
      } catch {
        return { success: false, error: 'Invalid backup: corrupted manifest data' };
      }

      let decryptedKeys: { accessKeys: AccessKeyMetadata[]; encryptionKeys: EncryptionKeyMetadata[] } | null = null;
      if (manifest.keyMaterial && !skipKeyMaterial) {
        if (!backupPassphrase?.trim()) {
          return { success: false, needsPassphrase: true };
        }
        onProgress?.('Decrypting access & encryption keys...', 15);
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
          return { success: false, needsPassphrase: true, error: 'Incorrect passphrase' };
        }
      }

      onProgress?.('Restoring files...', 30);
      const vaultDir = `${FileSystem.documentDirectory}vault_sandbox/`;
      await FileSystem.makeDirectoryAsync(vaultDir, { intermediates: true });
      const restorePrefix = `restore_${SecureCrypto.generateUUID()}_`;

      const fileEntryNames = Object.keys(zip.files).filter(name => name.startsWith('files/') && !zip.files[name].dir);
      const entryPathByBasename = new Map<string, string>();

      for (const file of manifest.vaultStructure.files.filter(f => !f.isTrash)) {
        if (!file.localPath || !getUriBasename(file.localPath) || !fileEntryNames.includes(`files/${getUriBasename(file.localPath)}`)) {
          return { success: false, error: 'Invalid backup: payload missing for one or more vault files' };
        }
      }

      for (let i = 0; i < fileEntryNames.length; i++) {
        const entryName = fileEntryNames[i];
        const destName = entryName.slice('files/'.length);
        if (!destName || destName.includes('/') || destName.includes('\\') || destName === '.' || destName === '..' || entryPathByBasename.has(destName)) {
          throw new Error('Invalid backup: unsafe or duplicate payload name');
        }
        const base64 = await zip.file(entryName)!.async('base64');
        const destinationPath = `${vaultDir}${restorePrefix}${destName}`;
        await FileSystem.writeAsStringAsync(destinationPath, base64, { encoding: FileSystem.EncodingType.Base64 });
        if (!(await FileSystem.getInfoAsync(destinationPath)).exists) {
          throw new Error('Restored payload was not written to the vault sandbox');
        }
        createdPayloadPaths.add(destinationPath);
        entryPathByBasename.set(destName, destinationPath);
        onProgress?.(`Restoring file ${i + 1}/${fileEntryNames.length}`, 30 + ((i + 1) / Math.max(fileEntryNames.length, 1)) * 35);
      }

      // Remap each file's localPath to THIS device's actual sandbox path —
      // the manifest's stored localPath is the originating device/install's
      // absolute path, which will not exist here.
      const remappedFiles = manifest.vaultStructure.files.map(f => {
        const localBasename = f.localPath ? getUriBasename(f.localPath) : '';
        const iconBasename = f.iconPath ? getUriBasename(f.iconPath) : '';
        const localPath = localBasename
          ? entryPathByBasename.get(localBasename) ?? `${vaultDir}${restorePrefix}${localBasename}`
          : f.localPath;
        // Thumbnail payloads were added after the first backup format. If an
        // older v2 manifest names a thumbnail that is not present, clear the
        // stale pointer and let the normal file-type fallback render it.
        const iconPath = iconBasename ? entryPathByBasename.get(iconBasename) : undefined;
        return { ...f, localPath, iconPath, iconEncrypted: iconPath ? f.iconEncrypted : false };
      });

      onProgress?.('Restoring vault structure...', 68);
      await AsyncStorage.setItem('@vault_folders', JSON.stringify(manifest.vaultStructure.folders));
      await AsyncStorage.setItem('@vault_files', JSON.stringify(remappedFiles));

      onProgress?.('Restoring settings...', 78);
      if (manifest.settings) {
        if (typeof manifest.settings.encryptionDefault === 'boolean') {
          await useSettingsStore.getState().updateSetting('encryptionDefault', manifest.settings.encryptionDefault);
        }
        if (typeof manifest.settings.autoLockDuration === 'number') {
          await useSettingsStore.getState().updateSetting('autoLockDuration', manifest.settings.autoLockDuration);
        }
        if (manifest.settings.themeMode) {
          await useSettingsStore.getState().updateSetting('themeMode', manifest.settings.themeMode);
        }
        if (manifest.settings.disguiseMode) {
          await useSettingsStore.getState().updateSetting('disguiseMode', manifest.settings.disguiseMode);
        }
      }

      if (decryptedKeys) {
        onProgress?.('Restoring security keys...', 90);
        await useSettingsStore.getState().restoreKeysFromBackup(decryptedKeys.accessKeys, decryptedKeys.encryptionKeys);
      }

      // Update in-memory Zustand only after payload, vault metadata, settings,
      // and key material have all completed. The store action also invalidates
      // any stale cold-start hydration read.
      useVaultStore.getState().replaceVaultStateFromRestore(manifest.vaultStructure.folders, remappedFiles);
      await useVaultStore.getState().reconcileMissingPayloads();

      logBackupDiagnostic('restore:complete', {
        scheme: getUriScheme(backupUri),
        provider: getUriProvider(backupUri),
        restoredFiles: remappedFiles.length,
        restoredFolders: manifest.vaultStructure.folders.length,
      });

      onProgress?.('Restore complete!', 100);
      return {
        success: true,
        restoredFiles: remappedFiles.length,
        restoredFolders: manifest.vaultStructure.folders.length,
        needsPassphrase: false,
      };
    } catch (e: any) {
      console.error('Restore failed:', e);
      await Promise.all([...createdPayloadPaths].map((path) => FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {})));
      return { success: false, error: e?.message ? `Restore operation failed: ${e.message}` : 'Restore operation failed. Please try again.' };
    }
  }

  /** Lets the user pick a backup file. Kept separate from restoreBackup so the caller can retry with a different passphrase without re-picking the file. */
  static async pickBackupFile(): Promise<string | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/zip',
          'application/x-zip-compressed',
          'application/x-zip',
          'application/octet-stream',
          '*/*',
        ],
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
