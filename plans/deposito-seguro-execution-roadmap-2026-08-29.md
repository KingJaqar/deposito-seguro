# Deposito Seguro — Execution Roadmap

**Source:** [`deposito-seguro-audit-report-2026-08-29.md`](deposito-seguro-audit-report-2026-08-29.md) (§17/§18) · **Prepared:** 2026‑08‑29

This turns the audit's findings into a sequenced, actionable plan. Two of
the audit's "Critical" security findings were resolved as **product
decisions** before this roadmap was written (see below) rather than left
as open engineering choices — everything after that reflects those
decisions.

---

## Product decisions already made (not open questions)

- **SEC‑0 (file encryption unreachable from any UI):** **Remove it.**
  Access keys/passwords are the intended protection model for this app;
  real file encryption at rest is not a goal. Phase 1 below retires the
  dead code accordingly — surgically, not wholesale (see the note there).
- **SEC‑1 (backup ZIPs are unencrypted archives):** **Keep it
  unencrypted.** No archive-level encryption will be added. This is now
  an accepted, documented product tradeoff, not an open gap — it drops
  out of the roadmap entirely.

Everything else from the audit's roadmap (§17) is reflected in the five
phases below, resequenced around those two decisions.

---

## Phase 1 — Security posture correction

**Goal:** make the app's actual security model (password-gated access,
not cryptographic encryption at rest) both true in the code and honest in
the UI, and close the one still-open crypto gap (PBKDF2 iterations).

**Why this order:** smallest phase, security-relevant, and removing dead
code now stops it from creating confusion in every later phase (tests,
type cleanup, etc. would otherwise have to account for unreachable
functions).

1. **Retire the unreachable encryption-key *creation* surface.**
   Delete `createEncryptionKey`, `assignFileEncryptionKey`,
   `assignFolderEncryptionKey`, and `toggleFolderEncryption`
   (`src/store/settingsStore.ts`, `src/store/vaultStore.ts`) — all
   confirmed to have zero callers anywhere in `src/app/**` or
   `src/components/**`, and per the product decision above will never
   gain any.
   - **Do not** remove `StorageService.decryptSandboxFile` or
     `removeFileEncryptionKey`/`removeFolderEncryptionKey`. The code's own
     comments describe these as "legacy... kept for backward
     compatibility" — implying real encrypted files may already exist
     from an earlier build or a backup restored from elsewhere. Those
     paths must keep working so such a file stays viewable/exportable and
     can still have its protection removed, rather than becoming
     permanently stuck.
   - Remove the now-dead `EncryptionKeyMetadata`-creation call sites and
     any settings-store scaffolding that only existed to support the
     removed functions (e.g. the `encryptionKeys` create/exists-check
     path) — but leave the `encryptionKeys` array, its SecureStore
     read/write, and `restoreKeysFromBackup`'s handling of it intact, so
     a backup made by an older build that *does* contain real encryption
     keys can still be restored and its files decrypted.
2. **Audit UI copy for overclaiming encryption.** Grep
   `src/app/**`, `README.md`, and `BACKUP_FEATURE_DOCUMENTATION.md` for
   "encrypt"/"encryption" language and confirm every remaining instance
   describes either (a) the access-key password gate accurately (not as
   cryptographic encryption), or (b) the legacy decrypt-path support kept
   for backward compatibility. Correct any copy that implies a newly
   imported/protected file becomes encrypted at rest.
