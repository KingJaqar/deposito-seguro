// src/utils/__tests__/vaultSections.test.ts
// Regression coverage for buildVaultSections' album handling (plan §4,
// Phase 5) — this module had no test coverage before, and its three
// branches (type-tag chip, Favorites-chip-with-extras, default 'All') each
// independently need to split albums out of `folders`/`rootFolders`/
// `subFolders` into their own `albums` section, per FolderMetadata.type.
import { buildVaultSections } from '../vaultSections';
import type { FileMetadata, FolderMetadata } from '../../types';

const makeFolder = (overrides: Partial<FolderMetadata> = {}): FolderMetadata => ({
  id: 'folder-1',
  name: 'Folder',
  isFavorite: false,
  isPersonalFavoritesFolder: false,
  createdAt: 0,
  ...overrides,
});

const makeAlbum = (overrides: Partial<FolderMetadata> = {}): FolderMetadata =>
  makeFolder({ id: 'album-1', name: 'Album', type: 'album', ...overrides });

const makeFile = (overrides: Partial<FileMetadata> = {}): FileMetadata => ({
  id: 'file-1',
  folderId: 'folder-1',
  name: 'file.jpg',
  size: 100,
  mimeType: 'image/jpeg',
  localPath: '/x',
  isFavorite: false,
  isTrash: false,
  importedAt: 0,
  ...overrides,
});

describe('buildVaultSections — album handling', () => {
  it("'All' branch: splits albums out of folders/rootFolders/subFolders into their own 'albums' section", () => {
    const plainRoot = makeFolder({ id: 'root-1' });
    const subfolder = makeFolder({ id: 'sub-1', parentId: 'root-1' });
    const album = makeAlbum();

    const sections = buildVaultSections({
      activeFilter: 'All',
      folders: [plainRoot, subfolder, album],
      files: [],
      contentFiles: [],
      includeFavoritesExtras: false,
    });

    const folders = sections.find(s => s.key === 'folders');
    const albums = sections.find(s => s.key === 'albums');
    const rootFolders = sections.find(s => s.key === 'rootFolders');
    const subFolders = sections.find(s => s.key === 'subFolders');

    expect(folders?.folders?.map(f => f.id)).toEqual([plainRoot.id, subfolder.id]);
    expect(albums?.folders?.map(f => f.id)).toEqual([album.id]);
    expect(rootFolders?.folders?.map(f => f.id)).toEqual([plainRoot.id]);
    expect(subFolders?.folders?.map(f => f.id)).toEqual([subfolder.id]);
    // An album must never also leak into rootFolders/subFolders alongside
    // its own dedicated section — every real folders/rootFolders/subFolders
    // slot must be album-free.
    expect(rootFolders?.folders?.some(f => f.type === 'album')).toBe(false);
    expect(subFolders?.folders?.some(f => f.type === 'album')).toBe(false);
  });

  it("'albums' section is placed immediately after 'folders'", () => {
    const sections = buildVaultSections({
      activeFilter: 'All',
      folders: [makeFolder(), makeAlbum()],
      files: [],
      contentFiles: [],
      includeFavoritesExtras: false,
    });
    const keys = sections.map(s => s.key);
    const foldersIdx = keys.indexOf('folders');
    expect(keys[foldersIdx + 1]).toBe('albums');
  });

  it('Favorites-chip-with-extras branch: only favorited albums appear in albums, unfavorited ones are dropped like any other folder', () => {
    const favAlbum = makeAlbum({ id: 'album-fav', isFavorite: true });
    const unfavAlbum = makeAlbum({ id: 'album-unfav', isFavorite: false });
    const favFolder = makeFolder({ id: 'folder-fav', isFavorite: true });

    const sections = buildVaultSections({
      activeFilter: 'Favorites',
      folders: [favAlbum, unfavAlbum, favFolder],
      files: [],
      contentFiles: [],
      includeFavoritesExtras: true,
    });

    const albums = sections.find(s => s.key === 'albums');
    const folders = sections.find(s => s.key === 'folders');
    expect(albums?.folders?.map(f => f.id)).toEqual([favAlbum.id]);
    expect(folders?.folders?.map(f => f.id)).toEqual([favFolder.id]);
  });

  it('type-tag branch (Images): an album containing a matching image is included in albums, not folders/rootFolders', () => {
    const album = makeAlbum();
    const image = makeFile({ id: 'img-1', folderId: album.id, mimeType: 'image/jpeg' });

    const sections = buildVaultSections({
      activeFilter: 'Images',
      folders: [album],
      files: [image],
      contentFiles: [image],
      includeFavoritesExtras: false,
    });

    const albums = sections.find(s => s.key === 'albums');
    const folders = sections.find(s => s.key === 'folders');
    expect(albums?.folders?.map(f => f.id)).toEqual([album.id]);
    expect(folders?.folders ?? []).toEqual([]);
  });

  it("the 'All' branch's trailing Favorites recap (search-only) is not pre-split — album membership is left to the caller's per-item rendering", () => {
    const favAlbum = makeAlbum({ isFavorite: true });
    const sections = buildVaultSections({
      activeFilter: 'All',
      folders: [favAlbum],
      files: [],
      contentFiles: [],
      includeFavoritesExtras: true,
    });
    const favorites = sections.find(s => s.key === 'favorites');
    expect(favorites?.folders?.map(f => f.id)).toEqual([favAlbum.id]);
  });
});
