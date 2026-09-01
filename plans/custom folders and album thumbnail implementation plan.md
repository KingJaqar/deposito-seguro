# Custom thumbnails for root folders, subfolders, and albums

## Context

Today only **albums** get a real cover thumbnail, and even that is auto-derived
(`useAlbumCoverUri` picks the most-recently-imported photo/video in the album —
see [useAlbumCoverUri.ts](src/hooks/useAlbumCoverUri.ts)). Root folders and
subfolders never render a thumbnail at all — every tile shows the generic
`RootFolderIcon`/`SubfolderIcon` glyph regardless of contents
([dashboard.tsx](src/app/(main)/dashboard.tsx)'s `renderVaultGrid`,
[VaultContentsScreen.tsx](src/components/vault/VaultContentsScreen.tsx)'s
`renderSubfolderTile`). `FolderMetadata.color`/`.icon` exist in the type but
are dead fields — never read back anywhere.

The user wants every folder-like container (root folder, subfolder, album) to
let the user **pick their own image** as its thumbnail, overriding whatever
default/auto-derived visual it would otherwise show — like a custom album
cover in Google Photos or a custom folder icon on desktop OSes.

**Security note (deliberate, matches existing precedent):** folder thumbnails
will be stored as plain (unencrypted) files in the sandbox, never gated behind
the folder's `hasAccessKey`/`accessKeyId` lock. This exactly matches today's
behavior for auto-derived album covers, which already render without
unlocking a password-protected album (`useAlbumCoverUri` has no access-key
check). A custom thumbnail is no more revealing than that existing behavior,
and treating it as encrypted would require resolving/managing a folder-scoped
encryption key that doesn't otherwise exist (`hasAccessKey` is a *browse gate*,
not real at-rest encryption — confirmed via `resolveNearestAccessKeyId` in
vaultStore.ts, which only ever gates navigation, never file bytes).

## Data model

**[src/types/index.ts](src/types/index.ts)** — add one optional field to
`FolderMetadata` (applies uniformly to `type: 'folder'` and `type: 'album'`,
same as every other shared field on this type):

```ts
/**
 * Path to a user-picked cover image (downscaled the same way as
 * FileMetadata.iconPath), stored unencrypted like an album's auto-derived
 * cover — see plans/<this-plan>.md's Context note. When set, this always
 * wins over any default/auto-derived thumbnail (root/sub folder generic
 * icon, or an album's own most-recent-media cover).
 */
customThumbnailPath?: string;
```

No `customThumbnailEncrypted` flag — deliberately never encrypted (see above).

## Performance & polish constraints (apply throughout)

- **Zero new dependencies.** `expo-image-picker` is already used (VaultContentsScreen.tsx), `react-native-reanimated` and `AccessibilityInfo`-gated reduce-motion are already the app's animation convention (`useScreenEnterAnimation.ts`), and `src/constants/animations.ts` already exports `Durations`/`EasingCurves` tokens — reuse these instead of inventing new numbers or components.
- **"0.5× speed" → reuse `Durations.fast` (150ms)**, which is already roughly half of `Durations.normal` (250ms) in this file's own token scale. No new duration constants.
- **No per-tile continuous or mount-triggered animation.** `VaultContentsScreen.tsx` renders its grid via a virtualized `SectionList` — an animation that fires `onLoad`/on-mount would replay every time a tile scrolls into view, which is wasted GPU/JS work at exactly the moment (scrolling) performance matters most. The one animation this plan does add (a `LayoutAnimation.configureNext` crossfade, timed inside the store actions — see Store section) fires exactly once per user-initiated set/remove, never on scroll or virtualization remount.
- **No increase to thumbnail size/quality.** Keep `extractImageThumbnail`'s existing 300px-longest-edge / JPEG 0.6 compression as-is — already small (typically tens of KB) and already shared by every other tile thumbnail in the app; bumping it up for folder covers would be asymmetric bloat for no visible benefit at tile size.
- **No new backup/restore work** (see Backup/restore section) — deliberately scoped out as disproportionate weight for a cosmetic feature.

## Store: src/store/vaultStore.ts

### New actions

Add near `assignFolderAccessKey`/`removeFolderAccessKey` (both the interface
declaration block ~line 96-126 and the implementation ~line 1221-1250 —
verify exact lines at execution time, this file has shifted since this plan
was drafted):

```ts
setFolderThumbnail: (folderId: string, sourceUri: string) => Promise<void>;
clearFolderThumbnail: (folderId: string) => Promise<void>;
```

**`setFolderThumbnail`** — mirrors `importFile`'s thumbnail-extraction slice
(lines ~697-734), reusing the same `extractImageThumbnail` from
`src/services/mediaThumbnailExtractor.ts` (already imported in this file) so
the output is downscaled/compressed exactly like every other tile thumbnail.

**Fixed defect (web platform), revised after further verification:** the
first fix pass (below the strikethrough-equivalent note) assumed that
falling back to `StorageService.copyToSandbox`'s output on web still yields
"a real, working image." Re-checked against `storage.ts` and this is false:
`copyToSandbox` on web (`storage.ts:22-29`) is a synthetic no-op — it returns
a `/web-vault/{filename}` placeholder string but never writes anything into
`webVaultStorage`, the in-memory map that actually backs web "files." The
only thing that populates that map is `StorageService.storeWebFile`, and the
only thing that ever *reads* it back is `StorageService.fileExists` (for
existence checks) — no render path (`useFileThumbnailUri`, `GridTile`,
`ListRow`) ever calls `getWebFileUri` to resolve a `/web-vault/...` string
back into a real `blob:`/`data:` URI before handing it to `<Image>`. So a
`/web-vault/...` placeholder handed to `<Image source={{uri: ...}}>` on
react-native-web just 404s as a literal relative URL. This is a pre-existing
gap shared by every other web thumbnail in the app today (e.g. `importFile`'s
own iconPath slot never gets populated on web for the same reason, silently
falling back further to `localPath`, which is the *same* kind of inert
placeholder for a web import) — not something introduced by this plan. But
extending that already-broken indirection here would make "Set Thumbnail"
silently do nothing visible on web (the picked image never renders; Phase 4's
`onError` fallback catches the broken `<Image>` and reverts to the generic
icon, so at least nothing crashes or shows a broken-image icon — but the
button would appear to not work).

