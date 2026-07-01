// File: src/services/backupService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { useVaultStore } from '../store/vaultStore';
import { FileMetadata, FolderMetadata } from '../types';

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
}

export class EnhancedBackupService {
  private static readonly BACKUP_FOLDER_NAME = 'Deposito Seguro Backup Files';
  private static readonly BACKUP_PREFIX = 'DepoS_Backup_';
  private static readonly BACKUP_EXTENSION = '.zip';
  private static readonly MANIFEST_FILENAME = 'manifest.json';
  private static readonly BACKUP_VERSION = '1.0.0';
  
  private static backupPermissionGranted: boolean | null = null;
  private static backupFolderUri: string | null = null;

  // Step 1: Request Permissions
  static async requestStoragePermission(): Promise<boolean> {
    if (Platform.OS === 'web') {
      return true;
    }

    if (this.backupPermissionGranted !== null) {
      return this.backupPermissionGranted;
    }

    try {
      if (Platform.OS === 'android') {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        this.backupPermissionGranted = status === 'granted';
      } else {
        // iOS doesn't need special permissions for app sandbox
        this.backupPermissionGranted = true;
      }
    } catch (e) {
      console.warn('Permission request failed, granting default access', e);
      this.backupPermissionGranted = true;
    }

    return this.backupPermissionGranted;
  }

  // Step 2: Launch folder picker (Android) or use default location (iOS)
  static async pickBackupFolder(): Promise<string | null> {
    try {
      if (Platform.OS === 'android') {
        const result = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: false,
          multiple: false,
        });

        if (result.canceled || !result.assets || result.assets.length === 0) {
          return null;
        }

        const folderUri = result.assets[0].uri;
        this.backupFolderUri = folderUri;
        return folderUri;
      } else {
        // iOS: Use app's documents directory
        const documentsDir = FileSystem.documentDirectory;
        if (!documentsDir) return null;

        const backupFolderPath = `${documentsDir}${this.BACKUP_FOLDER_NAME}/`;
        
        const dirInfo = await FileSystem.getInfoAsync(backupFolderPath);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(backupFolderPath, { intermediates: true });
        }

