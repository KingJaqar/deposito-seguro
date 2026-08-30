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
//
// Real-thumbnail follow-up (plans/album implementation plan.md §1a):
// vaultStore.importFile now also populates iconPath for images/videos (a
// small downscaled preview / extracted video frame — see
// src/services/mediaThumbnailExtractor.ts), the same field that used to be
// .apk-only. This closed two previously-accepted gaps: video tiles used to
// render as broken images (an <Image> can't decode video bytes) and an
// encrypted image's tile also rendered broken (its localPath pointed at
// ciphertext). Both are fixed for real by preferring iconPath — decrypted
// via the same S-12 machinery above when needed — over localPath whenever
// it's set, falling back to today's old behavior only for files imported
// before this change shipped (no migration needed).
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
 * - `iconPath` is preferred whenever it's set, regardless of file type —
 *   for images/videos imported after §1a this is a small downscaled
 *   preview / extracted video frame; for a `.apk` it's still the extracted
 *   launcher icon. Decrypted via the existing S-12 machinery when
 *   `iconEncrypted`, read directly otherwise.
 * - Falls back to `file.localPath` for images/videos only when `iconPath`
 *   is unset — i.e. a file imported before §1a shipped. No migration: it
 *   just keeps rendering exactly as it did before, until re-imported.
 * - Everything else resolves to `undefined`, which callers render as the
 *   generic type icon.
 */
export function useFileThumbnailUri(file: ThumbnailFile): string | undefined {
  const encryptionKeys = useSettingsStore((s) => s.encryptionKeys);
  const [decryptedIconUri, setDecryptedIconUri] = useState<string | undefined>(undefined);

  const isMedia = (file.mimeType?.startsWith('image/') || file.mimeType?.startsWith('video/')) && !!file.localPath;
  const needsIconDecrypt = !!file.iconPath && !!file.iconEncrypted;
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

  if (file.iconPath) {
    return needsIconDecrypt ? decryptedIconUri : file.iconPath;
  }
  if (isMedia) return file.localPath;
  return undefined;
}
