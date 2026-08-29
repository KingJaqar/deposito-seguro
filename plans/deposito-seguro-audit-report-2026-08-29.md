# Deposito Seguro — Repository Audit Report

**Audit date:** 2026‑08‑29 · **Scope:** full working tree at `HEAD` (`3437bc9`, branch `main`) · **Methodology:** static source review of all tracked files + executed verification (`tsc`, `eslint`, `jest`, `expo-doctor`)

> **Revision note (post-publication).** While this revision pass was underway, `git status` began showing a live, unrelated in-progress change outside this audit — a tab-root navigation fix (`router.push`→`router.replace`, to stop bottom-tab jumps from growing the navigation stack with ghost screen instances) spanning `src/components/AnimatedTabBar.tsx` (also refactored `TouchableOpacity`→`Pressable`+`memo`, retuned animation timings), `src/app/(main)/dashboard.tsx`, `src/app/(main)/trash.tsx`, and a comment update in `src/app/(main)/_layout.tsx`. None of it was authored by this audit, none of it is analyzed in any finding below, and none of it overlaps the specific lines this report cites (verified directly against each diff — e.g. `_layout.tsx`'s auth-guard/`AppState` lines at [18-26/62-64](../src/app/(main)/_layout.tsx) and `dashboard.tsx`'s cited `any`-typed lines in §11 are both untouched). `npx tsc --noEmit`, `npx expo lint`, and `npx jest --ci` were re-run against the tree with these changes present and produced results identical to the original pass (0 type errors; 0 lint errors/17 warnings; 118/118 tests passing) — the executed-evidence claims below remain current. If more such changes land after this note was written, they were likewise not analyzed here. This revision pass also corrects one significant mis-rating found on re-review — the "encryption keys" feature, now **Finding SEC‑0** in §10 — plus several smaller citation and wording issues throughout.

---

## 1. Executive Summary

**Deposito Seguro** is a single-tenant, fully offline **React Native (Expo SDK 57) vault app** for Android/iOS that stores a user's files behind a PIN, encrypts selected files/folders with AES‑256‑CBC+HMAC, and can disguise itself as a working calculator app (including swapping the OS launcher icon on Android). There is **no backend, no network calls, and no cloud storage** — `android.permission.INTERNET` is explicitly blocked in `app.json`, and this is architecturally enforced (the offline PDF/DOCX viewers vendor their JS libraries as bundled strings specifically because no network fetch is possible — [scripts/generate-viewer-vendor.js](../scripts/generate-viewer-vendor.js)).