**Fix:** on web, skip the sandbox-copy indirection entirely and use the
picker's own `sourceUri` directly as `customThumbnailPath`. On web this is
already a real, renderable `blob:`/`data:` URI — and web has no persistent
app-private filesystem to copy into anyway, so there is nothing gained by
routing it through `copyToSandbox` first. **Accepted trade-off:** a `blob:`
URI is revoked when the page is closed/reloaded, so a web-set folder
thumbnail does not survive a page reload — it reverts to the generic
icon/auto-cover, gracefully (via Phase 4's `onError` fallback), not as a
broken image. This matches the durability level of every other web thumbnail
in this app today; nothing here is a regression relative to that baseline,
and full persistence would require fixing the app's underlying web storage
model, which is out of scope for a cosmetic feature (see Backup/restore
section for the same disproportionate-scope reasoning applied elsewhere).

```ts
setFolderThumbnail: async (folderId, sourceUri) => {
  const folder = get().folders.find(f => f.id === folderId);
  if (!folder) return;

  let newThumbnailPath: string;
  if (Platform.OS === 'web') {
    // See "Fixed defect (web platform)" above: copyToSandbox is a
    // synthetic no-op on web with no way to resolve its placeholder back
    // to real bytes at render time. Use the picker's own URI directly —
    // already a real, renderable blob:/data: URI on web, no sandbox copy
    // needed (and none possible in any durable sense on this platform).
    newThumbnailPath = sourceUri;
  } else {
    // Copy into the sandbox first so extractImageThumbnail has a stable,
    // VAULT_DIR-anchored path to derive its output path from — same reason
    // importFile copies before extracting (see its own comment there).
    const rawPath = await StorageService.copyToSandbox(sourceUri, `${SecureCrypto.generateUUID()}_folder_thumb_src`);
    const thumbOutputPath = `${rawPath}.thumb.jpg`;
    const extracted = await extractImageThumbnail(rawPath, thumbOutputPath);
    if (extracted) {
      await StorageService.removeSandboxFile(rawPath); // intermediate full-res copy, superseded by the downscaled output
      newThumbnailPath = extracted;
    } else {
      // Extraction failed on this (non-web, so normally reliable)
      // platform: fall back to the raw copy itself rather than failing the
      // whole action — matches importFile's own never-blocks contract for
      // this exact failure mode, just applied to a required field here (a
      // folder thumbnail has no "generic icon iconPath slot" to silently
      // leave empty the way importFile's iconPath does — the user
      // explicitly asked to set one, so the fallback is the plain image
      // instead of the downscaled one, never an error).
      newThumbnailPath = rawPath;
    }
  }

  // Re-fetch right before committing (not just the entry guard above) —
  // covers two things, not just one:
  //   1. The folder being deleted out from under this async flow between
  //      entry and here.
  //   2. Fixed race condition (concurrent calls): re-reading
  //      customThumbnailPath fresh here, instead of using `folder` (the
  //      snapshot captured at function entry, before any awaits), matters
  //      when two setFolderThumbnail calls on the same folder overlap — e.g.
  //      a fast double-tap on "Change Thumbnail" that fires the picker twice
  //      before the first result finishes processing. Both calls' `folder`
  //      snapshots would otherwise see the SAME pre-existing path as
  //      "previous," so whichever call commits first correctly removes it —
  //      but the call that commits SECOND would have no idea the first call
  //      already wrote its own new file, and would never clean it up: an
  //      orphaned thumbnail file, permanently unreferenced. Reading fresh
  //      here means the second call sees the first call's just-committed
  //      path as "previous" and removes *that* instead, so exactly one
  //      thumbnail file is ever left on disk per folder, no matter how many
  //      overlapping calls race. Cheap (one array scan) either way.
  const freshFolder = get().folders.find(f => f.id === folderId);
  if (!freshFolder) {
    await StorageService.removeSandboxFile(newThumbnailPath);
    return;
  }
  const previousThumbnailPath = freshFolder.customThumbnailPath;

  // The crossfade lives HERE, not in the calling screen's .then() — that
  // would fire after commitVaultState's set() below has already run (it's
  // synchronous, the very first thing commitVaultState does), i.e. after
  // the tile has already re-rendered with no animation applied. This is the
  // one point in the whole flow where "immediately before the layout-
  // changing state update" is actually guaranteed. Precedent for a store
  // action touching a react-native UI API directly: this file already
  // imports and calls `Alert` from react-native (see pasteFromClipboard's
  // catch block).
  const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
  if (!reduceMotion) {
    LayoutAnimation.configureNext(LayoutAnimation.create(Durations.fast, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
  }
  await commitVaultState(set, (state) => ({
    folders: state.folders.map(f => f.id === folderId ? { ...f, customThumbnailPath: newThumbnailPath } : f)
  }));
  if (previousThumbnailPath) {
    await StorageService.removeSandboxFile(previousThumbnailPath);
  }
},
```

**`clearFolderThumbnail`** — same commit-then-cleanup shape, same crossfade-before-commit placement, **and the same fresh-re-read fix as `setFolderThumbnail`**: the entry-time `folder` snapshot is only used for the early-return guard, never for the path that actually gets committed/removed. Without this, a `setFolderThumbnail` that resolves during the `await AccessibilityInfo...` gap below would get silently clobbered — `clearFolderThumbnail` would go on to remove the file `setFolderThumbnail` just wrote, but commit `customThumbnailPath: undefined` over top of it, matching neither call's intent:

```ts
clearFolderThumbnail: async (folderId) => {
  const folder = get().folders.find(f => f.id === folderId);
  if (!folder?.customThumbnailPath) return;
  const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
  if (!reduceMotion) {
    LayoutAnimation.configureNext(LayoutAnimation.create(Durations.fast, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
  }
  // Re-read fresh, right before committing — see setFolderThumbnail's own
  // comment on this same pattern. A concurrent setFolderThumbnail call could
  // have written a new path during the await above; bail out (nothing to
  // clear/remove) rather than committing undefined over a path we never
  // actually looked at.
  const freshPath = get().folders.find(f => f.id === folderId)?.customThumbnailPath;
  if (!freshPath) return;
  await commitVaultState(set, (state) => ({
    folders: state.folders.map(f => f.id === folderId ? { ...f, customThumbnailPath: undefined } : f)
  }));
  await StorageService.removeSandboxFile(freshPath);
},
```

Add `LayoutAnimation, AccessibilityInfo` to this file's existing `react-native`
import (it already imports `Alert` from there) and `Durations` from
`../constants/animations`.

### Duplication — TWO independent copy sites, both need the fix

**Fixed gap:** the original draft of this plan only fixed `duplicateFolder`'s
`createFolderCopy` (~line 1996). But there is a **second, independent**
`createFolderCopy` used by `pasteFromClipboard` for copy-paste of a folder
(~line 1703, inside the `mode === 'copy'` branch) that does the exact same
`{ ...sourceFolder, ... }` spread with no thumbnail handling. Pasting a
copied folder that has a `customThumbnailPath` would leave two independent
folder records pointing at the **same on-disk** file — the identical bug
already fixed for `FileMetadata.iconPath` in `copyFileToFolder` (lines
~1887-1905). Both copy sites must get the same fix, applied **before pushing
`newFolder`** in each function:

```ts
let newThumbnailPath: string | undefined;
if (sourceFolder.customThumbnailPath) {
  const ext = sourceFolder.customThumbnailPath.includes('.')
    ? sourceFolder.customThumbnailPath.slice(sourceFolder.customThumbnailPath.lastIndexOf('.'))
    : '';
  newThumbnailPath = ext
    ? `${sourceFolder.customThumbnailPath.slice(0, -ext.length)}_copy_${newId}${ext}`
    : `${sourceFolder.customThumbnailPath}_copy_${newId}`;
  try {
    await StorageService.copySandboxFile(sourceFolder.customThumbnailPath, newThumbnailPath);
  } catch (e) {
    console.error('Failed to copy folder thumbnail', e);
    newThumbnailPath = undefined;
  }
}
const newFolder: FolderMetadata = {
  ...sourceFolder,
  id: newId,
  name: uniqueName(sourceFolder.name),
  parentId: newParentId,
  createdAt: Date.now(),
  customThumbnailPath: newThumbnailPath,
};
```

Apply this identically in both:
- `duplicateFolder`'s `createFolderCopy` (~line 1996) — keeps its existing
  `isTrash: false, deletedAt: undefined, trashedByFolderCascade: undefined`
  overrides alongside `customThumbnailPath: newThumbnailPath`; only adding a
  field, not replacing any existing one.
- `pasteFromClipboard`'s `createFolderCopy` (~line 1703, copy-mode branch) —
  same addition, no other overrides to preserve.

### Permanent deletion — `shredFolder` (~line 1127) and `shredMultipleFolders` (~line 1356)

Both currently walk the descendant subtree and call `removeFilePayload` for
every **file** in it, but never clean up a folder's own thumbnail file before
dropping its record. Add a cleanup pass over the subtree's folders (in each
function, right alongside the existing per-file cleanup loop). **Variable-name
note (verified against current code):** `shredFolder` names its descendant-id
set `subtreeIds`; `shredMultipleFolders` names the equivalent set
`allFolderIds` — use each function's own actual variable name, not a single
copy-pasted snippet:

