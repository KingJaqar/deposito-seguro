// File: src/utils/folderStats.ts
// Shared helpers for the "N files · size" subtitle shown on folder rows/tiles
// across dashboard.tsx, favorites.tsx, and search.tsx, so all three screens
// compute and format folder contents identically.
import type { FileMetadata } from '../types';

export interface FolderStats {
  count: number;
  size: number;
}

/** Groups non-trashed files by folderId into a { count, size } map. */
export function getFolderStatsMap(files: FileMetadata[]): Record<string, FolderStats> {
  const map: Record<string, FolderStats> = {};
  for (const f of files) {
    if (f.isTrash) continue;
    const fid = f.folderId;
    if (!map[fid]) map[fid] = { count: 0, size: 0 };
    map[fid].count += 1;
    map[fid].size += f.size;
  }
  return map;
}

/** Formats a folder's stats as e.g. "3 files · 13 MB" / "0 files · 0 MB". */
export function formatFolderStatsLabel(stats: FolderStats | undefined): string {
  const { count = 0, size = 0 } = stats ?? {};
  const mb = size / (1024 * 1024);
  const sizeLabel = mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
  return `${count} files · ${sizeLabel}`;
}
