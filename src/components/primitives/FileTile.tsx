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

export function FileGridTile({ file, ...tileProps }: { file: ThumbnailFile } & Omit<GridTileProps, 'thumbnailUri'>) {
  const thumbnailUri = useFileThumbnailUri(file);
  return <GridTile thumbnailUri={thumbnailUri} {...tileProps} />;
}

export function FileListRow({ file, ...rowProps }: { file: ThumbnailFile } & Omit<ListRowProps, 'thumbnailUri'>) {
  const thumbnailUri = useFileThumbnailUri(file);
  return <ListRow thumbnailUri={thumbnailUri} {...rowProps} />;
}
