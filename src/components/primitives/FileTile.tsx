// File: src/components/primitives/FileTile.tsx
//
// Thin per-file wrappers around GridTile/ListRow that resolve `thumbnailUri`
// via useFileThumbnailUri (see that hook for why: S-12's encrypted-icon
// decrypt-to-temp step needs a real hook, and a hook can't be called from
// inside a screen's `.map()` callback directly — Rules of Hooks requires a
// stable per-item component instance to call it from, which these are:
// React already keys one component per file id at each call site).
// GridTile/ListRow themselves stay generic (still used for folder tiles,
// which have no file to resolve a thumbnail from) — only file call sites
// switch to these.
import React from 'react';
import { GridTile, GridTileProps } from './GridTile';
import { ListRow, ListRowProps } from './ListRow';
import { useFileThumbnailUri, ThumbnailFile } from '../../hooks/useFileThumbnailUri';
import { useAlbumCoverUri } from '../../hooks/useAlbumCoverUri';

export function FileGridTile({ file, ...tileProps }: { file: ThumbnailFile } & Omit<GridTileProps, 'thumbnailUri'>) {
  const thumbnailUri = useFileThumbnailUri(file);
  return <GridTile thumbnailUri={thumbnailUri} {...tileProps} />;
}

export function FileListRow({ file, ...rowProps }: { file: ThumbnailFile } & Omit<ListRowProps, 'thumbnailUri'>) {
  const thumbnailUri = useFileThumbnailUri(file);
  return <ListRow thumbnailUri={thumbnailUri} {...rowProps} />;
}

// plans/album implementation plan.md §3 (Phase 4) — parallel wrappers for
// album tiles: resolve a real cover photo/video thumbnail via
// useAlbumCoverUri (falls back to `undefined`, which GridTile/ListRow
// already render as the generic Icon glyph, for an empty album) rather than
// always showing the generic album icon.
//
// plans/custom folders and album thumbnail implementation plan.md (Phase 4)
// — a user-picked customThumbnailPath always wins over the auto-derived
// cover when both are present, matching a custom album cover overriding an
// auto-picked one in Google Photos.
export function AlbumGridTile({ albumId, customThumbnailPath, ...tileProps }: { albumId: string; customThumbnailPath?: string } & Omit<GridTileProps, 'thumbnailUri'>) {
  const autoThumbnailUri = useAlbumCoverUri(albumId);
  return <GridTile thumbnailUri={customThumbnailPath || autoThumbnailUri} {...tileProps} />;
}

export function AlbumListRow({ albumId, customThumbnailPath, ...rowProps }: { albumId: string; customThumbnailPath?: string } & Omit<ListRowProps, 'thumbnailUri'>) {
  const autoThumbnailUri = useAlbumCoverUri(albumId);
  return <ListRow thumbnailUri={customThumbnailPath || autoThumbnailUri} {...rowProps} />;
}
