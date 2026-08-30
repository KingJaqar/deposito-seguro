// src/utils/__tests__/vaultSort.test.ts
// Coverage for vaultSort per plans/sorting function implementation
// plan.md, Milestone 1 acceptance criteria: all 8 SortKeys for both
// sortFolders/sortFiles, the folder type_* fallback, the trash
// dateField override, the id-tiebreaker, and a mixed-type NaN-safety case.
import { sortFolders, sortFiles, SORT_OPTIONS, SortKey } from '../vaultSort';
import type { SortableFile, SortableFolder } from '../vaultSort';

const makeFolder = (overrides: Partial<SortableFolder> = {}): SortableFolder => ({
  id: 'f-1',
  name: 'Folder',
  createdAt: 0,
  ...overrides,
});

const makeFile = (overrides: Partial<SortableFile> = {}): SortableFile => ({
  id: 'file-1',
  name: 'file',
  size: 0,
  mimeType: 'image/jpeg',
  importedAt: 0,
  ...overrides,
});

describe('SORT_OPTIONS', () => {
  it('declares exactly the 8 documented keys, paired by field', () => {
    const keys = SORT_OPTIONS.map((o) => o.key);
    expect(keys).toEqual([
      'name_asc',
      'name_desc',
      'date_desc',
      'date_asc',
      'size_desc',
      'size_asc',
      'type_asc',
      'type_desc',
    ]);
  });

  it('every option has a resolved Icon component (guards against a bad lucide import name)', () => {
    for (const option of SORT_OPTIONS) {
      expect(option.Icon).toBeDefined();
    }
  });
});

describe('sortFolders', () => {
  const a = makeFolder({ id: 'a', name: 'Banana', createdAt: 200 });
  const b = makeFolder({ id: 'b', name: 'apple', createdAt: 100 });
  const c = makeFolder({ id: 'c', name: 'Cherry', createdAt: 300 });
  const folders = [a, b, c];

  it('name_asc sorts case-insensitively A→Z', () => {
    expect(sortFolders(folders, 'name_asc').map((f) => f.id)).toEqual(['b', 'a', 'c']);
  });

  it('name_desc sorts case-insensitively Z→A', () => {
    expect(sortFolders(folders, 'name_desc').map((f) => f.id)).toEqual(['c', 'a', 'b']);
  });

  it('date_asc sorts oldest first', () => {
    expect(sortFolders(folders, 'date_asc').map((f) => f.id)).toEqual(['b', 'a', 'c']);
  });

  it('date_desc sorts newest first', () => {
    expect(sortFolders(folders, 'date_desc').map((f) => f.id)).toEqual(['c', 'a', 'b']);
  });

  it('size_asc/size_desc fall back to a name sort (folders have no size field)', () => {
    expect(sortFolders(folders, 'size_asc').map((f) => f.id)).toEqual(
      sortFolders(folders, 'name_asc').map((f) => f.id)
    );
    expect(sortFolders(folders, 'size_desc').map((f) => f.id)).toEqual(
      sortFolders(folders, 'name_desc').map((f) => f.id)
    );
  });

  it('type_asc/type_desc fall back to a name sort (Fix 6 — folders have no type concept)', () => {
    expect(sortFolders(folders, 'type_asc').map((f) => f.id)).toEqual(
      sortFolders(folders, 'name_asc').map((f) => f.id)
    );
    expect(sortFolders(folders, 'type_desc').map((f) => f.id)).toEqual(
      sortFolders(folders, 'name_desc').map((f) => f.id)
    );
  });

  it('ties break deterministically by id, independent of input order (Fix 8)', () => {
    const tied = [
      makeFolder({ id: 'z', name: 'Same', createdAt: 5 }),
      makeFolder({ id: 'y', name: 'Same', createdAt: 5 }),
      makeFolder({ id: 'x', name: 'Same', createdAt: 5 }),
    ];
    const reversedInput = [...tied].reverse();
    expect(sortFolders(tied, 'name_asc').map((f) => f.id)).toEqual(['x', 'y', 'z']);
    expect(sortFolders(reversedInput, 'name_asc').map((f) => f.id)).toEqual(['x', 'y', 'z']);
  });

  it('does not mutate the input array', () => {
    const input = [...folders];
    sortFolders(input, 'name_asc');
    expect(input).toEqual(folders);
  });
});

