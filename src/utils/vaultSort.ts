// src/utils/vaultSort.ts
// Shared sort utility for every vault-listing screen (Dashboard, Folder,
// Favorites, Search, Trash) — see plans/sorting function implementation
// plan.md. Deliberately excludes the album route (its date-grouped grid
// re-sorts internally regardless of input order — see Fix 4 in the plan)
// and the Move-destination picker (Fix 9: out of scope, confirmed with the
// user).

import {
  ArrowUpAZ,
  ArrowDownZA,
  CalendarArrowUp,
  CalendarArrowDown,
  ArrowUpNarrowWide,
  ArrowDownWideNarrow,
  Tag,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { classifyFileType } from './fileTypeClassifier';

export type SortKey =
  | 'name_asc'
  | 'name_desc'
  | 'date_asc'
  | 'date_desc'
  | 'size_asc'
  | 'size_desc'
  | 'type_asc'
  | 'type_desc';

export type SortGroup = 'Name' | 'Date' | 'Size' | 'Type';

export interface SortOptionMeta {
  key: SortKey;
  label: string;
  group: SortGroup;
  Icon: LucideIcon;
}

// Field-paired order (Name×2, Date×2, Size×2, Type×2) — Enhancement A in the
// plan renders a group caption above each pair, relying on this order.
export const SORT_OPTIONS: SortOptionMeta[] = [
  { key: 'name_asc', label: 'Name (A–Z)', group: 'Name', Icon: ArrowUpAZ },
  { key: 'name_desc', label: 'Name (Z–A)', group: 'Name', Icon: ArrowDownZA },
  { key: 'date_desc', label: 'Date (Newest first)', group: 'Date', Icon: CalendarArrowDown },
  { key: 'date_asc', label: 'Date (Oldest first)', group: 'Date', Icon: CalendarArrowUp },
  { key: 'size_desc', label: 'Size (Largest first)', group: 'Size', Icon: ArrowDownWideNarrow },
  { key: 'size_asc', label: 'Size (Smallest first)', group: 'Size', Icon: ArrowUpNarrowWide },
  { key: 'type_asc', label: 'Type (A–Z)', group: 'Type', Icon: Tag },
  { key: 'type_desc', label: 'Type (Z–A)', group: 'Type', Icon: Tag },
];

/**
 * Minimal shape sortFiles needs. Structural, not nominal — both
 * `FileMetadata[]` and trash.tsx's local `TrashedFile[]` satisfy this
 * without a cast (Fix 1). `deletedAt` allows `string` too since trash.tsx's
 * local type widens it that way.
 */
export interface SortableFile {
  id: string;
  name: string;
  size?: number;
  mimeType?: string;
  importedAt?: number;
  deletedAt?: number | string;
}

/** Minimal shape sortFolders needs — structural, matches FolderMetadata. */
export interface SortableFolder {
  id: string;
  name: string;
  createdAt?: number;
  /** Trash 3-segment plan §2e — lets Trash's Folders/Albums segments sort by deletion time. */
  deletedAt?: number;
}

export interface SortFoldersOptions {
  /** Which field feeds the date_* keys. Defaults to 'createdAt'; Trash's Folders/Albums segments pass 'deletedAt'. */
  dateField?: 'createdAt' | 'deletedAt';
}

function compareNumbers(a: number | undefined, b: number | undefined): number {
  return (a ?? 0) - (b ?? 0);
}

function toTime(value: number | string | undefined): number {
  if (value === undefined) return 0;
  return new Date(value).getTime();
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/** Deterministic final tiebreaker so equal-key items don't jitter across re-renders (Fix 8). */
function tiebreak<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}

/**
 * Sorts folders by the given key. Folders have no "type" concept (all are
 * `'folder'` or `'album'`, and albums are already routed into their own
 * section) — `type_asc`/`type_desc` deliberately fall back to a name sort
 * rather than inventing a fake ordering. This is an accepted limitation,
 * not a bug (Fix 6).
 */
export function sortFolders<T extends SortableFolder>(folders: T[], key: SortKey, options: SortFoldersOptions = {}): T[] {
  const dateField = options.dateField ?? 'createdAt';
  const sorted = [...folders];
  sorted.sort((a, b) => {
    switch (key) {
      case 'name_asc':
      case 'type_asc':
        return compareNames(a.name, b.name) || tiebreak(a, b);
      case 'name_desc':
      case 'type_desc':
        return -compareNames(a.name, b.name) || tiebreak(a, b);
      // toTime() (not compareNumbers directly) to mirror sortFiles's own
      // date_* handling exactly, per §2e — harmless today since
      // SortableFolder's createdAt/deletedAt are always plain numbers, but
      // keeps the two sort functions' date logic identical instead of
      // diverging for no reason.
      case 'date_asc':
        return (toTime(a[dateField]) - toTime(b[dateField])) || tiebreak(a, b);
      case 'date_desc':
        return (toTime(b[dateField]) - toTime(a[dateField])) || tiebreak(a, b);
      // Folders have no size field of their own (that's `folderStatsMap`,
      // a derived aggregate keyed separately) — fall back to name, same
      // reasoning as `type_*` above.
      case 'size_asc':
        return compareNames(a.name, b.name) || tiebreak(a, b);
      case 'size_desc':
        return -compareNames(a.name, b.name) || tiebreak(a, b);
      default:
        return tiebreak(a, b);
    }
  });
  return sorted;
}

export interface SortFilesOptions {
  /** Which field feeds the date_* keys. Defaults to 'importedAt'; trash.tsx passes 'deletedAt' (Fix 1). */
  dateField?: 'importedAt' | 'deletedAt';
}

/** Sorts files by the given key. Generic so both `FileMetadata[]` and trash.tsx's `TrashedFile[]` work without a cast (Fix 1). */
export function sortFiles<T extends SortableFile>(
  files: T[],
  key: SortKey,
  options: SortFilesOptions = {}
): T[] {
  const dateField = options.dateField ?? 'importedAt';
  const sorted = [...files];
  sorted.sort((a, b) => {
    switch (key) {
      case 'name_asc':
        return compareNames(a.name, b.name) || tiebreak(a, b);
      case 'name_desc':
        return -compareNames(a.name, b.name) || tiebreak(a, b);
      case 'date_asc':
        return (toTime(a[dateField]) - toTime(b[dateField])) || tiebreak(a, b);
      case 'date_desc':
        return (toTime(b[dateField]) - toTime(a[dateField])) || tiebreak(a, b);
      case 'size_asc':
        return compareNumbers(a.size, b.size) || tiebreak(a, b);
      case 'size_desc':
        return -compareNumbers(a.size, b.size) || tiebreak(a, b);
      case 'type_asc': {
        const ta = classifyFileType(a.mimeType ?? '', a.name);
        const tb = classifyFileType(b.mimeType ?? '', b.name);
        return ta.localeCompare(tb) || compareNames(a.name, b.name) || tiebreak(a, b);
      }
      case 'type_desc': {
        const ta = classifyFileType(a.mimeType ?? '', a.name);
        const tb = classifyFileType(b.mimeType ?? '', b.name);
        return -ta.localeCompare(tb) || compareNames(a.name, b.name) || tiebreak(a, b);
      }
      default:
        return tiebreak(a, b);
    }
  });
  return sorted;
}
