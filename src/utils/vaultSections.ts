// src/utils/vaultSections.ts
// Shared section-builder for the Search and Favorites screens' category-filter
// chips. Both screens render the same 4-part "files / folders / root folders /
// subfolders" breakdown for a type filter (Images, Videos, Documents, Audio,
// Apps, Other), and the same 10/11-part breakdown for "All" (Folders, Files,
// Root Folders, Subfolders, then one section per type, plus — search only —
// a trailing Favorites recap). Favorites.tsx's own "Favorites" chip/section is
// dropped since that whole screen is already favorites-scoped.
import type { FileMetadata, FolderMetadata } from '../types';
import { classifyFileType, FileTypeTag } from './fileTypeClassifier';

export type CategoryFilter = 'All' | 'Images' | 'Videos' | 'Documents' | 'Audio' | 'Apps' | 'Other' | 'Favorites';

export type VaultSectionKey =
  | 'folders' | 'files' | 'rootFolders' | 'subFolders'
  | 'images' | 'videos' | 'documents' | 'audio' | 'apps' | 'other'
  | 'favorites';

export interface VaultSectionData {
  key: VaultSectionKey;
  folders?: FolderMetadata[];
  files?: FileMetadata[];
}

const TAG_BY_FILTER: Partial<Record<CategoryFilter, FileTypeTag>> = {
  Images: 'image',
  Videos: 'video',
  Documents: 'doc',
  Audio: 'audio',
  Apps: 'app',
  Other: 'other',
};

const TYPE_SECTIONS: { key: VaultSectionKey; tag: FileTypeTag }[] = [
  { key: 'images', tag: 'image' },
  { key: 'videos', tag: 'video' },
  { key: 'documents', tag: 'doc' },
  { key: 'audio', tag: 'audio' },
  { key: 'apps', tag: 'app' },
  { key: 'other', tag: 'other' },
];

function byTag(files: FileMetadata[], tag: FileTypeTag): FileMetadata[] {
  return files.filter(f => classifyFileType(f.mimeType ?? '', f.name) === tag);
}

/** Folders (from `folders`) that directly contain at least one non-trash file of `tag`, per `contentFiles`. */
function foldersContainingTag(folders: FolderMetadata[], contentFiles: FileMetadata[], tag: FileTypeTag): FolderMetadata[] {
  const idsWithTag = new Set(
    contentFiles.filter(f => !f.isTrash && classifyFileType(f.mimeType ?? '', f.name) === tag).map(f => f.folderId)
  );
  return folders.filter(f => idsWithTag.has(f.id));
}

/**
 * Builds the ordered list of result sections for a category-filter chip.
 *
 * @param folders  search-query-matched, screen-scoped folders (e.g. favorites.tsx
 *                 passes only favorited folders; search.tsx passes all of them)
 * @param files    search-query-matched, screen-scoped files, same scoping rule
 * @param contentFiles  the *unfiltered-by-query* non-trash file list, used only to
 *                 decide whether a folder "contains" a given file type — a folder's
 *                 content composition shouldn't depend on whether its own name
 *                 matched the search text
 * @param includeFavoritesExtras  true on the Search screen (enables the "Favorites"
 *                 chip's own breakdown, and appends a trailing Favorites section
 *                 under "All"); false on the Favorites screen, which is already
 *                 entirely favorites so that chip/section would be redundant
 */
export function buildVaultSections(opts: {
  activeFilter: CategoryFilter;
  folders: FolderMetadata[];
  files: FileMetadata[];
  contentFiles: FileMetadata[];
  includeFavoritesExtras: boolean;
}): VaultSectionData[] {
  const { activeFilter, folders, files, contentFiles, includeFavoritesExtras } = opts;

  const tag = TAG_BY_FILTER[activeFilter];
  if (tag) {
    const typeFiles = byTag(files, tag);
    const typeFolders = foldersContainingTag(folders, contentFiles, tag);
    return [
      { key: 'files', files: typeFiles },
      { key: 'folders', folders: typeFolders },
      { key: 'rootFolders', folders: typeFolders.filter(f => !f.parentId) },
      { key: 'subFolders', folders: typeFolders.filter(f => !!f.parentId) },
    ];
  }

  if (activeFilter === 'Favorites' && includeFavoritesExtras) {
    const favFolders = folders.filter(f => f.isFavorite);
    const favFiles = files.filter(f => f.isFavorite);
    return [
      { key: 'folders', folders: favFolders },
      { key: 'files', files: favFiles },
      { key: 'rootFolders', folders: favFolders.filter(f => !f.parentId) },
      { key: 'subFolders', folders: favFolders.filter(f => !!f.parentId) },
      ...TYPE_SECTIONS.map(s => ({ key: s.key, files: byTag(favFiles, s.tag) })),
    ];
  }

  // 'All' (and 'Favorites' when includeFavoritesExtras is false, defensively)
  const sections: VaultSectionData[] = [
    { key: 'folders', folders },
    { key: 'files', files },
    { key: 'rootFolders', folders: folders.filter(f => !f.parentId) },
    { key: 'subFolders', folders: folders.filter(f => !!f.parentId) },
    ...TYPE_SECTIONS.map(s => ({ key: s.key, files: byTag(files, s.tag) })),
  ];
  if (includeFavoritesExtras) {
    sections.push({
      key: 'favorites',
      folders: folders.filter(f => f.isFavorite),
      files: files.filter(f => f.isFavorite),
    });
  }
  return sections;
}