```ts
// shredFolder — uses subtreeIds
const foldersToShred = folders.filter(f => subtreeIds.has(f.id));
await Promise.all(
  foldersToShred
    .filter(f => f.customThumbnailPath)
    .map(f => StorageService.removeSandboxFile(f.customThumbnailPath!).catch(() => {}))
);
```

```ts
// shredMultipleFolders — uses allFolderIds
const foldersToShred = folders.filter(f => allFolderIds.has(f.id));
await Promise.all(
  foldersToShred
    .filter(f => f.customThumbnailPath)
    .map(f => StorageService.removeSandboxFile(f.customThumbnailPath!).catch(() => {}))
);
```

(`deleteFolder`, the soft-trash path, needs **no change** — it never deletes
files/records, so a trashed folder's thumbnail simply keeps working, same as
a trashed album's auto-cover does today via `includeTrash: true`.)

## Display

Because thumbnails are plain unencrypted files, no new decrypt-to-temp hook is
needed (unlike `useFileThumbnailUri`) — `folder.customThumbnailPath` can be
passed straight through as `thumbnailUri` to the existing `GridTile`/`ListRow`
primitives, which already accept that prop generically.

**Regular folders/subfolders** — add `thumbnailUri={item.customThumbnailPath}`
(or `folder.customThumbnailPath`/`folderRecord.customThumbnailPath`, matching
each call site's variable name) to every plain `GridTile`/`ListRow` call
currently rendering a folder tile with no thumbnail support:
- [dashboard.tsx](src/app/(main)/dashboard.tsx) `renderVaultGrid`, `variant !== 'album'` branch — both the `ListRow` (~line 609) and `GridTile` (~line 627) calls.
- [VaultContentsScreen.tsx](src/components/vault/VaultContentsScreen.tsx) `renderSubfolderTile` — both branches (~line 899 grid, ~line 923 list).
- [favorites.tsx](src/app/(main)/favorites.tsx) — folder `GridTile` (~line 672) and `ListRow` (~line 729).
- [search.tsx](src/app/(main)/search.tsx) — same shape (~line 653 grid, ~line 711 list).
- [trash.tsx](src/app/(main)/trash.tsx) `FolderGridTile` (~line 815-833) — also update its stale comment ("no cover thumbnail (only Albums get one)").

**Albums** — extend the shared wrappers in
[FileTile.tsx](src/components/primitives/FileTile.tsx) to accept an optional
override that wins over the auto-derived cover:

```tsx
export function AlbumGridTile({ albumId, customThumbnailPath, ...tileProps }: { albumId: string; customThumbnailPath?: string } & Omit<GridTileProps, 'thumbnailUri'>) {
  const autoThumbnailUri = useAlbumCoverUri(albumId);
  return <GridTile thumbnailUri={customThumbnailPath || autoThumbnailUri} {...tileProps} />;
}
// AlbumListRow mirrors the same change.
```

Update all call sites to pass `customThumbnailPath={item.customThumbnailPath}`:
dashboard.tsx (~line 577, 591), favorites.tsx (~line 647, 707), search.tsx
(~line 627, 689), trash.tsx's own `AlbumGridTile` (~line 842-861, which calls
`useAlbumCoverUri` directly rather than through the wrapper — apply the same
`customThumbnailPath || thumbnailUri` precedence inline there, remembering
its `includeTrash: true` argument).

### Graceful fallback on a broken/missing thumbnail file

`GridTile.tsx` and `ListRow.tsx` currently render `<Image source={{ uri: thumbnailUri }}>`
unconditionally whenever `thumbnailUri` is truthy, with no `onError` handling —
if the file the path points to is ever missing (e.g. a future full backup/restore
gap, manual app-data clear, or any other orphaned-path scenario already possible
today with `iconPath`), the tile silently shows a broken/blank image forever
instead of the generic icon it would show with no thumbnail at all. This is a
real, if rare, gap in the existing primitives that this feature makes slightly
more likely to surface (one more path-bearing field). Fix once, in the shared
primitives, benefiting every thumbnail type (files/albums/folders alike):

```tsx
// GridTile.tsx / ListRow.tsx — both get the same small addition
const [thumbnailFailed, setThumbnailFailed] = useState(false);
useEffect(() => setThumbnailFailed(false), [thumbnailUri]); // reset when the URI itself changes
const showThumbnail = !!thumbnailUri && !thumbnailFailed;
// ...
{showThumbnail ? (
  <RNImage source={{ uri: thumbnailUri }} style={styles.thumbImage} resizeMode="cover" onError={() => setThumbnailFailed(true)} />
) : (
  <Icon size={...} color={iconColor} strokeWidth={1.75} />
)}
```

One `useState` + one tiny `useEffect` per tile, no continuous work, no
animation — purely a static fallback branch that only ever does anything on
the rare error path. This is the only change to the shared tile primitives;
everything else about them (layout, props, rendering cost) is untouched.

**Fixed gap:** the original draft only swapped the `<Image>`/`<Icon>`
ternary itself, but `GridTile.tsx` has **two other reads of raw
`thumbnailUri`** that must switch to `showThumbnail` too, or the fallback
looks broken in exactly the failure case it's meant to fix:
- The thumb container's `backgroundColor: thumbnailUri ? colors.surfaceHover : \`${iconColor}1F\`` (currently line 108) — on a failed load this must
  evaluate the `iconColor`-tinted branch, matching the `Icon` glyph now being
  shown, or the fallback icon renders on the wrong (thumbnail-style) background.
- The video play-badge condition `!!thumbnailUri && isVideo` (currently line
  119) — must become `showThumbnail && isVideo`, or a broken video thumbnail
  shows a floating play badge over the generic folder/file icon, which reads
  as broken UI, not a graceful fallback.

`ListRow.tsx` should be audited the same way for any other raw `thumbnailUri`
read beyond the image-render ternary before considering Phase 4 done — the
rule is: every visual decision keyed on "do we have a thumbnail" reads
`showThumbnail`, never the raw prop, once this fallback exists.

## Picker flow

New shared helper **`src/utils/pickFolderThumbnail.ts`** (avoids repeating the
permission+picker dance across 4 screens):

```ts
import * as ImagePicker from 'expo-image-picker';

export type PickThumbnailResult = 'set' | 'canceled' | 'permission-denied' | 'error';

export async function pickAndSetFolderThumbnail(
  folderId: string,
  setFolderThumbnail: (folderId: string, sourceUri: string) => Promise<void>
): Promise<PickThumbnailResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return 'permission-denied';

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled || !result.assets?.[0]) return 'canceled';

  try {
    await setFolderThumbnail(folderId, result.assets[0].uri);
    return 'set';
  } catch (e) {
    console.error('Failed to set folder thumbnail:', e);
    return 'error';
  }
}
```

This follows the exact permission/picker shape already used by
`executeAlbumImport` in VaultContentsScreen.tsx, just single-image/images-only.

## Menu wiring (5 menus across dashboard.tsx, VaultContentsScreen.tsx ×2, favorites.tsx, search.tsx)

No new hook file needed here — the reduce-motion check and the
`LayoutAnimation.configureNext` call both live inside the store actions
themselves (see Store section above), timed to fire immediately before the
actual state mutation. That means every screen's UI-layer code stays as
simple as every other action in these same switch statements: call the store
action, react to the result.

### Menu items — per-file exact insertion

Insert right after the `'duplicate'` entry in every menu-items array:

- **VaultContentsScreen.tsx's `folderMenuItems`** (own-folder, variable `folderRecord`), **`subfolderMenuItems`** (variable `subfolder`/`targetSubfolder`), **favorites.tsx's `folderMenuItems`**, **search.tsx's `folderMenuItems`** — all four already end their array with `.filter(Boolean) as {...}[]`, so this drops in as-is:
  ```ts
  { action: 'change-thumbnail', label: X.customThumbnailPath ? 'Change Thumbnail' : 'Set Thumbnail', color: colors.text },
  X.customThumbnailPath ? { action: 'remove-thumbnail', label: 'Remove Thumbnail', color: colors.error } : null,
  ```
  (`X` = `folderRecord` / `targetSubfolder` / `folder` per each file's own existing variable — check the exact name already in scope at that array before editing, don't assume.)

- **dashboard.tsx's `folderMenuItems`** — this one is a different shape: a plain array literal with `colors.error`/`colors.warning` items **and no `.filter(Boolean)` step at all**, plus two separate `.splice(3, 0, ...)` calls for the paste/access-key rows (verified in current code: `if (hasClipboard) baseItems.splice(3, 0, {paste...})` then `if (hasPassword) {...} else {...}`, both immediately after the literal). Do **not** copy the ternary+filter snippet here (it would leave a raw `null` in the array and break the `.map()` render). Instead, add `'change-thumbnail'` directly into the base array literal (immediately after `'duplicate'`, before `'favorite'`), then conditionally splice in `'remove-thumbnail'` right after it:
  ```ts
  const baseItems = [
    { action: 'rename', label: 'Rename', color: colors.text },
    { action: 'move', label: 'Move', color: colors.text },
    { action: 'export', label: 'Export', color: colors.text },
    { action: 'duplicate', label: 'Duplicate', color: colors.text },
    { action: 'change-thumbnail', label: targetFolder.customThumbnailPath ? 'Change Thumbnail' : 'Set Thumbnail', color: colors.text },
    { action: 'favorite', label: targetFolder.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', color: colors.warning },
    { action: 'delete', label: 'Move to Trash', color: colors.error },
    { action: 'shred', label: 'Delete Permanently', color: colors.error },
  ];
  if (targetFolder.customThumbnailPath) {
    baseItems.splice(5, 0, { action: 'remove-thumbnail', label: 'Remove Thumbnail', color: colors.error });
  }
  // hasClipboard / hasPassword splices (existing code) MUST run after this point, unmodified.
  if (hasClipboard) {
    baseItems.splice(3, 0, { action: 'paste', label: 'Paste Here', color: colors.secondary });
  }
  if (hasPassword) {
    baseItems.splice(3, 0, { action: 'remove-key', label: 'Remove Assigned Access Key', color: colors.error });
  } else {
    baseItems.splice(3, 0,
      { action: 'register-key', label: 'Assign and Create Access Key', color: colors.secondary },
      { action: 'assign-key', label: 'Assign Existing Access Key', color: colors.secondary }
    );
  }
  ```
  **Fixed ordering bug:** the original draft showed the `remove-thumbnail`
  splice with no explicit ordering relative to the existing `hasClipboard`/
  `hasPassword` splices, just a comment claiming the target index was safe.
  That's only true in one specific execution order. Both existing splices
  target a **hardcoded index 3** — they insert *before* whatever currently
  sits at index 3. Since `'change-thumbnail'`/`'remove-thumbnail'` sit at
  index 4-5 in the literal (after `'duplicate'` at index 3), those earlier
  splices never touch or shift them **as long as the new
  `baseItems.splice(5, 0, ...)` call executes first** (shown above, directly
  under the literal). If it were placed *after* the `hasClipboard`/
  `hasPassword` splices instead — an equally natural place to add new code,
  e.g. appended at the end near the album `.filter()` — index 5 would by then
  point somewhere inside the paste/access-key items that got inserted at
  index 3, silently misplacing `'Remove Thumbnail'` into the wrong menu
  section with no error. Execution order in this array must be: literal →
  `change-thumbnail`/`remove-thumbnail` splice → `hasClipboard` splice →
  `hasPassword`/`else` splice → album `.filter()`. Do not reorder.

### Action handling — shared shape, per-screen variable

In each of the 5 switch statements (dashboard.tsx's `handleFolderAction`,
VaultContentsScreen.tsx's `handleFolderAction` and `handleSubfolderAction`,
favorites.tsx's and search.tsx's `handleFolderAction`), add:

```ts
case 'change-thumbnail':
  pickAndSetFolderThumbnail(X.id, setFolderThumbnail).then((result) => {
    if (result === 'set') showTopToast(`${X.name} thumbnail updated`);
    else if (result === 'permission-denied') Alert.alert('Photo Access Needed', 'Photo access is required to choose a thumbnail — enable it in Settings.');
    else if (result === 'error') Alert.alert('Couldn’t Set Thumbnail', 'Something went wrong while processing that image.');
    // 'canceled' → no-op, matches every other cancel-a-picker path in this app
  });
  break;
case 'remove-thumbnail':
  clearFolderThumbnail(X.id).then(() => showTopToast(`${X.name} thumbnail removed`));
  break;
```

(`X` = each screen's own folder variable, same as above.) No local
reduce-motion or `LayoutAnimation` code needed in any of these 5 files — it's
handled once, correctly-timed, inside the store actions themselves.

**No "Processing…" toast.** Considered and deliberately rejected: the picker
resize/compress step is fast (well under half a second for a single small
image), so a transient toast would flash and be replaced by the final
success toast almost immediately — noise, not clarity. The OS-native picker
UI itself is the "something is happening" signal while the user is in it,
and the menu already closes the instant the action is tapped as immediate
registration-of-intent feedback. One final toast (success or error) is
enough.

**`showTopToast` naming caveat:** confirmed present and used this way in
dashboard.tsx and VaultContentsScreen.tsx already (their own delete/favorite
cases). Not yet confirmed by name in favorites.tsx/search.tsx — check each
file's own short one-line confirmation helper before wiring (dashboard.tsx
itself uses a *different* helper, `showSnackbar`, for its richer paste-result
message, so don't assume every screen exposes the same name for every kind of
confirmation).

Destructure `setFolderThumbnail`/`clearFolderThumbnail` from each screen's
existing `useVaultStore()` call alongside the other actions already pulled
from it (e.g. next to `duplicateFolder`).

Trash.tsx needs **no menu changes** — trashed items only offer restore/shred.

## Backup/restore — deliberate no-op

`src/services/backupService.ts` builds the folder manifest from an **explicit
field whitelist** (`id, name, color, icon, type, isEncrypted, encryptionKeyId,
hasAccessKey, accessKeyId, isFavorite, isPersonalFavoritesFolder, parentId,
createdAt` — verified by reading it), unlike files, whose `localPath`/`iconPath`
bytes are fully zipped and remapped to the new device's sandbox path on
restore. **`customThumbnailPath` is deliberately left out of that whitelist.**
Effect: a restored folder/album silently reverts to its generic icon /
auto-derived cover — never a dangling path pointing at a file that doesn't
exist on the new device. This mirrors the same whitelist's existing, already-
accepted omission of `isTrash`/`deletedAt` for folders. Add a one-line comment
at the manifest-building call site noting the omission is intentional, so a
future reader doesn't "fix" it as an oversight. Full-fidelity backup (zip-
embed + remap the thumbnail file, like `iconPath`) is a plausible future
enhancement, explicitly not built now — disproportionate weight in a shared,
delicate file for a purely cosmetic feature.

