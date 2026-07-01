# Backup Feature Implementation Documentation

## Overview

The Backup feature for Deposito Seguro enables users to create complete backups of their vault (including files, folders, and settings) and restore them when needed. The implementation is designed for EAS builds while maintaining compatibility with Expo Go for basic functionality.

## Files Modified/Created

### New Files Created:
1. **`src/services/backupService.ts`** - Enhanced backup service with full backup/restore functionality

### Files Modified:
1. **`src/services/backup.ts`** - Updated to re-export EnhancedBackupService for backward compatibility
2. **`src/app/(main)/settings/index.tsx`** - Added backup/restore UI and progress modal

## Architecture

### Backup Service Structure

```
EnhancedBackupService
├── Permission Handling
│   └── requestStoragePermission()
├── Folder Management
│   ├── pickBackupFolder() - Android: native picker, iOS: documents directory
│   └── ensureBackupFolder()
├── Backup Creation
│   ├── createBackup() - Main entry point
│   ├── createBackupManifest() - Creates metadata
│   ├── copyVaultFilesToTemp() - Copies files to temp directory
│   ├── writeManifestToTemp() - Writes manifest JSON
│   ├── createZipArchive() - Creates package (zip-compatible structure)
│   └── validateBackup() - Validates backup integrity
├── Restore Functionality
│   ├── restoreBackup() - Restores from backup package
│   └── importBackup() - File picker for selecting backup
└── Utilities
    ├── getNextBackupFilename() - Sequential naming (DepoS_Backup_001.zip)
    ├── shareBackup() - Share via expo-sharing
    └── cleanupTempFiles() - Clean up temp directories
```

### Backup Package Structure

```
DepoS_Backup_001.zip (or _package directory)
├── manifest.json          # Vault metadata and structure
└── files/                 # All vault files (encrypted as-is)
    ├── {id}_{filename}    # Individual vault files
    └── ...
```

### Manifest Structure

```typescript
{
  version: "1.0.0",
  timestamp: number,
  appName: "Deposito Seguro",
  appVersion: "1.0.0",
  vaultStructure: {
    folders: FolderMetadata[],  // Folder structure (no keys)
    files: FileMetadata[]       // File metadata (no keys)
  },
  settings: {
    encryptionDefault: boolean,
    autoLockDuration: number,
    themeMode: string,
    disguiseMode: string
  },
  statistics: {
    totalFiles: number,
    totalFolders: number,
    encryptedFiles: number,
    totalSize: number
  }
}
```

## Security Considerations

### What IS Included in Backup:
- ✅ Folder structure and metadata
- ✅ File metadata (names, sizes, paths, MIME types)
- ✅ Encryption key IDs (references only, not the keys themselves)
- ✅ Access key IDs (references only)
- ✅ User settings (theme, auto-lock, etc.)
- ✅ Encrypted files (exactly as stored, never decrypted)

### What is NOT Included in Backup:
- ❌ Actual encryption keys (stored in SecureStore)
- ❌ Access key passwords (stored in SecureStore)
- ❌ Master password hash/salt
- ❌ User authentication credentials
- ❌ Plaintext file content

### Security Guarantees:
1. **Keys Never Exposed**: Encryption keys remain in SecureStore and are never written to backup
2. **Files Stay Encrypted**: Vault files are backed up in their encrypted state
3. **No Plaintext Logging**: Sensitive data is never logged
4. **Validation Required**: Backups are validated before being marked complete
5. **Cleanup on Failure**: Partial/failed backups are automatically deleted

## Workflow

### Create Backup Workflow

1. **Permission Request**
   - Android: Requests MediaLibrary permission
   - iOS: Uses app documents directory (no permission needed)

2. **Folder Selection**
   - Android: Launches native document picker for user to select destination
   - iOS: Uses predefined documents directory

3. **Backup Folder Setup**
   - Creates `Deposito Seguro Backup Files/` folder if not exists
   - Scans for existing backups to determine next sequential number

4. **Manifest Creation**
   - Reads vault state from AsyncStorage
   - Creates JSON manifest with metadata
   - **Never includes encryption keys**

5. **File Copying**
   - Copies each non-trash vault file to temp directory
   - Files remain encrypted (no decryption)
   - Progress callbacks for UI updates

6. **Archive Creation**
   - Creates package directory structure
   - Copies manifest and files into package
   - Renames to `.zip` extension for compatibility