3. **Re-benchmark PBKDF2 iterations (SEC‑2 — independent of #1/#2).**
   `PBKDF2_ITERATIONS` in `src/security/crypto.ts` is currently 10,000,
   self-documented as provisional pending a real-device benchmark. Run
   that benchmark on real target hardware (not the Jest/Babel
   environment the existing 10k figure was measured in) and raise the
   value as far as unlock-latency UX tolerates, toward OWASP's 600k
   guidance. Update the existing doc comment with the new benchmark
   numbers, matching its current disclosure style.

**Exit criteria:**
- [ ] `npx tsc --noEmit`, `npx expo lint`, `npx jest --ci` all stay green
      (adjust/remove any test that exercised the deleted functions).
- [ ] Grep-confirmed: no reachable UI path can create a new encrypted
      file; the decrypt/remove-protection path still compiles and its
      existing tests (`vaultStore.test.ts`) still pass for legacy-data
      scenarios.
- [ ] Grep-confirmed: no UI copy anywhere claims file encryption as a
      live feature.
- [ ] `PBKDF2_ITERATIONS` updated with a real-device benchmark recorded
      in-line.

---

## Phase 2 — Test coverage gaps

**Goal:** close the two concrete "next thing to break" gaps the audit
found — the only viewer screens with zero tests, which also carry live
`exhaustive-deps` warnings — and extend coverage to the app's largest,
currently-untested screens.

1. Add component tests for `src/app/(main)/viewer/image.tsx` and
   `video.tsx` — pinch-zoom/pan, fullscreen toggle, and scrubber behavior
   at minimum, following the pattern already established in
   `viewer/__tests__/document.test.tsx`.
2. Resolve the live `react-hooks/exhaustive-deps` warnings this surfaced:
   `image.tsx:209` (missing `savedScale`/`savedTranslateX`/
   `savedTranslateY`/`scale`/`translateX`/`translateY`) and
   `video.tsx:375,379` (missing `isFullscreen`, `scrubberAnim`) — for
   each, either add the dependency or record why it's intentionally
   omitted.
3. Add E2E/integration coverage (Detox or Maestro — pick one, none is
   configured yet) for the four largest, currently-untested screens:
   `dashboard.tsx`, `favorites.tsx`, `search.tsx`, `folder/[id].tsx`.

**Exit criteria:**
- [ ] `npx jest --ci` suite count increases by 2 (image/video viewer
      suites), all passing.
- [ ] `npx expo lint` warning count drops by 3 (the two `image.tsx` deps
      + two `video.tsx` deps count as separate warnings currently — verify
      exact delta after the fix).
- [ ] A new E2E suite exists and passes in CI for the four screens above.

---

## Phase 3 — On-device verification & release pipeline

**Goal:** close the "no core flow has ever been end-to-end verified on
real hardware" gap — the single largest gap between "looks correct
statically" and "known to work" per the audit — and establish a real
release path.

1. Manual (or scripted) on-device walkthrough, in order: onboarding →
   set master PIN → import a file → assign an access key to a file and a
   folder → unlock and view each of the 3 viewer types (document, image,
   video) → trash a file → restore it → export a backup → restore that
   backup on a second install (or after clearing app data).
2. Stand up an EAS `production` build profile in `eas.json` (currently
   only `preview` exists) and produce one real build artifact from it.

**Exit criteria:**
- [ ] A real build artifact (APK or equivalent) exists from the new
      `production` profile.
- [ ] Every step of the walkthrough above is confirmed working, or a new
      finding is filed (with repro steps) for whatever isn't.

---

## Phase 4 — Code quality & type-safety cleanup

**Goal:** close the audit's largest concrete code-quality gap — internal
handler parameters typed `any` when a concrete type already exists.

1. Replace the 44 `any`/`as any` handler-parameter types across
   `dashboard.tsx`, `favorites.tsx`, `search.tsx`, and `folder/[id].tsx`
   with the concrete types already defined in `src/types/index.ts`
   (`FolderMetadata`, `FileMetadata`) or the correct native event type.

**Exit criteria:**
- [ ] `npx tsc --noEmit` stays clean.
- [ ] `grep -rn "as any\|: any\b" src --include=*.ts --include=*.tsx | grep -v "__tests__\|vendor/"`
      count drops from 44 toward 0 (some may be legitimately unavoidable —
      document any that remain and why).

---

## Phase 5 — Product decisions & repo hygiene

**Goal:** close the two remaining open product decisions from the audit,
and clean up the small set of repo-hygiene findings.

1. **Decide** foreground idle-timeout auto-lock (today, auto-lock only
   triggers on `AppState` background→active transitions —
   `src/app/(main)/_layout.tsx:18-26` — not while the app sits idle in
   the foreground) and **decide** biometric-unlock support (currently
   fully blocked via `USE_BIOMETRIC`/`USE_FINGERPRINT` in `app.json`).
   Either implement each or record the decision to leave it out, so it
   stops being an open question for the next reader of the audit.
2. Refresh `README.md` to match current architecture (it still describes
   an older component set and a 5,000-round PBKDF2 figure that hasn't
   been true since the security remediation predating this audit).
3. Remove or populate the 5 empty `rules/*.md` files
   (`REQUIREMENTS.md`, `RESPONSIVE.md`, `SECURITY.md`, `SUMMARY.md`,
   `UI-DESIGN.md`) and the tracked-but-empty `tsc_out.txt`.
4. Resolve the `.kilo/kilo.jsonc` tracking inconsistency (it's tracked
   despite `.kilo/` being gitignored) — either `git rm --cached` it or
   leave it deliberately and drop the ignore-rule mismatch note.
5. Run `npm run vendor:check` (regenerates the vendored PDF/DOCX viewer
   libraries and diffs against the tracked copies) and `npm audit` in a
   controlled session — both were skipped during the audit itself (the
   former to avoid writing to tracked files without being asked, the
   latter because it requires a network call).

**Exit criteria:**
- [ ] Both product decisions (idle-timeout, biometric) are recorded
      somewhere durable — implemented, or documented as intentionally
      out of scope.
- [ ] `README.md` matches current architecture.
- [ ] No stray/empty tracked files remain among the ones listed above.
- [ ] `npm run vendor:check` passes with a clean diff.
- [ ] `npm audit` has been run at least once and any findings triaged
      (fixed, or recorded as accepted).

---

## Sequencing

Phase 1 goes first — smallest, security-relevant, and prevents dead code
from complicating every later phase. Phases 2–5 have no hard dependencies
on each other and can proceed in any order, or in parallel across
sessions/contributors. Phase 3's manual walkthrough benefits from Phase
2's viewer tests existing first (more confidence going in) but doesn't
strictly require them.

| Phase | Priority | Rough size | Depends on |
|---|---|---|---|
| 1 — Security posture correction | Highest | Small | — |
| 2 — Test coverage gaps | High | Medium | — |
| 3 — On-device verification & release pipeline | High | Medium | (soft) Phase 2 |
| 4 — Type-safety cleanup | Medium | Small–Medium | — |
| 5 — Product decisions & repo hygiene | Medium | Small | — |