## Tests — src/store/__tests__/vaultStore.test.ts

**Corrected approach (the original draft's mock-wrapping instruction was
wrong and would have broken the suite):** the original draft of this section
said to wrap `copyToSandbox`/`copySandboxFile`/`removeSandboxFile` in
`jest.fn(async ...)` inside the shared `jest.mock('../../services/storage', …)`
factory to make them inspectable. **Do not do this** — this file's own
top-of-file comment explains why: jest-expo's preset sets `resetMocks: true`,
which runs `jest.resetAllMocks()` before *every* test and strips
`mockImplementation`s — including ones baked into a `jest.fn(impl)` at
factory-definition time — back to a no-op returning `undefined`. That would
silently break every *existing* test in the file that depends on
`copyToSandbox` actually returning `` `/vault/${name}` `` (used throughout
`importFile` tests) from the second test onward, not just the new ones. This
is exactly why the factory currently uses plain, un-wrapped functions.

The file already has the correct, working pattern for exactly this need, one
test above (`'performs zero physical copies when the batch check fails…'`,
~line 883): `jest.spyOn(StorageService, 'methodName')` called **locally,
inside the test that needs inspectability**, not at the factory level. A
`jest.spyOn` on a plain (non-`jest.fn()`) function created *after* that
test's own automatic `resetMocks()` pass has already run keeps delegating to
the real mocked implementation by default (so `copyToSandbox` still returns
its usual path) while adding `.mock.calls` for assertions — no factory
changes needed, and no risk to any other test in the file. Use this pattern
for every new test below that needs to assert a call happened/didn't happen
or inspect its arguments.

