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

export function useAlbumCoverUri(albumId: string): string | undefined {
  const files = useVaultStore((s) => s.files);

  const coverFile = useMemo<ThumbnailFile>(() => {
    let latest: (typeof files)[number] | undefined;
    for (const f of files) {
      if (f.folderId !== albumId || f.isTrash) continue;
      if (!(f.mimeType?.startsWith('image/') || f.mimeType?.startsWith('video/'))) continue;
      if (!latest || f.importedAt > latest.importedAt) latest = f;
    }
    return latest ?? {};
  }, [files, albumId]);

  return useFileThumbnailUri(coverFile);
}
