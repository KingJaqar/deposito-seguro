// File: src/hooks/useFileThumbnailUri.ts
//
// S-12 remediation (plans/deposito-seguro-audit-report-2026-08-28.md §10,
// plans/what-are-the-next-jaunty-deer.md item 1): a .apk's extracted
// launcher-icon thumbnail (src/services/apkIconExtractor.ts) used to always
// be written to and read from plaintext, even for a file the user marked
// "encrypted" — so the app it hid was identifiable from the sandbox alone.
// vaultStore.importFile now encrypts the icon under the same key as the file
// body when one was resolved (see `iconEncrypted` on FileMetadata). This
// hook is the read-side counterpart: it decrypts an encrypted icon to a
// throwaway plaintext temp file for display, mirroring the decrypt-to-temp
// pattern already used by viewer/{image,video,document}.tsx, and cleans that
// temp file up on unmount/file-change — the same discipline those viewers
// use, since grid/list tiles mount and unmount far more often while
// scrolling, making the crash-before-cleanup window (see item 9's boot-time
// sweep) more likely to matter here, not less.
import { useEffect, useState } from 'react';
import { StorageService } from '../services/storage';
import { useSettingsStore } from '../store/settingsStore';

export interface ThumbnailFile {
  mimeType?: string;
  localPath?: string;
  iconPath?: string;
  iconEncrypted?: boolean;
  encryptionKeyId?: string;
}

/**
 * Resolves the URI a file tile should render as its thumbnail.
 * - Images/videos preview their own `localPath` directly (unchanged; a file
 *   encrypted itself just renders as a broken image, same as before this
 *   change — that gap is out of scope for this hook, see plan item 1's
 *   file list).
 * - A `.apk`'s extracted icon renders `iconPath` directly when it isn't
 *   encrypted, or a decrypted temp copy when it is.
 * - Everything else resolves to `undefined`, which callers render as the
 *   generic type icon.
 */
export function useFileThumbnailUri(file: ThumbnailFile): string | undefined {
  const encryptionKeys = useSettingsStore((s) => s.encryptionKeys);
  const [decryptedIconUri, setDecryptedIconUri] = useState<string | undefined>(undefined);

  const isMedia = (file.mimeType?.startsWith('image/') || file.mimeType?.startsWith('video/')) && !!file.localPath;
  const needsIconDecrypt = !isMedia && !!file.iconPath && !!file.iconEncrypted;
  const encryptionKey = needsIconDecrypt
    ? encryptionKeys.find((k) => k.id === file.encryptionKeyId)?.key
    : undefined;

  useEffect(() => {
    // No synchronous setState here (react-hooks/set-state-in-effect — the
    // same anti-pattern family as plan item 8/Finding L-1): setState only
    // ever happens from the async decrypt's own completion below, mirroring
    // viewer/{image,video,document}.tsx's identical decrypt-to-temp effects,
    // which likewise never clear their displayed URI up front on a file
    // switch — the previous thumbnail just stays until the new one resolves
    // or the effect is torn down, rather than flashing to blank first.
    if (!needsIconDecrypt || !file.iconPath || !encryptionKey) {
      return;
    }

    let mounted = true;
    let tempPath: string | undefined;

    StorageService.decryptSandboxFile(file.iconPath, encryptionKey)
      .then((path) => {
        tempPath = path;
        if (mounted) setDecryptedIconUri(path);
      })
      .catch((err) => console.error('Failed to decrypt app icon preview:', err));

    return () => {
      mounted = false;
      if (tempPath) {
        StorageService.removeSandboxFile(tempPath).catch((e) => console.error('Failed to clean up decrypted icon temp file:', e));
      }
    };
  }, [needsIconDecrypt, file.iconPath, encryptionKey]);

  if (isMedia) return file.localPath;
  if (needsIconDecrypt) return decryptedIconUri;
  if (file.iconPath) return file.iconPath;
  return undefined;
}
