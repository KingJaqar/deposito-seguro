// File: src/constants/naming.ts
/**
 * Shared cap on folder/file display names. Enforced both at the UI layer
 * (TextField `maxLength`, so users can't type past it) and at the store
 * layer (vaultStore.ts create/rename/import), so the limit holds regardless
 * of entry point — including names that arrive from the OS document picker
 * rather than a text field.
 */
export const MAX_NAME_LENGTH = 60;

/** Truncate a name to MAX_NAME_LENGTH, trimming trailing whitespace left by the cut. */
export function clampNameLength(name: string): string {
  return name.length > MAX_NAME_LENGTH ? name.slice(0, MAX_NAME_LENGTH).trimEnd() : name;
}

/** Display-only cap for names shown in headers/titles: names of DISPLAY_NAME_LENGTH
 * characters or longer are cut short and suffixed with an ellipsis. */
export const DISPLAY_NAME_LENGTH = 30;

export function truncateDisplayName(name: string): string {
  return name.length >= DISPLAY_NAME_LENGTH
    ? `${name.slice(0, DISPLAY_NAME_LENGTH).trimEnd()}…`
    : name;
}
