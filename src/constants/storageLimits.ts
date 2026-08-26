// File: src/constants/storageLimits.ts
/**
 * Vault storage limit thresholds (feature request: "fully functional storage
 * limit threshold in settings"). `null` means Unlimited — no cap is enforced.
 *
 * Enforcement lives in src/store/vaultStore.ts (importFile / copyFileToFolder
 * check usage against useSettingsStore.getState().storageLimitBytes before
 * writing new bytes into the vault sandbox). This file only owns the
 * selectable option list and shared byte-formatting helpers so the Settings
 * UI, the dashboard widget, and the enforcement error messages all agree on
 * the same labels.
 */

export const GB = 1024 * 1024 * 1024;

export interface StorageLimitOption {
  /** Display label, e.g. "8 GB" or "Unlimited". */
  label: string;
  /** Byte threshold, or null for Unlimited (no cap). */
  bytes: number | null;
}

export const STORAGE_LIMIT_OPTIONS: StorageLimitOption[] = [
  { label: '1 GB', bytes: 1 * GB },
  { label: '2 GB', bytes: 2 * GB },
  { label: '4 GB', bytes: 4 * GB },
  { label: '8 GB', bytes: 8 * GB },
  { label: '16 GB', bytes: 16 * GB },
  { label: '32 GB', bytes: 32 * GB },
  { label: '64 GB', bytes: 64 * GB },
  { label: '128 GB', bytes: 128 * GB },
  { label: 'Unlimited', bytes: null },
];

export const DEFAULT_STORAGE_LIMIT_BYTES: number | null = null; // Unlimited by default — don't retroactively cap existing vaults.

/** Human-readable label for a byte threshold — falls back to a raw "N.N GB" for any value outside the preset list. */
export function formatStorageLimit(bytes: number | null): string {
  if (bytes === null) return 'Unlimited';
  const preset = STORAGE_LIMIT_OPTIONS.find((o) => o.bytes === bytes);
  if (preset) return preset.label;
  return `${(bytes / GB).toFixed(1)} GB`;
}

/** Human-readable size for an arbitrary byte count (used vs. limit displays, error messages). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
