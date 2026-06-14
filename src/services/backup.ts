import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

export class BackupService {
  private static backupPermissionGranted: boolean | null = null;
  private static readonly BACKUP_DIR = FileSystem.documentDirectory + 'backups/';

  static async requestStoragePermission(): Promise<boolean> {
    if (Platform.OS === 'web') {
      return true;
    }
    
    if (this.backupPermissionGranted !== null) {
      return this.backupPermissionGranted;
    }

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      this.backupPermissionGranted = status === 'granted';
    } catch (e) {
      console.error('Permission request failed', e);
      this.backupPermissionGranted = false;
    }

    return this.backupPermissionGranted;
  }

  static async ensureBackupDirectory(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(this.BACKUP_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.BACKUP_DIR, { intermediates: true });
    }
  }

  static async getNextBackupFilename(): Promise<string> {
    await this.ensureBackupDirectory();
    
    const files = await FileSystem.readDirectoryAsync(this.BACKUP_DIR);
    const backupFiles = files
      .filter(f => f.startsWith('DepoS_backup_') && f.endsWith('.zip'))
      .map(f => {
        const match = f.match(/DepoS_backup_(\d+)\.zip/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => !isNaN(n));
    
    const nextNum = backupFiles.length > 0 ? Math.max(...backupFiles) + 1 : 1;
    const formattedNum = String(nextNum).padStart(3, '0');
    return `${this.BACKUP_DIR}DepoS_backup_${formattedNum}.zip`;
  }

  static async exportCompleteBackupArchive(): Promise<string | null> {
    try {
      const hasPermission = await this.requestStoragePermission();
      if (!hasPermission) {
        return null;
      }

      await this.ensureBackupDirectory();
      
      const archivePath = await this.getNextBackupFilename();

      const folders = await AsyncStorage.getItem('@vault_folders') || '[]';
      const filesMeta = await AsyncStorage.getItem('@vault_files') || '[]';
      const settings = await AsyncStorage.getItem('@vault_settings') || '{}';

      const manifest = {
        version: '1.0.0',
        timestamp: Date.now(),
        folders: JSON.parse(folders),
        files: JSON.parse(filesMeta),
        settings: JSON.parse(settings)
      };

      const manifestContent = JSON.stringify(manifest, null, 2);
      const manifestB64 = btoa(manifestContent);

      const files = JSON.parse(filesMeta);
      let combinedContent = manifestContent + '\n\n--- FILES ---';

      for (const file of files) {
        if (file.localPath && !file.isTrash) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(file.localPath);
            if (fileInfo.exists) {
              const base64 = await FileSystem.readAsStringAsync(file.localPath, { 
                encoding: FileSystem.EncodingType.Base64 
              });
              if (base64) {
                combinedContent += `\n\n--- FILE: ${file.name} ---\n${base64}`;
              }
            }
          } catch (e) {
            console.warn(`Could not add file ${file.name} to backup`, e);
          }
        }
      }

      const binaryContent = new Uint8Array(
        combinedContent.split('').map(c => c.charCodeAt(0))
      );
      
      const backupB64 = btoa(
        Array.from(binaryContent)
          .map(b => String.fromCharCode(b))
          .join('')
      );
      
      await FileSystem.writeAsStringAsync(archivePath, backupB64, { 
        encoding: FileSystem.EncodingType.Base64 
      });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(archivePath);
      }
      return archivePath;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  static async importBackupFromJSONString(jsonString: string): Promise<boolean> {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed.folders && !parsed.files && !parsed.settings) return false;

      if (parsed.folders) {
        await AsyncStorage.setItem('@vault_folders', JSON.stringify(parsed.folders));
      }
      if (parsed.files) {
        await AsyncStorage.setItem('@vault_files', JSON.stringify(parsed.files));
      }
      if (parsed.settings) {
        await AsyncStorage.setItem('@vault_settings', JSON.stringify(parsed.settings));
      }
      return true;
    } catch {
      return false;
    }
  }
}