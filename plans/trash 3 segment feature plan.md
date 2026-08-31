# Trash screen: Files / Folders / Albums segments + real folder/album restore

## Context

The Trash screen (`src/app/(main)/trash.tsx`) currently only ever shows
deleted **files** (`files.filter(f => f.isTrash)`). Folders and albums have
no trash concept at all: `FolderMetadata` has no `isTrash`/`deletedAt`
field, and `deleteFolder` in `src/store/vaultStore.ts:435` **hard-deletes**
the folder record immediately — even though every call site presents this
to the user as "Move to Trash" (`VaultContentsScreen.tsx:653/721`,
`dashboard.tsx:353`, `favorites.tsx:487`, `search.tsx:481`, all captioned
"...will be moved back to its original location" style wording elsewhere).
That's a real bug independent of this feature request: a folder the user
believes they can undo is actually gone forever, and only its *direct*
child files get soft-deleted into trash — files sitting in a **subfolder**
of the deleted folder are silently orphaned (never trashed, never
reachable, per the I-12 comment thread already in the file). A second,
related bug: `shredFolder` (the *permanent* delete path) only removes the
one folder record and its *direct* files too — subfolders and their files
are never cascaded, leaking dangling metadata.

This plan (1) gives folders and albums a real, restorable trash state,
fixing both bugs as a side effect, and (2) rebuilds the Trash screen around
a Files / Folders / Albums segmented control so the user can actually see
and recover what they deleted, and (3) makes "original container is gone"
restores land in a freshly dated `Restored Files <date & time>` root
folder instead of silently reusing a generic fixed name.

## Execution phases

Each phase should land as its own commit and leave the app in a working,
type-checked state (no phase depends on a *later* phase's code, only on
earlier ones) — so this can be executed and verified incrementally rather
than as one giant change.

