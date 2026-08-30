# Sorting for Folders & Files — Implementation Plan (Revised)

## 1. Plan summary

**Objective**: give users control over the order folders and files appear in, everywhere the vault lists them — by Name, Date, Size, or Type, each ascending/descending — instead of today's fixed/insertion order (or, in Trash, a bespoke one-off control that only covers Name/Date).

**Target users**: anyone using the vault with more than a handful of items — the exact users [trash.tsx](src/app/(main)/trash.tsx)'s existing sort chips were already built for, just extended everywhere else.

**Scope**: Dashboard (My Vault), a folder's contents, Favorites, Search, and Trash. Explicitly **out of scope**: the album route's date-grouped grid (deliberately different UX, left untouched), and the Move-destination picker (`MoveVaultModal`/`FolderPicker`) — see §2, Issue 9.

**Core requirements** (confirmed with the user across prior rounds):
- Per-screen local sort state — not persisted, not shared globally (matches Trash's existing lifecycle).
- Icon button + bottom `Sheet` radio-list UI, mirroring [ViewModeMenu.tsx](src/components/ViewModeMenu.tsx) exactly.
- 8 sort options: Name/Date/Size/Type × ascending/descending.
- Zero new dependencies, zero new persistence, lightweight and fast — reuse existing primitives (`Sheet`, `lucide-react-native`, `getFolderStatsMap`, `classifyFileType`) rather than building new machinery.

## 2. Issues found

Every item below was checked against the actual source (line numbers cited), not assumed. Severity: **Critical** = would break at runtime/compile; **High** = wrong behavior a user would notice; **Medium** = real but narrow/cosmetic; **Low** = worth documenting so it isn't relitigated.

| # | Issue | Severity | Where | Impact |
|---|---|---|---|---|
| 1 | `sortFiles` originally typed its parameter as `FileMetadata[]`. [trash.tsx](src/app/(main)/trash.tsx) doesn't operate on `FileMetadata[]` — it maps store files into its own local `TrashedFile` interface (lines 64-73, looser `deletedAt?: number \| string`) before sorting. | Critical | `vaultSort.ts` × trash.tsx | `tsc` fails the moment §6 (Trash) is wired up. |
| 2 | `folderStatsMap` is declared (dashboard.tsx:262) **after** `rootFolders`/`subFolders`/`albums` (lines 258-260). `const`/`useMemo` don't hoist — referencing it from inside those three memos throws (temporal dead zone) on first render. | Critical | dashboard.tsx | App crashes on the Dashboard screen the moment sorting is wired in. |
| 3 | Same class of bug, worse: `folderStatsMap` is declared **after** `searchedFolders`/`searchedFiles` *and* after the `buildVaultSections` memo that consumes them, in both favorites.tsx (176 vs. 148/144/158) and search.tsx (184 vs. 160/156/165). | Critical | favorites.tsx, search.tsx | Same crash, on two more screens. |
| 4 | An early draft applied the sort to `displayedFiles` unconditionally in VaultContentsScreen.tsx, including on the album route, where `displayedFiles` also feeds `groupFilesByDate` (line 844) — which re-sorts by date internally regardless of input order. Functionally harmless, but wasted work and drifts from "leave the album branch untouched." | Medium | VaultContentsScreen.tsx | Album screen does one extra needless array sort per render; not a bug a user would see, but violates the plan's own "no unnecessary work" goal. |
| 5 | Unverified icon names (`ArrowUpDown`, `ArrowUpAZ`, `ArrowDownZA`, `CalendarArrowUp/Down`, `ArrowUpNarrowWide`/`ArrowDownWideNarrow`, `Tag`) — a plausible-sounding lucide icon name that doesn't exist would fail the import at build time. | High | `vaultSort.ts`, `SortMenu.tsx` | Build failure if any guessed name is wrong. |
| 6 | "Type" sort has no meaning for folders (all are `'folder'` or `'album'`) — left undocumented, a future reader could "fix" this by inventing a fake folder-type ordering that doesn't correspond to anything the user asked for. | Low | `vaultSort.ts` | Confusing-but-harmless UX if undocumented; risk of scope creep if "fixed" later. |
| 7 | Comparators using raw numeric subtraction (`a.size - b.size`, `a.deletedAt - b.deletedAt`) on optional/mixed-type fields (`size?: number`, `deletedAt?: number \| string`) can produce `NaN` or a type error if not normalized first. | Medium | `vaultSort.ts` | A `NaN` comparator result makes `Array.sort` behavior unspecified — items could appear to shuffle randomly instead of sorting. |
| 8 | Two or more items with an identical name/date/size/type have no defined relative order — `Array.sort` stability guarantees keeping *original* array order for ties, but the "original" order is store-insertion order, which can silently change between renders (e.g. after an edit) and make ties visibly jitter. | Medium | `vaultSort.ts` | Minor visual flicker for duplicate-named/same-size items across re-renders. |
| 9 | **Missing requirement**: the plan never addressed whether the Move-destination picker (`MoveVaultModal`/`FolderPicker`, which also lists folders via `toMoveDestinations`) should get the same sort control. | Medium | `MoveVaultModal.tsx` | Ambiguous scope — a user could reasonably expect "sorting everywhere" to include the folder picker they see mid-move. |
| 10 | **Security/data-exposure check**: does sorting by Size or Type reveal anything about a folder/file that isn't already shown? (Folder size aggregates already show on locked-folder tiles pre-unlock; file `mimeType`/`name` are only ever visible after a locked folder is unlocked.) Needed to actually verify this rather than assume it, given the app's threat model (access keys, disguise mode). | Low (verified clean) | dashboard.tsx `renderVaultGrid`, `FileTile.tsx` | None — confirmed no new exposure, see Fix 10. Documented so it isn't re-flagged as an open risk later. |
| 11 | **Usability**: a flat, unlabeled 8-row list (Name×2, Date×2, Size×2, Type×2) is scannable but has no visual grouping — a user has to read every label to find "the Size ones." | Medium | `SortMenu.tsx` | Minor friction, not a blocker — addressed as an enhancement (§4) rather than a required fix, since `ViewModeMenu`'s 4-row list gets away without grouping and 8 rows is not dramatically harder to scan. |
| 12 | **Accessibility gap**: `SortMenu`'s trigger button, copied verbatim from `ViewModeMenu`, would carry a static `accessibilityLabel="Sort options"` — a screen-reader user gets no indication of the *current* sort without opening the sheet, unlike a sighted user who could add a visual cue. | Medium | `SortMenu.tsx` | Screen-reader users have a worse experience discovering current state than sighted users would with the enhancement in §4. |
| 13 | **Edge cases checked, no code changes needed**: (a) 0- or 1-item lists sort as a no-op, no guard needed; (b) `isMissing` files (payload gone, metadata intact) sort fine since `name`/`size`/`importedAt`/`mimeType` are unaffected by that flag; (c) search text filter + sort combined — order of operations (filter narrows first, sort orders what's left) was already the plan's design in §3-§6 draft, confirmed correct, not a gap. | Low (verified clean) | All screens | None — listed so these aren't mistaken for unaddressed gaps. |

## 3. Fixes and decisions

1. **(Fixes Issue 1)** Made `sortFiles` generic over a minimal `SortableFile` shape (`id`, `name`, optional `size`/`mimeType`/`importedAt`, `deletedAt?: number | string`) instead of hardcoding `FileMetadata[]`. Both `FileMetadata[]` and trash.tsx's `TrashedFile[]` satisfy it structurally; the generic return type `T[]` means no caller ever casts.
2. **(Fixes Issue 2)** In dashboard.tsx, relocate the existing `const folderStatsMap = useMemo(() => getFolderStatsMap(files), [files]);` up to right after `files`/`folders` are destructured from `useVaultStore()`, before `rootFolders`/`subFolders`/`albums`. Pure reordering (its only dependency is `files`), zero behavior change to its own value.
3. **(Fixes Issue 3)** Same relocation in favorites.tsx and search.tsx, moved above `searchedFolders`/`searchedFiles` and the `buildVaultSections` memo. Every existing downstream use of `folderStatsMap` (the `toMoveDestinations(...)` calls, the `formatFolderStatsLabel(folderStatsMap[item.id])` renders) is unaffected as long as the declaration comes before its first use.
4. **(Fixes Issue 4)** Guard the sort inside `displayedFolders`/`displayedFiles`'s `useMemo` bodies with `isAlbum ? list : sortFolders/sortFiles(list, ...)`, so the album path's input to `groupFilesByDate` stays byte-identical to today, and no sort pass runs just to be immediately redone.
5. **(Fixes Issue 5)** Verified every icon file exists in the installed `lucide-react-native` at `node_modules/lucide-react-native/dist/esm/icons/*.mjs` and that each exports the exact PascalCase name used (`ArrowUpDown`, `ArrowUpAZ`, `ArrowDownZA`, `CalendarArrowUp`, `CalendarArrowDown`, `ArrowUpNarrowWide`, `ArrowDownWideNarrow`, `Tag`) before writing them into the plan.
6. **(Fixes Issue 6)** Documented the folder `type_*` → name-sort fallback inline in `vaultSort.ts` as a deliberate, accepted limitation, with the reasoning (no "type" concept exists for folders) spelled out so it reads as a decision, not an oversight.
7. **(Fixes Issue 7)** All numeric/date comparisons go through an explicit helper rather than raw subtraction: `compareNumbers(a, b) => (a ?? 0) - (b ?? 0)` is fine for `size` (always non-negative, well under `Number.MAX_SAFE_INTEGER` for any real file), but dates go through `new Date(value ?? 0).getTime()` first (handles the `number | string` union), and the type comparator compares `classifyFileType(...)` tag strings via `localeCompare`, never numeric subtraction. No path produces `NaN`.
8. **(Fixes Issue 8)** Every comparator ends in an `id`-based tiebreaker (`a.id.localeCompare(b.id)`) after its primary (and, for type, secondary name) key, so ties resolve to a fixed, deterministic order independent of store-array order.
9. **(Fixes Issue 9)** Decision: **out of scope for this pass.** `MoveVaultModal`/`FolderPicker` is a different interaction (a short-lived destination picker, not a persistent browsing list) and already sorts implicitly by whatever order `toMoveDestinations` receives; adding a second, differently-scoped `SortMenu` instance there is real scope creep for a picker that's open for seconds, not the primary use case the user asked for. Noted explicitly here (rather than silently ignored) so it's a deliberate deferral, not a gap — worth a follow-up ticket if requested later, not part of this plan.
10. **(Fixes Issue 10)** Verified clean, no fix needed: `renderVaultGrid` in dashboard.tsx already renders `formatFolderStatsLabel(folderStatsMap[item.id])` (size/count) on **every** folder tile including locked ones, pre-unlock (existing behavior, confirmed by reading the render code) — so a Size sort exposes nothing new. `FileTile`/`FileTypeIcon` never special-case `mimeType`/`name` for locked state — a file's type/name are only ever visible in a screen's list *after* its containing folder has already been unlocked (gated by `handleVaultPress`'s existing access-key check) — so a Type sort likewise exposes nothing that wasn't already visible at that point. Documented so this isn't re-investigated as an open question.
11. **(Issue 11 → enhancement, not a blocking fix)** See §4, Enhancement A.
12. **(Issue 12 → enhancement, not a blocking fix)** See §4, Enhancement B.

## 4. Enhancements added

Only additions with a clear purpose, low implementation cost, and no new dependency. Two considered and deliberately **rejected** are listed at the end for transparency.

**A. Grouped section dividers inside the `SortMenu` sheet** — *Priority: Medium, Purpose: usability (fixes Issue 11).*
`SORT_OPTIONS` is already ordered in field-pairs (Name×2, Date×2, Size×2, Type×2); render a small, non-interactive caption (`"NAME"`, `"DATE"`, `"SIZE"`, `"TYPE"`) above each pair, styled like the existing uppercase section headers already used elsewhere (e.g. trash.tsx's `sectionHeader` style: small, muted, letter-spaced). Zero new components — four `<Text>` captions interleaved into the existing `SORT_OPTIONS.map`. Cheap, no logic change, and makes an 8-row list scannable at a glance instead of requiring the user to read every label.

**B. Trigger button announces the active sort to screen readers** — *Priority: Medium-High, Purpose: accessibility (fixes Issue 12).*
Instead of a static `accessibilityLabel="Sort options"`, compute it from the current `value`: `` `Sort options, currently ${currentOption.label}` `` (mirroring how `ViewModeMenu` could have done this but doesn't — this is a genuine improvement over the pattern it's copied from, not just a port). Sighted users already get this via the `Check` icon inside the sheet; this brings screen-reader users to parity without opening it first.

**C. Small active-indicator dot on the trigger icon when sort ≠ each screen's default** — *Priority: Medium, Purpose: usability/at-a-glance feedback.*
A tiny filled circle (reusing the same small-dot styling pattern already in the codebase — e.g. trash.tsx's `metaDot`, ~3px, `colors.primary`) positioned at the trigger icon's top-right corner, shown only when `value !== defaultKey` (each screen already knows its own default from §1/§3-§6). Lets a user glance at the header and know "yes, a non-default sort is active" without opening the sheet — the same kind of feedback many list UIs give for active filters. No new dependency; `SortMenu` needs one extra prop (`defaultKey: SortKey`) to know when to show it.

**Considered and rejected** (to demonstrate restraint, not oversight):
- *A "Reset to default" action inside the sheet* — rejected: redundant with just tapping the default option directly (one extra tap saved, one extra row/complexity added — not worth it for 8 options where the default is always visibly first-or-near-first in its group).
- *Length-based early-exit guard skipping `sortFolders`/`sortFiles` for 0-1-item arrays* — rejected: `Array.prototype.sort` on 0-1 elements is already O(1) in practice; adding a branch to skip it is pure complexity for zero measurable gain.
- *Persisting last-used sort per screen in-memory across navigations (not full `AsyncStorage`, just a module-level cache)* — rejected: directly contradicts the user's confirmed "per-screen local state" decision; not this plan's call to quietly reinterpret that.

## 5. Revised implementation plan

Dependency-ordered; each milestone has explicit acceptance criteria so "done" is unambiguous, not just "looks right."

### Milestone 1 — Shared utility: `src/utils/vaultSort.ts` (new)
Implements `SortKey`, `SortOptionMeta`, `SORT_OPTIONS` (with Enhancement A's group captions data if modeled as metadata, or left to the UI layer — either is fine, UI layer is simpler), `SortableFile`, `sortFolders`, `sortFiles`, per Fixes 1/5/6/7/8.
- **Acceptance criteria**: `npx tsc --noEmit` passes; new `src/utils/__tests__/vaultSort.test.ts` covers all 8 `SortKey`s for both functions, the folder `type_*` fallback, the trash `dateField` override, the `id`-tiebreaker, and a mixed-type `NaN`-safety case (item with `size: undefined`), all green.

### Milestone 2 — Shared UI: `src/components/SortMenu.tsx` (new)
`Sheet`-based, prop-driven (`value`, `onChange`, `defaultKey` per Enhancement C), built against Milestone 1. Includes Enhancements A and B.
- **Acceptance criteria**: mounted standalone (scratch route) with a sample `value`, opens/closes correctly, lists 8 options under 4 group captions with the correct icons/labels, checked row matches `value`, `onChange` fires and closes the sheet, active-indicator dot appears only when `value !== defaultKey`, `accessibilityLabel` reflects the current option.

### Milestone 3 — Dashboard ([dashboard.tsx](src/app/(main)/dashboard.tsx))
Relocate `folderStatsMap` (Fix 2), sort `rootFolders`/`subFolders`/`albums`, add header control.
- **Acceptance criteria**: `tsc` passes; manually cycling all 8 options visibly reorders root vaults, subfolders, and albums correctly; selection mode, create-folder flow, and the storage bar are unaffected.

### Milestone 4 — Favorites & Search ([favorites.tsx](src/app/(main)/favorites.tsx), [search.tsx](src/app/(main)/search.tsx))
Relocate `folderStatsMap` (Fix 3), sort `searchedFolders`/`searchedFiles` before `buildVaultSections`, add header control, in both files.
- **Acceptance criteria**: `tsc` passes; every category chip (not just "All") reorders correctly under each sort key in both screens, since `buildVaultSections` fans one sorted input into many sections at once.

### Milestone 5 — Folder & Album contents ([VaultContentsScreen.tsx](src/components/vault/VaultContentsScreen.tsx))
`isAlbum`-guarded sort on `displayedFolders`/`displayedFiles` (Fix 4), header control gated on `!isAlbum`.
- **Acceptance criteria**: `tsc` passes; a regular folder's subfolders/files both reorder correctly; an album shows no sort icon and its date-grouped grid is pixel-identical to its pre-change screenshot.

### Milestone 6 — Trash ([trash.tsx](src/app/(main)/trash.tsx))
Delete local `SortKey`/inline sort/chip row, adopt the shared type/function with `dateField: 'deletedAt'`, move control into the header.
- **Acceptance criteria**: `tsc` passes; search, type filter, restore, permanent delete, and bulk selection all still work; `size_*`/`type_*` (previously unavailable here) now work too.

### Milestone 7 — Full verification pass
Run the complete checklist in §6 top to bottom, now that every screen is wired.
- **Acceptance criteria**: every box in §6 is checked with no open items.

## 6. Final validation checklist

- [ ] **Complete** — all 5 in-scope screens (Dashboard, Folder, Favorites, Search, Trash) have a working sort control; the album route and the Move-destination picker are deliberately excluded and documented as such (§2 Issue 9 / §3 Fix 9), not silently missing.
- [ ] **Internally consistent** — `SortKey`/`SortableFile`/`SORT_OPTIONS` are defined once in `vaultSort.ts` and imported everywhere; no screen has its own duplicate sort type (Trash's old one is deleted, not left dangling).
- [ ] **Lightweight** — zero new npm dependencies; zero new `AsyncStorage`/`SecureStore` I/O; the two new files are each single-purpose and small.
- [ ] **Performant** — every sort call sits inside a correctly-keyed `useMemo`; no sort runs inside a `useEffect` or inline in JSX; the album route's redundant-sort risk (Issue 4) is closed.
- [ ] **Secure** — verified (§3 Fix 10, not assumed) that Size/Type sorting exposes no folder/file metadata that wasn't already visible at that point in the existing UI.
- [ ] **Responsive** — `SortMenu`'s trigger reuses `ViewModeMenu`'s exact `responsiveSize`-driven icon sizing; the underlying `Sheet` already caps at 560px on tablets.
- [ ] **Accessible** — `accessibilityRole="radio"`/`accessibilityState` per option (matching `ViewModeMenu`); trigger button announces the *current* sort, not just that a sort control exists (Enhancement B).
- [ ] **Animations correct** — no bespoke animation code added to `SortMenu`; it inherits `Sheet`'s already-tuned 0.5x-speed spring and its reduce-motion fallback verbatim.
- [ ] **Type-safe** — `sortFiles`'s generic signature accepts both `FileMetadata[]` and Trash's `TrashedFile[]` without a cast (Fix 1); `npx tsc --noEmit` is clean after every milestone, not just at the end.
- [ ] **No crashes from declaration order** — `folderStatsMap` relocations in dashboard.tsx/favorites.tsx/search.tsx are done *before* those files' sort logic is wired in (Fixes 2-3), not after.
- [ ] **Tested** — `src/utils/__tests__/vaultSort.test.ts` exists and is green, covering every `SortKey`, the folder-type fallback, the trash date-field override, the id-tiebreaker, and an undefined-`size` case; existing `vaultStore.test.ts`/`vaultSections.test.ts` still pass unmodified.
- [ ] **Ready for implementation** — every milestone in §5 has a concrete acceptance criterion; nothing in this plan depends on a decision that hasn't been made (scope, UI pattern, and fields were all explicitly confirmed with the user; the one open scope question — Move-picker sorting — has been resolved as an explicit deferral, not left hanging).
