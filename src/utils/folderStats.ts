// File: src/utils/folderStats.ts
// Shared helpers for the "N files · size" subtitle shown on folder rows/tiles
// across dashboard.tsx, favorites.tsx, and search.tsx, so all three screens
// compute and format folder contents identically.
import type { FileMetadata, FolderMetadata } from '../types';
import type { MoveDestination } from '../contexts/MoveVaultContext';

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

/**
 * Maps folders to the MoveVaultModal's destination shape, folding in each
 * folder's file count/size (from `statsMap`, see getFolderStatsMap) and its
 * favorite/lock state so the picker can render the same badges/subtitle the
 * dashboard, favorites, and search screens already show for these folders.
 */
export function toMoveDestinations(folders: FolderMetadata[], statsMap: Record<string, FolderStats>): MoveDestination[] {
  return folders.map(f => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    isFavorite: f.isFavorite,
    hasAccessKey: !!(f.hasAccessKey || f.accessKeyId),
    fileCount: statsMap[f.id]?.count ?? 0,
    totalSize: statsMap[f.id]?.size ?? 0,
  }));
}

/**
 * Builds a "Root / Parent / Folder"-style breadcrumb label for a folder id
 * by walking parentId up to the root, e.g. for trash.tsx's restore toast
 * ("**file** restored in **path**"). Undefined/missing folderId means the
 * vault root. Guards against a corrupt/circular parentId chain with a visited
 * set instead of looping forever.
 */
export function getFolderPathLabel(folderId: string | undefined, folders: FolderMetadata[]): string {
  if (!folderId) return 'Root';
  const byId = new Map(folders.map(f => [f.id, f]));
  const names: string[] = [];
  const visited = new Set<string>();
  let current = byId.get(folderId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.length > 0 ? `Root / ${names.join(' / ')}` : 'Root';
}
