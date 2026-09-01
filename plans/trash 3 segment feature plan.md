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
**Post-review**: see §2c-revision below — the cascade/restore logic
described in this phase was corrected after initial review to stop folder
restore from resurrecting independently-trashed items; the fix (and four new
tests for it) landed in this same phase, already reflected in the code.
**Note**: the existing test at `vaultStore.test.ts:191-204` ("reports
landedInFallbackFolder=true and reroutes into 'Restored Files' when the
original folder was deleted") will *fail*, not just need re-running — it
asserts a folder literally named `'Restored Files'` (§2d replaces that with
a dated name) and its precondition (`deleteFolder` making the original
folder stop "existing") changes meaning once `deleteFolder` becomes a
soft-delete (the folder still exists in `folders`, just trashed — reachability
is now `isContainerUnreachable`, not presence). Rewrite this test's
assertions (dated-name pattern match instead of exact name; same
`landedInFallbackFolder: true` outcome, now reached via the trashed-parent
path) as part of this phase, not just the brand-new cases.

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

### 2c-revision. Cascade-vs-independent trash review fix

**Post-review correction** (found during plan review, before Phase 3 started):
§2a's cascade and §2c's `restoreFolderFromTrash` as originally specified
conflated two different reasons a file/folder can be `isTrash`: "trashed
directly by the user" and "trashed only because its container was trashed."
Concretely — trash a photo inside `Vacation/` on its own, then later trash
the whole `Vacation/` folder, then restore `Vacation/`: the photo the user
had *already, separately* thrown away came back too, because
`deleteFolder`'s cascade unconditionally re-stamped `isTrash`/`deletedAt` on
every file in the subtree (even ones already trashed) and
`restoreFolderFromTrash` unconditionally cleared `isTrash` on every file in
the subtree with no way to tell the two cases apart.

Fix, implemented in `vaultStore.ts`:
- `FolderMetadata`/`FileMetadata` gain `trashedByFolderCascade?: boolean`
  (§1) — true only when an item was trashed as a *side effect* of an
  ancestor's `deleteFolder` cascade, never set on the folder the user
  actually invoked `deleteFolder` on.
- `deleteFolder`'s cascade skips any descendant folder/file that is
  **already** `isTrash` — its own `isTrash`/`deletedAt` is left completely
  alone (not re-stamped with `now`), so an independently-trashed item keeps
  its real deletion time and is never mistaken for something this cascade
  just trashed. The I-12 access-key inheritance snapshot still runs against
  already-trashed files too (that protection is disappearing regardless of
  the file's own trash status) — only the trash bookkeeping is skipped.
  Newly-touched descendants get `trashedByFolderCascade: true`; the explicit
  target folder itself never does.
- `restoreFolderFromTrash`/`restoreFoldersFromTrash` walk the subtree via a
  new `collectCascadeRestorableSubtree` helper instead of
  `collectDescendantFolders`: starting from the restore target (always
  included, whatever its own flag), a descendant is pulled in only if it —
  and every folder between it and the target — is `trashedByFolderCascade:
  true`. The moment a branch hits a folder that was trashed on its own, that
  whole branch is excluded and left exactly as the user left it: still
  trashed, still parented where it was, not reparented into any fallback
  folder. Files follow the same rule: only restored if their folder is in
  the restorable set *and* the file itself is `trashedByFolderCascade: true`.
- `shredFolder`/`shredMultipleFolders` (§2b) are unaffected by any of this —
  permanent delete still removes the *entire* subtree regardless of trash
  origin, which is correct (and necessary, since both are also wired
  directly to a "Delete Permanently" action on **live** folders in
  dashboard.tsx/favorites.tsx/search.tsx/VaultContentsScreen.tsx, not only
  reachable from Trash).
- Covered by four new `vaultStore.test.ts` cases: a file independently
  trashed before its folder is deleted stays trashed (and keeps its
  original `deletedAt`) after the folder is restored; an independently
  trashed subfolder several levels down is left behind (with its own file)
  when an ancestor several levels up is restored; `deleteFolder` never
  overwrites an already-trashed file's `deletedAt`; and the fallback-folder
  name-dedup case below.

Also fixed in the same pass: `buildDatedFallbackFolder` (§2d) now takes the
current root-level folder names and runs its generated name through the
same `uniqueClampedName` dedup every other folder-creation path already
uses — two restores landing in the same wall-clock second (a fast
double-tap, or two bulk actions moments apart) previously produced two
root folders with the *identical displayed name* (harmless functionally,
since ids still differ, but confusing in the UI). Now the second one gets
the usual " (2)" suffix.

**Non-goal, confirmed out of scope**: `isPersonalFavoritesFolder` folders
have no special protection anywhere in the delete/trash code path today —
that's a pre-existing condition unrelated to this feature (nothing in
dashboard.tsx/VaultContentsScreen.tsx exempts them from `deleteFolder`/
`shredFolder`), not something this plan introduces or is fixing.

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

This is a slightly bigger change than "add an option" implies — today
`SortableFolder` (`vaultSort.ts:69-73`) has no `deletedAt` field at all, and
`sortFolders`'s `date_asc`/`date_desc` cases are hardcoded to
`a.createdAt`/`b.createdAt` rather than indexing by a field name. Bring it
in line with how `sortFiles` already does this (`toTime(a[dateField])`,
`vaultSort.ts:148-150`): widen `SortableFolder` with `deletedAt?: number`,
then rewrite the two date cases to read `a[dateField]`/`b[dateField]`
through `toTime()` instead of `a.createdAt` directly.

**Post-review correction**: the first pass at this landed the `dateField`
indexing but read it through `compareNumbers(a[dateField], b[dateField])`
instead of `toTime()` — harmless in practice (`SortableFolder.createdAt`/
`deletedAt` are always plain `number`, never the `string`-widened shape
`SortableFile.deletedAt` allows for trash.tsx's local type), but it left
`sortFolders`'s date handling silently diverging from `sortFiles`'s for no
reason, which is exactly the inconsistency this section said it was
avoiding. Fixed to route through `toTime()` like `sortFiles` does, as
originally specified.

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

### 3a. Correction — the "subfolder listing for a given container" lives in a hook, not in `VaultContentsScreen.tsx`

Re-verified while reviewing this plan: `VaultContentsScreen.tsx` never filters
folders itself for this purpose — it consumes `matchedFolders` from
`useFileSystemQuery(id)` (`src/hooks/useFileSystemQuery.ts:10,14`), which
sets `filteredFolders = folders` and then only narrows by `parentId`, with
no `!isTrash` guard at all (contrast line 9's `filteredFiles = files.filter(f
=> !f.isTrash)`, which already has one). This one hook backs `folder/[id].tsx`
**and** `album/[id].tsx` — fix it there, once, instead of in
`VaultContentsScreen.tsx`.

### 3b. New — "Move to…"/"Add to Album" **destination pickers** also need the guard

Missed in the original audit: eight call sites build a Move-destination list
via `toMoveDestinations(folders.filter(f => f.id !== X && f.type !== 'album'), ...)`,
none of them excluding trashed folders:
`favorites.tsx:356`, `favorites.tsx:452`, `dashboard.tsx:338`,
`search.tsx:376`, `search.tsx:450`, `VaultContentsScreen.tsx:527`,
`VaultContentsScreen.tsx:622`, `VaultContentsScreen.tsx:689`.

This is harmless *today* only because `deleteFolder` currently hard-removes
a folder the instant it's trashed, so no folder ever sits in `folders` with
`isTrash: true` for a picker to surface. The moment Phase 1 makes
`deleteFolder` a soft-delete, these become live bugs: a user could pick a
trashed folder as a move target, and `moveFileToFolder` would move a
still-live file (`isTrash: false`) into it — the file vanishes from every
listing (not in Trash, since it isn't itself trashed; not in the
destination, since Phase 2's own filter now hides that folder everywhere)
until someone happens to restore or shred the folder it's hiding in. This
is the exact orphaning failure mode the rest of this plan exists to fix,
reintroduced through the one door §3/§3a didn't check. Add `!f.isTrash` to
all eight filters in the same Phase 2 pass.

*Checkpoint addition*: after Phase 2, also confirm a trashed folder is
**not selectable** in the Move-to/Add-to-Album destination picker from
every one of the eight sites above, not just invisible in the main listings.

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

- **Grid mode**: reuse `FileGridTile` for Files (unchanged); for Folders/Albums reuse the generic `src/components/primitives/GridTile.tsx`, which already has `onRestorePress`/`onDeletePress` built in — pass `Icon`/`iconColor` matching dashboard's existing folder-icon resolution (`RootFolderIcon`/`SubfolderIcon`/`GalleryHorizontalEnd`, see `dashboard.tsx:558`), and for Albums pass `thumbnailUri` from `useAlbumCoverUri(album.id)` (`src/hooks/useAlbumCoverUri.ts`).
  **Correction**: `useAlbumCoverUri` as it stands today explicitly skips
  `f.isTrash` files when picking a cover (`useAlbumCoverUri.ts:21`) — and
  `deleteFolder`'s cascade (§2a) sets `isTrash: true` on every file inside a
  trashed container, including a trashed album's own files. Called
  unmodified, `useAlbumCoverUri(album.id)` on a *trashed* album will always
  resolve to `undefined` (every candidate cover file is itself trashed), so
  the album silently loses its cover the moment it's trashed — the opposite
  of §5 scenario 2's expectation. Add an `includeTrash` param to
  `useAlbumCoverUri` (default `false`, so every existing non-Trash caller is
  unaffected) that drops the `f.isTrash` exclusion when true, and pass
  `includeTrash` from the Trash → Albums segment only.
- **List mode**: keep the existing `TrashRow` for Files; add a new sibling `FolderTrashRow` component in the same file, visually identical to `TrashRow` (icon chip + name + meta row + Restore/Delete icon actions) but sourcing its icon from the folder-type resolution above and its meta line from `formatDeletedAt(f.deletedAt)` + (Folders segment only) the path caption.
- Selection mode, bulk restore/delete bars, and empty states all work the same way per segment — just point at the segment's own filtered/selected list and the folder-flavored store actions from §2c. Switching the segmented control clears `selectionMode`/`selectedIds` (a selection made in Files is meaningless once the visible list becomes Folders) — wire this via `onChange={(s) => { setSegment(s); exitSelectionMode(); }}`, reusing the existing `exitSelectionMode` helper. Count text ("N files"/"N folders"/"N albums") and empty-state copy ("Trash is empty" / "No deleted folders" / "No deleted albums") branch on `segment` the same way the search placeholder does (§4b).

### 4d. Actions wiring

- Restore (single): Folders/Albums row → `restoreFolderFromTrash(id)`; reuse the existing `restoreConfirm` Dialog, adapting its message, and reuse the same fallback-folder `Alert` pattern (`handleRestore`, trash.tsx:257–310) — swap `restoreFileFromTrash` for `restoreFolderFromTrash` and drop the `filePreservedAccessKey` copy (folders don't need that specific phrasing; keep the "restored to `Restored Files – ...`" framing generic).
- Restore (bulk): `handleRestoreSelected` branches on `segment` to call `restoreFilesFromTrash`/`restoreFoldersFromTrash` (§2c) instead of the current per-file `Promise.allSettled` loop.
- Permanent delete (single/bulk/"Delete All"): Folders/Albums call `shredFolder`/`shredMultipleFolders` (§2b, now cascade-fixed) through the same `useConfirmDestructive`/`DestructiveConfirmModal` pattern already used for Files.

**Post-review correction — fallback-folder alert copy must not hardcode the
old static name**: the first pass at all four fallback-folder `Alert.alert`
call sites (`handleRestore`, `handleRestoreFolder`, and both branches of
`handleRestoreSelected`) literally quoted `"Restored Files"` as the
destination folder's name — a leftover from before §2d replaced the static
name with a freshly dated one. Since the toast shown immediately before
each alert already displays the real name via `locationLabel`
(`getFolderPathLabel(folderId/parentId, freshFolders)`), the alert
contradicted its own toast: e.g. toast says *"restored in Root / Restored
Files – Aug 31, 2026, 3:52:04 PM"*, then the modal claims it was *"restored
into the 'Restored Files' folder"* — a folder that, under that exact name,
was never created. Fixed by looking the actual destination folder up (from
`useVaultStore.getState().folders`, keyed by the `folderId`/`parentId`
already returned from the restore call — the bulk cases resolve it once
from the first landed-in-fallback result, since a single batch call shares
one fallback folder per §2c/§2d) and interpolating its real `name` into
every alert title/body instead of the stale literal.

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