7. **Validation**
   - Checks archive exists
   - Verifies size > 0
   - Confirms manifest exists
   - Deletes if validation fails

8. **Cleanup**
   - Deletes temporary directories
   - Shares backup via expo-sharing

9. **User Notification**
   - Shows success alert with backup name and size
   - Or error alert with failure reason

### Restore Workflow

1. **File Selection**
   - User selects backup file via document picker

2. **Manifest Reading**
   - Reads manifest.json from backup package

3. **Vault Structure Restore**
   - Writes folders to AsyncStorage
   - Writes files to AsyncStorage

4. **Settings Restore**
   - Restores backup-related settings

5. **File Restoration**
   - Copies files from backup to vault sandbox
   - Files remain encrypted

6. **Completion**
   - Shows count of restored files/folders

## Error Handling

### Handled Error Scenarios:
- Permission denied
- Picker cancelled
- Invalid destination
- Insufficient storage
- Compression failure
- Validation failure
- Corrupted vault files
- Unexpected exceptions

### Error Recovery:
- All errors trigger cleanup of temporary files
- Partial backups are deleted
- User receives clear error messages
- No sensitive data in error messages

## Platform Differences

### Android (EAS Build)
- Uses Storage Access Framework via DocumentPicker
- User selects any writable destination
- Requires `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` permissions
- Full file system access

### iOS (EAS Build)
- Uses app documents directory
- Backups stored in app sandbox
- Can be accessed via Files app
- No special permissions needed

### Expo Go (Current)
- Limited to app sandbox
- Cannot access external storage
- DocumentPicker works but limited scope
- Basic backup functionality available

### Web
- Uses browser storage
- Limited functionality
- Primarily for development

## UI Components

### Settings Screen Integration
- **Create Backup** button with 📦 icon
- **Restore Backup** button with 📥 icon
- Both in "Data Continuity Engine" section

### Progress Modal
- Shows current operation status
- Progress bar with percentage
- Non-dismissible during operation
- Updates in real-time

## Usage

### Creating a Backup

```typescript
import { BackupService } from './services/backup';

const result = await BackupService.createBackup((message, progress) => {
  console.log(`${message}: ${progress}%`);
});

if (result.success) {
  console.log(`Backup saved as ${result.backupName}`);
} else {
  console.error(`Backup failed: ${result.error}`);
}
```

### Restoring a Backup

```typescript
import { BackupService } from './services/backup';

const result = await BackupService.importBackup((message, progress) => {
  console.log(`${message}: ${progress}%`);
});

if (result.success) {
  console.log(`Restored ${result.restoredFiles} files and ${result.restoredFolders} folders`);
} else {
  console.error(`Restore failed: ${result.error}`);
}
```

## EAS Build Considerations

### Required Configuration

In `eas.json`:
```json
{
  "build": {
    "production": {
      "android": {
        "permissions": [
          "READ_EXTERNAL_STORAGE",
          "WRITE_EXTERNAL_STORAGE"
        ]
      }
    }
  }
}
```

### Future Enhancements (EAS Only)

For production EAS builds, consider adding:
1. **react-native-zip-archive** - Proper ZIP compression
2. **expo-task-manager** - Background backup tasks
3. **expo-background-fetch** - Scheduled automatic backups
4. **Cloud integration** - Google Drive / iCloud backup

## Testing Recommendations

1. **Test with empty vault** - Verify backup creation
2. **Test with large vault** - Verify progress and performance
3. **Test restore** - Verify data integrity
4. **Test permission denial** - Verify error handling
5. **Test cancellation** - Verify cleanup
6. **Test on both platforms** - Verify platform-specific behavior

## Migration Notes

### From Old Backup System
The new system is backward incompatible with the old JSON-only backup format. Users with old backups will need to:
1. Create a new backup with the updated system
2. Old backups can still be imported via `importBackupFromJSONString()` (legacy method preserved in original backup.ts)

## Maintenance

### Regular Tasks
- Monitor backup file sizes
- Clean up old backups periodically
- Test restore functionality regularly
- Update backup format version when needed

### Troubleshooting
- Check AsyncStorage for vault data
- Verify file paths in manifest
- Ensure SecureStore keys are intact
- Check platform permissions

## Summary

The backup feature provides a secure, user-friendly way to backup and restore vault data. It follows security best practices by never exposing encryption keys and keeping files encrypted. The implementation is designed to work within Expo Go limitations while being ready for full EAS build capabilities.