This is an unusually mature codebase for its size: essentially every security-sensitive file carries inline comments citing specific prior findings (IDs such as `S‑1`…`S‑12`, `I‑1`…`I‑23`, and others — e.g. `N‑1` for a native-specific finding, §9.2) from four audit/planning documents already checked into `plans/`, and the fixes described in those comments are independently verifiable in the current source — I cross-checked a representative sample (constant-time comparison, AES‑CBC+HMAC replacing a prior XOR cipher, PBKDF2 replacing a manual SHA‑256 loop, brute-force lockout, `allowBackup="false"`, storage-limit accounting, render-time auth guard) and found the code matches the claims. This audit independently re-verifies rather than trusts those documents (per the audit's own untrusted-evidence rule), but treats consistent, corroborated claims as **Confirmed**.

**Executed evidence, this session:** `npx tsc --noEmit` — 0 errors. `npx expo lint` — 0 errors, 17 warnings (all dead-import/unused-var). `npx jest --ci` — **118/118 tests passing**, 13 suites. `npx expo-doctor` — 21/21 checks passed. This is real, reproduced-in-this-session evidence, not a claim taken from documentation.

**What is *not* verified in this session:** no Android/iOS build was compiled, no APK was installed, and no on-device or emulator run occurred. The project's own `plans/what-are-the-next-jaunty-deer.md` documents a prior, partial on-device pass (cold boot through first screen only) that surfaced and fixed two real runtime bugs invisible to static analysis — but explicitly leaves login, file import, all three viewer types, trash/restore, and backup/restore **unverified on a real device**. This audit treats that document as evidence of *what the project has previously found*, not as first-hand verification performed here.

**Bottom line:** functionally broad and unusually well-instrumented against its own known defects, with a real (if incomplete) security posture — but it has **zero automated UI/E2E coverage**, **zero on-device verification this session**, and one headline gap that undercuts the app's core value proposition: **the AES‑256‑CBC+HMAC file-encryption feature is unreachable from any screen in the current app.** The only UI-reachable protection mechanism ("access keys") is a password gate enforced inside the app's own UI, not encryption — a "protected" file is stored as plain, readable bytes on disk (**SEC‑0**, §10). A second, related gap compounds this: **vault files are stored in the exported backup ZIP with exactly the protection level they have inside the vault** — since no file can currently become encrypted at rest, this means essentially every exported file is fully readable plaintext inside a password-less ZIP; only the *access/encryption key secrets* (not file bytes) are optionally passphrase-protected (**SEC‑1**, §10).

---

## 2. Audit Scope, Access, and Verification Limits

| Item | Status |
|---|---|
| Source code (`src/`, `plugins/`, `scripts/`) | Fully inspected |
| Configuration (`app.json`, `eas.json`, `tsconfig.json`, `babel.config.js`, `metro.config.js`, `eslint.config.js`, `.github/workflows/ci.yml`) | Fully inspected |
| Tests (`**/__tests__/**`) | Fully inspected + executed |
| `android/`, `ios/` native projects | **Do not exist in this repo** — both are gitignored, generated by `expo prebuild` from the two local config plugins ([.gitignore:42-43](../.gitignore)). Nothing to inspect; native behavior is inferred from the plugin source that generates them. |
| Backend / server / cloud | **Not present in the repository.** Confirmed architecturally: `INTERNET` is in `app.json`'s `android.blockedPermissions` ([app.json:35-42](../app.json)), and no HTTP client, API SDK, or backend config exists anywhere in `src/`. |
| Build execution | **Not run.** No `expo prebuild`, `gradlew assembleDebug`, EAS build, or app install was performed this session. |
| Runtime / device execution | **Not run this session.** A prior, partial on-device pass is documented in `plans/what-are-the-next-jaunty-deer.md` (see §13) but is not first-hand evidence for this audit. |
| Non-destructive validation commands | **Executed:** `npx tsc --noEmit`, `npx expo lint`, `npx jest --ci`, `npx expo-doctor` (all read-only, matching `.github/workflows/ci.yml`). **Not run:** `npm run vendor:check` (regenerates + diffs vendored files — skipped to avoid writing to tracked files without being asked) and `npm audit` (would contact npm's registry — a network call, out of scope for a repo whose own security model is "no network"). |
| Files modified | **None.** `git status --short` confirmed clean after every validation command. |

---

## 3. Project Purpose and Actual Behavior

Determined from code, not from `README.md` (which is materially stale — see [§11](#11-inconsistencies-bugs-and-risks)).

- **Target users:** an individual who wants to hide personal files (photos, videos, documents, APKs) on their own device, behind a PIN, with no cloud dependency and an option to make casual/coercive inspection ("someone picks up my unlocked phone") show an innocuous calculator instead of a file vault.
- **Core problem solved:** on-device, offline, encrypted personal file storage with a plausible-deniability disguise layer.
- **Core user workflows (confirmed in code):** onboarding → set a 6–20 digit master PIN → import files into folders → lock individual files/folders behind a separate "access key" password (an app-level UI gate — see Finding SEC‑0, §10, for why this does not encrypt the file itself) → browse/search/favorite/trash/restore/shred → export a ZIP backup → restore a ZIP backup on the same or a different device. A parallel "named encryption key" mechanism also exists in the code but, per SEC‑0, has no UI path that ever invokes it.
- **Disguise mechanism:** a `disguiseMode` setting (`default | calculator | notes | utility`) changes what the *lock screen itself* renders — in `calculator` mode the lock screen is a fully functional scientific calculator ([src/app/(auth)/login.tsx](../src/app/(auth)/login.tsx)) that only reveals the vault when the entered digits happen to also be a valid PIN. Separately, `disguiseIconTheme` swaps the **actual OS launcher icon** on Android via `activity-alias` toggling ([plugins/withDisguiseIcon.js:212-253](../plugins/withDisguiseIcon.js)).
- **Doc-vs-code gap:** `README.md` describes an older architecture (5,000 PBKDF2 rounds, a different component set, no access-keys/backup-passphrase system) that no longer matches the shipped code. Not used as evidence anywhere in this audit.

### Architecture (reconstructed from code)

```text
User
  │
  ▼
Screens (src/app/**, expo-router file-based routing)
  (auth): onboarding → register → lock/login   (main): dashboard, folder/[id], search,
                                                  favorites, trash, settings/*, viewer/*
  │
  ▼
State (zustand stores, src/store/*)
  authStore (session)  settingsStore (keys, prefs)  vaultStore (files/folders)  lockoutStore (brute-force)
  │
  ▼
Services / crypto (src/services/*, src/security/crypto.ts)
  StorageService (sandbox FS I/O)   SecureCrypto (PBKDF2 + AES-256-CBC+HMAC)
  EnhancedBackupService (ZIP export/import)   documentViewers/* (offline PDF/DOCX/XLSX render)
  │
  ▼
Device-local persistence only — no network layer exists
  AsyncStorage (metadata, JSON)   expo-secure-store (PIN hash, key/password secrets)
  App sandbox filesystem (vault_sandbox/, plaintext or AES-256-CBC+HMAC ciphertext)
```

There is no "API / Authentication backend / Database" tier in the generic template this audit's own architecture diagram assumes — everything below the state layer is on-device only.

---

## 4. Repository Structure and Active Components

211 files tracked by git. Non-code directories (`assets/`, `design images as reference output/`) are screenshots/icons used as build references and app assets, not summarized further; `dist/`, `.expo/`, `.kilo/node_modules/`, `.qodo/` are local/generated and gitignored (not part of the committed repo, despite appearing on disk).

| Path | Role | Status |
|---|---|---|
| `App.tsx` | Expo Router entry (`ExpoRoot`) | Active |
| `src/app/(auth)/*` | Onboarding, register (PIN wizard), lock, login (PIN pad / calculator disguise) | Active |
| `src/app/(main)/*` | Dashboard, folder browser, search, favorites, trash, settings (4 subpages), 3 file viewers | Active |
| `src/components/primitives/*` (21 files) | Shared design-system components (Button, Card, Sheet, Dialog, TextField, …) | Active |
| `src/components/*.tsx` (top level, 16 files) | Feature modals: access-key registration/unlock, move/rename (+ context wrappers), clipboard bar, destructive-confirm, file info, folder picker, backup confirm, tab bar, vault header | Active |
| `src/components/documentViewer/*` | WebView-hosted PDF/DOCX/XLSX/plain-text renderers | Active |
| `src/components/onboarding/*` | PIN keypad/dots, progress indicator, brand header for the register wizard | Active |
| `src/store/*` (4 stores + 4 test files) | authStore, settingsStore, vaultStore, lockoutStore | Active, unit-tested |
| `src/security/crypto.ts` | PBKDF2 + AES‑256‑CBC+HMAC primitives | Active, unit-tested |
| `src/services/storage.ts` | Sandbox filesystem I/O, encrypt/decrypt, orphan-file sweep | Active |
| `src/services/backupService.ts` (+ `backup.ts` re-export shim) | ZIP backup/restore | Active, unit-tested |
| `src/services/apkIconExtractor.ts` | Best-effort real-icon extraction for imported `.apk` files | Active |
| `src/services/documentViewers/*` | HTML/JS generation for offline document viewers + 3 `*.generated.ts` vendor bundles (pdf.js, pdf.worker, mammoth — checked into git as generated string exports) | Active; vendor files are machine-generated (`scripts/generate-viewer-vendor.js`), not hand-maintained |
| `src/utils/*` (10 files) | Validation, calculator expression evaluator, disguise-icon bridge, file typing, naming, responsive scaling, SecureStore key sanitization, video remux bridge | Active |
| `src/contexts/*` | Theme, hydration gate, move/rename modal state | Active |
| `src/hooks/*` | File-system query, thumbnail decrypt-to-temp, screen-enter animation | Active |
| `src/constants/*` | Colors, typography, radius, shadows, animation timings, naming limits, storage-limit tiers | Active |
| `plugins/withDisguiseIcon.js`, `plugins/withVideoRemux.js` | Expo config plugins that regenerate native Android Kotlin modules + manifest edits on every `prebuild` | Active — this **is** the native layer; `android/` itself doesn't exist in the repo |
| `scripts/generate-viewer-vendor.js` | Regenerates the 3 vendor `*.generated.ts` files from `node_modules` | Active, dev-time only |
| `.github/workflows/ci.yml` | Lint/typecheck/test/vendor-check/doctor on push+PR to `main` | Active |
| `plans/*.md` (4 files) | Prior AI-assisted audit/remediation trail, extensively cross-referenced by inline code comments | Reference/historical — not shipped, not app logic |
| `rules/*.md` (6 files) | 4 of 6 are **empty (0 bytes)**: `REQUIREMENTS.md`, `RESPONSIVE.md`, `SECURITY.md`, `SUMMARY.md`, `UI-DESIGN.md`. `ANALYZE.md`/`VERIFYCHANGES.md` are non-empty but tiny (8/6 lines) | Likely AI-assistant prompt scaffolding; mostly unused placeholders |
| `README.md`, `BACKUP_FEATURE_DOCUMENTATION.md`, `DESIGN_SYSTEM_REFACTOR.md`, `UI_CONSISTENCY_UPDATE.md`, `UI_UX_DESIGN_CRITIQUE.md` | Project docs | `README.md` is **stale** (see §11); the other four are design-process notes, not verified against current code in this pass |
| `.kilo/`, `.qodo/` | Third-party AI coding-tool scaffolding | `.kilo/kilo.jsonc` is (unusually) git-tracked; `.kilo/node_modules/` and `.qodo/` are gitignored. Not part of the app; own toolchain, not inspected further |
| `tsc_out.txt` (root) | **Tracked, 0 bytes** | Dead/stray file — see Minor findings |
| `dist/` | Local `expo export --platform web` output on disk | **Not git-tracked** (`.gitignore` excludes it) — not part of the committed repo |

---

## 5. Technology Stack and Dependencies

| Layer | Technology | Classification |
|---|---|---|
| Framework | Expo SDK ~57.0.18, React Native 0.86.3, React 19.2.3 | Actively used |
| Language | TypeScript ^6.0.3, `strict: true` ([tsconfig.json:6](../tsconfig.json)) | Actively used |
| Routing | expo-router ~57.0.17 (file-based, `(auth)`/`(main)` groups) | Actively used |
| State management | zustand ^4.5.2 (4 stores, no middleware/persist plugin — persistence is hand-rolled) | Actively used |
| Styling | Hand-rolled `StyleSheet` + a `useTheme()` context (no styling library) | Actively used |
| Forms/validation | Hand-rolled (`accessKeyValidation.ts`) | Actively used |
| Networking | **None** — no fetch/axios/API client anywhere; `INTERNET` permission actively blocked | N/A by design |
| Auth | Local PIN → PBKDF2‑HMAC‑SHA256 hash compared via constant-time compare; no OAuth/SSO/biometrics | Actively used (device‑local only) |
| Backend/DB | **None** | Not present |
| Local persistence | `@react-native-async-storage/async-storage` 2.2.0 (metadata JSON) + `expo-secure-store` ~57.0.2 (secrets) | Actively used, split correctly (see §10) |
| Crypto | `crypto-js` ^4.2.0 (PBKDF2, AES‑CBC, HMAC‑SHA256) + `expo-crypto` ~57.0.2 (CSPRNG only) | Actively used |
| File I/O | `expo-file-system` (legacy API — `expo-file-system/legacy`), `expo-document-picker`, `expo-image-picker`, `expo-media-library`, `expo-sharing`, `react-native-blob-util` | Actively used |
| Backup | `jszip` ^3.10.1 | Actively used |
| Document rendering | `pdfjs-dist` 3.11.174 (devDependency, vendored as string), `mammoth` ^1.9.1 (devDependency, vendored as string), `xlsx` ^0.18.5, `react-native-webview` 13.16.1 | Actively used — note `pdfjs-dist`/`mammoth` are **devDependencies** but their output ships inside the JS bundle via the generated vendor files; this is intentional (see `scripts/generate-viewer-vendor.js`'s own doc comment) but an unusual dependency classification worth knowing about, not a defect |
| Icons | `lucide-react-native` ^1.21.0, `@expo/vector-icons` ^15.1.1 | Actively used |
| Animation/gestures | `react-native-reanimated` 4.5.1, `react-native-worklets` 0.10.1, `react-native-gesture-handler` ~2.32.0 | Actively used — reanimated 4 requires New Architecture/worklets, confirmed compatible with this Expo SDK per `expo-doctor`'s clean run |
| Native/platform | 2 local Expo config plugins generating Kotlin native modules (icon-alias switching, `FLAG_SECURE`, lossless video remux via `MediaExtractor`/`MediaMuxer`) — **Android only**, no iOS-native equivalent exists | Actively used, Android-only by explicit design (`plugins/withVideoRemux.js:23-26`) |
| Testing | `jest` ~29.7.0 via `jest-expo`, `@testing-library/react-native` ^13.3.3 | Actively used |
| Lint/format | ESLint 9 + `eslint-config-expo` | Actively used, 0 errors |
| CI | GitHub Actions (`ci.yml`) | Actively used |
| EAS build | `eas.json` — only a `preview`/internal APK profile exists; **no `production` profile** | Partially configured — confirmed intentional/deferred, not an oversight (`plans/what-are-the-next-jaunty-deer.md`: "item 14 … deferred by user decision ('not ready yet')") |

No dependency-version conflicts, deprecated-package warnings, or build-blocking incompatibilities were surfaced by `expo-doctor` (21/21 clean) or `tsc`/`eslint`. `npm audit` was not run (would require a network call to the npm registry).

---

## 6. Current Architecture and Data Flow

Already diagrammed in §3. Key structural facts, confirmed in code:

- **Route-guard enforcement is real, not just navigational convention.** `src/app/(main)/_layout.tsx:62-64` renders `<Redirect href="/(auth)/lock" />` if `!isAuthenticated`, at the layout level — a deep link or restored nav state landing directly on a `(main)` route cannot bypass the lock screen. This is documented in-code as fixing a real prior gap (`I-1`).
- **Session lock is timer-based**, evaluated on `AppState` transitions, not a background timer: elapsed time since `lastActiveTimestamp` is checked only when the app returns to `active` ([src/app/(main)/_layout.tsx:18-26](../src/app/(main)/_layout.tsx)). This means the app **cannot self-lock while genuinely backgrounded and never resumed** (e.g., force-quit) — but the master PIN itself is required again on any fresh cold boot regardless (`isAuthenticated` always starts `false`), so this is a minor UX nuance, not a bypass.
- **Disguise mode has a real secondary security effect**, not just cosmetic: backgrounding under `calculator` disguise calls `lockTransientMemory()`, which blanks in-memory encryption/access-key secrets ([src/store/settingsStore.ts:520-526](../src/store/settingsStore.ts)) — a deliberate reduction of the live secret-material window while the disguise is active.

---

## 7. Complete Feature Inventory

| Feature | UI Location | Frontend Logic | Service/Backend | Data Storage | Validation | Loading/Error Handling | Auth/Authorization | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| Onboarding / first-run | `(auth)/onboarding.tsx` | `useAuthStore.checkSetup` | — | — | — | 8s timeout guard, loading state | N/A (pre-auth) | Statically complete | [onboarding.tsx:31-53](../src/app/(auth)/onboarding.tsx) |
| Master PIN creation (wizard) | `(auth)/register.tsx` | 4-step wizard, auto-advance on 6th digit | `authStore.initializeVault` | SecureStore (hash+salt) / AsyncStorage on web | `PIN_MIN_LENGTH`=6, confirm-match | Alert on mismatch/failure | N/A (pre-auth) | Statically complete, unit-tested | [register.tsx](../src/app/(auth)/register.tsx), [authStore.test.ts](../src/store/__tests__/authStore.test.ts) |
| PIN / calculator-disguise unlock | `(auth)/login.tsx`, `lock.tsx` | Full scientific-calculator expression engine dual-purposed as PIN entry | `authStore.authenticate` | SecureStore hash compare | PIN regex + length | Lockout-aware alerts | PBKDF2 + constant-time compare + brute-force lockout | Statically complete | [login.tsx](../src/app/(auth)/login.tsx) |
| Brute-force lockout | login/lock, `access-keys.tsx`, `auth-key.tsx` | 5 attempts → 30s lockout, survives restart | `lockoutStore` | AsyncStorage | — | Remaining-time messaging | Applies to master PIN + access-key deletion | Statically complete, unit-tested | [lockoutStore.ts](../src/store/lockoutStore.ts), [lockoutStore.test.ts](../src/store/__tests__/lockoutStore.test.ts) |
| Folder create/rename/move/delete | `dashboard.tsx`, `folder/[id].tsx`, `RenameModal`, `MoveVaultModal` | `vaultStore.createFolder/renameFolder/moveFolder/deleteFolder` | — | AsyncStorage (`@vault_folders`) | Name clamping, dedupe | try/catch + Alert at UI call sites | Access-key cascade on delete (I-12) | Statically complete, unit-tested | [vaultStore.ts:376-450](../src/store/vaultStore.ts), [vaultStore.test.ts](../src/store/__tests__/vaultStore.test.ts) |
| File import (incl. `.apk` icon extraction, video remux) — **always imports as unencrypted**: `encrypt` is hardcoded `false` at the sole real UI call site (see SEC‑0) | `folder/[id].tsx` | `vaultStore.importFile` | `StorageService`, `apkIconExtractor`, `videoRemux` (native, Android-only) | Sandbox FS + AsyncStorage (`@vault_files`) | Storage-limit pre-check | Throws `StorageLimitExceededError`, caught at call sites | — | Statically complete, unit-tested | [vaultStore.ts:452-536](../src/store/vaultStore.ts), [folder/\[id\].tsx:202,204](../src/app/(main)/folder/[id].tsx), [vaultStore.test.ts](../src/store/__tests__/vaultStore.test.ts) |
| Per-file/-folder encryption ("encryption keys") | **None found** — `assignFileEncryptionKey`/`assignFolderEncryptionKey`/`createEncryptionKey` have zero call sites anywhere in `src/app/**` or `src/components/**` (grep-confirmed) | Functions exist and are correctly implemented (cascade to children on assign/remove) but are never invoked by any screen | `StorageService.encrypt/decryptSandboxFile` (real implementation — unreachable in practice) | Sandbox FS (`.enc` files), key secret in SecureStore — never populated by real use | Key existence check | Per-file try/catch, logged | Encryption key not usable without decrypting first (S-11: throws, never falls back) | **Backend-only** — see Finding **SEC‑0**, §10 | [vaultStore.ts:793-846](../src/store/vaultStore.ts), [settingsStore.ts:393-395](../src/store/settingsStore.ts) (code's own "no live UI caller" comment), [crypto.ts](../src/security/crypto.ts) |
| Access keys — **app-level password gate only; does not encrypt file bytes** (see SEC‑0) | `settings/access-keys.tsx`, `AccessKeyUnlockModal`/`RegistrationModal`/`ScreenAuthModal` | create/edit/delete with constant-time delete-verification + lockout | `settingsStore` | Secret in SecureStore, metadata (password redacted) in AsyncStorage | `validatePassword` (8-128 chars, complexity) | Alert-based | Per-key delete lockout | Statically complete, unit-tested | [access-keys.tsx](../src/app/(main)/settings/access-keys.tsx), [settingsStore.ts:267-389](../src/store/settingsStore.ts), [settingsStore.test.ts](../src/store/__tests__/settingsStore.test.ts) |
| Favorites | `favorites.tsx` | `toggleFavorite`/`toggleFolderFavorite`, personal-favorites folder | `vaultStore` | AsyncStorage | — | — | — | Statically complete | [vaultStore.ts:537-546,925-946](../src/store/vaultStore.ts) |
| Search | `search.tsx` (957 lines) | Multi-mime filter over `folders`/`files` | `vaultStore` (read-only) | — | — | — | — | Statically complete (not unit-tested) | [search.tsx](../src/app/(main)/search.tsx) |
| Trash / restore / shred | `trash.tsx` | soft-delete, restore-with-access-key-preservation (I-12), permanent shred | `vaultStore`, `StorageService.removeSandboxFile` | AsyncStorage + FS delete | — | — | — | Statically complete | [vaultStore.ts:547-745](../src/store/vaultStore.ts) |
| Clipboard copy/cut/paste (incl. cross-folder, batch storage-limit check) | context-menus across `dashboard`/`favorites`/`search`/`folder/[id]` | `copyToClipboard`/`cutToClipboard`/`pasteFromClipboard` | `vaultStore` | AsyncStorage (`@vault_clipboard`) | Batch storage-limit pre-check (I-22) | Orphaned-copy cleanup on partial-batch failure | — | Statically complete, unit-tested | [vaultStore.ts:995-1292](../src/store/vaultStore.ts), [vaultStore.test.ts](../src/store/__tests__/vaultStore.test.ts) |
| Document/image/video viewers (offline PDF/DOCX/XLSX/text/image/video) | `viewer/document.tsx`, `image.tsx`, `video.tsx` | decrypt-to-temp-file pattern, cleanup on unmount | `StorageService.decryptSandboxFile`, WebView + vendored JS libs | Sandbox FS (temp plaintext) | S-11: throws if key unavailable, no silent fallback | Explicit error state (`document.test.tsx` covers this) | Requires resolvable encryption key | Statically complete, **document.tsx unit-tested**; **image.tsx/video.tsx have zero component tests** (documented gap) | [document.tsx](../src/app/(main)/viewer/document.tsx), `plans/what-are-the-next-jaunty-deer.md` |
| Orphaned-plaintext-temp-file sweep (boot) | — (background) | `StorageService.sweepOrphanedPlaintextTempFiles` | — | Sandbox FS scan | Staleness margin to avoid racing an in-flight decrypt | Logged, best-effort | — | Statically complete | [storage.ts:124-188](../src/services/storage.ts) |
| Storage-limit setting/enforcement | `settings/storage.tsx` | device-capacity-aware option graying | `vaultStore.getVaultUsageBytes`, `assertWithinStorageLimit` | AsyncStorage | Device tier + free-space aware | Alert with exact byte figures | — | Statically complete, unit-tested | [storageLimits.ts](../src/constants/storageLimits.ts), [storage.test.tsx](../src/app/(main)/settings/__tests__/storage.test.tsx) |
| Theming (light/dark/AMOLED, accent, font scale, disguise) | `settings/customization.tsx`, `ThemeContext` | — | `settingsStore` | AsyncStorage | — | — | — | Statically complete | [ThemeContext.tsx](../src/contexts/ThemeContext.tsx) |
| App-icon disguise (real OS launcher icon swap) | `settings/customization.tsx`, `index.tsx` | `setDisguiseIcon`/`initializeDisguiseIcon` | Native `DisguiseIconModule` (Android only) | `activity-alias` component enable/disable | — | Silent no-op if module unavailable (Expo Go / iOS) | — | Statically complete (Android); **N/A on iOS** | [disguiseIcon.ts](../src/utils/disguiseIcon.ts), [withDisguiseIcon.js](../plugins/withDisguiseIcon.js) |
| Screenshot/recents protection (`FLAG_SECURE`) | `settings/customization.tsx`, on by default | `setFlagSecure` | Native `DisguiseIconModule.setFlagSecure` (Android only) | — | — | Caught, logged | — | Statically complete **and** documented as having been broken at runtime once (UI-thread bug), now fixed in source (`activity.runOnUiThread` wrap present) — **not re-verified on-device this session** | [withDisguiseIcon.js:84-114](../plugins/withDisguiseIcon.js) |
| ZIP backup export | `settings/index.tsx` (renders `BackupConfirmDialog`; calls `BackupService.pickBackupFolder`/`createBackupInFolder`) | folder pick (SAF on Android) → manifest → ZIP | `EnhancedBackupService` | Device filesystem (user-chosen folder) | Post-write validation (zip exists, size>0, manifest present) | Rolls back (deletes) invalid output | Optional passphrase encrypts only key *secrets*, not file bytes — and per SEC‑0, no file bytes are ever encrypted at rest to begin with | Statically complete, unit-tested | [settings/index.tsx](../src/app/(main)/settings/index.tsx), [backupService.ts](../src/services/backupService.ts), [backupService.test.ts](../src/services/__tests__/backupService.test.ts) |
| ZIP backup restore | same | pick file → parse manifest → restore | same | AsyncStorage + FS write | Manifest structure checks | Distinguishes "needs passphrase" from other failures | Passphrase-gated key-secret restore | Statically complete, unit-tested | same |
| Missing-payload reconciliation | — (background, on hydrate) | `reconcileMissingPayloads` | `StorageService.fileExists` | — | — | Flags `isMissing` instead of hard error | — | Statically complete | [vaultStore.ts:354-375](../src/store/vaultStore.ts) |
| Analytics / crash reporting | — | — | — | — | — | — | — | **Not present** — no Sentry/Firebase/Crashlytics/analytics SDK anywhere in `package.json` or source | grep across `src/`, `package.json` |
| Push notifications | — | — | — | — | — | — | — | **Not present** — no `expo-notifications` dependency | `package.json` |
| Biometric auth | — | — | — | — | — | — | — | **Not present, and actively blocked**: `USE_BIOMETRIC`/`USE_FINGERPRINT` are in `android.blockedPermissions` ([app.json:35-42](../app.json)) | `app.json` |

---

## 8. Feature Trace Analysis

Two representative end-to-end traces, chosen for security relevance.

### 8.1 Master-PIN unlock

```text
login.tsx (PIN pad or calculator-disguise digit sequence)
  → handleStandardAuth() validates via validatePin() [accessKeyValidation.ts]
  → checks useLockoutStore.isLockedOut(PIN_LOCKOUT_KEY) client-side (UX only — see below)
  → authStore.authenticate(password)
      → useLockoutStore.isLockedOut() re-checked authoritatively inside authStore.authenticate() itself (not merely the UI's own pre-check)
      → SecureStore.getItemAsync(MASTER_PASSWORD_HASH / SALT)
      → SecureCrypto.hashPassword(password, salt)  — PBKDF2-HMAC-SHA256, 10,000 rounds
      → SecureCrypto.secureCompare(verifyHash, storedHash)  — constant-time
      → on success: lockoutStore.resetAttempts(), authStore sets isAuthenticated=true,
        re-triggers settingsStore.hydrateSettings() (recovers keys blanked by disguise-mode backgrounding)
      → on failure: lockoutStore.recordFailedAttempt()
  → router.replace('/(main)/dashboard')
```
No broken link found in this trace. The lockout check is duplicated in the UI (`login.tsx:104-117`) purely for a friendlier message — `authenticate()` enforces it independently, so a caller skipping the UI check (impossible here, but relevant to §7's design intent) still can't bypass lockout. This is the intended, documented design (`S-1`).

### 8.2 Encrypted-file view (viewer/document.tsx)

```text
folder/[id].tsx → user taps an encrypted file
  → router push to viewer/document.tsx with file id
  → document.tsx resolves file from vaultStore, resolves encryptionKeys from settingsStore
  → if isEncrypted && no resolvable key: throws / sets an explicit error state
    (confirmed by document.test.tsx: "S-11 fail-loudly path (missing encryption key → error state,
     decryptSandboxFile never called)")
  → if key resolves: StorageService.decryptSandboxFile(localPath, key)
      → reads ciphertext (UTF8), SecureCrypto.decrypt(): HMAC verified constant-time BEFORE
        AES-CBC decrypt runs — throws "authentication tag mismatch" on tamper/wrong key
      → writes plaintext to a sibling temp path (same name minus ".enc")
  → viewer renders temp path (routes by mimeType to PdfViewer/FlowDocViewer/SheetViewer/TextPageViewer)
  → on unmount: temp plaintext file deleted
  → if the app crashes between decrypt and cleanup: the boot-time sweep
    (StorageService.sweepOrphanedPlaintextTempFiles) catches it on the next cold start,
    with a staleness margin specifically to avoid deleting a file that's mid-decrypt right now
```
No broken link found. This is a genuinely well-reasoned pipeline — the fail-loudly-on-missing-key design (replacing an earlier silent-fallback bug, `S-11`) and the boot sweep's staleness-margin design (explicitly reasoned about a race the code comment itself flags as "not actually enforced anywhere" by the splash-hide timer) both show real engineering care, not just defensive boilerplate.

---

## 9. Frontend, Backend, Data, and Native Platform Assessment

**Backend/API/cloud database: not present in the repository**, as stated in §2/§3. There is no server code, no ORM, no API route, no cloud SDK.

### 9.1 On-device "resources" (in place of a backend data-contract table)

| Resource | Purpose | Fields/Types Observed | Readers | Writers | Validation | "Authorization" evidence | Risks/Mismatches |
|---|---|---|---|---|---|---|---|
| SecureStore: `MASTER_PASSWORD_HASH`/`SALT`, `SECURITY_HINT`, `PIN_LENGTH` | Master PIN auth | Hex strings | `authStore` | `authStore` | — | Constant-time compare, PBKDF2 | None found |
| SecureStore: `access_key_<id>`, `encryption_key_<id>` | Raw secret values | Plaintext string secrets | `settingsStore` load functions | `settingsStore` create/update/delete | — | — | S-2 fix confirmed: these secrets are **never** duplicated into the AsyncStorage JSON blob ([settingsStore.ts:122-145](../src/store/settingsStore.ts)) |
| AsyncStorage: `@vault_settings` | Non-secret settings snapshot + **redacted** key/access-key metadata | JSON | `settingsStore.hydrateSettings` | `persistSnapshot` | — | — | Redaction verified in code (password/key fields blanked before serialize) |
| AsyncStorage: `@vault_folders`, `@vault_files` | Vault structure/metadata | `FolderMetadata[]`, `FileMetadata[]` (types/index.ts) | `vaultStore` | `persistFolders`/`persistFiles` | — | — | `localPath` is a raw absolute device path — portable only via the backup remap logic (§9.2), correctly handled there |
| AsyncStorage: `@vault_lockouts` | Brute-force attempt counters | `{attempts, lockouts}` JSON | `lockoutStore` | `lockoutStore` | — | Survives restart (S-5 fix confirmed) | None found |
| AsyncStorage: `@vault_clipboard` | Copy/cut clipboard | `ClipboardItem` JSON | `vaultStore` | `persistClipboard` | — | — | None found |
| App sandbox FS: `vault_sandbox/` | File payloads (plaintext or `.enc`) | Binary/ciphertext | `StorageService` | `StorageService` | — | AES-256-CBC+HMAC, keys never embedded in filenames | **See SEC‑0** — the `.enc` path exists and is correctly implemented, but is never reached by any current UI flow, so in practice every payload here is plaintext |
| Backup ZIP (`DepoS_Backup_*.zip`) | Portable export | manifest.json + `files/` | `EnhancedBackupService.restoreBackup` | `EnhancedBackupService.createBackupInFolder` | Post-write zip/size/manifest checks | **No password on the ZIP itself**; only key *secrets* are optionally passphrase-encrypted | **See Finding SEC-1 below** — file bytes carry exactly the vault's own protection level into a portable, unencrypted-by-default archive |

### 9.2 Native platform (Android-only; no iOS-native code exists)

Both native modules are generated Kotlin, produced fresh on every `expo prebuild` by the two local config plugins — this is a deliberate design (documented in-code as fixing `N-1`: hand-edited native files in the gitignored `android/` folder used to silently vanish on a clean prebuild).

- `DisguiseIconModule`: `setIcon(theme)` toggles 4 `activity-alias` component states; `setFlagSecure(enabled)` sets/clears `WindowManager.LayoutParams.FLAG_SECURE`, wrapped in `activity.runOnUiThread` — this wrap is present in the current source and, per the project's own audit trail, fixes a real on-device threading crash found during a prior device pass. **Not independently re-verified on a device in this audit.**
- `VideoRemuxModule`: lossless `MediaExtractor`/`MediaMuxer` stream-copy remux for videos with an unseekable/`TIME_UNSET` duration, run off the UI thread (`Thread { ... }.start()`), with orientation-hint preservation and a growing sample buffer. Well-reasoned, but its correctness (does it actually always produce a seekable file, does the orientation hint round-trip correctly) is **not verifiable without a device**.
- `AndroidManifest.xml` patch sets `android:allowBackup="false"` — confirmed present, correctly prevents `adb backup`/OEM-cloud-backup exfiltration of the sandbox (S-2).
- Permissions: `READ_MEDIA_IMAGES/VIDEO/AUDIO`, `VIBRATE` granted; `CAMERA`, `INTERNET`, `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `USE_BIOMETRIC`, `USE_FINGERPRINT` explicitly blocked ([app.json:29-42](../app.json)) — a tight, purpose-matched permission set for a local-only vault with no camera-capture feature.

---

## 10. Authentication, Authorization, and Security

This is the app's core value proposition, so it gets the deepest treatment.

**Confirmed-good, independently verified in source (not taken on faith from comments):**

- Password hashing: PBKDF2‑HMAC‑SHA256, 10,000 iterations, per-user random 16-byte salt from `expo-crypto`'s CSPRNG ([crypto.ts:67-97](../src/security/crypto.ts)). The iteration count is below OWASP's current 600k recommendation, but the code **itself documents the tradeoff and the benchmark numbers** it was chosen from (pure-JS PBKDF2 with no native acceleration; ~2.7s at 60k on the project's own test environment) and flags it for re-benchmarking on a real device before release — this is a Risk, correctly disclosed rather than hidden.
- File encryption: AES‑256‑CBC + HMAC‑SHA256 (Encrypt‑then‑MAC), fresh random IV per call, HMAC verified **before** decrypting (constant-time compare) so tampered/corrupted ciphertext fails loudly instead of decrypting to garbage ([crypto.ts:139-183](../src/security/crypto.ts)) — **correctly implemented, but see SEC‑0 below: this code path is not reachable from any current UI screen.**
- All randomness (salts, IVs, UUIDs, generated encryption keys) sources `expo-crypto`'s CSPRNG — no `Math.random()`/`Date.now()`-derived key material found anywhere in a security-relevant path (grep-verified across `src/`, excluding vendor bundles and non-secret timestamp fields).
- Constant-time comparison (`constantTimeEqual`) is used consistently at every secret-comparison site checked: master-PIN auth, access-key deletion.
- Brute-force lockout (5 attempts / 30s) is enforced **inside** `authStore.authenticate()` itself, not just at the UI layer, and persists across app restarts via AsyncStorage.
- Secret/non-secret storage split is real: `expo-secure-store` holds every raw secret; AsyncStorage's JSON blob is confirmed to redact `password`/`key` fields before serialization.
- `android:allowBackup="false"` blocks OS-level extraction of the SecureStore-backed and AsyncStorage-backed data via `adb backup`.
- Route-level auth guard (`(main)/_layout.tsx`) prevents deep-link/nav-state bypass of the lock screen.
- Fail-loudly design: `encryptSandboxFile`/`decryptSandboxFile` **require** a real key and throw without one — no silent reversible fallback exists in the current code (confirmed by reading the functions directly, not just the comment claiming this).

**Risks and gaps identified:**

- **SEC‑0 (Critical, Confirmed).** The AES‑256‑CBC+HMAC file-encryption feature is unreachable from any current UI screen, and the only UI-reachable protection mechanism ("access keys") does not encrypt file bytes at all. **Evidence:** (1) the sole real UI call site of `vaultStore.importFile` — [folder/\[id\].tsx:202,204](../src/app/(main)/folder/[id].tsx) — hardcodes `encrypt=false` with no `encryptionKeyId`; every other call site of `importFile` in the whole repo is inside `vaultStore.test.ts`. (2) `assignFileEncryptionKey`/`assignFolderEncryptionKey`/`createEncryptionKey`/`toggleFolderEncryption`/`removeFileEncryptionKey`/`removeFolderEncryptionKey` — the only functions that ever call `StorageService.encryptSandboxFile` — have **zero call sites** anywhere in `src/app/**` or `src/components/**` (grep-confirmed across the whole tree; they exist only in `vaultStore.ts`/`settingsStore.ts`'s own definitions and in `vaultStore.test.ts`). (3) The code says so directly: [settingsStore.ts:393-395](../src/store/settingsStore.ts) — "store export currently has no live UI caller (grep-confirmed)... kept consistent with its sibling." (4) `assignFileAccessKey`/`assignFolderAccessKey` — the only assignment functions actually wired to a screen ([vaultStore.ts:772,780](../src/store/vaultStore.ts)) — only set `hasAccessKey`/`accessKeyId` metadata flags; neither calls `encryptSandboxFile`. **Impact:** no file a real user imports through this app can currently become encrypted at rest. A file marked "protected" by an access key is stored as plain, fully readable bytes in the vault sandbox — the password requirement is enforced only inside the app's own UI, not cryptographically, so it offers no protection against anyone with direct filesystem access to the device (root, a filesystem-level extraction tool, or any bypass of the app's own screens). This also means Finding SEC‑1 below (unencrypted backup ZIPs) currently applies to essentially every exported file, not a subset. **Recommended fix:** either (a) build a real "encrypt this file" UI flow that creates/assigns an encryption key and actually invokes `encryptSandboxFile`, or (b) make access-key assignment itself perform real encryption under a key derived from the access-key password, or at minimum (c) relabel "access keys" in the product's own UI copy as an app-lock/PIN-gate feature rather than implying encryption, so users aren't misled about the protection they're actually getting. **Confidence: High** (four independent, mutually corroborating sources: two exhaustive call-site greps, the code's own comment, and direct reading of the only reachable assignment functions).
- **SEC‑1 (Major, Confirmed).** Backup ZIP files are not encrypted as an archive, and file payloads inside them carry only whatever protection they already had in the vault — an unencrypted vault file is exported as a fully readable plaintext file inside a password-less ZIP. Only the *access/encryption key secret values* (not file bytes) are protected, and only if the user opts into a backup passphrase. **Evidence:** [backupService.ts:254-300](../src/services/backupService.ts) (`buildAndWriteZip` writes each file's current bytes straight into the archive with no additional transform) and [backupService.ts:155-176](../src/services/backupService.ts) (`keyMaterial` — the only encrypted piece — covers `accessKeys`/`encryptionKeys` metadata, not file content). **Impact:** a user who exports a backup containing unencrypted personal files and then shares/loses/uploads that ZIP anywhere has fully exposed those files, with no vault-level protection carried over and no archive password to fall back on. **Recommended fix:** offer (or default to) encrypting the entire archive under the backup passphrase, or explicitly and visibly warn the user at export time that unencrypted vault files export as unencrypted files. **Confidence: High** (directly read the write path).
- **SEC‑2 (Medium, Confirmed).** PBKDF2 at 10,000 iterations is below current OWASP guidance (600,000 for PBKDF2‑HMAC‑SHA256) and is explicitly self-documented as a latency tradeoff pending real-device re-benchmarking that (per the project's own audit trail) has not yet happened. **Evidence:** [crypto.ts:51-67](../src/security/crypto.ts). **Impact:** an attacker with the SecureStore-extracted hash+salt (e.g., a rooted device, or a backup of SecureStore on a compromised OS) brute-forces a 6-digit PIN meaningfully faster than at OWASP-recommended iteration counts. **Recommended fix:** re-benchmark on real low/mid-end Android hardware and raise the count as far as UX tolerates, or move to a native/WebCrypto-accelerated KDF. **Confidence: High.**
- **SEC‑3 (Minor, Confirmed).** No biometric unlock option exists, and biometric permissions are actively blocked in `app.json`. This is very likely an intentional scope decision (a biometric fallback can be a *weaker* factor than a well-chosen PIN on some OEM implementations, and adds native complexity) rather than an oversight, but it is a UX/security-tradeoff decision worth the user confirming explicitly, since most competing vault apps offer it. **Confidence: Medium** (inferred intent, not stated anywhere in code).
- **SEC‑4 (Minor, Confirmed).** Session auto-lock is evaluated only on the `AppState` `background → active` transition ([\_layout.tsx:18-26](../src/app/(main)/_layout.tsx)), not by a live background timer. A force-quit-and-relaunch always requires the PIN again (fresh process, `isAuthenticated` initializes false), so this is not a bypass — but a user who leaves the app foregrounded-but-idle (rather than backgrounded) for longer than `autoLockDuration` is **not** auto-locked, since the check only fires on resume. **Confidence: Medium** (no idle/inactivity timer was found anywhere in the codebase; a foreground idle-timeout is a plausible intended feature that appears absent, not confirmed as intended-vs-missing without asking the author).
- **Recovery-hint plaintext storage** is intentional and disclosed to the user in the UI itself ("Optional. Stored locally in plain text, so keep it oblique" — [register.tsx:157](../src/app/(auth)/register.tsx)). Not a finding; flagged only for completeness since Phase 7 asks about sensitive-data storage explicitly.
- **No privilege-escalation surface exists to audit** — there is exactly one user/role model (the device owner), no multi-user support, no server-side authorization to bypass.

---

## 11. Inconsistencies, Bugs, and Risks

- **Finding:** `README.md`'s architecture description, feature list wording, and iteration count (5,000) do not match the current codebase (10,000 iterations; a materially different, larger component/file tree — e.g., `AnimatedCard.tsx`/`StyledButton.tsx` referenced in the README no longer exist and are confirmed deleted by an in-source comment in [access-keys.tsx:16-19](../src/app/(main)/settings/access-keys.tsx)).
  **Classification:** Confirmed. **Severity:** Minor. **Evidence:** `README.md:49-99` vs. [crypto.ts:67](../src/security/crypto.ts) and repository file listing (§4). **Verification basis:** Static analysis (direct diff of claimed vs. actual file tree and constant). **Impact:** misleads a new contributor about current architecture; no runtime effect. **Recommended fix:** regenerate the README's file-tree section and feature description from current source, or replace it with a short pointer into `plans/` and the code itself. **Confidence:** High.

- **Finding:** `tsc_out.txt` is a git-tracked, 0-byte stray file at the repo root with no apparent purpose (name suggests a captured `tsc` run output that was never populated or was emptied before commit).
  **Classification:** Confirmed. **Severity:** Minor. **Evidence:** `git ls-files tsc_out.txt` (tracked), file read as empty. **Verification basis:** Static analysis. **Impact:** repo-hygiene noise only. **Recommended fix:** `git rm tsc_out.txt`. **Confidence:** High.

- **Finding:** `rules/REQUIREMENTS.md`, `RESPONSIVE.md`, `SECURITY.md`, `SUMMARY.md`, `UI-DESIGN.md` are all git-tracked, 0-byte files.
  **Classification:** Confirmed. **Severity:** Minor. **Evidence:** `wc -l` on each returns 0. **Verification basis:** Static analysis. **Impact:** none functionally; likely intended as AI-assistant instruction scaffolding that was never filled in — could mislead a contributor expecting real content. **Recommended fix:** populate or remove. **Confidence:** High.

- **Finding:** 44 uses of `any`/`as any` outside tests and vendor bundles, concentrated in list-rendering/event-handler signatures across `dashboard.tsx`, `favorites.tsx`, `search.tsx`, `folder/[id].tsx` (e.g., `(folder: any) => {...}`, `(e: any) => {...}`).
  **Classification:** Confirmed. **Severity:** Minor. **Evidence:** `src/app/(main)/dashboard.tsx:204,261,446,454,482` and similar across the other three screens. **Verification basis:** Static analysis (grep + spot read). **Impact:** these are all internal handler params with an inferable concrete type (`FolderMetadata`, `FileMetadata`, native event types) already available from `src/types/index.ts` — `strict: true` doesn't catch this because the annotations are explicit, not inferred. Real type-safety loss is low (call sites are internal, not external API boundaries) but it's exactly the kind of gap that hides a real mismatch later. **Recommended fix:** replace with the concrete types already defined in `src/types/index.ts`. **Confidence:** High.

- **Finding:** 17 ESLint warnings (all `no-unused-vars`/`exhaustive-deps`), zero errors — see §13 for the full executed list.
  **Classification:** Confirmed. **Severity:** Minor. **Evidence:** `npx expo lint` output, this session. **Verification basis:** Executed. **Impact:** dead imports/unused locals (cosmetic) plus two `react-hooks/exhaustive-deps` warnings in `viewer/image.tsx:209` and `viewer/video.tsx:375,379` that are worth a closer look — a missing dependency on a `useEffect` touching shared-value refs (`scale`, `translateX`, `translateY`, `isFullscreen`, `scrubberAnim`) is a plausible source of stale-closure bugs in gesture/animation code, which is exactly the pair of viewers (`image.tsx`/`video.tsx`) confirmed to have **zero component test coverage** (§14). **Recommended fix:** review each flagged effect for an intentional vs. accidental missing dependency; add the missing deps or a documented justification for omitting them. **Confidence:** Medium (the warning is Confirmed; whether it manifests as a real user-facing bug is Likely, not proven, without exercising the gesture interactions it's tied to).

- **Finding:** `.kilo/kilo.jsonc` is git-tracked despite `.gitignore` listing `.kilo/` (added for exactly this class of file, per its own I-21 comment) — git does not retroactively un-track a file that was already tracked before the ignore rule was added.
  **Classification:** Confirmed. **Severity:** Minor. **Evidence:** `git ls-files | grep .kilo` returns `kilo.jsonc`; `.gitignore` lists `.kilo/`. **Verification basis:** Static analysis. **Impact:** none functional; minor repo-hygiene inconsistency with the ignore rule's own stated intent. **Recommended fix:** `git rm --cached .kilo/kilo.jsonc` if it's not meant to be shared. **Confidence:** High.

- **No route/parameter, model/schema, or naming mismatches were found** between the frontend and its own local "backend" (the zustand stores) — because both are TypeScript in the same codebase sharing the same `src/types/index.ts` definitions, the class of defect this section's checklist is largely aimed at (client assumes a field the server doesn't send, enum drift between client/server, date-format mismatches) has no server to drift *from*. This is a structural reason the app scores well here, not a claim that no bugs exist.

---

## 12. Code Quality and Technical Debt

- **Positive, unusual for a codebase this size:** near-universal, specific inline documentation of *why* code is shaped the way it is, frequently citing a specific prior finding ID and explaining the tradeoff considered and rejected. This materially raises maintainability — a future contributor (human or AI) has far less risk of "fixing" something back into a previously-found bug, because the comment says so at the exact line.
- **Debt:** two document-viewer screens (`image.tsx`, `video.tsx`) carry real gesture/animation complexity (pinch-zoom, pan, fullscreen, scrubbing) with **zero automated test coverage**, and both have live `exhaustive-deps` ESLint warnings in exactly that code. This is the single most concrete "next thing to break" signal in the repository.
- **Debt:** 44 `any`-typed handler params (Minor, §11) in the four heaviest list-rendering screens (`dashboard.tsx`, `favorites.tsx`, `search.tsx`, `folder/[id].tsx`, each 950–1,200 lines) — these screens are also the largest files in the repo and the least covered by tests (none of the four has a `__tests__` directory).
- **Debt:** `vaultStore.ts` (1,531 lines) and `settingsStore.ts`/`storage.ts` show accumulated layered-fix complexity (multiple `I-*` follow-up comments literally describing "a completion gap in an already-'done' item, fixed in place rather than filed separately") — functionally sound based on this review, but the pattern of repeated in-place patching over a single audit cycle is a maintainability signal worth watching; a future refactor pass (not urgent) could consolidate the storage-limit accounting logic (`committedFileBytes`/`projectedFileBytes`/`assertWithinStorageLimit`/`assertBatchWithinStorageLimit`), which is correct per its own tests but spread across several tightly-coupled helper functions with subtle "must never diverge" invariants documented only in comments.
- **No dead/commented-out code blocks, no hardcoded credentials/secrets, no debug endpoints, and no circular-dependency smell** were found in the files reviewed. One stray unconditional `console.log` debug statement was found and *already removed* per the project's own audit trail (`Sheet.tsx`) — I did not independently re-verify its absence beyond noting the project's own account of fixing it, since I did not diff that specific commit.

---

## 13. Testing, Build, and QA Assessment

**Test inventory (all under `src/**/__tests__/`):**

| Suite | File | Scope |
|---|---|---|
| `crypto.test.ts` | `src/security/__tests__/` | PBKDF2, AES-CBC+HMAC round-trip, tamper detection |
| `authStore.test.ts` | `src/store/__tests__/` | Setup, auth, lockout integration |
| `lockoutStore.test.ts` | `src/store/__tests__/` | Attempt counting, persistence, expiry |
| `settingsStore.test.ts` | `src/store/__tests__/` | Key CRUD, redaction, transient-memory lock |
| `vaultStore.test.ts` | `src/store/__tests__/` | Files/folders CRUD, storage limits, clipboard, disk-full failure paths |
| `backupService.test.ts` | `src/services/__tests__/` | Manifest, ZIP build/validate, restore, passphrase gating |
| `storage.test.ts` | `src/services/__tests__/` | Sandbox FS, encrypt/decrypt, orphan sweep |
| `calculatorExpression.test.ts` | `src/utils/__tests__/` | Expression evaluator |
| `disguiseIcon.test.ts` | `src/utils/__tests__/` | Native-module bridge behavior/fallback |
| `onboarding.test.tsx` | `src/app/(auth)/__tests__/` | Redirect logic, timeout, loading state |
| `document.test.tsx` | `src/app/(main)/viewer/__tests__/` | Routing, decrypt pipeline, error states |
| `storage.test.tsx` (settings) | `src/app/(main)/settings/__tests__/` | Storage-limit UI, accounting display |
| `Sheet.test.tsx` | `src/components/primitives/__tests__/` | Open/close/animation lifecycle |

**Explicitly absent:** no tests for `image.tsx`/`video.tsx` viewers (documented gap, §7/§12), no E2E/integration tests (no Detox/Maestro/Appium config found), no native (Kotlin) unit tests for the two config-plugin-generated modules.

**Executed this session (all read-only, no repo modification):**

| Command | Result | What it proves | What it doesn't prove |
|---|---|---|---|
| `npx tsc --noEmit` | **0 errors** | Whole-project type soundness under `strict: true` | Runtime correctness, logic errors typed code can still contain |
| `npx expo lint` | **0 errors, 17 warnings** | No lint-blocking issues; warnings are dead-code/hook-dep hygiene | Same as above |
| `npx jest --ci` | **118/118 tests passed, 13 suites** | Every unit/component test in the repo currently passes, including crypto correctness, store logic, and one full component (Sheet) lifecycle | Anything not covered by a test (image/video viewers, all four large list screens, native modules) |
| `npx expo-doctor` | **21/21 checks passed** | Expo config/dependency-tree sanity | App actually builds/launches |
| `git status --short` (before/after) | **Clean both times** | This audit made no changes to the repository | — |

**Not executed this session, and why:** `npm run vendor:check` (writes to tracked vendor files before diffing — skipped per the "don't modify files" instruction); `npm audit`/build/emulator runs (network calls / out of scope for non-destructive validation / no device available in this environment).

**Prior, project-documented device evidence (not first-hand to this audit — cited for completeness only):** `plans/what-are-the-next-jaunty-deer.md`'s "Phase E" section describes a real on-device pass on a VirtualBox-hosted Android VM that reached cold boot → splash → first screen, and in doing so found and fixed two genuine runtime bugs invisible to static analysis (a mipmap resource-name character restriction that broke the native build outright, and the `FLAG_SECURE` UI-thread crash referenced in §10). That same document explicitly states login, file import, all three viewer types, trash/restore, and backup/restore round-trip were **never reached** before the test VM was lost, and remain unverified even by the project's own account.

---

## 14. Missing or Incomplete Functionality

| Gap | Evidence | Severity |
|---|---|---|
| AES‑256‑CBC+HMAC file encryption has no UI entry point anywhere in the app; the only reachable protection ("access keys") never encrypts file bytes | §10, Finding SEC‑0 | Critical |
| No component tests for `image.tsx`/`video.tsx` viewers | Documented directly in `plans/what-are-the-next-jaunty-deer.md`'s Phase D notes ("Not done") | Medium |
| No E2E/on-device verification of core flows (login, import, all viewers, backup/restore) in this repo's history or this audit | `plans/what-are-the-next-jaunty-deer.md` Phase E | Major (for release readiness specifically) |
| No `production` EAS build profile | `eas.json` only has `preview` | Minor (confirmed deliberate/deferred, not an oversight) |
| No biometric unlock | Absent everywhere; permissions actively blocked | Minor (plausibly deliberate — see SEC‑3) |
| No analytics/crash reporting | Absent from `package.json`/source | Not a gap for this app's stated privacy-first purpose — flagged only because Phase 4's checklist asks about it explicitly |
| No archive-level encryption for backup ZIPs | §9.1/§10, Finding SEC‑1 | Major |
| Foreground idle-timeout auto-lock | Absent; only background-resume timing exists | Minor (see SEC‑4) |
| `npm run vendor:check` not exercised this session | Skipped per no-modification instruction | Not verifiable this session |

---

## 15. Functional Status Matrix

| Area | Status |
|---|---|
| Onboarding / PIN setup | Statically complete |
| PIN unlock + calculator disguise | Statically complete |
| Brute-force lockout | Statically complete, unit-tested |
| Folder CRUD | Statically complete, unit-tested |
| File import (incl. APK icon, video remux) | Statically complete, unit-tested (native remux/icon-extract logic not device-verified); **always imports unencrypted — see SEC‑0** |
| Encryption keys (assign/remove/cascade) | **Backend-only** — implemented correctly, but zero UI callers found anywhere (see SEC‑0) |
| Access keys (separate password gate) | Statically complete, unit-tested — **app-level UI gate only; does not encrypt file bytes** (see SEC‑0) |
| Favorites | Statically complete |
| Search | Statically complete (untested) |
| Trash/restore/shred | Statically complete |
| Clipboard copy/cut/paste | Statically complete, unit-tested |
| Document/PDF/DOCX/XLSX viewer | Statically complete, unit-tested |
| Image viewer | Statically complete, **untested** |
| Video viewer | Statically complete, **untested** |
| Storage-limit setting | Statically complete, unit-tested |
| Theming/customization | Statically complete |
| App-icon disguise (Android) | Statically complete; not device-verified this session |
| Screenshot protection (`FLAG_SECURE`, Android) | Statically complete; fix present in source, not device-re-verified this session |
| ZIP backup export/restore | Statically complete, unit-tested; **archive itself unencrypted by default, and per SEC‑0 this currently applies to virtually every exported file since none can be encrypted at rest today** |
| Biometric auth | Not present |
| Analytics/crash reporting | Not present |
| Push notifications | Not present |
| Backend/cloud sync | Not present |
| CI pipeline | Executed-working (lint/typecheck/test/doctor all green, this session and per `ci.yml`) |
| Production build/release pipeline | Not verifiable (no `production` EAS profile, no build run) |

---

## 16. Development, Testing, and Production Readiness

| Track | Status | Basis |
|---|---|---|
| **Development readiness** | **Ready for continued development** | Clean type-check, clean lint, clean full test suite, clean `expo-doctor`, and an unusually thorough self-documenting audit trail already in place to build on. |
| **Testing readiness** | **Conditionally ready** | Unit/store/crypto/one-component coverage is solid and green. Blocked from "ready for systematic testing" (full) by: zero coverage on the two most gesture-complex screens (`image.tsx`/`video.tsx`, with live lint warnings in exactly that code), zero E2E coverage, and no on-device verification of the core unlock→import→view→backup loop performed in this repository's history or this audit. |
| **Production readiness** | **Not ready** | No `production` EAS profile exists (confirmed intentional/deferred by the project itself). The core user journey has never been confirmed to work end-to-end on a real device by this repo's own account. Most importantly: the app's core file-encryption feature is currently unreachable from any UI screen (**SEC‑0**), so no file a real user imports is ever actually encrypted at rest — combined with the unencrypted-backup-archive design (SEC‑1) and sub-OWASP KDF iteration count (SEC‑2), these are real, currently-live gaps that must be resolved before any real personal data is trusted to a released build. |

---

## 17. Prioritized Improvement Roadmap

| Priority | Improvement | Reason | Affected Files/Modules | Expected Benefit | Verification Method |
|---|---|---|---|---|---|
| Critical | Wire a real file-encryption path into the UI (or make access-key assignment perform real encryption), or explicitly relabel "access keys" as an app-lock feature, not encryption | **SEC‑0** — the app's core encryption feature is currently unreachable from any screen, and the only UI-reachable "access keys" don't encrypt file bytes | `src/app/(main)/folder/[id].tsx`, `src/store/vaultStore.ts`, `src/store/settingsStore.ts`, `src/app/(main)/settings/access-keys.tsx` | Closes the single largest gap between the app's stated purpose and what it actually does for a user today | New test + manual check confirming an imported/"protected" file is genuinely ciphertext on disk, not just app-gated |
| Critical | Perform a full on-device manual/E2E pass covering login, import, all 3 viewers, encryption assign/remove, trash/restore, and backup/restore round-trip | No core flow has been end-to-end verified on real hardware, by this audit or (per the project's own record) ever fully | Whole app | Closes the single largest gap between "looks correct statically" and "known to work" | Manual device walkthrough + screen recording, or Detox/Maestro E2E suite |
| Critical | Decide and implement backup-archive protection: either encrypt the whole ZIP under the backup passphrase, or add an explicit, unmissable warning at export time that unencrypted vault files export unencrypted | SEC‑1 — real data-exposure risk on a portable artifact | `backupService.ts` | Removes (or honestly discloses) the largest real security gap found | New test asserting archive-level protection or the warning is surfaced; manual export/inspect |
| Major | Re-benchmark PBKDF2 iteration count on real target hardware and raise toward OWASP guidance (or move to a faster/native KDF) | SEC‑2 — currently a self-disclosed, unresolved tradeoff | `src/security/crypto.ts` | Meaningfully raises brute-force cost of an extracted PIN hash | On-device timing benchmark + updated `PBKDF2_ITERATIONS` + existing crypto tests re-run |
| Major | Add component tests for `viewer/image.tsx` and `viewer/video.tsx`, and resolve their `exhaustive-deps` warnings | Only two viewer screens with zero coverage; also the only ones with live hook-dependency warnings | `src/app/(main)/viewer/image.tsx`, `video.tsx` | Closes the most concrete "next thing to break" in the repo | `npx jest --ci` new suites green; `npx expo lint` warning count drops |
| Major | Add an EAS `production` build profile and run at least one real build | No path to a distributable release currently exists in the repo | `eas.json` | Establishes the missing last step to any real release | `eas build --profile production` succeeds |
| Medium | Consider a foreground idle-timeout auto-lock (not just background-resume-based) | SEC‑4 — a plausible gap in the auto-lock model | `src/app/(main)/_layout.tsx` | Reduces the shoulder-surfing/unattended-unlocked-device window | New test simulating idle foreground time |
| Medium | Add basic E2E/integration coverage (Detox or Maestro) for the four largest, currently-untested screens (`dashboard`, `favorites`, `search`, `folder/[id]`) | Largest files in the repo, zero test coverage, heaviest use of `any` | those 4 files | Coverage for the app's actual daily-use surface | New E2E suite passing in CI |
| Medium | Replace the 44 `any`/`as any` handler-parameter types with the concrete types already defined in `src/types/index.ts` | Real but currently low-impact type-safety gap | `dashboard.tsx`, `favorites.tsx`, `search.tsx`, `folder/[id].tsx` | Catches future field/shape mismatches at compile time instead of runtime | `tsc --noEmit` stays clean with stricter types; no behavior change expected |
| Minor | Regenerate/replace `README.md` to match current architecture, or trim it to a pointer into `plans/`/code | Stale docs mislead new contributors | `README.md` | Accurate onboarding doc | Manual review against current `src/` tree |
| Minor | Remove or populate the 5 empty `rules/*.md` files and the tracked empty `tsc_out.txt` | Repo hygiene | `rules/*.md`, `tsc_out.txt` | Cleaner repo, no orphaned artifacts | `git status` / file listing after cleanup |
| Minor | Decide whether `.kilo/kilo.jsonc` should remain tracked given `.kilo/` is otherwise gitignored | Inconsistent with the ignore rule's own stated intent | `.kilo/kilo.jsonc`, `.gitignore` | Consistent repo hygiene | `git ls-files` after `git rm --cached` if untracking |
| Minor | Explicitly decide (and document) whether biometric unlock is out-of-scope by design | Currently unstated; a common user expectation for this app category | `app.json`, product docs | Removes ambiguity for future contributors/users | N/A — a product decision, not a code change |

---

## 18. Top 10 Next Actions

1. Wire a real file-encryption path into the UI, or explicitly relabel "access keys" as an app-lock feature rather than encryption — **SEC‑0**.
2. Run a full manual (or scripted) on-device walkthrough of login → import → encrypt/access-key → view (all 3 viewer types) → trash/restore → backup → restore-on-a-second-install.
3. Decide the backup-archive protection model (encrypt whole ZIP vs. explicit warning) and implement it — **SEC‑1**.
4. Re-benchmark and raise the PBKDF2 iteration count on real hardware — **SEC‑2**.
5. Add `viewer/image.tsx` and `viewer/video.tsx` component tests; resolve their `exhaustive-deps` warnings.
6. Stand up an EAS `production` build profile and produce one real build artifact.
7. Add E2E coverage (Detox/Maestro) for the four largest, currently-untested screens.
8. Replace the 44 `any`-typed handler params with concrete types from `src/types/index.ts`.
9. Explicitly decide on foreground idle-timeout auto-lock and biometric-unlock scope.
10. Repo hygiene pass: refresh `README.md` to match current architecture; remove/populate the 5 empty `rules/*.md` files and the stray `tsc_out.txt`; run `npm run vendor:check` and `npm audit` in a controlled session (both were skipped in this audit — one for file-safety, one for network-scope reasons).

---

## 19. Final Scorecard

| Category | Weight | Score | Evidence | Verification limitations | Main factor holding score down |
|---|---|---|---|---|---|
| Functionality | 30% | 68/100 | Most declared features have statically complete, coherent, reachable implementations; 118/118 tests pass | No on-device execution this session; 2 of the most interaction-heavy screens have zero tests; **one core feature (file encryption) is backend-only with zero UI reachability (SEC‑0)**, found on this revision pass | The app's headline "encrypt your files" capability doesn't actually run for any real user today; untested gesture-heavy viewers |
| Architecture | 15% | 88/100 | Clean, conventional Expo Router + zustand layering; genuine route-level auth guard; no backend to introduce cross-tier drift | N/A — architecture is fully visible in static source | Some accumulated complexity in `vaultStore.ts`'s storage-accounting helpers |
| Backend/data integrity | 15% | 85/100 | No backend exists, so this scores against on-device data integrity: secret/non-secret storage split is correct and verified, persistence failures are surfaced (not silently swallowed) per the `I-11` remediation pattern confirmed in multiple stores | Not verifiable: real device storage-failure behavior, concurrent-write races beyond what unit tests simulate | Backup-archive protection gap (SEC‑1) is a data-integrity/exposure issue, not just a "security" label |
| Security | 15% | 55/100 | Real AES‑256‑CBC+HMAC, PBKDF2, constant-time comparisons, brute-force lockout, correct secret storage split, `allowBackup=false`, fail-loud crypto — all correctly implemented and independently verified in source | Native `FLAG_SECURE` fix not re-verified on-device this session; no `npm audit` run | **The correctly-implemented crypto is not reachable from any UI screen (SEC‑0)** — no file a user imports is ever actually encrypted at rest today; compounded by the unencrypted-by-default backup archive (SEC‑1) and sub-OWASP KDF iterations (SEC‑2) |
| Code quality | 10% | 80/100 | Exceptionally well-commented for a project this size; 0 lint errors; consistent patterns across stores | — | 44 `any`-typed params; 4 very large (950–1,200-line), untested screen files |
| Reliability/error handling | 5% | 85/100 | Systematic try/catch + user-facing error states across stores and viewers; documented, deliberate fail-loud design for crypto failures | Not exercised under real device resource pressure (low storage, low battery, backgrounding mid-write) | Foreground idle-timeout gap (SEC‑4) |
| Testing | 5% | 65/100 | 118 passing tests across 13 suites, including crypto and store logic; CI enforces this on every push | Zero E2E; zero coverage on 2 of the app's screens; zero on-device verification | Coverage gaps concentrated exactly where the code is most complex (gestures/animation) |
| Maintainability/scalability | 5% | 82/100 | Single-tenant, local-only app has no scale dimension to worry about; documentation discipline is strong | — | Large, monolithic screen files without decomposition |

**Overall Score: 74/100** *(recomputed on this revision pass: 30%·68 + 15%·88 + 15%·85 + 15%·55 + 10%·80 + 5%·85 + 5%·65 + 5%·82 = 74.2, down from the original 79/100 — Functionality and Security both dropped to reflect Finding SEC‑0)*

- **Development readiness:** Ready for continued development
- **Testing readiness:** Conditionally ready
- **Production readiness:** Not ready

**Three highest-risk findings:**
1. **SEC‑0** — The app's core AES‑256‑CBC+HMAC file-encryption feature is unreachable from any UI screen; the only UI-reachable protection ("access keys") is a password gate that never encrypts file bytes, so no file a real user imports is ever actually encrypted at rest today.
2. **SEC‑1** — Backup ZIPs export file bytes at exactly their in-vault protection level (which, per SEC‑0, is currently plaintext for essentially every file), with no archive-level encryption by default; only key *secrets* are optionally passphrase-protected.
3. **No end-to-end, on-device verification** of the core user journey exists — neither in this audit nor, by the project's own record, ever fully completed.

**Top ten next actions:** see §18 above.