describe('sortFiles', () => {
  const img = makeFile({ id: 'img', name: 'Beta.jpg', size: 200, mimeType: 'image/jpeg', importedAt: 200 });
  const doc = makeFile({ id: 'doc', name: 'alpha.pdf', size: 100, mimeType: 'application/pdf', importedAt: 100 });
  const vid = makeFile({ id: 'vid', name: 'Gamma.mp4', size: 300, mimeType: 'video/mp4', importedAt: 300 });
  const files = [img, doc, vid];

  it('name_asc/name_desc sort case-insensitively', () => {
    expect(sortFiles(files, 'name_asc').map((f) => f.id)).toEqual(['doc', 'img', 'vid']);
    expect(sortFiles(files, 'name_desc').map((f) => f.id)).toEqual(['vid', 'img', 'doc']);
  });

  it('date_asc/date_desc sort by importedAt by default', () => {
    expect(sortFiles(files, 'date_asc').map((f) => f.id)).toEqual(['doc', 'img', 'vid']);
    expect(sortFiles(files, 'date_desc').map((f) => f.id)).toEqual(['vid', 'img', 'doc']);
  });

  it('size_asc/size_desc sort by size', () => {
    expect(sortFiles(files, 'size_asc').map((f) => f.id)).toEqual(['doc', 'img', 'vid']);
    expect(sortFiles(files, 'size_desc').map((f) => f.id)).toEqual(['vid', 'img', 'doc']);
  });

  it('type_asc/type_desc sort by classified type tag, then name', () => {
    // classifyFileType: doc -> 'doc', img -> 'image', vid -> 'video'
    expect(sortFiles(files, 'type_asc').map((f) => f.id)).toEqual(['doc', 'img', 'vid']);
    expect(sortFiles(files, 'type_desc').map((f) => f.id)).toEqual(['vid', 'img', 'doc']);
  });

  it('dateField option lets trash.tsx sort by deletedAt instead of importedAt (Fix 1)', () => {
    const trashed = [
      makeFile({ id: 'old', name: 'a', importedAt: 999, deletedAt: 100 }),
      makeFile({ id: 'new', name: 'b', importedAt: 1, deletedAt: 300 }),
      makeFile({ id: 'mid', name: 'c', importedAt: 500, deletedAt: 200 }),
    ];
    expect(
      sortFiles(trashed, 'date_desc', { dateField: 'deletedAt' }).map((f) => f.id)
    ).toEqual(['new', 'mid', 'old']);
  });

  it('deletedAt as a string (TrashedFile\'s looser type) sorts correctly, not NaN', () => {
    const trashed = [
      makeFile({ id: 'a', deletedAt: '2024-01-03T00:00:00.000Z' }),
      makeFile({ id: 'b', deletedAt: '2024-01-01T00:00:00.000Z' }),
      makeFile({ id: 'c', deletedAt: '2024-01-02T00:00:00.000Z' }),
    ];
    expect(
      sortFiles(trashed, 'date_asc', { dateField: 'deletedAt' }).map((f) => f.id)
    ).toEqual(['b', 'c', 'a']);
  });

  it('undefined size sorts as if 0, never produces NaN/unspecified order (Fix 7)', () => {
    const mixed = [
      makeFile({ id: 'known', size: 50 }),
      makeFile({ id: 'unknown', size: undefined }),
    ];
    const ascResult = sortFiles(mixed, 'size_asc');
    expect(ascResult.map((f) => f.id)).toEqual(['unknown', 'known']);
    const descResult = sortFiles(mixed, 'size_desc');
    expect(descResult.map((f) => f.id)).toEqual(['known', 'unknown']);
  });

  it('ties break deterministically by id (Fix 8)', () => {
    const tied = [
      makeFile({ id: 'z', name: 'Same', size: 5 }),
      makeFile({ id: 'y', name: 'Same', size: 5 }),
      makeFile({ id: 'x', name: 'Same', size: 5 }),
    ];
    const reversedInput = [...tied].reverse();
    expect(sortFiles(tied, 'size_asc').map((f) => f.id)).toEqual(['x', 'y', 'z']);
    expect(sortFiles(reversedInput, 'size_asc').map((f) => f.id)).toEqual(['x', 'y', 'z']);
  });

  it('does not mutate the input array', () => {
    const input = [...files];
    sortFiles(input, 'name_asc');
    expect(input).toEqual(files);
  });

  it('handles 0- and 1-item arrays as a no-op', () => {
    expect(sortFiles([], 'name_asc')).toEqual([]);
    expect(sortFiles([img], 'name_asc')).toEqual([img]);
  });

  it('every SortKey is handled without throwing', () => {
    const allKeys = SORT_OPTIONS.map((o) => o.key) as SortKey[];
    for (const key of allKeys) {
      expect(() => sortFiles(files, key)).not.toThrow();
      expect(() => sortFolders([makeFolder(), makeFolder({ id: 'g' })], key)).not.toThrow();
    }
  });
});
