// File: src/services/backup.ts
// This file maintains backward compatibility while integrating with the enhanced backup service
import { EnhancedBackupService, BackupEstimate, BackupManifest, BackupResult, RestoreResult } from './backupService';

// Re-export the enhanced service as the primary BackupService
export const BackupService = EnhancedBackupService;

// Keep legacy exports for backward compatibility if needed
export { EnhancedBackupService, BackupEstimate, BackupManifest, BackupResult, RestoreResult };