**Phase 1 — Data model + store layer (§1, §2a–§2e).**
`src/types/index.ts` (`isTrash`/`deletedAt` on `FolderMetadata`), then
`src/store/vaultStore.ts`: rewrite `deleteFolder`, fix the cascade bug in
`shredFolder`/`shredMultipleFolders`, add the `isContainerUnreachable`
helper and the dated-fallback-folder builder, add
`restoreFolderFromTrash`/`restoreFoldersFromTrash`/`restoreFilesFromTrash`,
update `restoreFileFromTrash` to use both. Add the `dateField` option to
`sortFolders` in `src/utils/vaultSort.ts`. Nothing in the UI calls the new
functions yet — existing screens keep calling today's `deleteFolder`/
`shredFolder`/`restoreFileFromTrash` with their existing (now-fixed)
behavior, so the app builds and runs unchanged from a user's perspective
except that folder/album delete is now actually reversible (no UI to
reverse it yet — that's Phase 3).
*Checkpoint*: `npx tsc --noEmit` clean; run `src/store/__tests__/vaultStore.test.ts`
plus the new cases described in §5 for this layer (cascade trash, cascade
shred, subtree restore, fallback folder) — get these passing before moving on.

**Phase 2 — Active-listing filter audit (§3).**
Add `!f.isTrash` to every "live folder" listing found in §3:
`dashboard.tsx` (`rootFolders`, `subFolders`, the albums list feeding "My
Albums"), the three "Add to Album" destination pickers (`favorites.tsx:119`,
`search.tsx:115`, `VaultContentsScreen.tsx:128`), and
`VaultContentsScreen.tsx`'s/`favorites.tsx`'s subfolder listings. Leave
`search.tsx:166`'s `allFolders` untouched (already correct).
*Checkpoint*: manually delete a folder (Phase 1's new soft-delete) and
confirm it disappears from Dashboard, Favorites, Search results, and every
"Add to Album"/"Move to..." picker — it should now be invisible everywhere
except (still, until Phase 3) nowhere, since Trash has no folder UI yet.
This is the right moment to catch a missed filter site, before Trash UI
work makes it harder to notice one.

**Phase 3 — Trash screen rebuild (§4a–§4d).**
`src/app/(main)/trash.tsx`: add the segmented control, the Folders/Albums
data pipelines, `FolderTrashRow` + `GridTile`-based grid rendering, and
wire restore/permanent-delete actions to the Phase 1 store functions.
*Checkpoint*: run the app and walk through all 6 manual scenarios in §5.

**Phase 4 — Final verification (§5).**
Full `npx tsc --noEmit`, full test suite, and a final pass through every
§5 scenario end-to-end (including the ones that span phases, like
restoring a subtree and confirming it reappears in Dashboard).

## 1. Data model — `src/types/index.ts`

Add to `FolderMetadata` (mirrors `FileMetadata`'s existing `isTrash`/`deletedAt`):

```ts
isTrash?: boolean;
deletedAt?: number;
```

Applies uniformly to folders and albums (an album is just `FolderMetadata`
with `type: 'album'` — no separate type needed).

## 2. Store layer — `src/store/vaultStore.ts`

### 2a. `deleteFolder(folderId)` — rewrite to real soft-delete, whole subtree

Replace the hard-delete with a cascade soft-delete over the folder **and
every descendant** (via the existing `getFolderDescendants(folderId)`):
- Every folder in `{folderId, ...descendants}` gets `isTrash: true, deletedAt: Date.now()`.
- Every file whose `folderId` is in that same set gets `isTrash: true, deletedAt: Date.now()` (this is the fix for the orphaned-subfolder-files bug — today only direct children are touched).
- **Access-key inheritance must run per descendant, not once for the top-level folder.** The existing walk (lines 456–478) only ever resolved the nearest lock along the *exact deleted folder's* own ancestor chain and applied it to that folder's *direct* files. Now that files inside descendant subfolders are also being trashed for the first time, each descendant folder needs its own inherited-lock resolution (walk its own ancestor chain — which passes up through the target folder into the same external ancestors) before deciding whether its files inherit a lock. Concretely: build a `Map<folderId, accessKeyId | undefined>` by resolving the nearest lock for the target folder once, then for each descendant folder either reuse its own `hasAccessKey/accessKeyId` if set, or otherwise the nearest ancestor's (walking up through already-resolved entries in the map first, since the target's own resolution is already known). Apply the same "only if the file doesn't already have its own key" rule per file as today.
- Folder records are **never removed** by this action anymore — only `shredFolder`/`shredMultipleFolders` (permanent delete) removes metadata.

### 2b. `shredFolder`/`shredMultipleFolders` — fix cascade bug

Extend both to walk `getFolderDescendants(folderId)` too: remove payloads
for files in the folder **and every descendant**, then drop **all** those
folder records and file records in the same `commitVaultState` call
(currently they only touch the one folder + its direct files). This is the
"permanently delete" action the new Trash Folders/Albums segments call.

### 2c. New restore actions

Add a shared internal helper (not exported) that both file- and
folder-restore paths use:

```ts
// Walks parentId up to root; "findable" means every link exists AND is
// not itself isTrash. Returns true if the chain is broken or trashed
// anywhere along the way — the unified trigger for the dated fallback
// folder, whether the container was hard-deleted (shredded) or is simply
// still sitting in trash itself (so restoring into it would make the
// item unreachable from normal browsing).
function isContainerUnreachable(containerId: string | undefined, folders: FolderMetadata[]): boolean
```

- **`restoreFileFromTrash(fileId)`** — same signature/return shape as today, but its "does the folder still exist" check becomes `isContainerUnreachable(targetFile.folderId, folders)`, and the fallback folder it creates is the new dated one (§2d) instead of the static-named one.
- **`restoreFilesFromTrash(fileIds: string[])`** (new, bulk) — computes **one** shared dated fallback folder for the whole batch (if any files need it) instead of one per file, then applies it inside a single `commitVaultState`. `trash.tsx`'s `handleRestoreSelected` switches to this instead of `Promise.allSettled(ids.map(restoreFileFromTrash))`.
- **`restoreFolderFromTrash(folderId)`** (new) — restores the target folder **and its entire trashed descendant subtree together** (all-or-nothing, mirroring `deleteFolder`'s cascade): clears `isTrash`/`deletedAt` on the folder + every descendant folder, and on every file inside that subtree. Reachability is checked **only for the target folder's own parent** (`isContainerUnreachable(folder.parentId, folders)`) — descendants are covered by being restored in the same call, so they never independently trigger the fallback. If unreachable, the *target folder itself* (not its descendants) is reparented into the dated fallback folder — descendants keep their existing `parentId` pointing at the target, which is correct since the whole subtree moves together. Albums (`parentId` always `undefined`) never hit the fallback path — they always restore straight to root.
- **`restoreFoldersFromTrash(folderIds: string[])`** (new, bulk) — same shared-fallback-folder batching as `restoreFilesFromTrash`, one call covering multiple folders/albums (e.g. "Restore selected" in the Folders or Albums segment).

### 2d. Dated fallback folder

Replace the existing static `'Restored Files'` lookup/creation
(`restoreFileFromTrash`, vaultStore.ts:642–658) with a helper that builds
the name from the current moment, e.g. `Restored Files – Aug 31, 2026, 3:45:12 PM`
(match the existing `toLocaleString` style already used by trash.tsx's
`formatDeletedAt`, just with seconds added for extra collision safety).
One dated folder is created **per store-action call** (single or bulk) and
reused for every item that call restores into it — separate calls (e.g.
two different single-item restores a minute apart) get their own distinct
dated folders, which matches "automatically create a ... root folder"
reading naturally as one folder per restore action. No dedup-by-name
lookup is needed since the timestamp already makes each one unique;
construct it the same inline way the existing fallback folder is built
(`SecureCrypto.generateUUID()`, `color: '#34C759'`, `icon: 'folder'`,
`type: 'folder'`, `isFavorite: false`, `isPersonalFavoritesFolder: false`,
`createdAt: Date.now()`), running the generated name through
`clampNameLength` first (matching `createFolder`'s own handling — the
existing static-name fallback never needed this since `'Restored Files'`
is always short, but the dated name should stay consistent with every
other folder-name code path).

### 2e. `sortFolders` — add a `dateField` option

Mirror `sortFiles`'s existing `SortFilesOptions.dateField` (`src/utils/vaultSort.ts:128`):
add `SortFoldersOptions { dateField?: 'createdAt' | 'deletedAt' }` to
`sortFolders`, defaulting to `'createdAt'`, so Trash's Folders/Albums
segments can sort by `deletedAt` the same way Trash's Files segment
already does via `sortFiles(..., { dateField: 'deletedAt' })`.

## 3. Active-listing filters — exclude trashed folders

Every place that lists "live" folders needs `!f.isTrash` added alongside
its existing filters, the same pattern repeated per screen. Verified by
grep against the current tree — sites confirmed to need the fix:
- `dashboard.tsx:270–279` (`rootFolders`, `subFolders`) **and line 279's
  albums list** (`folders.filter(f => f.type === 'album')` — feeds the
  "My Albums" dashboard section, no trash guard today).
- **Three independent "Add to Album" destination pickers**, each its own
  `folders.filter(f => f.type === 'album')` with no trash guard:
  `favorites.tsx:119`, `search.tsx:115`, `VaultContentsScreen.tsx:128`.
  Without this fix a trashed album stays choosable as a move/add-to-album
  target after this feature ships.
- `VaultContentsScreen.tsx` subfolder listing for a given container; `favorites.tsx` root/sub folder listings.
- `getFolderStatsMap` (`src/utils/folderStats.ts:14`) already skips trashed *files*; no change needed there since it's keyed by file, not folder, but `toMoveDestinations` callers should pass an already-`!isTrash`-filtered folder list.

Already safe, confirmed by reading the code — **no change needed**:
`search.tsx:166`'s `allFolders = folders.filter(f => !f.isTrash)` (feeding
`searchedFolders`, the main search-results folder list) already carries
this guard — apparently added pre-emptively in an earlier session, ahead
of `FolderMetadata` actually gaining the field. This is strong independent
confirmation the filter pattern is exactly right; it just needs to be
copied to the sites above that don't have it yet.

No changes needed in `getFolderDescendants` itself — it's never called on
a trashed folder in practice once the listings above stop surfacing one to
navigate into.

## 4. Trash screen — `src/app/(main)/trash.tsx`

### 4a. Segmented control

Add `SegmentedControl<'files' | 'folders' | 'albums'>` (reuse
`src/components/primitives/SegmentedControl.tsx` as-is — same component
`customization.tsx` already uses) directly below the search bar, above the
Filters row. New `const [segment, setSegment] = useState<'files'|'folders'|'albums'>('files')`.

### 4b. Per-segment data pipelines

- **Files** (default): today's existing `enrichedFiles`/`filtered`/`grouped` pipeline, unchanged.
- **Folders**: `folders.filter(f => f.isTrash && f.type !== 'album')`, same search/sort treatment (`sortFolders(..., { dateField: 'deletedAt' })` from §2e), grouped by the same `groupByDate`-style buckets (generalize `groupByDate` to a structural `{ id, name, deletedAt }` shape so both files and folders can use it, matching how `sortFiles`/`sortFolders` are already generic). Each row shows a path caption via `getFolderPathLabel(f.parentId, folders)` (`src/utils/folderStats.ts:59`) so a trashed subfolder shows where it used to live.
- **Albums**: `folders.filter(f => f.isTrash && f.type === 'album')`, same treatment, no path caption needed (albums are always root-level).
- The type-filter Chip row (image/video/document/...) only applies to Files — hide it (or disable it) when `segment !== 'files'`.
- Search input placeholder switches per segment ("Search deleted files…" / "Search deleted folders…" / "Search deleted albums…").

### 4c. Rendering

- **Grid mode**: reuse `FileGridTile` for Files (unchanged); for Folders/Albums reuse the generic `src/components/primitives/GridTile.tsx`, which already has `onRestorePress`/`onDeletePress` built in — pass `Icon`/`iconColor` matching dashboard's existing folder-icon resolution (`RootFolderIcon`/`SubfolderIcon`/`GalleryHorizontalEnd`, see `dashboard.tsx:558`), and for Albums pass `thumbnailUri` from `useAlbumCoverUri(album.id)` (`src/hooks/useAlbumCoverUri.ts`) so a trashed album still shows its real cover.
- **List mode**: keep the existing `TrashRow` for Files; add a new sibling `FolderTrashRow` component in the same file, visually identical to `TrashRow` (icon chip + name + meta row + Restore/Delete icon actions) but sourcing its icon from the folder-type resolution above and its meta line from `formatDeletedAt(f.deletedAt)` + (Folders segment only) the path caption.
- Selection mode, bulk restore/delete bars, and empty states all work the same way per segment — just point at the segment's own filtered/selected list and the folder-flavored store actions from §2c. Switching the segmented control clears `selectionMode`/`selectedIds` (a selection made in Files is meaningless once the visible list becomes Folders) — wire this via `onChange={(s) => { setSegment(s); exitSelectionMode(); }}`, reusing the existing `exitSelectionMode` helper. Count text ("N files"/"N folders"/"N albums") and empty-state copy ("Trash is empty" / "No deleted folders" / "No deleted albums") branch on `segment` the same way the search placeholder does (§4b).

### 4d. Actions wiring

- Restore (single): Folders/Albums row → `restoreFolderFromTrash(id)`; reuse the existing `restoreConfirm` Dialog, adapting its message, and reuse the same fallback-folder `Alert` pattern (`handleRestore`, trash.tsx:257–310) — swap `restoreFileFromTrash` for `restoreFolderFromTrash` and drop the `filePreservedAccessKey` copy (folders don't need that specific phrasing; keep the "restored to `Restored Files – ...`" framing generic).
- Restore (bulk): `handleRestoreSelected` branches on `segment` to call `restoreFilesFromTrash`/`restoreFoldersFromTrash` (§2c) instead of the current per-file `Promise.allSettled` loop.
- Permanent delete (single/bulk/"Delete All"): Folders/Albums call `shredFolder`/`shredMultipleFolders` (§2b, now cascade-fixed) through the same `useConfirmDestructive`/`DestructiveConfirmModal` pattern already used for Files.

## 5. Verification

- `npx tsc --noEmit` (or the project's existing type-check script) to confirm the new `FolderMetadata` fields and store action signatures don't break other call sites.
- Run the existing unit suite, in particular `src/store/__tests__/vaultStore.test.ts` (already asserts on album counts via `folders.filter(f => f.type === 'album')` — must keep passing unchanged) and `src/utils/__tests__/vaultSections.test.ts`. Add new cases to `vaultStore.test.ts` for: `deleteFolder` cascading trash onto a nested subfolder's files (the orphan-bug fix), `shredFolder`/`shredMultipleFolders` cascading permanent removal onto descendants, `restoreFolderFromTrash` restoring a whole subtree together, and the unreachable-parent fallback landing in a freshly dated folder for both file and folder restores.
- Run the app (Expo) and exercise, per segment:
  1. Delete a root folder that has a subfolder with its own files → confirm all three (root, subfolder, subfolder's files) disappear from Dashboard/Folder views and appear in Trash → Folders (root + subfolder) and Trash → Files (the subfolder's files, previously orphaned).
  2. Delete an album with files → confirm it appears in Trash → Albums with its cover thumbnail intact.
  3. Restore the subfolder alone while its root parent is still trashed → confirm it lands in a new dated "Restored Files – ..." folder (unreachable-parent fallback), not silently invisible.
  4. Restore the root folder (with subfolder still nested) → confirm the whole subtree reappears intact in its original location.
  5. Permanently delete (shred) a folder with a subfolder → confirm no dangling folder/file metadata remains (re-open Dashboard, check nothing orphaned).
  6. Search and sort within each segment; toggle grid/list view mode.