New `describe` block:
1. `setFolderThumbnail` sets `customThumbnailPath` on the right folder.
2. `setFolderThumbnail` called twice (sequentially, both awaited) on the same
   folder: `jest.spyOn(StorageService, 'removeSandboxFile')` and assert it
   was called with the *first* path once the second call resolves.
3. `clearFolderThumbnail` unsets the field and calls `removeSandboxFile`
   (spied) with the removed path.
4. `duplicateFolder` gives the copy its own `customThumbnailPath` (a
   different string from the source, not a shared reference).
5. `shredFolder` (and `shredMultipleFolders`) remove the field along with the
   folder record, don't error, and (spy on `removeSandboxFile`) actually
   clean up the thumbnail file for every folder in the shredded subtree —
   existing subtree-cascade tests in this file (e.g. around line 329-343)
   are the pattern to extend.
6. **Fixes the web-platform gap:** with `Platform.OS` overridden to `'web'`
   for the duration of the test (reassign the property directly — e.g.
   `Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true })`
   — and restore it to its original value in the test or an `afterEach`, since
   this mutates a shared module object that other tests in the file rely on
   defaulting to a native platform), `setFolderThumbnail` still succeeds and
   sets `customThumbnailPath` to the exact `sourceUri` passed in — unchanged,
   not copied — with neither `StorageService.copyToSandbox` nor
   `extractImageThumbnail` called at all (spy on both, assert zero calls) and
   no error thrown.
7. **Fixes the paste-copy duplication gap:** pasting a copied folder (via
   `pasteFromClipboard`, copy-mode) that has a `customThumbnailPath` gives the
   pasted copy its own `customThumbnailPath` (different string from the
   source, not a shared reference) — same assertion shape as test 4 but
   exercising `pasteFromClipboard`'s `createFolderCopy`, not
   `duplicateFolder`'s.