        this.backupFolderUri = backupFolderPath;
        return backupFolderPath;
      }
    } catch (e) {
      console.error('Failed to pick backup folder', e);
      return null;
    }
  }

  // Step 3: Ensure backup folder exists
  static async ensureBackupFolder(basePath: string): Promise<string> {
    const backupFolderPath = `${basePath}${this.BACKUP_FOLDER_NAME}/`;
    
    try {
      const dirInfo = await FileSystem.getInfoAsync(backupFolderPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(backupFolderPath, { intermediates: true });
      }
      return backupFolderPath;
    } catch (e) {
      throw new Error(`Failed to create backup folder: ${e}`);
    }
  }

  // Step 4: Get next sequential backup filename
  static async getNextBackupFilename(backupFolderPath: string): Promise<string> {
    try {
      const files = await FileSystem.readDirectoryAsync(backupFolderPath);
      const backupFiles = files
        .filter(f => f.startsWith(this.BACKUP_PREFIX) && f.endsWith(this.BACKUP_EXTENSION))
        .map(f => {
          const match = f.match(/DepoS_Backup_(\d+)\.zip/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => !isNaN(n));

      const nextNum = backupFiles.length > 0 ? Math.max(...backupFiles) + 1 : 1;
      const formattedNum = String(nextNum).padStart(3, '0');
      return `${this.BACKUP_PREFIX}${formattedNum}${this.BACKUP_EXTENSION}`;
    } catch (e) {
      // If directory reading fails, start from 001
      return `${this.BACKUP_PREFIX}001${this.BACKUP_EXTENSION}`;
    }
  }

  // Step 5: Create backup manifest
  static async createBackupManifest(): Promise<BackupManifest> {
    const vaultState = useVaultStore.getState();
    const settingsState = useSettingsStore.getState();

    const folders = vaultState.folders || [];
    const files = vaultState.files || [];
    const encryptedFiles = files.filter(f => f.isEncrypted).length;
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

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
          encryptionKeyId: f.encryptionKeyId, // Metadata only, not the key itself
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
          encryptionKeyId: f.encryptionKeyId, // Metadata only
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
    };
  }

  // Step 6: Create temporary backup directory
  static async createTempBackupDir(): Promise<string> {
    const tempDir = `${FileSystem.cacheDirectory}backup_temp_${Date.now()}/`;
    await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
    return tempDir;
  }

  // Step 7: Copy vault files to temp directory
  static async copyVaultFilesToTemp(tempDir: string, onProgress?: (current: number, total: number) => void): Promise<void> {
    const vaultState = useVaultStore.getState();
    const files = vaultState.files || [];
    const nonTrashFiles = files.filter(f => !f.isTrash);

    // Create files directory
    const filesDir = `${tempDir}files/`;
    await FileSystem.makeDirectoryAsync(filesDir, { intermediates: true });

    // Copy each file
    for (let i = 0; i < nonTrashFiles.length; i++) {
      const file = nonTrashFiles[i];
      if (file.localPath) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(file.localPath);
          if (fileInfo.exists) {
            const destPath = `${filesDir}${file.id}_${file.name}`;
            await FileSystem.copyAsync({ from: file.localPath, to: destPath });
          }
        } catch (e) {
          console.warn(`Failed to copy file ${file.id}:`, e);
        }
      }
      onProgress?.(i + 1, nonTrashFiles.length);
    }
  }

  // Step 8: Write manifest to temp directory
  static async writeManifestToTemp(tempDir: string, manifest: BackupManifest): Promise<void> {
    const manifestPath = `${tempDir}${this.MANIFEST_FILENAME}`;
    await FileSystem.writeAsStringAsync(manifestPath, JSON.stringify(manifest, null, 2), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  // Step 9: Create ZIP archive (using manual implementation since react-native-zip-archive may not be available)
  static async createZipArchive(tempDir: string, outputPath: string, onProgress?: (progress: number) => void): Promise<void> {
    // For now, we'll create a simple archive by copying files
    // In production with EAS, you would use react-native-zip-archive
    
    // Since we can't use native zip in Expo Go, we'll create a backup package
    // that can be restored by copying files back
    
    // Create a simple package structure
    const packageDir = outputPath.replace('.zip', '_package');
    
    // Clean up any existing package directory at this path
    try {
      const existingInfo = await FileSystem.getInfoAsync(packageDir);
      if (existingInfo.exists) {
        await FileSystem.deleteAsync(packageDir, { idempotent: true });
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    
    await FileSystem.makeDirectoryAsync(packageDir, { intermediates: true });
    
    // Copy all temp contents to package
    const tempContents = await FileSystem.readDirectoryAsync(tempDir);
    const totalItems = tempContents.length;
    
    for (let idx = 0; idx < totalItems; idx++) {
      const item = tempContents[idx];
      const sourcePath = `${tempDir}${item}`;
      const destPath = `${packageDir}/${item}`;
      
      const isDir = item === 'files';
      if (isDir) {
        await FileSystem.makeDirectoryAsync(destPath, { intermediates: true });
        const fileContents = await FileSystem.readDirectoryAsync(`${tempDir}files/`);
        const totalFiles = fileContents.length;
        
        for (let fileIdx = 0; fileIdx < totalFiles; fileIdx++) {
          const file = fileContents[fileIdx];
          await FileSystem.copyAsync({
            from: `${tempDir}files/${file}`,
            to: `${destPath}/${file}`
          });
          // Update progress for file copying (50% of archive step)
          const fileProgress = ((fileIdx + 1) / totalFiles) * 100;
          onProgress?.(fileProgress);
        }
      } else {
        await FileSystem.copyAsync({ from: sourcePath, to: destPath });
      }
    }
    
    // Rename package to .zip extension for consistency
    await FileSystem.moveAsync({ from: packageDir, to: outputPath });
    onProgress?.(100);
  }

  // Step 10: Validate backup
  static async validateBackup(backupPath: string): Promise<{
    zipExists: boolean;
    sizeGreaterThanZero: boolean;
    manifestExists: boolean;
  }> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(backupPath);
      const zipExists = fileInfo.exists;
      const sizeGreaterThanZero = fileInfo.exists && (fileInfo.size || 0) > 0;

      // Check if manifest exists (for package format, check inside)
      let manifestExists = false;
      if (zipExists) {
        // For package format, check if manifest.json exists in the package
        const packagePath = backupPath.replace('.zip', '_package');
        const manifestPath = `${packagePath}/${this.MANIFEST_FILENAME}`;
        const manifestInfo = await FileSystem.getInfoAsync(manifestPath);
        manifestExists = manifestInfo.exists;
      }

      return {
        zipExists,
        sizeGreaterThanZero,
        manifestExists,
      };
    } catch (e) {
      return {
        zipExists: false,
        sizeGreaterThanZero: false,
        manifestExists: false,
      };
    }
  }

  // Step 11: Clean up temporary files
  static async cleanupTempFiles(tempDir: string): Promise<void> {
    try {
      await FileSystem.deleteAsync(tempDir, { idempotent: true });
    } catch (e) {
      console.warn('Failed to cleanup temp files:', e);
    }
  }

  // Step 12: Share backup with user
  static async shareBackup(backupPath: string): Promise<void> {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(backupPath);
    }
  }

  // Main backup function
  static async createBackup(
    onProgress?: (message: string, progress: number) => void
  ): Promise<BackupResult> {
    let tempDir = '';
    let backupPath = '';

    try {
      // Step 1: Request permissions
      onProgress?.('Requesting storage permissions...', 0);
      const hasPermission = await this.requestStoragePermission();
      if (!hasPermission) {
        return {
          success: false,
          error: 'Storage permission denied',
        };
      }

      // Step 2: Pick backup folder
      onProgress?.('Selecting backup destination...', 5);
      let basePath = await this.pickBackupFolder();
      if (!basePath) {
        return {
          success: false,
          error: 'Backup folder selection cancelled',
        };
      }

      // Step 3: Ensure backup folder exists
      onProgress?.('Preparing backup folder...', 10);
      const backupFolderPath = await this.ensureBackupFolder(basePath);

      // Step 4: Get next backup filename
      const backupFilename = await this.getNextBackupFilename(backupFolderPath);
      backupPath = `${backupFolderPath}${backupFilename}`;

      // Step 5: Create manifest
      onProgress?.('Creating backup manifest...', 15);
      const manifest = await this.createBackupManifest();

      // Step 6: Create temp directory
      tempDir = await this.createTempBackupDir();

      // Step 7: Copy vault files
      onProgress?.('Copying vault files...', 20);
      await this.copyVaultFilesToTemp(tempDir, (current, total) => {
        const progress = 20 + (current / total) * 40;
        onProgress?.(`Copying files: ${current}/${total}`, progress);
      });

      // Step 8: Write manifest
      onProgress?.('Writing manifest...', 65);
      await this.writeManifestToTemp(tempDir, manifest);

      // Step 9: Create archive
      onProgress?.('Creating backup archive...', 70);
      await this.createZipArchive(tempDir, backupPath, (progress) => {
        onProgress?.('Creating archive...', 70 + (progress * 0.25));
      });

      // Step 10: Validate backup
      onProgress?.('Validating backup...', 95);
      const validation = await this.validateBackup(backupPath);

      if (!validation.zipExists || !validation.sizeGreaterThanZero || !validation.manifestExists) {
        // Cleanup failed backup
        await FileSystem.deleteAsync(backupPath, { idempotent: true });
        return {
          success: false,
          error: 'Backup validation failed',
          validation,
        };
      }

      // Step 11: Cleanup
      await this.cleanupTempFiles(tempDir);

      // Step 12: Share backup
      onProgress?.('Backup complete! Sharing...', 100);
      await this.shareBackup(backupPath);

      const fileInfo = await FileSystem.getInfoAsync(backupPath);
      const fileSize = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0;

      return {
        success: true,
        backupPath,
        backupName: backupFilename,
        fileSize,
        validation,
      };
    } catch (e: any) {
      // Cleanup on error
      if (tempDir) {
        await this.cleanupTempFiles(tempDir);
      }
      if (backupPath) {
        await FileSystem.deleteAsync(backupPath, { idempotent: true });
      }

      // Log full error for debugging but return sanitized message to user
      console.error('Backup failed:', e);
      return {
        success: false,
        error: 'Backup operation failed. Please try again.',
      };
    }
  }

  // Restore backup function
  static async restoreBackup(
    backupUri: string,
    onProgress?: (message: string, progress: number) => void
  ): Promise<RestoreResult> {
    let tempDir = '';

    try {
      onProgress?.('Starting restore process...', 0);

      // For package format, we need to extract and restore
      // This is a simplified version - in production you'd extract the zip
      
      onProgress?.('Reading backup manifest...', 20);
      // Read manifest from backup
      const packagePath = backupUri.replace('.zip', '_package');
      const manifestPath = `${packagePath}/${this.MANIFEST_FILENAME}`;
      
      // Check if manifest file exists
      const manifestInfo = await FileSystem.getInfoAsync(manifestPath);
      if (!manifestInfo.exists) {
        return {
          success: false,
          error: 'Invalid backup: manifest not found',
        };
      }
      
      const manifestContent = await FileSystem.readAsStringAsync(manifestPath, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      
      // Validate and parse manifest JSON
      let manifest: BackupManifest;
      try {
        manifest = JSON.parse(manifestContent) as BackupManifest;
        
        // Validate required fields
        if (!manifest.vaultStructure || !manifest.vaultStructure.folders || !manifest.vaultStructure.files) {
          return {
            success: false,
            error: 'Invalid backup: corrupted manifest structure',
          };
        }
      } catch (parseError) {
        return {
          success: false,
          error: 'Invalid backup: corrupted manifest data',
        };
      }

      onProgress?.('Restoring vault structure...', 40);
      // Restore folders
      const folders = manifest.vaultStructure.folders;
      await AsyncStorage.setItem('@vault_folders', JSON.stringify(folders));

      // Restore files
      const files = manifest.vaultStructure.files;
      await AsyncStorage.setItem('@vault_files', JSON.stringify(files));

      onProgress?.('Restoring settings...', 60);
      // Restore settings (partial - only backup-related settings)
      const currentSettings = useSettingsStore.getState();
      await useSettingsStore.getState().updateSetting('encryptionDefault', manifest.settings.encryptionDefault);
      await useSettingsStore.getState().updateSetting('autoLockDuration', manifest.settings.autoLockDuration);

      onProgress?.('Restoring files...', 80);
      // Copy files from backup to sandbox
      const backupFilesDir = `${packagePath}/files/`;
      const vaultDir = `${FileSystem.documentDirectory}vault_sandbox/`;
      
      await FileSystem.makeDirectoryAsync(vaultDir, { intermediates: true });

      const backupFiles = await FileSystem.readDirectoryAsync(backupFilesDir);
      for (let i = 0; i < backupFiles.length; i++) {
        const fileName = backupFiles[i];
        const sourcePath = `${backupFilesDir}${fileName}`;
        const destPath = `${vaultDir}${fileName}`;
        await FileSystem.copyAsync({ from: sourcePath, to: destPath });
        onProgress?.(`Restoring file ${i + 1}/${backupFiles.length}`, 80 + (i / backupFiles.length) * 15);
      }

      onProgress?.('Restore complete!', 100);

      return {
        success: true,
        restoredFiles: files.length,
        restoredFolders: folders.length,
      };
    } catch (e: any) {
      // Log full error for debugging but return sanitized message to user
      console.error('Restore failed:', e);
      if (tempDir) {
        await this.cleanupTempFiles(tempDir);
      }

      return {
        success: false,
        error: 'Restore operation failed. Please try again.',
      };
    }
  }

  // Import backup from file picker
  static async importBackup(
    onProgress?: (message: string, progress: number) => void
  ): Promise<RestoreResult> {
    try {
      onProgress?.('Select backup file to restore...', 0);
      
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/zip',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return {
          success: false,
          error: 'Backup selection cancelled',
        };
      }

      const backupUri = result.assets[0].uri;
      return await this.restoreBackup(backupUri, onProgress);
    } catch (e: any) {
      // Log full error for debugging but return sanitized message to user
      console.error('Import failed:', e);
      return {
        success: false,
        error: 'Import operation failed. Please try again.',
      };
    }
  }
}
