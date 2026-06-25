/**
 * Sanitizes a key for use with expo-secure-store.
 * 
 * SecureStore keys must:
 * - Not be empty
 * - Contain only alphanumeric characters, ".", "-", and "_"
 * 
 * @param key - The key to sanitize
 * @param prefix - Optional prefix to prepend (will also be sanitized)
 * @returns A sanitized key safe for SecureStore
 */
export function sanitizeSecureStoreKey(key: string, prefix?: string): string {
  // Combine prefix and key if provided
  const rawKey = prefix ? `${prefix}${key}` : key;
  
  // If empty or whitespace-only, return fallback
  if (!rawKey || rawKey.trim() === '') {
    return 'default_key';
  }
  
  // Replace spaces with underscores
  const noSpaces = rawKey.replace(/\s+/g, '_');
  
  // Remove any characters not allowed by SecureStore
  // Allowed: A-Z, a-z, 0-9, ".", "-", "_"
  const sanitized = noSpaces.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  // Final fallback if sanitization resulted in empty string
  if (!sanitized || sanitized.trim() === '') {
    return 'default_key';
  }
  
  return sanitized;
}