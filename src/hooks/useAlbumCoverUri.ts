// File: src/hooks/useAlbumCoverUri.ts
// plans/album implementation plan.md §3 — real album cover thumbnails
// (Phase 4), like a Google Photos album card, instead of always showing the
// generic album icon. Finds the most-recently-imported non-trash media file
// in the album and resolves its thumbnail via the exact same
// useFileThumbnailUri hook every other file tile uses, so it automatically
// benefits from §1a's real-thumbnail work (including decrypt-on-read for an
// encrypted cover file). An empty album (no files yet) naturally resolves to
// `undefined`, which GridTile/ListRow already render as the generic icon
// glyph with no extra logic needed here.
import { useMemo } from 'react';
import { useVaultStore } from '../store/vaultStore';
import { useFileThumbnailUri, ThumbnailFile } from './useFileThumbnailUri';

/**
 * `includeTrash` (default false, so every existing non-Trash caller is
 * unaffected): trash 3-segment plan §4c — deleting an album cascades
 * `isTrash: true` onto its own files too (vaultStore.deleteFolder), so a
 * *trashed* album's cover candidates are themselves all trashed. Without
 * this flag the default `f.isTrash` exclusion below would always resolve to
 * `undefined` for a trashed album, silently losing its cover the moment
 * it's trashed. Trash → Albums passes `includeTrash: true` to keep showing
 * the real cover there.
 */
export function useAlbumCoverUri(albumId: string, includeTrash: boolean = false): string | undefined {
  const files = useVaultStore((s) => s.files);

  const coverFile = useMemo<ThumbnailFile>(() => {
    let latest: (typeof files)[number] | undefined;
    for (const f of files) {
      if (f.folderId !== albumId) continue;
      if (f.isTrash && !includeTrash) continue;
      if (!(f.mimeType?.startsWith('image/') || f.mimeType?.startsWith('video/'))) continue;
      if (!latest || f.importedAt > latest.importedAt) latest = f;
    }
    return latest ?? {};
  }, [files, albumId, includeTrash]);

  return useFileThumbnailUri(coverFile);
}
