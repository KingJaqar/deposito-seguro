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

/**
 * Common marketed device capacities, in decimal-ish GB. Manufacturers sell
 * "64 GB" / "128 GB" devices, but `getTotalDiskCapacityAsync()` reports the
 * real formatted partition size, which is normally 5-15% smaller than the
 * marketed figure (filesystem overhead, reserved system partitions). Round
 * the reported total *up* to the nearest tier here so a real "128 GB" phone
 * (which might report ~118 GB to the OS) is still treated as a 128 GB
 * device for cap purposes, instead of being quietly capped at 64 GB.
 */
const DEVICE_CAPACITY_TIERS_GB = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];

function nearestDeviceTierBytes(totalCapacityBytes: number): number {
  if (!totalCapacityBytes || totalCapacityBytes <= 0) return Infinity; // unknown capacity — don't restrict on it
  const tierGB = DEVICE_CAPACITY_TIERS_GB.find((gb) => totalCapacityBytes <= gb * GB);
  return tierGB ? tierGB * GB : totalCapacityBytes;
}

/**
 * Whether a storage limit option should be greyed out for this device, per
 * the "limit cap" feature request:
 *  - a device with only 64 GB of total capacity can't select 64 GB or 128 GB
 *    (it can never physically hold that much)
 *  - a device with 128 GB+ of total capacity can select 128 GB
 *  - regardless of total capacity, an option can't be selected if it's >=
 *    the storage that's actually free right now — filling the vault to that
 *    cap would leave zero free space on the device, which is never useful
 *    (e.g. 64 GB total but only 32 GB free greys out 32 GB, 64 GB, and 128 GB)
 * `Unlimited` (bytes === null) is never disabled.
 */
export function isStorageLimitOptionDisabled(
  optionBytes: number | null,
  totalCapacityBytes: number,
  freeBytes: number
): boolean {
  if (optionBytes === null) return false;
  if (freeBytes > 0 && optionBytes >= freeBytes) return true;
  if (totalCapacityBytes > 0 && optionBytes > nearestDeviceTierBytes(totalCapacityBytes)) return true;
  return false;
}

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