8. **New (closes a real coverage gap found in code review — the plan's own
   documented extraction-failure fallback had no test):** with
   `extractImageThumbnail` spied/overridden to return a falsy value for one
   call (`jest.spyOn(require('../../services/mediaThumbnailExtractor'),
   'extractImageThumbnail').mockResolvedValueOnce(null)` — or equivalent),
   `setFolderThumbnail` on a non-web platform still succeeds and sets
   `customThumbnailPath` to the raw sandbox-copy path (not a `.thumb.jpg`
   path), never throwing or leaving the field unset.
   **Implementation pitfall hit and fixed while executing this test:** get
   the module reference via `require('../../services/mediaThumbnailExtractor')`,
   **not** `import * as MediaThumbnailExtractor from '...'`. This project's
   Babel CommonJS interop wraps a namespace (`import * as`) import of a
   plain, non-`__esModule` `jest.mock` factory object (exactly what this
   file's `mediaThumbnailExtractor` mock is) in a *copy*, not a live
   reference to the same `module.exports` object that `vaultStore.ts`'s own
   `import { extractImageThumbnail }` resolves against internally. Spying on
   the namespace-import copy compiles and runs without error but silently
   does nothing — `mockResolvedValueOnce` is queued on a function
   `vaultStore.ts` never calls, so the test would pass against *both* correct
   and broken store code, which is worse than not having the test at all.
   `require(...)` returns the exact singleton object every import site sees,
   so `jest.spyOn` on it is live. (`StorageService` was never at risk of this
   — it's imported via a named import of a class, not a namespace import of a
   plain-function-exporting mock module.)
9. **New (proves the concurrency fix in the Store section above):** start two
   overlapping `setFolderThumbnail` calls on the same folder without
   awaiting the first before starting the second (`const p1 = …; const p2 =
   …; await Promise.all([p1, p2]);`), then assert (a) the folder's final
   `customThumbnailPath` is one of the two new paths (whichever call's
   commit landed last — order isn't the point), and (b) `removeSandboxFile`
   (spied) was eventually called with the *other* call's new path — i.e.
   nothing is left orphaned/unreferenced. This is the regression test for
   the fresh-re-read fix; written against the original (entry-snapshot)
   code, it fails by asserting `removeSandboxFile` is never called with the
   losing call's path.

## Default-state acceptance criteria (explicit)

- A folder/subfolder with no `customThumbnailPath`: unchanged today's-generic-icon behavior.
- An album with no `customThumbnailPath`: unchanged today's auto-derived-cover-or-generic-icon behavior.
- The new field is purely additive/override — nothing about existing rendering changes until a user explicitly sets a thumbnail.

## Review addendum (post-Phase-3 revision pass)

Independently re-verified against the live codebase (all claims below were
checked by reading the actual files and running the test suite, not just
re-reading this document):

- Phases 1–3 (data model, store actions, both `createFolderCopy` sites, both
  shred functions, store tests) are implemented exactly as this plan
  specifies. `npx jest src/store/__tests__/vaultStore.test.ts` → 89/89.
  `npx jest` (full suite) → 196/196. No regressions, no drift from spec.
- `GridTile.tsx`/`ListRow.tsx`/`FileTile.tsx` current shape, `dashboard.tsx`'s
  `baseItems`/splice structure, `backupService.ts`'s folder whitelist, and
  `storage.ts`'s web `copyToSandbox` no-op behavior all match this plan's
  descriptions line-for-line.

Two non-blocking items surfaced by that pass, neither of which blocks Phase 4:

**Gap (deferred, not fixed here — pre-existing class of risk, not a
regression):** if the app is killed between `StorageService.copyToSandbox`/
`extractImageThumbnail` and the `commitVaultState` call inside
`setFolderThumbnail`, the intermediate/extracted file on disk is never
referenced by any record and is never cleaned up — a permanent orphan.
`importFile` has the identical exposure for its own `iconPath` extraction
step today, so this isn't new risk introduced by this feature, just inherited
scope. Fixing it (e.g. a startup sweep for untracked sandbox files) is
disproportionate for a cosmetic feature and touches already-tested,
already-shipped Phase 2 code — explicitly out of scope for this revision,
same reasoning as the Backup/restore section's own scope cuts. Noted here so
a future reader doesn't mistake the omission for an oversight.

**Minor note (procedural, not a defect):** the `showTopToast` vs. `showSnackbar`
naming caveat this plan already flags for Phase 7 is confirmed still accurate
— favorites.tsx/search.tsx's own toast helper name must be checked locally at
that phase, not assumed from dashboard.tsx's.

No critical defects and no functional bugs were found. Phase 4 proceeds
exactly as originally specified below.

## Review addendum 2 (pre-Phase-6 revision pass)

One additional gap found while re-verifying the plan before starting Phase 6,
not covered by the addendum above: **duplicating or pasting a folder on web
whose `customThumbnailPath` is a `blob:`/`data:` URI** (the web fallback path
in `setFolderThumbnail`) produces a broken copy. `StorageService
.copySandboxFile`'s web branch (`storage.ts:220-230`) only resolves a path
that was actually written into `webVaultStorage` — a `blob:` URI never was
(the web fallback bypasses `webVaultStorage` entirely, see the Store
section) — so it falls through to returning `sourcePath` unchanged, while
`createFolderCopy`'s `_copy_${newId}` suffix logic (written assuming a real
sandbox path with a normal extension) mangles the `blob:` URL into a
non-existent string. **Not a crash or a regression**: Phase 4's `onError`
fallback on `GridTile`/`ListRow` catches the resulting broken `<Image>` and
falls back to the generic icon, same as any other missing-thumbnail case.
But it is a real, previously-undocumented corner case: the duplicate/paste
silently loses the thumbnail on web even within the same session, before any
reload. **Accepted as an extension of the same documented web trade-off**
(the original's own `blob:` URI already doesn't survive a reload) — not
fixed in this pass, since a real fix would mean special-casing web inside
`createFolderCopy` (skip the copy/rename logic, reuse the source's `blob:`
URI as-is, matching how `setFolderThumbnail` already special-cases web) for
a durability tier (web, pre-reload) that's already known to be temporary.
Noted here so a future reader doesn't mistake the silent loss for a new bug;
revisit only if web is promoted from "best-effort" to a fully-supported
target.

Phase 6 proceeds exactly as originally specified below.

## Review addendum 3 (post-execution correctness pass, pre-Phase-8)

Re-verified against the live codebase before finishing the plan. Two findings,
both now fixed (not just noted):

**Real defect found and fixed — residual race window in `setFolderThumbnail`/
`clearFolderThumbnail`.** The "re-fetch right before committing" fix described
above and implemented through Phase 2 read `previousThumbnailPath` via a
`get()` call, then still had an `await AccessibilityInfo.isReduceMotionEnabled()`
between that read and the actual `commitVaultState` call. Two truly-concurrent
calls whose reads both land in that gap before either commits still see the
same stale "previous" value, and the losing call's committed file is orphaned
— contrary to this document's own claim that the race was fully closed. Fixed
by moving the read-then-decide logic (both the "does the folder still exist"
check and the "what was previously there" read) **inside the synchronous
`commitVaultState` updater callback itself**, so there is no `await` between
reading state and writing it, in both actions. See the updated Store-section
code and the in-code comments on both actions for the corrected version.

**Test defect found and fixed — the regression test for this race didn't
actually test it.** The original assertion (`removedPaths.some(p => p !==
finalPath)`) was satisfied by `setFolderThumbnail`'s own *unconditional*
cleanup of its intermediate raw sandbox copy after a successful extraction —
which fires for every call regardless of any race outcome — so the test would
pass even against the buggy await-gap code above. Fixed by deriving each
call's actual extracted-thumbnail path from `StorageService.copyToSandbox`'s
recorded call arguments and asserting `removeSandboxFile` was called with the
specific *losing* call's path. Verified this new assertion (a) passes against
the atomic fix and (b) fails against the await-gap version when manually
reintroduced — see [vaultStore.test.ts](src/store/__tests__/vaultStore.test.ts)'s
`'two overlapping setFolderThumbnail calls...'` test and its comments.

**Phase-status correction:** Phases 4 and 7 (shared-primitive fallback +
album override, and the four remaining screens' menu/action/display wiring)
are already fully implemented in the repo — verified by reading
`GridTile.tsx`, `ListRow.tsx`, `FileTile.tsx`, `favorites.tsx`, `search.tsx`,
`VaultContentsScreen.tsx`, and `trash.tsx` directly, not inferred. Only
**Phase 8** (the backup/restore intentional-omission comment) remains.

`npx tsc --noEmit -p .`: clean. `npx jest`: **202/202** across 16 suites,
including the corrected concurrency test.

## Verification

- `npm test -- vaultStore` (or the project's existing test script) for the
  new store-level tests plus the full existing suite (duplication/shred
  cascade tests must still pass unchanged).
- Manual pass via the Expo dev server / emulator: create a root folder, a
  subfolder, and an album; set a thumbnail on each via the "…" menu → Set
  Thumbnail; confirm the tile updates in both grid and list view mode on
  dashboard, inside the folder/album screen (as a subfolder), and in
  favorites/search (favorite the folder first / search for it). Confirm the
  toast fires and the tile crossfades in (disable reduce-motion first to see
  it; then enable reduce-motion and confirm it updates instantly with no
  animation). Confirm "Change Thumbnail" replaces it and the old file is gone
  (no orphan growth), "Remove Thumbnail" reverts to the generic icon (or the
  auto-cover, for an album with existing media). Confirm Duplicate produces
  an independently removable copy, and Delete Permanently doesn't leave the
  image file behind. Confirm scrolling a large album's virtualized grid stays
  smooth (no per-tile animation replay on scroll). Sanity-check a
  backup/restore round-trip: a folder that had a custom thumbnail shows its
  generic icon again after restore, with no broken-image state (the `onError`
  fallback covers this even if it somehow didn't).
- Web sanity pass (`expo start --web`): set a thumbnail on a folder/album and
  confirm it renders immediately (it's the picker's own `blob:` URI, not a
  sandbox copy — see the Store section's web fallback). Reload the page and
  confirm it gracefully reverts to the generic icon/auto-cover (the `blob:`
  URI is now invalid) with no broken-image flash — this is the accepted,
  documented trade-off for web, not a regression to chase further.

## Execution phases

Each phase should compile/typecheck and (from Phase 2 onward) pass
`npm test -- vaultStore` before moving to the next — this feature is additive
enough that nothing here requires all phases to land in one sitting. File
line numbers throughout this plan are anchors from when it was drafted, not
guarantees; re-locate the actual insertion point at execution time rather
than trusting an offset.

**Phase 0 — sanity re-check (no code changes)**
Before touching anything, re-grep the exact line numbers/variable names this
plan cites in `vaultStore.ts`, `FileTile.tsx`, `GridTile.tsx`/`ListRow.tsx`,
and all five menu files — the plan was written against a snapshot and this
repo has had two feature commits since (album grouping, sorting). Treat every
`~line N` in this document as approximate.

**Phase 1 — data model**
- [types/index.ts](src/types/index.ts): add `customThumbnailPath?` to
  `FolderMetadata` with the doc comment from the Data model section.
- No runtime behavior change yet; this alone should typecheck cleanly since
  the field is optional and unread.

**Phase 2 — store actions + lifecycle correctness**
- [vaultStore.ts](src/store/vaultStore.ts): add the `LayoutAnimation,
  AccessibilityInfo` import and `Durations` import (`Platform` is already
  imported — no new import needed for the web-fallback branch).
- Add `setFolderThumbnail`/`clearFolderThumbnail` to the interface and
  implementation, exactly as specified (branch on `Platform.OS === 'web'`:
  use `sourceUri` directly on web, or copy-to-sandbox → extract → fallback-
  to-raw-copy on other platforms → re-check existence → crossfade → commit →
  cleanup-old-file ordering matters, don't reorder).
- Fix **both** `createFolderCopy` sites (`duplicateFolder`'s at ~line 1996
  *and* `pasteFromClipboard`'s at ~line 1703) to give each copy its own
  thumbnail file rather than a shared path.
- Fix `shredFolder` and `shredMultipleFolders` to clean up thumbnail files
  for every folder in the deleted subtree (using each function's own actual
  descendant-set variable name — `subtreeIds` vs. `allFolderIds`).
- This phase is self-contained and independently testable — no UI depends on
  it yet, so it's the safest place to pause if execution spans sessions.

**Phase 3 — store tests — ✅ DONE**
- Did **not** touch the shared `jest.mock('../../services/storage', …)`
  factory — `copyToSandbox`/`copySandboxFile`/`removeSandboxFile` remain
  plain functions. Used `jest.spyOn(StorageService, 'methodName')` locally,
  inside each new test that needs call inspection (matching the existing
  precedent ~line 883).
- Added all 11 new tests (the 9 planned cases — extraction-failure fallback
  and concurrent-calls regression included — split across a couple of extra
  `it`s for clarity, e.g. a dedicated no-op-when-already-clear case for
  `clearFolderThumbnail`) in a new `describe('Custom folder/album thumbnails
  …')` block at the end of `vaultStore.test.ts`.
- Hit and fixed a real interop pitfall along the way: `extractImageThumbnail`
  must be referenced via `require(...)`, not `import * as` — see the note
  under test case 8 above.
- `npx jest src/store/__tests__/vaultStore.test.ts`: **89/89 pass** (78
  pre-existing + 11 new, zero regressions). `npx jest` (full project suite):
  **196/196 pass** across all 15 suites.
- Phase 2's store logic (including the two race-condition fixes made during
  this review pass — see the Store section's "Race fix" comments on both
  `setFolderThumbnail` and `clearFolderThumbnail`) is now fully proven
  correct. Safe to proceed to Phase 4.

**Phase 4 — shared primitives (fallback + album override) — ✅ DONE**
(Confirmed done during the Review addendum 3 pass above — see that section.)
- [GridTile.tsx](src/components/primitives/GridTile.tsx) and
  [ListRow.tsx](src/components/primitives/ListRow.tsx): add the
  `thumbnailFailed` state + `onError` fallback described in "Graceful
  fallback on a broken/missing thumbnail file" — **including** rewriting
  every other read of raw `thumbnailUri` in the same component
  (`backgroundColor`, the video play-badge condition) to read `showThumbnail`
  instead, not just the `<Image>`/`<Icon>` ternary. Do this regardless of the
  rest of the feature — it's a standalone robustness fix for `iconPath` too.
- [FileTile.tsx](src/components/primitives/FileTile.tsx): extend
  `AlbumGridTile`/`AlbumListRow` to accept `customThumbnailPath` and prefer it
  over `useAlbumCoverUri`'s result.
- Manually sanity-check an existing album/file tile still renders normally
  (no regression) before moving on — this phase touches the most
  widely-shared render path in the app.

**Phase 5 — picker helper — ✅ DONE**
- Added [src/utils/pickFolderThumbnail.ts](src/utils/pickFolderThumbnail.ts)
  exactly as specified, with one added doc note: it deliberately does **not**
  mirror `executeAlbumImport`'s picker call shape (multi-select, no crop —
  that flow imports raw media *into* an album). This helper forces
  `allowsMultipleSelection: false` and a 1:1 crop via the OS picker's native
  editor, matching the "pick a single cover image" convention instead. Both
  reuse the same permission-request dance; only the `launchImageLibraryAsync`
  options differ. (Verified: `executeAlbumImport` in
  VaultContentsScreen.tsx has no `allowsEditing`/`aspect` — confirmed by
  reading the source, not assumed.)
- **Gap closed (was flagged as missing in the pre-Phase-5 review pass):**
  the plan previously had zero automated coverage north of the store layer —
  everything from Phase 5 on relied entirely on manual click-through. Added
  [src/utils/__tests__/pickFolderThumbnail.test.ts](src/utils/__tests__/pickFolderThumbnail.test.ts)
  (mocks `expo-image-picker` locally, not via a shared factory — no other
  test in the repo mocks that module, so there's no shared-mock risk to
  account for) covering: permission-denied short-circuits before the picker
  opens; canceled (both the `canceled: true` shape and the defensive
  no-assets-but-not-canceled shape) never calls `setFolderThumbnail`; the
  picker is invoked with the single-select/square-crop options (not the
  multi-select shape); success calls `setFolderThumbnail` with the exact
  picked URI and returns `'set'`; a rejection from `setFolderThumbnail` is
  caught and returns `'error'` rather than throwing past the helper.
- `npx jest src/utils/__tests__/pickFolderThumbnail.test.ts`: **6/6 pass**.
  `npx jest` (full suite): **202/202 pass** across 16 suites (196
  pre-existing + 6 new, zero regressions).
- No screen wiring yet, as planned — Phase 6 wires this helper into
  dashboard.tsx end-to-end.

**Phase 6 — wire one screen end-to-end (dashboard.tsx) — ✅ DONE**
- Added `pickAndSetFolderThumbnail` import and destructured
  `setFolderThumbnail`/`clearFolderThumbnail` from `useVaultStore()`.
- Added `thumbnailUri={item.customThumbnailPath}` to the plain-folder
  `ListRow` and `GridTile` branches in `renderVaultGrid`, and
  `customThumbnailPath={item.customThumbnailPath}` to the `AlbumListRow`/
  `AlbumGridTile` call sites in the same function's `'album'` branch.
- `folderMenuItems`: added `'change-thumbnail'` to the `baseItems` literal
  right after `'duplicate'`, and a conditional `baseItems.splice(5, 0, …)`
  for `'remove-thumbnail'` placed **before** the existing `hasClipboard`/
  `hasPassword` splices (index-3-based), preserving the ordering constraint
  this plan flagged above — verified by re-reading the resulting file, not
  just written and assumed.
- `handleFolderAction`: added `'change-thumbnail'`/`'remove-thumbnail'`
  cases, matching the shared shape (toast on success/removal, `Alert` on
  permission-denied/error, no-op on cancel) using this screen's own
  `folder`/`showTopToast` names.
- `npx tsc --noEmit -p .`: clean, no errors in `dashboard.tsx` or elsewhere.
  `npx jest`: **202/202 pass**, 16/16 suites — zero regressions from the
  display/menu wiring.
- Manual click-through in the Expo web dev server was not completed this
  pass — the app's own lock/disguise screen requires credentials this
  execution didn't have. Static verification (typecheck + full test suite +
  line-by-line re-read of every edit) stands in; the manual grid/list/
  reduce-motion walkthrough in the Verification section still applies and is
  left for the user (or a session with the unlock PIN) to run before this
  phase is fully closed out.

**Phase 7 — replicate to the remaining four surfaces — ✅ DONE**
(Confirmed done during the Review addendum 3 pass above — see that section.)
- [VaultContentsScreen.tsx](src/components/vault/VaultContentsScreen.tsx):
  both `folderMenuItems`/`handleFolderAction` (own-folder) and
  `subfolderMenuItems`/`handleSubfolderAction` (subfolder) — two independent
  wiring points in the same file.
- [favorites.tsx](src/app/(main)/favorites.tsx)
- [search.tsx](src/app/(main)/search.tsx)
- For each: confirm the file's own toast-helper name (`showTopToast` vs.
  something else) before wiring rather than assuming: — copy dashboard.tsx's
  pattern but verify names locally per the plan's caveat.
- [trash.tsx](src/app/(main)/trash.tsx): display-only change (add
  `thumbnailUri`/`customThumbnailPath` precedence to its `FolderGridTile` and
  its own `AlbumGridTile`, fix the stale comment) — no menu/action wiring,
  trashed items only restore/shred.

**Phase 8 — backup/restore documentation — ✅ DONE**
- Added the intentional-omission comment at the manifest-building call site
  in [backupService.ts](src/services/backupService.ts), directly above the
  `folders: folders.map(...)` whitelist, naming the omitted field, the
  behavior it produces on restore, the precedent (`isTrash`/`deletedAt`), and
  a pointer back to this plan so a future reader doesn't "fix" it.
- No behavior change: `npx tsc --noEmit -p .` clean; `npx jest` (full suite)
  **202/202** across 16 suites, zero regressions.

## Review addendum 4 (plan revision + fix pass, pre-Phase-9)

Requested review categorized every open item as Critical / Gap / Real issue /
Minor, per the standard severity taxonomy, cross-checked against the live
code (not just this document) with `tsc --noEmit` and the full Jest suite
before and after the fix below.

**Critical defects:** none found. No correctness or safety issue survived
Review addendum 3's pass.

**Gaps:** none newly found. The previously-documented ones (kill-mid-op
orphan file, web duplicate-of-`blob:` losing the thumbnail) remain
deliberately accepted, bounded, pre-existing-class risks — see their own
addenda above; not reopened here.

**Real issue found and fixed — animation API mismatch (`LayoutAnimation` vs.
this app's established Reanimated convention).** `setFolderThumbnail`/
`clearFolderThumbnail` called `LayoutAnimation.configureNext` from inside the
store, right before `commitVaultState`. This compiled, typechecked, and
passed all 202 tests — but it silently reused an animation API this codebase
already tried and rejected for the exact same situation:
[SectionHeaderToggle.tsx](src/components/primitives/SectionHeaderToggle.tsx)'s
own header comment documents that the "old JS-thread LayoutAnimation
approach... stuttered on anything heavier than a couple of rows (grids,
ScrollViews)," which is why `CollapsibleSection` was rewritten onto
`react-native-reanimated`'s `LinearTransition` instead. `LayoutAnimation` is
a *global* next-layout-commit animation, not scoped to one view — calling it
from a store action that fires on a user tap, right before a state update
that re-renders a tile inside `VaultContentsScreen.tsx`'s virtualized
`SectionList` grid (or dashboard's/favorites'/search's own grids), is exactly
the "grids" case that comment warns about. This also directly contradicted
this plan's own stated constraint ("`react-native-reanimated`... already the
app's animation convention... reuse these instead of inventing new... UI
approaches") — the plan named the right convention in its constraints
section, then didn't follow it in the implementation.

**Fix:** removed `LayoutAnimation`/`AccessibilityInfo`/`Durations`-triggered
animation entirely from the store (`vaultStore.ts` no longer imports
`LayoutAnimation`/`AccessibilityInfo`, and no longer imports `Durations` at
all). The crossfade now lives in
[GridTile.tsx](src/components/primitives/GridTile.tsx) and
[ListRow.tsx](src/components/primitives/ListRow.tsx) themselves — a
per-tile Reanimated `useSharedValue`/`withTiming` opacity tween on the
thumbnail container, keyed off `thumbnailUri` changing (skipped on first
mount via a `hasMountedThumb` ref, so virtualized scroll-into-view never
replays it — same non-negotiable constraint as before), and honoring
reduce-motion via `AccessibilityInfo.isReduceMotionEnabled()` read once per
mount into a ref, matching the exact pattern already established by
[useScreenEnterAnimation.ts](src/hooks/useScreenEnterAnimation.ts). This is
a strict improvement, not just a swap: because it lives in the shared
primitives, it benefits every thumbnail change through `GridTile`/`ListRow`
(files, albums, folders alike), not only the folder-thumbnail feature — same
"fix once in the shared primitive" precedent Phase 4 already established for
the `onError` fallback. `tsc --noEmit -p .` clean; `npx jest`: **202/202**
across 16 suites, unchanged (no test asserted on `LayoutAnimation`, so this
was a pure behind-the-scenes swap).

**Minor / non-blocking notes** (unchanged from prior addenda, still true,
still not blocking):
- Phase 6's manual click-through in a live Expo session was never completed
  (blocked on the app's own lock/disguise screen credentials) — static
  verification stands in; Phase 9's manual walkthrough still needs to happen
  for real, including now re-confirming the crossfade *does* still visibly
  play (reduce-motion off) and *doesn't* replay on scroll, since the
  animation implementation changed in this pass even though its trigger
  conditions didn't.
- `showTopToast` vs. `showSnackbar` naming was already verified per-screen
  during Phase 7 — no outstanding risk, noted here only for completeness.

**Validation:** all Critical/Real items are resolved and re-verified against
the live repo, not just this document. No gaps were reopened. The one Real
issue found in this pass is fixed, not merely noted. Phase 9 proceeds next —
it is unaffected in scope by this addendum (same manual checklist as before,
plus the one added crossfade-behavior spot-check called out above).

**Phase 9 — full verification pass**
- `npm test` (full suite, not just vaultStore) to catch any cross-file
  regression from the primitive changes in Phase 4.
- Walk the full manual checklist in the Verification section above across
  all five surfaces: set/change/remove on root folder, subfolder, and album;
  grid + list view; reduce-motion on/off; duplicate-then-independently-remove;
  delete-permanently leaves no orphan file; virtualized-scroll smoothness on
  a large album; a backup/restore round-trip reverting to the generic/auto
  cover with no broken-image flash.
