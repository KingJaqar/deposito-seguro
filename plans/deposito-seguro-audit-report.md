# Deposito Seguro — Full Repository Audit Report

**Repository:** `C:\Users\User\deposito-seguro` · **Branch:** `main` (4 commits ahead of `origin/main`, clean working tree)
**Audit date:** 2026-08-26 · **Audited by:** Claude Code (static, read-only analysis)
**Latest commit at audit time:** `9e0802a` — "refactor: implement lazy hydration with background store hydration"
**Updated 2026-08-26 (1):** Added [§20 Execution Plan](#20-execution-plan--phased-remediation-roadmap) — a phased, dependency-ordered roadmap for resolving every finding in §10/§11/§14/§17.
**Updated 2026-08-26 (2):** Added **Finding L-1** (§11) — an app-breaking infinite re-render loop on first launch, identified after the user reported the app getting stuck on the loading screen in both Expo Go and an EAS-built APK.
**Updated 2026-08-26 (3):** Added **Finding N-1** (§11) — a risk that the custom native Android module (app-icon disguise + `FLAG_SECURE`) may not survive a clean Expo prebuild/CNG regeneration; and added the Expo **SDK 56 → SDK 57** upgrade as a roadmap/execution-plan item, researched against the official SDK 57 changelog (external source, cited inline). This remains a planning/analysis document only: no code has been changed and no commands have been executed.

---

## 1. Executive Summary

Deposito Seguro is a **local-only Expo/React Native mobile app** (SDK 56, React Native 0.85.3) that lets a user hide photos, videos, and documents behind a PIN, inside a UI disguised as a calculator (`app.json` app name is literally `"Calculator"`). It offers optional per-item "access key" (password) locks, optional per-item "encryption," and a local folder-to-folder backup/restore feature. There is **no backend, no cloud service, and no network I/O anywhere in the application code** — confirmed by repository-wide search.

The app is **functionally extensive and mostly wired end-to-end** for its core file-vault workflows (import, organize, favorite, search, trash/restore, share/export, theme, disguise). However, static analysis surfaced serious, code-confirmed gaps between what the app claims (in its UI copy, docstrings, and several self-authored "audit"/"test" markdown files) and what it actually does:

- **[Added after user report] The app can get permanently stuck on the loading screen on first launch, in both Expo Go and an EAS-built APK.** Root cause identified via static analysis: an infinite re-render loop in the onboarding gate — see **Finding L-1** in §11. This is the single most urgent item in this report, since it can block a fresh install/first-run entirely (and therefore blocks manual testing of everything else described below) until fixed.
- The file "encryption" engine is a **plain repeating-key XOR cipher** internally documented as "Simulated ... AES-256" (`src/security/crypto.ts:103-114`).
- The **master vault PIN has no brute-force lockout at all** (`src/store/authStore.ts:90-108`, called unthrottled from `src/app/(auth)/login.tsx:104`).
- Access-key and encryption-key **secrets are duplicated in plaintext into unencrypted `AsyncStorage`**, in addition to the correct `SecureStore` copy (`src/store/settingsStore.ts:201-211,375-385`), while `android:allowBackup="true"` remains enabled.
- The backup feature's "`.zip`" output **is not a real ZIP archive** and never restores the encryption/access keys needed to decrypt protected content on a new device (`src/services/backupService.ts:277-332,615-714`).
- Several complete, wired UI features are **dead code with zero call sites** (`UnlockContext`, a second parallel `authKey` auth system, 6 unused components, 4 unused hooks).
- **No automated tests, no CI pipeline, and no executed build/type-check evidence exist in the repository.** Several root markdown files self-report "PASSED" audits/tests for features that have no runnable test backing them, and at least one (`FILE_PASSWORD_VERIFICATION_TEST.md`) references source files that no longer exist under their claimed names.

The project is best characterized as a **feature-rich, actively-developed hobby/personal-use vault app with real (if weak) security controls, not yet ready for handling data the user cannot afford to lose or expose.** It is suitable for continued development and for manual/exploratory QA; it is **not ready** for production distribution or for protecting genuinely sensitive data without the Critical items in §17 being addressed.

---

## 2. Audit Scope, Access, and Verification Limits

**Scope:** Full working tree at `C:\Users\User\deposito-seguro`, excluding `node_modules/`, `.kilo/node_modules/`, and the 11 nested git worktrees under `.kilo/worktrees/*` (confirmed to be Kilo Code AI-tool session sandboxes, not part of the shipped app, and not git-tracked from the repo root).

**Method:** Read-only static analysis only — full or near-full reads of every store, context, service, security module, the Android native module/activity, all screens, all components, all hooks, all config files, and root documentation; targeted `grep` sweeps for secrets, network calls, TODO markers, and dead code across `src/`.

**Explicitly NOT performed, per the user's decision:**
- No `tsc`/`eslint`/`expo-doctor` execution, even though `node_modules/` is installed and these binaries are present (`node_modules/.bin/tsc`, `node_modules/.bin/eslint` confirmed present). **Type-check and lint cleanliness are therefore Not verifiable**, not assumed clean.
- No app build, no install on a device/emulator, no runtime execution of any kind.
- No access to Play Store/App Store listings, EAS build logs, or any external service.

**Hard verification limits that follow from this:**
- Whether the app actually launches, hydrates, and completes any user flow (login, import, export, backup) is **Not verifiable** — every "works" statement below is qualified as static/plausible unless explicitly marked otherwise.
- Whether `android:usesCleartextTraffic="true"` (referenced in earlier environment context) is actually emitted at build time could not be confirmed from the static `AndroidManifest.xml` alone — Expo config plugins can inject it at prebuild time from `app.json`; this repository's `app.json` does not visibly set it, so this is **Not verifiable**.
- Native Android build correctness (`android/app/build.gradle`, Gradle sync) was read but not compiled.
- No PII, secrets, or credentials were found anywhere in the repository during this audit; none are disclosed in this report.

---

## 3. Project Purpose and Actual Behavior

**Target user:** An individual wanting to hide personal photos/videos/files on their own Android device from casual snoopers (partner, family, a thief with brief physical access) — a "vault"/"gallery lock" app category, reinforced by the calculator-disguise UI and "stealth" language in `README.md`.

**Core problem solved (as implemented):** Local, on-device concealment and light-weight protection of files, not cryptographically strong protection against a sophisticated attacker with real forensic access (see §10).

**Core user workflows confirmed in code:**
1. First-run PIN setup (`register.tsx` → `authStore.initializeVault`) → land on `dashboard.tsx`.
2. Return visits: calculator-disguise or PIN-pad unlock (`login.tsx`) → `dashboard.tsx`.
3. Import files into folders (`folder/[id].tsx`, `DocumentPicker` → `StorageService.copyToSandbox`), organize (create/rename/move/favorite/duplicate), optionally assign a per-item access key and/or encryption key.
4. Browse/search/filter across Dashboard, Favorites, Search, and per-folder views; view files (`viewer/image|video|document.tsx`) with decrypt-on-open.
5. Soft-delete to Trash, restore or permanently shred.
6. Local backup export/import via a device folder picker (app-sandbox only) and Settings toggles (theme, disguise, screenshot protection, access-key/auth-key management).

**Gap between documentation claims and actual code (Likely/Confirmed, see full detail in §11):** `README.md` and several root markdown files use language like "military-grade," "zero-knowledge," "AES-256," and "PASSED" test/audit results that are **not borne out by the actual crypto implementation or by any executed test suite** — this is a material documentation-vs-code inconsistency, not merely marketing polish.

**Architecture (as actually implemented):**

```text
User
  ↓
Screens (src/app/(auth)/*, src/app/(main)/*) — expo-router file-based routing
  ↓
Contexts (Theme, Rename, MoveVault; Hydration; Unlock [dead]) + Zustand stores
  (authStore, lockoutStore, settingsStore, vaultStore)
  ↓
Services (StorageService — file I/O + XOR "encryption"; BackupService — local zip-like export/import)
  ↓
Device-local persistence only:
  - expo-secure-store (PIN hash+salt, access-key/encryption-key "authoritative" copies)
  - AsyncStorage (vault index: folders/files/clipboard; settings; a PLAINTEXT duplicate of secrets)
  - expo-file-system app sandbox (actual file bytes, XOR-"encrypted" or plain)
  ↓
No network / no backend / no external database — confirmed absent
```

---

## 4. Repository Structure and Active Components

| Path | Role | Status |
|---|---|---|
| `App.tsx` | Expo Router bootstrap (`ExpoRoot` over `src/app`) | Active |
| `src/app/(auth)/*` | Onboarding, register, lock, login (incl. calculator disguise) | Active |
| `src/app/(main)/*` | Dashboard, favorites, search, trash, folder/[id], viewer/*, settings/* | Active |
| `src/components/*` (23 files) | UI building blocks | **17 active, 6 fully dead** (`ResponsiveText`, `AnimatedPressable`, `AnimatedScreen`, `SafeAreaScreenWrapper`, `GridListToggle`, `AnimatedModal` — zero external references) |
| `src/contexts/*` (5 files) | Theme, Rename, MoveVault, Hydration, Unlock | **4 active, 1 fully dead** (`UnlockContext.tsx` — zero consumers) |
| `src/hooks/*` (5 files) | Responsive/orientation/breakpoint/query/transition helpers | **1 active** (`useFileSystemQuery`), **4 dead** (`useResponsive`, `useBreakpoint`, `useOrientation`, `useScreenFadeTransition` — a fully unreferenced chain) |
| `src/store/*` (4 files) | authStore, lockoutStore, settingsStore, vaultStore (Zustand) | Active, but `settingsStore.ts` contains a fully dead `authKey` sub-system (lines 16-25, 38-42, 298-345) |
| `src/services/*` | `storage.ts` (file I/O + crypto glue), `backup.ts` (re-export), `backupService.ts` (747-line backup/restore engine) | Active; `backupService.createBackup()`/`pickBackupFolder()` (native system folder picker path) is implemented but **never called** — the UI only uses the sandbox-limited `createBackupInFolder` path |
| `src/security/crypto.ts` | Hashing, salt/UUID generation, XOR "encryption" | Active — weak, see §10 |
| `src/utils/*` | Validation, secure-store key sanitizing, disguise-icon bridge, file-type helpers | Active |
| `src/types/index.ts` | Shared TS interfaces | Active, loosely enforced (see §12) |
| `android/` | Native Android project (Kotlin `MainActivity`, `MainApplication`, `DisguiseIconModule`, `DisguiseIconPackage`) | Active; real native module confirmed (icon-swap + `FLAG_SECURE`), plus one **dead** native code path (`MainActivity.shouldApplyFlagSecure`, never set to `true` from anywhere) |
| `scripts/reset-project.js` | Stock `create-expo-app` template script | **Dead/unreferenced** — no `package.json` script or doc points to it; safe-to-delete per its own header comment |
| `rules/*.md` (7 files) | AI-agent process instructions (analysis/verification rules) | 5 of 7 are **empty (0 bytes)**; only `ANALYZE.md` and `VERIFYCHANGES.md` have content |
| `.kilo/`, `.qodo/` | Third-party AI coding-tool state (Kilo Code worktrees, Qodo scaffolding) | Tooling metadata, not app code; not git-tracked; no secrets found; `.kilo/` is not excluded by the root `.gitignore` (latent risk of accidental commit, not currently a problem) |
| `dist/` | Prior `expo export` web build output | Generated artifact, gitignored, not tracked |
| `.expo/` | Local Expo CLI cache | Generated, gitignored, not tracked |
| `app.json.bak` | Stale pre-splash-screen, pre-`expo-secure-store`-plugin snapshot of `app.json` | Legacy/unreferenced backup file left in working tree |
| `tsc_out.txt` | 0-byte file | Ambiguous — could mean a prior clean `tsc` run, or an unrun/truncated artifact; **not treated as proof of a clean build** |
| Root `*.md` docs (7 files) | README + 6 self-authored "audit"/"design"/"critique" reports | Documentation only — see §11 for confirmed inconsistencies against code |
| `design images as reference output/` | 8 PNG UI mockups | Design reference assets, not code |
| `LICENSE` | Unedited MIT license from the Expo template (`650 Industries, Inc.`) | Boilerplate, not customized to this project |

---

## 5. Technology Stack and Dependencies

| Layer | Technology | Classification |
|---|---|---|
| Framework | Expo ~56.0.16 (managed/CNG), React Native 0.85.3, React 19.2.3 | Actively used |
| Routing | expo-router ~56.2.15 (file-based) | Actively used |
| State | zustand ^4.5.2 (no persistence middleware; manual AsyncStorage/SecureStore glue) | Actively used |
| Animation | react-native-reanimated 4.3.1 + worklets, `react-native-gesture-handler` | Actively used |
| Styling | Hand-rolled `StyleSheet` + a custom `ThemeContext`/`useTheme()` responsive system | Actively used; duplicated logic (see §12) |
| Storage | `@react-native-async-storage/async-storage` 2.2.0 (plaintext JSON), `expo-secure-store` ~56.0.4 (OS keystore) | Actively used, inconsistently (see §10) |
| File system | `expo-file-system` ~56.0.8 (`/legacy` API used throughout) | Actively used |
| Crypto | `expo-crypto` ~56.0.4 (SHA-256 digest + `getRandomBytes` — only *partially* used correctly, see §10) | Actively used, misapplied |
| Media/pickers | `expo-document-picker`, `expo-image-picker`, `expo-media-library`, `expo-video`, `expo-sharing` | Actively used |
| Icons | `lucide-react-native` ^1.21.0, `@expo/vector-icons` | Actively used |
| Biometrics | *(none — `expo-local-authentication` not a dependency)* | **Not present**, despite `USE_BIOMETRIC`/`USE_FINGERPRINT` Android permissions being declared |
| Backend/Cloud | *(none)* | **Not present** — confirmed via repo-wide grep (no Firebase/Supabase/Appwrite SDK, no `.env`, no `process.env`/API-key usage) |
| Build/tooling | TypeScript ^6.0.3 (`strict: true`), ESLint 9 (`eslint-config-expo/flat`), Babel (`babel-preset-expo` + Reanimated plugin), Metro (`@expo/metro-config`, CSS enabled) | Actively used, config is standard/unmodified beyond expected plugins |
| CI/CD | *(none)* | **Not present** — no `.github/workflows`, no other CI config found |
| Testing | *(none)* | **Not present** — no `*.test.*`/`*.spec.*` files, no `__tests__` dirs, no test runner dependency |
| Distribution | EAS (`eas.json`) | Only a `preview`/internal-APK profile exists; **no production build profile configured** |

**Version-risk note (Likely, Not fully verifiable without `expo-doctor`):** `react-native 0.85.3` / `react 19.2.3` / `expo ~56.0.16` are unusually high version numbers relative to the assistant's training-data baseline for "current" Expo/RN releases; the project's own `AGENTS.md` explicitly warns "Expo HAS CHANGED" and directs readers to versioned v56 docs, implying the maintainer is already aware these are recent/fast-moving versions. Genuine compatibility between this exact dependency matrix could only be confirmed by running `expo-doctor`/`npm ls`, which was not executed per the user's instruction — classified **Not verifiable**.

**SDK currency (confirmed via live web lookup, not repo evidence — see §20 for the upgrade task):** As of this update, **Expo SDK 57 is the latest release** and this project is one major SDK behind, on SDK 56. Per the [official SDK 57 changelog](https://expo.dev/changelog/sdk-57), SDK 57 bumps React Native 0.85→0.86 (React stays at 19.2, unchanged), bumps `react-native-reanimated` 4.3→4.5, `react-native-worklets` 0.8→0.10, and `react-native-gesture-handler` 2.31→2.32, and is explicitly documented as intending **zero breaking changes** from 0.85. A known Hermes memory regression affecting apps using worklets/Reanimated (this app uses both heavily) was fixed in `expo@57.0.9`, so the target version should be `^57.0.9` or later, not just `^57.0.0`. This makes the upgrade comparatively low-risk, but see **Finding N-1** below for a real risk specific to this repo's custom native Android code that the upgrade procedure would otherwise trip over.

---

## 6. Current Architecture and Data Flow

```text
App.tsx (ExpoRoot)
  → src/app/_layout.tsx (RootLayout): mounts Hydration/Theme/Rename/Move/Unlock providers,
     triggers settingsStore.hydrateSettings() + vaultStore.hydrateVault() in parallel,
     shows a global blocking error screen with no retry if either hydration fails
  → src/app/index.tsx: unconditional redirect → (auth)/onboarding
  → (auth)/onboarding.tsx: THE real gate — authStore.checkSetup() decides:
       not configured → register.tsx (PIN setup)
       configured, not authenticated → lock.tsx → login.tsx (PIN or calculator disguise)
       configured, authenticated → (main)/dashboard.tsx
  → (main)/_layout.tsx: NO render-time auth guard; only an AppState listener that
       re-locks on foreground if idle > autoLockDuration
  → (main)/* screens ↔ vaultStore / settingsStore (CRUD, search, favorites, trash, backup)
       ↔ StorageService (file bytes, XOR "encrypt"/"decrypt", sandbox path)
       ↔ BackupService (local export/import, sandbox-folder-only in current UI wiring)
  → Persistence: AsyncStorage (vault index + settings, PARTIALLY plaintext secrets),
       expo-secure-store (PIN hash+salt, "authoritative" secret copies),
       expo-file-system sandbox (file bytes)
```

No network layer, no server, no external database exists anywhere in this flow — every arrow above terminates on-device.

---

## 7. Complete Feature Inventory

| Feature | UI Location | Frontend Logic | Service/Backend | Data Storage | Validation | Loading/Error Handling | Auth/Authz | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| First-run PIN setup | `register.tsx` | `initializeVault()` | `authStore.ts:69-89` | SecureStore (or AsyncStorage on web) | `validatePin` (6-20 digits) | Alert-based errors only | N/A (setup) | Statically complete | `src/app/(auth)/register.tsx`, `src/store/authStore.ts:69-89` |
| PIN unlock (standard) | `login.tsx` | `authenticate()` | `authStore.ts:90-108` | SecureStore | `validatePin` | Alert on failure | **No lockout** | Partially implemented (works, but no rate-limit) | `src/app/(auth)/login.tsx:87-127` |
| Calculator-disguise unlock | `login.tsx` (isCalc branch) | Same `authenticate()`, triggered by entering PIN as a "number" then `=` | Same as above | Same | Same | Same | Same gap | Statically complete | `src/app/(auth)/login.tsx:340-352,421-495` |
| Auto-lock on background | `(main)/_layout.tsx` | `AppState` listener | `authStore.terminateSession`, `settingsStore.lockTransientMemory` | In-memory | N/A | Silent | Time-based, no render guard | Partially implemented | `src/app/(main)/_layout.tsx:10-53` |
| Import file | `folder/[id].tsx` | `DocumentPicker` → `importFile()` | `vaultStore.ts:174-207`, `StorageService.copyToSandbox` | AsyncStorage index + FS sandbox | File-type inferred | Alerts | Vault-level only | Statically complete (encryption flag can desync — see §11) | `src/app/(main)/folder/[id].tsx`, `src/store/vaultStore.ts:174-207` |
| Folder/file CRUD (create/rename/move/duplicate/favorite/delete) | Dashboard, Favorites, Search, `folder/[id]` | Store actions | `vaultStore.ts` (throughout) | AsyncStorage (fire-and-forget writes) | Basic | Alerts, empty states | Vault-level | Statically complete | `src/store/vaultStore.ts` |
| Search/filter/sort | Search, Trash | Debounced local filter | `useFileSystemQuery`, inline filters | In-memory over hydrated state | N/A | Empty/no-results states | Vault-level | Statically complete | `src/hooks/useFileSystemQuery.ts`, `src/app/(main)/search.tsx`, `src/app/(main)/trash.tsx` |
| Trash / restore / permanent delete | `trash.tsx` | Store actions | `vaultStore.ts:229-263` etc. | AsyncStorage | N/A | Empty state, grouped list | Vault-level | Statically complete (folder-level protection can be lost on restore — §11) | `src/app/(main)/trash.tsx`, `src/store/vaultStore.ts:229-263` |
| File "export"/share (viewer & folder screens) | `viewer/*`, `folder/[id].tsx` | `Sharing.shareAsync` after decrypt | `StorageService.decryptSandboxFile` | Temp decrypted file, cleaned on unmount | N/A | Loading/error states present | Vault-level | Statically complete | `src/app/(main)/viewer/*.tsx`, `src/app/(main)/folder/[id].tsx` |
| File "export" (Favorites/Search) | `favorites.tsx`, `search.tsx` | `Alert.alert('Export', ...)` placeholder only | none | none | none | none | none | **UI-only / Broken** (does nothing but show an alert) | grep for `'Export'` in both files |
| Per-item access key (password) | Dashboard/Favorites/Search/Folder + `settings/access-keys.tsx` | `AccessKeyPicker`, `AccessKeyRegistrationModal`, `AccessKeyUnlockModal` | `settingsStore.createAccessKey` etc. | AsyncStorage **(plaintext) + SecureStore** | Password policy in `accessKeyValidation.ts` | Lockout via `lockoutStore` (in-memory, resettable) | Per-item | Statically complete, weak | `src/store/settingsStore.ts:177-217`, `src/store/lockoutStore.ts` |
| Per-item encryption key | Same screens | `assignFileEncryptionKey`/`assignFolderEncryptionKey` | `vaultStore.ts:452-477` | Key duplicated in AsyncStorage plaintext + SecureStore | Key length only | N/A | Per-item | Partially implemented (folder-level "encrypt" is metadata-only, no file bytes touched) | `src/store/vaultStore.ts:452-477` |
| File "encryption" at rest | `StorageService.encryptSandboxFile`/`decryptSandboxFile` | XOR cipher | `src/security/crypto.ts:107-114` | Sandbox FS | none | Errors bubble to caller | N/A | **Mocked/hardcoded-quality** (real code path, but not real encryption) | `src/services/storage.ts:47-72`, `src/security/crypto.ts:103-114` |
| "Session unlock memory" (remember-unlocked) | *(intended, per `UnlockContext.tsx` doc comment)* | `UnlockContext` provider/hook | none consume it | none | none | none | none | **Not present / dead code** | `src/contexts/UnlockContext.tsx` (zero consumers) |
| Backup export | `settings/index.tsx` → `FolderPicker` (sandbox only) → `BackupConfirmDialog` | `handleExport`/`handleBackupConfirm` | `BackupService.createBackupInFolder` | Sandbox-directory renamed to `.zip` (not a real archive) | Manifest schema validated on restore only | Progress modal, success/error modal | Vault-level | Partially implemented / Broken as a "portable backup" | `src/app/(main)/settings/index.tsx:110-156`, `src/services/backupService.ts:277-332` |
| Backup import/restore | `settings/index.tsx` → `handleImport` | `BackupService.importBackup` | `backupService.ts:615-714` | Overwrites `@vault_folders`/`@vault_files` wholesale | Manifest checked, file contents not checksummed | Progress + result alert | Vault-level | Partially implemented (never restores keys, so encrypted items become undecryptable if keys are lost) | `src/services/backupService.ts:615-714` |
| Native folder-picker backup path | *(exists in code, no UI hookup)* | `BackupService.createBackup`/`pickBackupFolder` | `backupService.ts:98-133,386-492` | N/A | N/A | N/A | N/A | **Backend-only / Unused** (zero call sites from UI) | `src/services/backupService.ts:98-133` |
| Theme (light/dark/AMOLED) | `settings/customization.tsx`, `settings/index.tsx` | `settingsStore.updateSetting('themeMode', …)` | n/a | AsyncStorage | n/a | n/a | n/a | Statically complete | `src/store/settingsStore.ts`, `src/app/(main)/settings/index.tsx:216-238` |
| App-icon disguise (calculator icon color swap) | `settings/index.tsx` icon grid | `setDisguiseIcon()` → native module | `DisguiseIconModule.kt:19-58` (real, wired) | Activity-alias enable/disable | n/a | n/a | n/a | **Executed-working is NOT claimed** — Statically complete, native code confirmed real and correctly wired, but not runtime-verified | `android/app/.../DisguiseIconModule.kt`, `src/utils/disguiseIcon.ts:12-26` |
| Screenshot protection (`FLAG_SECURE`) | `settings/index.tsx` toggle | `setFlagSecure()` → native module | `DisguiseIconModule.kt:60-77` (real, wired) | n/a — default **off** | n/a | n/a | n/a | Statically complete, native code confirmed real; **defaults to disabled** | `src/store/settingsStore.ts:130`, `android/.../MainActivity.kt` (note: a *second*, dead `shouldApplyFlagSecure` mechanism exists in `MainActivity.kt:16-38` and is never triggered — see §11) |
| Storage usage display | `settings/storage.tsx` | `StorageService.getStorageQuotaInfo()` | `storage.ts:96-101` | n/a | n/a | Loading/error states present, but data is fake | n/a | **Mocked/hardcoded** | `src/services/storage.ts:96-101` |
| "Cloud Storage" capacity widget | `dashboard.tsx` | `DISPLAY_CAPACITY_GB = 100` constant | none | none | none | none | none | **Mocked/hardcoded** (and self-contradicts the app's offline-only claim) | `src/app/(main)/dashboard.tsx:62` |
| "Authentication Key" management screen | `settings/auth-key.tsx` | Reuses `authStore.authenticate`/`initializeVault` (the real PIN system) | `authStore.ts` | SecureStore | n/a | Alerts | Vault-level | Statically complete | `src/app/(main)/settings/auth-key.tsx` |
| Parallel `authKey` subsystem | *(no UI — dead)* | `settingsStore.setAuthKey/verifyAuthKey/changeAuthKey` | `settingsStore.ts:298-345` | AsyncStorage plaintext | none | none | none | **Unused/deprecated** (zero external call sites) | `src/store/settingsStore.ts:16-25,38-42,298-345` |
| Biometric unlock | *(none — no UI, no dependency)* | n/a | n/a | n/a | n/a | n/a | n/a | **Not present** (despite `USE_BIOMETRIC`/`USE_FINGERPRINT` Android permissions being declared) | `android/app/src/main/AndroidManifest.xml`, absence of `expo-local-authentication` in `package.json` |
| Analytics / crash reporting | *(none found)* | n/a | n/a | n/a | n/a | n/a | n/a | **Not present** | repo-wide grep, no matches |

---

## 8. Feature Trace Analysis

### 8.1 Vault unlock (PIN)
```
login.tsx → handleStandardAuth() → validatePin() → authStore.authenticate(pin)
  → SecureCrypto.hashPassword(pin, storedSalt) [1000× chained SHA-256]
  → compare to stored hash (plain === comparison, non-constant-time)
  → success: router.replace('/(main)/dashboard'); failure: Alert + clear input
```
**Broken/weak links:** no attempt counter, no delay, no lockout integration anywhere in this path (`lockoutStore` is imported by three *other* screens, never by `login.tsx`/`authStore.ts`). This is the single most exploitable path into the entire vault — see Finding S-1 in §10.

### 8.2 Per-item access-key unlock
```
folder/[id].tsx (or dashboard/favorites/search) → tap protected item
  → AccessKeyUnlockModal → password === targetPassword.password (plain string compare)
  → useLockoutStore.recordAttempt()/isLockedOut() [5 attempts / 30s, in-memory only]
  → success: item action proceeds (open/export/remove-key)
```
**Broken/weak link:** `lockoutStore` state is a plain JS object with no persistence; force-closing the app clears `attempts`/`lockouts` immediately, defeating the lockout (Finding S-5).

### 8.3 File import + "encryption"
```
folder/[id].tsx → DocumentPicker.getDocumentAsync()
  → vaultStore.importFile(uri, folderId, { encrypt, encryptionKeyId })
     → StorageService.copyToSandbox(uri) → local sandbox path
     → IF encrypt && encryptionKeyId resolves in settingsStore:
          StorageService.encryptSandboxFile(path, key) [XOR cipher]
     → metadata.isEncrypted = encrypt   ← set UNCONDITIONALLY from the requested flag,
                                            not from whether encryption actually ran
  → AsyncStorage.setItem('@vault_files', …) [fire-and-forget, not awaited]
```
**Broken link (confirmed):** if `encrypt` is requested but `encryptionKeyId` fails to resolve, the file stays plaintext on disk while `isEncrypted: true` is persisted — a false "🔐 Encrypted" badge in every list/grid view that reads this flag (Finding D-1).

### 8.4 Backup export
```
settings/index.tsx → handleExport() → BackupService.calculateBackupSize()
  → requestStoragePermission() [defaults to GRANTED on exception — fails open]
  → FolderPicker [browses ONLY FileSystem.documentDirectory sandbox — no OS picker]
  → BackupConfirmDialog → handleBackupConfirm() → BackupService.createBackupInFolder()
     → copies file bytes as-is (inherits existing per-file encryption state, if any)
     → createBackupManifest() [key METADATA only — never the actual key material]
     → createZipArchive() → FileSystem.moveAsync(packageDir → path ending ".zip")
        [directory renamed to .zip, NOT a real archive format]
```
**Broken links (confirmed):** (1) the "portable" backup path (`createBackup`/`pickBackupFolder`, which does use the real native folder chooser) exists but is never invoked by any UI; (2) the produced `.zip` is not openable by standard tools outside this app; (3) encryption/access keys are never exported, so restoring onto a new device (or after `SecureStore` data loss) permanently strands protected content (Finding D-2, D-3).

### 8.5 Route protection
```
(main)/_layout.tsx renders children UNCONDITIONALLY — no `if (!isAuthenticated) return <Redirect/>`
Protection is entirely a funnel effect: only onboarding.tsx/login.tsx ever router.replace into (main)/*
```
**Risk (Likely, static only):** any future code path, deep link, or restored navigation state that lands directly on a `(main)/*` route bypasses the lock screen; `isAuthenticated` being in-memory-only limits blast radius today, but there is no defense-in-depth (Finding A-1).

---

## 9. Frontend, Backend, Data, and Native Platform Assessment

**Backend:** Not present in the repository. No server code, no cloud SDK, no API routes, no database service of any kind was found. All "backend" functions are local device services (`StorageService`, `BackupService`) operating on the local filesystem/AsyncStorage/SecureStore.

**Data/storage resource inventory** (in lieu of a traditional DB, since one doesn't exist):

| Resource | Purpose | Fields/Types Observed | Readers | Writers | Validation | Authorization Evidence | Risks/Mismatches |
|---|---|---|---|---|---|---|---|
| SecureStore key `MASTER_PASSWORD_HASH`/`SECURITY_HINT`/`PIN_LENGTH` | Master PIN auth | hash (string), salt, hint, length | `authStore.checkSetup/authenticate` | `authStore.initializeVault` | `validatePin` (6-20 digits) client-side only | Vault-level gate | No lockout on the consuming path (§10) |
| AsyncStorage `@vault_folders` / `@vault_files` | Vault index | `FolderMetadata`/`FileMetadata` (`types/index.ts`) — names, paths, flags, `isEncrypted`, `accessKeyId`, `encryptionKeyId` | All screens via `vaultStore` | `vaultStore.*` (fire-and-forget, unawaited writes) | Loose (`any`-typed at many UI call sites) | UI-convention only, not enforced at store level | Cleartext index even for "protected" items; `isEncrypted` can desync from reality (§11) |
| AsyncStorage `@vault_settings` (`SETTINGS_KEY`) | App settings incl. **plaintext** access-key/encryption-key array | `AccessKeyMetadata`, `EncryptionKeyMetadata` incl. raw `password`/`key` | `settingsStore` | `settingsStore.*` | Password/key policy on create only | None at storage layer | **Plaintext secrets in unencrypted storage, duplicated from SecureStore** (§10, Finding S-2) |
| SecureStore per-key access/encryption key entries | "Authoritative" secret copies | raw password/key strings | `loadAccessKeyValues`/`loadEncryptionKeyValues` | `settingsStore.create/updateAccessKey` etc. | Same as above | OS keystore | Redundant with the AsyncStorage plaintext copy above, defeating its own purpose |
| `expo-file-system` sandbox (`vault_sandbox/`) | File bytes | Arbitrary binary, optionally XOR-"encrypted" or reversed-base64 "obfuscated" | `StorageService` | `StorageService` | None | Vault-level (UI gate only) | Not real encryption; duplicated files reuse ciphertext/key pairs (§10) |
| AsyncStorage `@vault_clipboard` | Copy/cut clipboard state | `ClipboardItem[]` | `vaultStore` | `vaultStore` | n/a | n/a | No issues found |

**Native platform (Android):** Real, working-as-coded native module (`DisguiseIconModule.kt`) for icon-alias swapping and `FLAG_SECURE` toggling, correctly registered (`DisguiseIconPackage.kt`) and bridged from JS (`disguiseIcon.ts`). A second, unrelated `FLAG_SECURE` mechanism in `MainActivity.kt` (`shouldApplyFlagSecure`, toggled on pause/resume) is present but its trigger flag is **never set to `true` anywhere in the codebase** — dead native code, not a security control in practice. Manifest declares more permissions (`CAMERA`, `INTERNET`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `RECORD_AUDIO`) than the JS layer uses (no camera capture flow, no network calls, no biometric library, no audio recording found in `src/`) — see §10 for the security implications. iOS-specific native code was not present to review (no `ios/` directory in the working tree — Expo managed workflow, generated on `expo prebuild`).

---

## 10. Authentication, Authorization, and Security

This is a dedicated security review; classifications follow the report-wide Confirmed/Likely/Risk/Not-verifiable scheme.

### Finding S-1 — Master vault PIN has no brute-force protection
- **Classification:** Confirmed · **Severity:** Critical
- **Evidence:** `src/store/authStore.ts:90-108` (`authenticate`), `src/app/(auth)/login.tsx:87-127` (`handleStandardAuth`) — no import or use of `lockoutStore`/`MAX_PASSWORD_ATTEMPTS` anywhere in this file.
- **Verification basis:** Static analysis
- **Impact:** A 6-digit numeric PIN (the enforced minimum, `PIN_MIN_LENGTH` in `accessKeyValidation.ts`) has only 1,000,000 combinations; with unlimited, undelayed automated guesses (e.g., via a modified client or direct store manipulation on a rooted/debug device) the entire vault can be exhaustively unlocked. This gates every other protection in the app.
- **Recommended fix:** Wire `authStore.authenticate` through `lockoutStore` (or an equivalent, persisted, exponential-backoff mechanism) the same way `AccessKeyUnlockModal` already does.
- **Confidence:** High

### Finding S-2 — Access-key/encryption-key secrets duplicated into plaintext AsyncStorage
- **Classification:** Confirmed · **Severity:** Critical
- **Evidence:** `src/store/settingsStore.ts:177-217` (`createAccessKey`), `:347-391` (`createEncryptionKey`), persisted via `PERSIST_KEYS`/snapshot at `:201-211,375-385`; `AccessKeyMetadata`/`EncryptionKeyMetadata.password|key` typed in `src/types/index.ts:11,26`.
- **Verification basis:** Static analysis
- **Impact:** Every per-item password and encryption key exists in cleartext inside AsyncStorage's unencrypted local JSON store, in addition to (correctly) being written to `expo-secure-store`. Combined with `android:allowBackup="true"` (`AndroidManifest.xml`), this data is extractable via `adb backup`/similar tooling without touching the OS keystore or requiring root.
- **Recommended fix:** Store only non-secret metadata (id, hint, algorithm params) in AsyncStorage; keep the raw secret exclusively in SecureStore, and set `android:allowBackup="false"` (or configure `dataExtractionRules`/`fullBackupContent` to exclude the settings store).
- **Confidence:** High

### Finding S-3 — "Encryption" is an unauthenticated XOR cipher, misleadingly documented as AES-256
- **Classification:** Confirmed · **Severity:** Critical
- **Evidence:** `src/security/crypto.ts:103-114` (`xorTransform`, docstring at 103-106 claims "Simulated high-performance local AES-256 transformations"), consumed by `src/services/storage.ts:47-72`.
- **Verification basis:** Static analysis
- **Impact:** XOR with a reused key is trivially reversible under known-plaintext or multi-time-pad conditions (which occur here, since duplicated files reuse the same key/ciphertext — `vaultStore.copyFileToFolder`). Any user or reviewer relying on the "AES-256" comment or the app's "encrypted" badge is materially misled about the actual protection level.
- **Recommended fix:** Replace with a real authenticated cipher available in the RN/Expo ecosystem (e.g., AES-GCM via a vetted native crypto library), with unique per-file IVs/nonces, and correct the documentation.
- **Confidence:** High

### Finding S-4 — Password hashing is a homemade iterative SHA-256 chain, not a real KDF
- **Classification:** Confirmed · **Severity:** Major
- **Evidence:** `src/security/crypto.ts:7-17` (`hashPassword`, 1000 rounds of `Crypto.digestStringAsync(SHA256, ...)` over the hex string, not HMAC-based PBKDF2 despite the docstring's claim).
- **Verification basis:** Static analysis
- **Impact:** 1,000 rounds of plain SHA-256 is far below modern guidance for password-derived key material (e.g., PBKDF2-HMAC-SHA256 ≥ 600k rounds, or Argon2/scrypt/bcrypt), and is fast to brute-force offline if the stored hash+salt is ever extracted (compounding Finding S-2's exposure path).
- **Recommended fix:** Use `expo-crypto`'s documented KDF support or a vetted PBKDF2/Argon2 implementation with a modern work factor.
- **Confidence:** High

### Finding S-5 — Per-item lockout is in-memory only and reset by force-closing the app
- **Classification:** Confirmed · **Severity:** Major
- **Evidence:** `src/store/lockoutStore.ts` (full file — no `persist()` middleware, no AsyncStorage/SecureStore writes; `attempts`/`lockouts` are plain state objects).
- **Verification basis:** Static analysis
- **Impact:** An attacker can bypass the intended 5-attempt/30-second lockout on any per-item access key by killing and relaunching the app after every 4 failed attempts.
- **Recommended fix:** Persist attempt/lockout counters (SecureStore or AsyncStorage keyed per item), or move the lockout enforcement into `authStore`/vault-level gating that survives process restarts.
- **Confidence:** High

### Finding S-6 — Weak randomness feeds security-relevant code despite comments claiming otherwise
- **Classification:** Confirmed · **Severity:** Medium
- **Evidence:** `src/security/crypto.ts:23-38` (`generateSalt` — `Math.random()`-based, comment falsely claims "cryptographically secure random salt"), `:55-74` (`generateUUID` — `Math.random()`-based despite claiming to use `Crypto.getRandomBytes`), consumed as auto-generated encryption-key material at `src/store/settingsStore.ts:355`.
- **Verification basis:** Static analysis
- **Impact:** Reduces the real entropy of auto-generated encryption keys and of the (separate, lower-impact) weak-salt code path; the misleading comments also create false confidence for future maintainers/reviewers.
- **Recommended fix:** Route all security-relevant randomness through `Crypto.getRandomBytes`/`generateSaltAsync` exclusively; delete or clearly mark the `Math.random()`-based helpers as non-cryptographic.
- **Confidence:** High

### Finding S-7 — Non-constant-time secret comparisons
- **Classification:** Confirmed · **Severity:** Minor
- **Evidence:** `src/components/AccessKeyUnlockModal.tsx:78`, `src/store/settingsStore.ts:308,313`, `src/store/authStore.ts:100` — all plain `===`/`!==` comparisons of secrets/hashes.
- **Verification basis:** Static analysis
- **Impact:** Timing side-channel risk is low for a single-process, on-device app, but is a recognized anti-pattern for secret comparison.
- **Recommended fix:** Use a constant-time comparison utility for password/hash checks.
- **Confidence:** Medium

### Finding S-8 — Overprivileged/unused Android permissions and manifest defaults
- **Classification:** Confirmed · **Severity:** Medium
- **Evidence:** `android/app/src/main/AndroidManifest.xml` — `USE_BIOMETRIC`/`USE_FINGERPRINT` (no biometric code or dependency anywhere in `src/`), `INTERNET` (repo-wide grep for `fetch`/`axios`/`http(s)://` in `src/` returns no matches), `android:allowBackup="true"`.
- **Verification basis:** Static analysis
- **Impact:** Unused permissions widen the attack surface without functional benefit and may raise unnecessary user/store-reviewer suspicion for a "vault" app; `allowBackup="true"` compounds S-2.
- **Recommended fix:** Remove unused permissions; set `allowBackup="false"` or scope backup rules to exclude sensitive stores.
- **Confidence:** High

### Finding S-9 — Screenshot protection defaults to off; a second, dead FLAG_SECURE mechanism exists in native code
- **Classification:** Confirmed · **Severity:** Minor
- **Evidence:** `src/store/settingsStore.ts:130` (`screenshotProtection` default `false`), `android/app/src/main/java/.../MainActivity.kt:16-38` (`shouldApplyFlagSecure` companion var, never set `true` anywhere in the repo — confirmed via grep).
- **Verification basis:** Static analysis
- **Impact:** Out of the box, a vault app's screenshots and Android recent-apps thumbnail can leak content until the user manually opts in; the dead `MainActivity` mechanism suggests an abandoned/incomplete alternate implementation attempt, adding maintenance confusion.
- **Recommended fix:** Default `screenshotProtection` to `true`, or prompt for it during setup; remove the dead `shouldApplyFlagSecure` path or wire it up and delete the JS-driven duplicate.
- **Confidence:** High

### Finding S-10 — Storage-permission request fails open
- **Classification:** Confirmed · **Severity:** Minor
- **Evidence:** `src/services/backupService.ts:72-95` (`requestStoragePermission` sets `this.backupPermissionGranted = true` on a caught exception, line 91).
- **Verification basis:** Static analysis
- **Impact:** An unexpected error during permission negotiation is treated as authorization, not denial — inconsistent with a fail-closed posture appropriate for a security-sensitive feature.
- **Recommended fix:** Default to `false`/denied on any exception.
- **Confidence:** Medium

**No hardcoded credentials, API keys, or backend secrets were found anywhere in the repository** (Confirmed — repo-wide grep for common secret patterns, `.env` files, and cloud-SDK config all returned no matches). No `console.log` of sensitive values was found (only benign diagnostic messages).

---

## 11. Inconsistencies, Bugs, and Risks

### Finding L-1 — Infinite re-render loop can permanently stick the app on the loading screen at first launch

- **Classification:** Confirmed (code pattern) / Likely (that this is the exact cause of the user-reported symptom) · **Severity:** Critical
- **Evidence:** `src/app/(auth)/onboarding.tsx:15-29` (the effect), `src/store/authStore.ts:50-51` (`checkSetup`'s `set({ isLoading: true })`)
- **Verification basis:** Static analysis (identified after the user reported the app getting stuck on the loading screen when testing both in Expo Go and an EAS-built APK; not runtime-reproduced in this session)
- **Mechanism:**
  ```js
  // onboarding.tsx:15-29
  useEffect(() => {
    let mounted = true;
    const timer = setTimeout(() => {
      if (mounted && isLoading) setSetupTimedOut(true);
    }, 8000);
    checkSetup();                       // called unconditionally on every effect run
    return () => { mounted = false; clearTimeout(timer); };
  }, [checkSetup, isLoading]);          // isLoading is a dependency of the effect that calls checkSetup()
  ```
  `checkSetup()` (`authStore.ts:50-51`) synchronously sets `isLoading: true` as its first action on *every* invocation. Because `isLoading` is in this effect's dependency array, each time `checkSetup()` changes `isLoading` (either direction), React tears down and reruns the effect — which calls `checkSetup()` again — which changes `isLoading` again — an unbounded loop.
  - For a **returning user** (vault already configured), a separate effect (`onboarding.tsx:31-37`) usually fires `router.replace('/(auth)/lock')` on the first render where `isLoading` becomes `false`, unmounting the screen and breaking the loop — so already-configured vaults are less likely to visibly hang.
  - For a **fresh install / first launch** (no PIN configured yet — `isConfigured` stays `false`), that redirect never fires, so nothing ever unmounts the screen and `checkSetup()` is re-invoked indefinitely, hammering SecureStore/AsyncStorage in a tight loop with `isLoading` true at almost every paint.
  - The intended 8-second `setSetupTimedOut` safety-net timer is itself defeated by the same loop: it gets `clearTimeout`'d and recreated on every iteration (line 27's cleanup), so it essentially never survives long enough to fire — explaining why the screen doesn't even recover after ~8 seconds, it just stays stuck.
  - By contrast, `src/app/(auth)/lock.tsx:12-14` calls `checkSetup()` in an effect with deps `[checkSetup]` only (no `isLoading`) — confirming this is a defect isolated to `onboarding.tsx`, not the store or the general pattern.
- **Impact:** Can make the app appear completely broken/unusable on first run (fresh install, cleared app data, or any state where no vault has been configured yet) in both Expo Go and a standalone/EAS build, since the bug is pure JS logic with no native-module dependency. This blocks not just this feature but *all* manual QA of the rest of the app until fixed.
- **Recommended fix:** Remove `isLoading` from the effect's dependency array so `checkSetup()` only runs once on mount; read the live value for the timeout check via `useAuthStore.getState().isLoading` instead of the closed-over prop, e.g.:
  ```js
  useEffect(() => {
    let mounted = true;
    const timer = setTimeout(() => {
      if (mounted && useAuthStore.getState().isLoading) setSetupTimedOut(true);
    }, 8000);
    checkSetup();
    return () => { mounted = false; clearTimeout(timer); };
  }, []); // checkSetup is a stable Zustand action reference — safe to omit here
  ```
- **Confidence:** High (the code-level defect is unambiguous; the causal link to the user's reported symptom is a strong static match — same bug reproduces identically in Expo Go and an EAS APK since it involves no native code — but was not runtime-confirmed in this session).

### Finding N-1 — Custom native Android module is not CNG-safe; may be silently absent from real prebuild/EAS-generated APKs

- **Classification:** Risk · **Severity:** Major
- **Evidence:** `android/` is listed in `.gitignore` (`/android`) and confirmed **not tracked by git** (§4, §9); the custom native files `android/app/src/main/java/com/anonymous/depositoseguro/DisguiseIconModule.kt`, `DisguiseIconPackage.kt`, and the hand-edited `FLAG_SECURE` logic in `MainActivity.kt:16-38` live directly inside that gitignored, hand-maintained folder; `app.json`'s `plugins` array (`expo-router`, `expo-sharing`, `expo-video`, `expo-splash-screen`, `expo-font`, `expo-secure-store`) contains **no local config plugin** that would re-inject these files; no `.easignore` file exists in the repo to override the `.gitignore`-based exclusion EAS Build normally applies when archiving the project for a cloud build.
- **Verification basis:** Static analysis only — the actual EAS Build configuration/behavior (whether it uploads the local `android/` folder as-is, or treats this as a Continuous Native Generation project and regenerates it fresh via `expo prebuild` on the build server) was not observed directly and would need to be confirmed against real EAS build logs.
- **Impact:** If EAS Build (or a fresh local `expo prebuild`) regenerates `android/` from `app.json` + plugins alone — which is the standard behavior for a CNG-style project with no committed native folder and no plugin wiring the customization in — the generated project **would not include `DisguiseIconModule.kt`/`DisguiseIconPackage.kt`**, and `MainActivity.kt` would be the stock Expo template version without the `FLAG_SECURE` on-pause/on-resume logic. At runtime this wouldn't crash (both `setDisguiseIcon()`/`setFlagSecure()` in `src/utils/disguiseIcon.ts:12-42` already guard with `if (DisguiseIconModule && typeof ... === 'function')` and fail gracefully), but the **app-icon disguise feature and the native `FLAG_SECURE` screenshot-protection path could silently do nothing** in a real distributed build, even though they read as fully implemented in static review (§7, §9) — this would only be visible as a user-facing "toggle does nothing" symptom, not an error.
- **Why this matters right now:** the SDK 56→57 upgrade procedure (see §20 Phase 0) explicitly involves `expo prebuild --clean` for CNG projects, which would compound this risk by deleting and regenerating `android/` from scratch — destroying the hand-added native files if they aren't backed up or, better, converted into a proper plugin first.
- **Recommended fix:** Convert the disguise-icon/`FLAG_SECURE` native customization into a local Expo config plugin (a `./plugins/withDisguiseIcon.js` using `@expo/config-plugins`'s Android mod APIs to write the Kotlin files and patch `MainActivity`/`AndroidManifest.xml` during `expo prebuild`), reference it in `app.json`'s `plugins` array, and delete the hand-maintained copies from `android/` so the only source of truth is the plugin. This makes the customization survive `expo prebuild --clean`, SDK upgrades, and CI-based EAS builds reliably.
- **Confidence:** Medium (the CNG/prebuild-regeneration risk is a well-documented Expo behavior pattern that matches this repo's exact file layout; whether it has actually caused the disguise/FLAG_SECURE features to silently fail in the user's real EAS builds is unconfirmed and worth checking directly, e.g. by inspecting the EAS build logs for a prebuild step, or checking whether the currently-installed APK's icon-theme picker actually changes the home-screen icon on a real device).

| # | Finding | Classification | Severity | Evidence | Impact |
|---|---|---|---|---|---|
| L-1 | App can get permanently stuck on the loading screen at first launch (see full write-up above) | Confirmed / Likely | **Critical** | `src/app/(auth)/onboarding.tsx:15-29`, `src/store/authStore.ts:50-51` | Blocks first-run and all downstream manual testing until fixed |
| N-1 | Custom native Android module may not survive a clean prebuild/EAS regeneration (see full write-up above) | Risk | Major | `android/` gitignored + untracked, no config plugin, no `.easignore` | Disguise-icon and native `FLAG_SECURE` protection could silently no-op in real builds |
| I-1 | `(main)/_layout.tsx` has no render-time `isAuthenticated` guard | Confirmed | Major | `src/app/(main)/_layout.tsx:10-53` | Route protection relies entirely on navigation funneling, not a real guard — see Finding A-1 / §8.5 |
| I-2 | `importFile()` can mark `isEncrypted: true` without the file actually being encrypted | Confirmed | Major | `src/store/vaultStore.ts:174-207` (Finding D-1) | False security indicator in every UI list that reads the flag |
| I-3 | Backup export produces a directory renamed to `.zip`, not a real archive; keys are never exported | Confirmed | Major | `src/services/backupService.ts:277-332,615-714` (Finding D-2/D-3) | Restoring on a new device permanently strands encrypted content; exported "zip" isn't portable |
| I-4 | Two independent, unreconciled "auth key" systems | Confirmed | Major | `src/store/settingsStore.ts:16-25,38-42,298-345` vs. `src/app/(main)/settings/auth-key.tsx` (uses `authStore` instead) | Dead insecure-pattern code (plaintext compare) sits alongside the real system; latent risk if ever wired up |
| I-5 | `UnlockContext` fully implemented, zero consumers; contradicts its own doc comment ("won't be prompted again until app restart") | Confirmed | Medium | `src/contexts/UnlockContext.tsx` | Users re-enter access-key passwords every single open, despite the intended UX being "remember for session" |
| I-6 | Six components and four hooks are fully dead code (zero external references) | Confirmed | Medium | `ResponsiveText`, `AnimatedPressable`, `AnimatedScreen`, `SafeAreaScreenWrapper`, `GridListToggle`, `AnimatedModal`; `useResponsive`, `useBreakpoint`, `useOrientation`, `useScreenFadeTransition` | Codebase bloat; screens hand-roll equivalents of several of these instead of reusing them |
| I-7 | Duplicated responsive-layout logic: computed once and discarded in `ThemeContext`'s provider, then re-derived per call inside `useTheme()` | Confirmed | Minor | `src/contexts/ThemeContext.tsx:71-148` vs. `:196-274` | Wasted computation; maintenance burden of two copies of the same formulas |
| I-8 | `favorites.tsx`/`search.tsx` "Export" menu item is a placeholder alert, not a real action | Confirmed | Medium | grep for `'Export'` alert text in both files | Feature appears in the UI but silently does nothing useful — user must know to use the file viewer instead |
| I-9 | Folder-level "encrypt" is metadata-only; doesn't touch file bytes (asymmetric with file-level encrypt) | Confirmed | Major | `src/store/vaultStore.ts:452-461` vs `:462-477` | 🔐 badge on a folder can misrepresent the protection state of its contents |
| I-10 | `toggleFolderEncryption` cannot actually toggle off an assigned key | Confirmed | Minor | `src/store/vaultStore.ts:534-540` | Dead-end control; recomputes state that can't change given how it's called |
| I-11 | Pervasive un-awaited `AsyncStorage.setItem(...).catch(...)` fire-and-forget writes throughout both stores | Confirmed | Major | `src/store/vaultStore.ts` (throughout), `src/store/settingsStore.ts` (throughout) | In-memory state can silently desync from persisted disk state on write failure or app kill immediately after a mutation; no retry, no user-visible error |
| I-12 | Restoring a file from Trash into an auto-created "Restored Files" folder does not carry over folder-level protection | Confirmed | Minor | `src/store/vaultStore.ts:229-263` | A file that lived in a since-deleted encrypted/protected folder lands in an unprotected folder on restore (file-level flags are preserved, folder-level inheritance is not) |
| I-13 | `getStorageQuotaInfo()` and `DISPLAY_CAPACITY_GB` return hardcoded fake values | Confirmed | Medium | `src/services/storage.ts:96-101`, `src/app/(main)/dashboard.tsx:62` | Misleads users about real device/vault storage usage; the "Cloud Storage" label also self-contradicts the app's offline-only design |
| I-14 | `initializeDisguiseIcon()` is an empty stub, called and awaited on every boot | Confirmed | Minor | `src/utils/disguiseIcon.ts:44-46`, `src/app/_layout.tsx:47` | Harmless but dead/no-op code executed unconditionally at startup |
| I-15 | `FILE_PASSWORD_VERIFICATION_TEST.md` references source files that do not exist under those names (`filePasswordValidation.ts`, `FilePasswordUnlockModal.tsx`) | Confirmed | Medium | root doc vs. confirmed absence via `find src -iname "*filepassword*"` (no matches) | Documentation is stale relative to a later rename (git log shows "change filepassword to accesskey"); self-reported "PASSED" status for a feature under its old name cannot be trusted as current |
| I-16 | Multiple root markdown docs self-report "PASSED"/"✅" results with no backing automated test suite | Confirmed | Medium | `BACKUP_AUDIT_REPORT.md`, `FILE_PASSWORD_VERIFICATION_TEST.md` vs. confirmed absence of any test files/CI (§13) | These are narrative claims, not verifiable evidence; should not be treated as proof of correctness |
| I-17 | `app.json.bak` is a stale, untracked backup missing the splash-screen config and the `expo-secure-store` plugin | Confirmed | Minor | diff of `app.json` vs `app.json.bak` | Housekeeping risk only if ever mistaken for the active config |
| I-18 | `LICENSE` is unedited Expo-template boilerplate (copyright "650 Industries, Inc.") | Confirmed | Minor | `LICENSE:1-22` | Doesn't reflect actual project authorship/licensing intent |
| I-19 | `src/app/index.tsx` and `src/app/(main)/index.tsx` are byte-identical unconditional redirects | Confirmed | Minor | both files | Harmless duplication, candidate for consolidation |
| I-20 | Calculator's expression evaluator uses `Function('use strict'; return (...))(...)` on user-typed input | Confirmed | Minor | `src/app/(auth)/login.tsx:176` | Input is pre-sanitized to a restrictive character set before reaching `Function`, so practical risk is low, but dynamic-code evaluation is a code-smell worth removing in favor of a proper expression parser |
| I-21 | `.kilo/` (AI-tool worktree sandboxes, contains its own `node_modules`) is not excluded by the root `.gitignore` | Risk | Minor | `.gitignore` vs `.kilo/.gitignore` (only the latter excludes select files) | Latent risk of accidentally committing a large, irrelevant tree; not currently a problem since nothing under `.kilo/` is tracked |

---

## 12. Code Quality and Technical Debt

- **TypeScript is present and `strict: true`, but frequently bypassed at the UI layer.** Screens widely type items as `any` (`folder: any`, `file: any`, `targetItem: any` across `dashboard.tsx`, `favorites.tsx`, `search.tsx`, `folder/[id].tsx`), meaning the well-defined models in `src/types/index.ts` are not actually enforced where most property access happens (Likely/Confirmed by grep pattern, static only).
- **Two tsconfig files** (`tsconfig.json`, `tsconfig.all_src.json`) with slightly different scopes/`skipLibCheck` and no documented reason for the split.
- **No TODO/FIXME/HACK/XXX markers** were found anywhere in `src/` — either genuinely clean or such markers were never used as a practice; combined with the docs in §11, this suggests known gaps are tracked informally (or not at all) rather than in-code.
- **Duplicate feature logic:** `favorites.tsx` and `search.tsx` largely copy-paste the same filter/CRUD/access-key handling (same `CATEGORY_FILTERS`, same switch statements) instead of sharing a common hook/component.
- **Dead code volume is non-trivial** for a repo this size: 6 components, 4 hooks, 1 context, and one entire parallel auth subsystem (§4, §11) — roughly a quarter of `src/components` and most of `src/hooks` are unreachable.
- **`scripts/reset-project.js`** is inert template scaffolding that should be deleted per its own header comment.
- **Root documentation sprawl:** 7 markdown files at the repo root beyond `README.md`, several self-declaring "PASSED" audits without any executable evidence backing them — a maintainability and trust risk if relied upon by future contributors (§11, I-16).

---

## 13. Testing, Build, and QA Assessment

**Test inventory:** None. Confirmed absence of unit tests, component tests, integration tests, E2E tests, backend tests, native tests, test fixtures/mocks, and any test runner dependency (`jest`, `vitest`, `detox`, etc. — not present in `package.json`).

**CI:** None. No `.github/workflows` directory or any other CI configuration exists in the repository.

**Build/validation commands available but NOT executed** (per explicit user instruction to keep this pass static-only):
| Command | Purpose | Status |
|---|---|---|
| `npx tsc --noEmit` / `npm run ts:check` | Type-check | Not executed — Not verifiable. `node_modules/.bin/tsc` confirmed present. |
| `npx eslint .` / `npm run lint` | Lint | Not executed — Not verifiable. `node_modules/.bin/eslint` confirmed present. |
| `npx expo-doctor` | Expo/dependency compatibility | Not executed — Not verifiable; would likely need network access. |
| App build/run (`expo run:android`, EAS build) | Compile & launch | Not executed — Not verifiable; no device/emulator available in this environment. |

**`tsc_out.txt`** exists at the repo root and is **0 bytes**. This is ambiguous: `tsc` prints nothing on a clean pass, so an empty file is *consistent with* a clean historical run, but it is equally consistent with the file having been created and never actually populated. **This audit does not treat it as evidence of a currently clean type-check.**

**Conclusion for this section:** Build, type-check, lint, and runtime correctness are **entirely unverified** by this audit. Everything reported elsewhere about "Statically complete" features is a claim about code shape and wiring, not about whether the code actually compiles or runs correctly.

---

## 14. Missing or Incomplete Functionality

- No automated tests or CI (§13) — Critical gap for any team beyond a solo hobbyist.
- No production EAS build profile (`eas.json` only has `preview`) — no defined path to a store-ready release build.
- No biometric unlock despite biometric permissions being declared (§10, S-8) — either finish the feature or remove the permissions.
- No real encryption (§10, S-3) — the single biggest gap between the app's stated purpose ("secure vault") and its actual implementation.
- No portable/real backup archive format, and backups can't carry encryption keys across devices (§8.4, §11 I-3).
- "Remember unlocked for this session" UX is fully coded but not wired up (`UnlockContext`, §11 I-5) — either finish or remove.
- "Export" action in Favorites/Search is a non-functional placeholder (§11 I-8).
- No real storage-usage reporting (§11 I-13) — either implement it against `expo-file-system` real usage or remove the UI.
- The parallel `authKey` subsystem in `settingsStore.ts` is incomplete/abandoned relative to the real PIN system it duplicates (§11 I-4) — should be finished-and-merged or deleted.
- No Expo config plugin exists for the custom native Android module (§11 N-1) — the disguise-icon/`FLAG_SECURE` native customization is not packaged in a way that survives a clean `expo prebuild`, which is a gap that becomes directly relevant the moment an SDK upgrade or any CNG regeneration is performed.
- The project is one major Expo SDK behind (on SDK 56; SDK 57 is current as of this update, §5) — not urgent on its own since SDK 57 has no breaking changes, but worth closing before it becomes two versions behind.

---

## 15. Functional Status Matrix

| Area | Status |
|---|---|
| App bootstrap / hydration | Statically complete (global error screen has no retry — Partially implemented) |
| Onboarding / PIN setup | Statically complete |
| PIN unlock (standard + calculator disguise) | Partially implemented (works per static trace, but no brute-force protection) |
| Auto-lock on background | Partially implemented (time-based only, no render-time guard) |
| Folder/file CRUD | Statically complete |
| Search / filter / sort | Statically complete |
| Trash / restore / shred | Statically complete (folder-protection inheritance gap on restore) |
| File viewer (image/video/document) + share | Statically complete |
| Favorites/Search "Export" | Broken (placeholder alert only) |
| Per-item access key | Statically complete, weak (in-memory lockout, plaintext storage duplication) |
| Per-item encryption key | Partially implemented (folder-level is metadata-only; file "encryption" is not real encryption) |
| Session-remember unlock | Not present (dead code) |
| Backup export | Partially implemented / effectively broken as a portable backup |
| Backup import/restore | Partially implemented (works for same-device restore of unencrypted content; loses keys) |
| Native folder-picker backup path | Backend-only / unused |
| Theme / customization | Statically complete |
| App-icon disguise | Statically complete (native code confirmed real, not runtime-verified) |
| Screenshot protection | Statically complete, opt-in/default-off |
| Storage usage display | Mocked/hardcoded |
| Dashboard "Cloud Storage" widget | Mocked/hardcoded |
| Authentication-key settings screen | Statically complete (uses real PIN system) |
| Parallel `authKey` system | Unused/deprecated |
| Biometric unlock | Not present |
| Analytics / crash reporting | Not present |
| Backend / cloud sync | Not present |
| Automated tests | Not present |
| CI/CD | Not present |

---

## 16. Development, Testing, and Production Readiness

| Track | Status | Rationale |
|---|---|---|
| **Development readiness** | **Ready for continued development** | The architecture is coherent, mostly consistently wired, and easy to extend; the main blockers are cleanup (dead code, dead subsystems) and closing the crypto/lockout gaps, not a fundamentally broken foundation. |
| **Testing readiness** | **Conditionally ready — blocked by Finding L-1 until fixed** | Manual/exploratory QA is very feasible given how much of the app is statically wired end-to-end, but (a) Finding L-1's infinite loading loop can prevent even reaching the app on a fresh install/test device, and must be fixed first, and (b) there is zero automated test coverage to regression-test against, and no execution evidence yet exists (§13) — a first testing pass should include fixing L-1, then actually running `tsc`/`eslint`/a real build, before deeper QA. |
| **Production readiness** | **Not ready** | The Critical/Major security findings in §10 (no PIN lockout, plaintext secret duplication, non-real encryption, weak KDF) directly undermine the app's core value proposition as a "secure vault," and there is no production EAS build profile, no CI, and no test suite to guard against regressions before a release. |

This audit does not and cannot state that the app "builds," "launches," or "works" — those require execution evidence not gathered in this pass (§2, §13).

---

## 17. Prioritized Improvement Roadmap

| Priority | Improvement | Reason | Affected Files/Modules | Expected Benefit | Verification Method |
|---|---|---|---|---|---|
| **Critical** | **Fix the onboarding infinite-loop bug (L-1)** | App can get permanently stuck on the loading screen on first launch — blocks all other testing | `src/app/(auth)/onboarding.tsx` | App actually reaches the setup/lock screen reliably | Fresh install (clear app data / new Expo Go session), confirm the "Setup Secure Vault Space" screen appears within a couple seconds instead of hanging |
| Critical | Add lockout/rate-limiting to the main vault PIN | No protection today (S-1) gates the whole app | `src/store/authStore.ts`, `src/app/(auth)/login.tsx` | Closes the single largest attack surface | Manual brute-force attempt on a debug build; unit test for lockout behavior |
| Critical | Stop duplicating access-key/encryption-key secrets into plaintext AsyncStorage | Direct plaintext-secret exposure (S-2), compounded by `allowBackup="true"` | `src/store/settingsStore.ts` | Removes the easiest path to extracting all per-item secrets | Inspect AsyncStorage contents on a test device/emulator after creating a key |
| Critical | Replace XOR "encryption" with a real authenticated cipher | Core "secure vault" claim is currently false (S-3) | `src/security/crypto.ts`, `src/services/storage.ts` | Makes file protection actually meaningful | Cryptographic review + known-plaintext test |
| Major | Replace homemade SHA-256 chain with a real KDF (PBKDF2/Argon2, adequate work factor) | Weak against offline brute force if hash is extracted (S-4) | `src/security/crypto.ts` | Raises the cost of offline PIN cracking | Timing/benchmark test of the new KDF |
| Major | Persist per-item lockout state | Trivially bypassed by app restart today (S-5) | `src/store/lockoutStore.ts` | Makes the existing 5-attempt/30s policy actually effective | Kill-and-relaunch test against a locked-out item |
| Major | Make backup produce a real, portable archive and include/restore key material (or clearly document that it doesn't and gate cross-device restore) | Backups are effectively non-functional across devices today (I-3) | `src/services/backupService.ts`, `src/components/FolderPicker.tsx` | Backup/restore actually protects the user's data | Restore a backup on a second device/emulator and confirm decrypted content is accessible |
| Major | Fix `isEncrypted` flag to reflect actual encryption outcome | False security indicator (D-1/I-2) | `src/store/vaultStore.ts:174-207` | UI accurately reflects protection state | Force an encryption-key-resolution failure and confirm the badge doesn't show |
| Major | Reconcile or delete the duplicate `authKey` subsystem | Dead, weaker-pattern code sitting next to the real system (I-4) | `src/store/settingsStore.ts` | Removes a latent-risk footgun and reduces confusion | Grep confirms zero remaining references after removal |
| Major | Stand up a minimal automated test suite + CI | Zero current coverage (§13) — nothing catches regressions | New `__tests__/`, `.github/workflows/ci.yml` | Baseline safety net for all future changes | CI run passes on a PR |
| Major | Actually run `tsc`/`eslint`/`expo-doctor` and fix findings | Build/type/lint cleanliness is currently unverified (§13) | Whole repo | Establishes a real, current quality baseline | Command output reviewed for zero errors |
| Medium | Remove or wire up `UnlockContext` (session-remember unlock) | Coded but unused/misleading doc comment (I-5) | `src/contexts/UnlockContext.tsx` and consumers | Either delivers the intended UX or removes dead weight | Manual UX check after wiring, or grep confirms removal |
| Medium | Implement real "Export" in Favorites/Search or remove the menu item | Currently a non-functional placeholder (I-8) | `src/app/(main)/favorites.tsx`, `search.tsx` | Removes a broken-feeling UI affordance | Manual tap-through test |
| Medium | Implement real storage-usage reporting or remove the mocked screen | Misleading fake numbers (I-13) | `src/services/storage.ts`, `src/app/(main)/dashboard.tsx`, `settings/storage.tsx` | Trustworthy storage info | Compare reported vs. actual `expo-file-system` usage |
| Medium | Add a render-time auth guard on `(main)/_layout.tsx` | Defense-in-depth against future deep-link/nav-state bypass (I-1) | `src/app/(main)/_layout.tsx` | Removes reliance on navigation-funnel-only protection | Attempt direct navigation to a `(main)` route while unauthenticated |
| Medium | Default `screenshotProtection` to enabled | Vault content exposed via screenshots/recents by default today (S-9) | `src/store/settingsStore.ts` | Safer default posture | Manual screenshot attempt with default settings |
| Medium | Remove unused Android permissions (`USE_BIOMETRIC`, `USE_FINGERPRINT`, `INTERNET`) or implement the features they imply | Overprivileged manifest (S-8) | `android/app/src/main/AndroidManifest.xml` | Smaller attack surface, less reviewer suspicion | Manifest diff + rebuild |
| Medium | Convert the custom native Android module (disguise icon + `FLAG_SECURE`) into a proper Expo config plugin | Not CNG-safe today; a clean prebuild (including the one needed for the SDK 57 upgrade) can silently delete it (N-1) | New `./plugins/withDisguiseIcon.js`, `app.json`, `android/app/src/main/java/.../DisguiseIconModule.kt`, `DisguiseIconPackage.kt`, `MainActivity.kt` | Native customization survives `expo prebuild --clean`, SDK upgrades, and CI builds | Run `expo prebuild --clean` and confirm the generated project still contains the module + `FLAG_SECURE` logic |
| Medium | Upgrade Expo SDK 56 → SDK 57 (`expo@^57.0.9`+) | Currently one major SDK behind; SDK 57 is documented as a zero-breaking-change upgrade over 0.85, and a known Hermes/Reanimated memory regression is only fixed from `57.0.9` onward | `package.json`/lockfile, `app.json`, `android/`/`ios/` (regenerated) | Up-to-date dependency baseline, avoids a known worklets/Reanimated memory bug, keeps pace with Expo's supported-version window | `npx expo install expo@^57.0.9 --fix` + `npx expo-doctor@latest` clean, app boots and all core flows still work after regeneration |
| Minor | Remove dead components/hooks/contexts (§4, §11 I-6) | Codebase bloat | `src/components/*`, `src/hooks/*`, `src/contexts/UnlockContext.tsx` | Smaller, clearer codebase | Grep confirms zero references before deletion |
| Minor | Delete `scripts/reset-project.js`, `app.json.bak`, correct `LICENSE` | Inert/stale template leftovers (§4, I-17/I-18) | root files | Cleaner repo | Visual confirmation |
| Minor | De-duplicate `favorites.tsx`/`search.tsx` shared logic into a hook/component | Maintainability | both files | Less duplicated logic to keep in sync | Code review |
| Minor | Correct or remove self-reported "PASSED" claims in root markdown docs until backed by real tests | Trust/accuracy of documentation (I-16) | root `*.md` | Documentation matches reality | Manual review |

---

## 18. Top 10 Next Actions

1. **Fix Finding L-1 first, before anything else** — remove `isLoading` from the dependency array of the effect in `src/app/(auth)/onboarding.tsx:15-29` (and read `useAuthStore.getState().isLoading` for the timeout check) so the app doesn't get stuck on the loading screen on first launch. Confirm on a fresh install in both Expo Go and an EAS build.
2. Run `npx tsc --noEmit`, `npx eslint .`, and `npx expo-doctor`, and fix everything they surface — establish the first real, executed quality baseline for this repo.
3. Convert the custom native Android module (disguise icon + `FLAG_SECURE`, currently hand-edited inside the gitignored `android/` folder — Finding N-1) into a proper Expo config plugin, **then** upgrade Expo SDK 56 → 57 (`npx expo install expo@^57.0.9 --fix`, `npx expo-doctor@latest`, regenerate `android/`/`ios/`) — doing the plugin conversion first prevents the SDK-upgrade's prebuild step from silently deleting that native code.
4. Add lockout/rate-limiting to `authStore.authenticate` (the main PIN path) — the single highest-impact security fix available.
5. Stop writing raw access-key/encryption-key secrets into AsyncStorage; keep them exclusively in SecureStore.
6. Replace `xorTransform`-based file "encryption" with a real authenticated cipher (and correct the misleading "AES-256" documentation).
7. Replace the 1,000-round SHA-256 password hash with a proper KDF (PBKDF2/Argon2) at an adequate work factor.
8. Persist `lockoutStore` state so per-item lockouts survive an app restart.
9. Decide the fate of the backup feature: either implement a real portable archive + key export, or clearly scope it as "same-device-only" in the UI copy and prevent misleading expectations.
10. Stand up a minimal Jest (or equivalent) test suite covering `authStore`, `vaultStore`, and `crypto.ts`, plus a basic GitHub Actions CI workflow running lint/typecheck/tests on every push.
11. Sweep and remove confirmed dead code (`UnlockContext`, the six unused components, the four unused hooks, the `authKey` subsystem) or finish wiring whichever of these was actually intended to ship.
12. Reconcile the root markdown "audit"/"test" documents with actual code state (fix or remove unverifiable "PASSED" claims, update file names referenced in `FILE_PASSWORD_VERIFICATION_TEST.md`), so future contributors (human or AI) can trust the repo's own documentation.

---

## 19. Final Scorecard

| Category | Weight | Score | Evidence | Verification Limitations | Main factor holding score back |
|---|---|---|---|---|---|
| Functionality | 30% | 62/100 | Most core vault workflows (CRUD, search, trash, viewer, theming, disguise) are statically complete and consistently wired; several notable features are broken/placeholder (Favorites/Search export, backup portability, storage stats) or entirely dead code | No execution evidence — "statically complete" ≠ "confirmed working" | Backup non-portability + placeholder export + fake storage stats + dead subsystems |
| Architecture | 15% | 68/100 | Clean file-based routing, sensible store/service/context separation, mostly consistent patterns | Static only | No render-time auth guard at the main route boundary; duplicated logic (favorites/search, responsive calc) |
| Backend/data integrity | 15% | 45/100 | No backend to assess for integrity in the traditional sense; local persistence has real, confirmed integrity gaps (unawaited writes, `isEncrypted` desync, wholesale-overwrite restore) | Static only; no data-loss scenario was actually reproduced | Fire-and-forget AsyncStorage writes; false encryption-flag scenario; backup key loss |
| Security | 15% | 30/100 | Real controls exist (SecureStore for the primary PIN, native FLAG_SECURE, icon disguise) but are undermined by no-lockout PIN, plaintext secret duplication, and fake encryption | Static only; no penetration test performed | S-1 (no PIN lockout) and S-3 (fake encryption) directly contradict the app's core promise |
| Code quality | 10% | 58/100 | TypeScript strict mode, standard tooling config, no TODO sprawl in-code; undermined by pervasive `any` typing at UI boundaries and a meaningful volume of dead code | Static only (no lint/typecheck executed to confirm current cleanliness) | Untyped UI call sites; dead components/hooks/subsystems |
| Reliability/error handling | 5% | 55/100 | Alerts and empty/error states are present broadly; backup error messages are sanitized well; but async writes are unawaited/unmonitored and permission checks fail open | Static only | Fire-and-forget persistence, fail-open permission handling |
| Testing | 5% | 0/100 | No tests of any kind exist | Confirmed absence, not merely unverified | Complete absence of automated test coverage |
| Maintainability/scalability | 5% | 55/100 | Reasonable module boundaries; hurt by duplicated code, two tsconfigs, dead subsystems, and documentation that has drifted from the code (renamed files still referenced in docs) | Static only | Documentation/code drift; duplicated logic across near-identical screens |

**Overall Score: 51/100**

- **Development readiness:** Ready for continued development
- **Testing readiness:** Conditionally ready
- **Production readiness:** Not ready

**Three highest-risk findings:**
1. **L-1 — Infinite re-render loop can permanently stick the app on the loading screen at first launch** (`src/app/(auth)/onboarding.tsx:15-29`, `src/store/authStore.ts:50-51`) — identified after the user reported this exact symptom in both Expo Go and an EAS APK; blocks the app from being usable at all on a fresh install, and blocks all downstream manual testing until fixed. Fix this before anything else.
2. **S-1 — No brute-force protection on the master vault PIN** (`src/store/authStore.ts:90-108`) — the single point of failure for the entire vault.
3. **S-3 — File "encryption" is an XOR cipher misleadingly documented as AES-256** (`src/security/crypto.ts:103-114`) — the app's core security promise is not actually delivered.

*(S-2 — plaintext secret duplication in AsyncStorage — remains the next-highest risk after these three; see the full ranked list in §10.)*

**Top 10 next actions:** see §18 above.

---

## 20. Execution Plan — Phased Remediation Roadmap

This section converts every finding in §10 (Security), §11 (Inconsistencies/Bugs/Risks), §14 (Missing/Incomplete Functionality), and §17 (Improvement Roadmap) into nine ordered, executable phases. Each phase lists its goal, concrete tasks (tagged with the originating finding ID), the files touched, exit/verification criteria, and its dependencies on other phases. Checkboxes are provided so this can be used directly as a tracking document across future work sessions — nothing below has been implemented yet.

**How to use this plan:** work top-to-bottom by default. Phases marked "may run in parallel" can be split across parallel branches/sessions once their stated dependencies are satisfied. Every phase that touches security- or data-critical code assumes Phase 0's safety net exists first — do not skip Phase 0.

### Dependency map

```text
Phase 0 (Baseline & Safety Net)
    │
    ▼
Phase 1 (Critical Security Remediation)  ──────────────┐
    │                                                   │
    ▼                                                   ▼
Phase 2 (Data Integrity & Persistence)      Phase 4 (Auth/Navigation Hardening)
    │                                        [may run in parallel with Phase 2/3]
    ▼
Phase 3 (Backup/Restore Overhaul)
    │
    ▼
Phase 5 (Dead Code & UX Completion)  [may run in parallel with Phases 2–4]
    │
    ▼
Phase 6 (Test Suite Expansion & CI Hardening)  [ideally incremental per-phase, not all at the end]
    │
    ▼
Phase 7 (Documentation & Housekeeping)
    │
    ▼
Phase 8 (Final Validation & Production Readiness Gate)
```

---

### Phase 0 — Baseline & Safety Net

**Goal:** Establish real, executed ground truth and a minimal regression safety net *before* touching any security- or data-critical code. (§13 currently marks all build/type/lint status as Not verifiable — this phase resolves that.)

- [ ] **Step 1 — do this literally first, before any other task in this plan:** fix **Finding L-1** — remove `isLoading` from the dependency array of the effect in `src/app/(auth)/onboarding.tsx:15-29` (read `useAuthStore.getState().isLoading` for the 8-second timeout check instead). Verify on a fresh install (cleared app data / new Expo Go session) that the app reaches the "Setup Secure Vault Space" or lock screen within a couple seconds in **both** Expo Go and an EAS-built APK. Nothing else in this plan can be manually verified until this is confirmed fixed.
- [ ] **Step 2 — Expo SDK 56 → 57 upgrade** (do this before the tsc/eslint/expo-doctor baseline run below, so that baseline reflects the final target stack, not a stack about to change):
  - [ ] **2a.** First, convert the custom native Android module into a proper Expo config plugin (Finding N-1) — create `./plugins/withDisguiseIcon.js` using `@expo/config-plugins` to inject `DisguiseIconModule.kt`/`DisguiseIconPackage.kt` and patch `MainActivity.kt`'s `FLAG_SECURE` logic + package registration during `expo prebuild`; reference it in `app.json`'s `plugins` array; remove the hand-maintained copies from `android/` once the plugin reliably regenerates them. **Do this before 2b** — otherwise the prebuild step in 2b will silently delete this native code.
  - [ ] **2b.** Back up (or just note down) `android/app/debug.keystore` if it's ever been manually customized (harmless to lose if it's still the stock Expo-generated debug keystore, but confirm before deleting).
  - [ ] **2c.** Run `npx expo install expo@^57.0.9 --fix` (the `.9`+ pin avoids a known Hermes/Reanimated memory regression present in earlier 57.x releases — see §5) to bump `expo` and align all `expo-*`/`react-native-reanimated`/`react-native-worklets`/`react-native-gesture-handler` package versions.
  - [ ] **2d.** Run `expo prebuild --clean` (or delete the local `android/`/`ios/` folders and let the next build regenerate them) to regenerate the native projects against React Native 0.86; confirm the config plugin from 2a re-adds the disguise-icon/`FLAG_SECURE` native code (check the regenerated files against the originals).
  - [ ] **2e.** Rebuild and smoke-test (`expo run:android` or a fresh EAS `preview` build) — confirm the app still boots, the disguise-icon theme picker still changes the launcher icon, and screenshot protection still works, on a real device/emulator.
- [ ] Run `npx tsc --noEmit` (or `npm run ts:check`); fix all reported errors.
- [ ] Run `npx eslint .` (or `npm run lint`); fix all reported errors/warnings.
- [ ] Run `npx expo-doctor`; resolve any remaining dependency/version-compatibility findings.
- [ ] Stand up a Jest (or equivalent) test harness; add first smoke tests for `src/store/authStore.ts`, `src/store/vaultStore.ts`, `src/security/crypto.ts` — even thin/trivial tests are enough to catch regressions in Phase 1.
- [ ] Add a GitHub Actions workflow (`.github/workflows/ci.yml`) running lint + typecheck + tests on every push/PR.

**Files:** whole repo (validation only); `package.json`/lockfile, `app.json`, `android/`, `ios/` (SDK upgrade); new `./plugins/withDisguiseIcon.js` (N-1 fix); new `.github/workflows/ci.yml`, new `__tests__/` or `*.test.ts` files.
**Exit criteria:** the app reliably reaches the setup/lock screen on a fresh install in both Expo Go and an EAS build (L-1 confirmed fixed); the project builds and runs on Expo SDK 57 with the native disguise-icon/`FLAG_SECURE` module intact after a clean prebuild (N-1 confirmed fixed); CI is green on current `main`; baseline tests exist and pass.
**Dependencies:** None — run first. Internally sequenced: L-1 fix → native module → config plugin conversion (N-1) → SDK 57 upgrade/prebuild → tsc/eslint/expo-doctor → tests/CI.
**Addresses:** Finding L-1 (§11) — unblocks all manual testing; Finding N-1 (§11) — makes the native customization upgrade-safe; the Expo SDK 56→57 roadmap item (§5, §17); Roadmap items "Actually run tsc/eslint/expo-doctor" and "Stand up a minimal automated test suite + CI" (§17); resolves the Testing category's 0/100 score (§19) from zero to a non-zero baseline.

---

### Phase 1 — Critical Security Remediation

**Goal:** Make the app's core "secure vault" promise actually true. This is the highest-risk, highest-priority phase — work on a feature branch with the heaviest review.

- [ ] **S-1:** Integrate `lockoutStore` (or a persisted equivalent — see Phase 2/S-5) into `src/store/authStore.ts:authenticate()` and its call site in `src/app/(auth)/login.tsx:104`, mirroring the pattern already used correctly in `AccessKeyUnlockModal.tsx`.
- [ ] **S-4:** Replace the 1,000-round chained-SHA-256 `hashPassword` (`src/security/crypto.ts:7-17`) with a real KDF (PBKDF2-HMAC-SHA256 at a modern round count, or Argon2 if a vetted RN binding is available).
- [ ] **S-3:** Replace `xorTransform` (`src/security/crypto.ts:107-114`) with real authenticated encryption (e.g., AES-GCM via a vetted native crypto library), with a unique IV/nonce generated per file/operation. Update `src/services/storage.ts:47-72` accordingly. Correct the misleading "AES-256" docstring regardless of timing.
- [ ] **S-2:** Stop writing raw `password`/`key` fields to AsyncStorage in `src/store/settingsStore.ts` (`createAccessKey:177-217`, `createEncryptionKey:347-391`, and the `PERSIST_KEYS`/snapshot mechanism at `:201-211,375-385`); keep secrets exclusively in SecureStore, with only non-secret metadata (id, hint, algorithm/version tag) in AsyncStorage.
- [ ] Set `android:allowBackup="false"` in `android/app/src/main/AndroidManifest.xml` (or scope `dataExtractionRules`/`fullBackupContent` to exclude the settings store) to close the S-2 exfiltration path.

**⚠️ Design decision needed before implementation:** changing the hash format (S-4) and the encryption format (S-3) are **breaking changes** for any already-initialized vault — existing stored PIN hashes and encrypted files will not be readable by the new code as-is. A migration strategy must be chosen before coding starts, e.g.: (a) a format-version tag stored alongside each hash/ciphertext, with old-format data re-hashed/re-encrypted transparently on next successful unlock, or (b) an explicit one-time "vault upgrade" flow, or (c) accept a hard breaking change if no real users exist yet. Flag this to the user/product owner before starting S-3/S-4.

**Files:** `src/security/crypto.ts`, `src/services/storage.ts`, `src/store/authStore.ts`, `src/store/settingsStore.ts`, `src/app/(auth)/login.tsx`, `android/app/src/main/AndroidManifest.xml`.
**Exit criteria:** new unit tests (added as part of this phase, per Phase 6's incremental-testing recommendation) cover lockout behavior, the new hash function, and the new cipher (including a known-plaintext/round-trip test); `tsc`/`eslint` stay clean; a manual test confirms a freshly-created vault can be locked and unlocked correctly end-to-end (still Not verifiable by static review alone — requires a build).
**Dependencies:** Phase 0 complete.
**Addresses:** Findings S-1, S-2, S-3, S-4 (§10); Scorecard's Security category (currently 30/100, §19) — this phase should move that score the most.

---

### Phase 2 — Data Integrity & Persistence Fixes

**Goal:** Make persisted vault state trustworthy and internally consistent.

- [ ] **I-11:** Await `AsyncStorage.setItem(...)` calls (or introduce a serialized write queue) throughout `src/store/vaultStore.ts` and `src/store/settingsStore.ts` instead of fire-and-forget `.catch(console.error)`; surface persistent write failures to the UI instead of only logging them.
- [ ] **I-2:** Fix `importFile()` (`src/store/vaultStore.ts:174-207`) so `isEncrypted` is only ever set `true` when encryption actually succeeded, not merely requested.
- [ ] **I-9 / I-10:** Resolve the folder-vs-file encryption asymmetry (`vaultStore.ts:452-477`) — either make folder-level "encrypt" genuinely cascade to every contained file, or remove/relabel the folder-level toggle so it can't imply protection it doesn't provide; fix `toggleFolderEncryption` (`:534-540`) so it can actually turn protection off.
- [ ] **I-12:** When `restoreFileFromTrash` (`vaultStore.ts:229-263`) auto-creates a "Restored Files" folder, carry forward the original folder's protection state (or explicitly warn the user it wasn't preserved).
- [ ] **S-5:** Persist `lockoutStore` attempt/lockout state (SecureStore or AsyncStorage, keyed per item) so it survives an app restart.
- [ ] **S-10:** Make `requestStoragePermission()` (`src/services/backupService.ts:72-95`) fail closed (default `false`) on any exception, not fail open.

**Files:** `src/store/vaultStore.ts`, `src/store/settingsStore.ts`, `src/store/lockoutStore.ts`, `src/services/backupService.ts`.
**Exit criteria:** a regression test exists for each fixed behavior (e.g., force-kill-and-relaunch test for S-5, encryption-key-resolution-failure test for I-2); manual repro of each original bug confirmed fixed.
**Dependencies:** Phase 0; should land after Phase 1 since both touch `vaultStore.ts`/`settingsStore.ts` — sequencing avoids merge conflicts on the same files.
**Addresses:** Findings I-2, I-9, I-10, I-11, I-12, S-5, S-10 (§10/§11).

---

### Phase 3 — Backup/Restore Overhaul

**Goal:** Make backup either a real, portable, key-inclusive archive, or clearly scope and label it as same-device-only — currently it silently does neither well (I-3).

**⚠️ Design decision needed before implementation:** choose one of:
  - **(A) Full portable backup:** implement a real ZIP (or similar) writer, include encryption/access keys in the manifest (encrypted under a user-supplied backup passphrase, never in plaintext), and wire up the already-implemented-but-unused native folder-picker path (`BackupService.createBackup`/`pickBackupFolder`, `backupService.ts:98-133,386-492`) instead of the sandbox-only `FolderPicker` component.
  - **(B) Same-device-only backup:** keep the current sandbox-scoped mechanism, but rename/relabel it clearly in the UI ("Local Snapshot," not "Backup"), and add explicit warnings that it cannot be restored on another device or after key loss.
- [ ] Implement the chosen option.
- [ ] If (A): replace `createZipArchive()` (`backupService.ts:277-332`) with a real archive library; extend `createBackupManifest()`/`restoreBackup()` (`:172-231,615-714`) to include/restore key material encrypted under a backup passphrase.
- [ ] If (B): update all UI copy in `settings/index.tsx` and `BackupConfirmDialog.tsx` to reflect the same-device-only scope; keep the existing manifest-only (no-keys) behavior but make it explicit to the user.
- [ ] Either way: add a restore-parity test (create → restore → byte-compare original vs. restored files).

**Files:** `src/services/backupService.ts`, `src/services/backup.ts`, `src/components/FolderPicker.tsx`, `src/components/BackupConfirmDialog.tsx`, `src/app/(main)/settings/index.tsx`.
**Exit criteria:** a backup produced by the app can be restored and yields byte-identical file content to the original (same-device test at minimum; cross-device test if option (A) is chosen).
**Dependencies:** Phase 1 (the new encryption scheme from S-3 should be what any key-export design targets, not the old XOR cipher) — sequence after Phase 1.
**Addresses:** Finding I-3 (§11); "Missing/Incomplete: no portable/real backup archive" (§14).

---

### Phase 4 — Auth/Navigation Hardening

**Goal:** Defense-in-depth and permission hygiene, independent of the crypto core.

- [ ] **I-1:** Add a render-time `isAuthenticated` guard to `src/app/(main)/_layout.tsx` (e.g., `if (!isAuthenticated) return <Redirect href="/(auth)/lock" />`) so route protection no longer relies solely on navigation funneling.
- [ ] **I-4:** Resolve the parallel `authKey` subsystem in `src/store/settingsStore.ts` (`:16-25,38-42,298-345`) — either delete it entirely (confirm zero references first) or finish wiring it up and retire the duplicate PIN-based flow in `settings/auth-key.tsx`. Deletion is the lower-risk default recommendation given it duplicates a weaker, plaintext-comparison pattern.
- [ ] **S-8:** Remove unused Android permissions (`USE_BIOMETRIC`, `USE_FINGERPRINT`, `INTERNET`) from `AndroidManifest.xml`, or implement the corresponding features (biometric unlock via `expo-local-authentication`) if desired instead of removal.
- [ ] **S-9:** Default `screenshotProtection` to `true` in `src/store/settingsStore.ts:130`; remove the dead `shouldApplyFlagSecure` mechanism in `android/app/src/main/java/.../MainActivity.kt:16-38` (never triggered anywhere) to avoid maintainer confusion with the real, working `DisguiseIconModule.setFlagSecure` path.

**Files:** `src/app/(main)/_layout.tsx`, `src/store/settingsStore.ts`, `src/app/(main)/settings/auth-key.tsx`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/.../MainActivity.kt`.
**Exit criteria:** manual test of a direct-navigation-while-locked-out bypass attempt fails as expected; permission diff reviewed; native project still builds after the `MainActivity.kt` cleanup.
**Dependencies:** Phase 0 only — touches different files than Phases 2/3, so **may run in parallel** with them.
**Addresses:** Findings I-1, I-4, S-8, S-9 (§10/§11).

---

### Phase 5 — Dead Code & UX Completion

**Goal:** Remove confusion from half-built/dead features; finish the ones worth keeping.

- [ ] **I-5:** Decide the fate of `src/contexts/UnlockContext.tsx` — either wire it up for the "remember unlocked this session" UX its own doc comment promises (consumed from `dashboard.tsx`, `favorites.tsx`, `search.tsx`, `folder/[id].tsx`'s access-key-gated actions), or delete it.
- [ ] **I-6:** Delete the six dead components (`ResponsiveText`, `AnimatedPressable`, `AnimatedScreen`, `SafeAreaScreenWrapper`, `GridListToggle`, `AnimatedModal`) and four dead hooks (`useResponsive`, `useBreakpoint`, `useOrientation`, `useScreenFadeTransition`) — re-confirm zero references with a grep pass immediately before deleting each.
- [ ] **I-7:** Consolidate the duplicated responsive-layout math in `src/contexts/ThemeContext.tsx` (discarded provider-level memo at `:71-148` vs. re-derived-per-call logic in `useTheme()` at `:196-274`) into a single computed source.
- [ ] **I-8:** Implement real "Export" behavior in `favorites.tsx`/`search.tsx` (reuse the working `Sharing.shareAsync` logic already present in `folder/[id].tsx`/`viewer/*.tsx`), or remove the placeholder menu item.
- [ ] **I-13:** Implement real storage-usage reporting via `expo-file-system` in `src/services/storage.ts:getStorageQuotaInfo()`, and replace the hardcoded `DISPLAY_CAPACITY_GB` in `dashboard.tsx:62` with real data (or remove/relabel the "Cloud Storage" widget, since the app is offline-only).
- [ ] **I-19:** Consolidate `src/app/index.tsx` and `src/app/(main)/index.tsx` (byte-identical unconditional redirects) into one.
- [ ] **I-20:** Replace the `Function('use strict'; return (...))(...)` calculator expression evaluator (`login.tsx:176`) with a small, safe expression parser (no dynamic code evaluation).

**Files:** `src/contexts/UnlockContext.tsx` and its intended consumers, `src/components/*` (deletions), `src/hooks/*` (deletions), `src/contexts/ThemeContext.tsx`, `src/app/(main)/favorites.tsx`, `search.tsx`, `src/services/storage.ts`, `src/app/(main)/dashboard.tsx`, `src/app/index.tsx`, `src/app/(main)/index.tsx`, `src/app/(auth)/login.tsx`.
**Exit criteria:** grep-confirmed zero dangling references after each deletion; manual UX walkthrough of every completed (not deleted) feature.
**Dependencies:** Phase 0 only — lowest risk of all phases; **may run fully in parallel** with Phases 2–4 (e.g., as a second contributor's workstream), since it touches mostly disjoint files.
**Addresses:** Findings I-5, I-6, I-7, I-8, I-13, I-19, I-20 (§11); "Missing/Incomplete" items in §14.

---

### Phase 6 — Test Suite Expansion & CI Hardening

**Goal:** Convert Phase 0's baseline tests into real coverage of everything changed in Phases 1–5, and make CI a required gate.

- [ ] Recommended: don't defer all testing to the end — write each fix's regression test *in the same phase as the fix* (already reflected as checklist items above). Use this phase to catch up anything skipped and to harden CI.
- [ ] Unit tests: new KDF/cipher round-trip and failure cases (crypto.ts), `authStore` lockout behavior, `vaultStore` CRUD + `isEncrypted` correctness, `lockoutStore` persistence across restarts, `backupService` restore-parity.
- [ ] Component/integration-level tests where feasible (e.g., `login.tsx` lockout UI behavior) using React Native Testing Library.
- [ ] Make the CI workflow from Phase 0 a required check before merge to `main`.

**Files:** new/expanded test files across `src/`.
**Exit criteria:** meaningful coverage of every Critical/Major finding's fix; CI required-check enforced.
**Dependencies:** Phases 1–5 (or incrementally alongside each, per the recommendation above).
**Addresses:** Roadmap item "Stand up a minimal automated test suite + CI" (§17); Testing category (§19).

---

### Phase 7 — Documentation & Housekeeping

**Goal:** Make the repository's own documentation trustworthy again, and clear out inert leftovers.

- [ ] **I-16:** Correct or remove unverifiable "PASSED"/"✅" claims in `BACKUP_AUDIT_REPORT.md` and other self-authored reports once the underlying fixes in Phases 1–3 actually land and are test-covered (don't mark anything "PASSED" without a real test/CI check behind it).
- [ ] **I-15:** Fix or remove `FILE_PASSWORD_VERIFICATION_TEST.md`'s references to files that no longer exist (`filePasswordValidation.ts`, `FilePasswordUnlockModal.tsx`) — update to the current `accessKeyValidation.ts`/`AccessKeyUnlockModal.tsx` names, or delete the doc if superseded.
- [ ] **I-17 / I-18:** Delete `app.json.bak`; replace the unedited Expo-template `LICENSE` with an actual licensing decision for this project.
- [ ] Delete `scripts/reset-project.js` (confirmed unreferenced, per its own header comment).
- [ ] **I-21:** Add `.kilo/` to the root `.gitignore` (currently only excluded internally by `.kilo/.gitignore`, which doesn't protect against an accidental `git add -A` from the repo root).

**Files:** root `*.md` docs, `app.json.bak`, `LICENSE`, `scripts/reset-project.js`, `.gitignore`.
**Exit criteria:** no doc references a file/feature that doesn't match current code; no stale/dead files remain at the root.
**Dependencies:** Should happen last (or continuously) — it's documenting the outcome of Phases 1–5, so doing it too early just creates more drift to fix.
**Addresses:** Findings I-15, I-16, I-17, I-18, I-21 (§11); roadmap's documentation-accuracy item (§17).

---

### Phase 8 — Final Validation & Production Readiness Gate

**Goal:** Confirm everything holds together as a whole, and re-score against this audit's methodology.

- [ ] Full clean run of `tsc`, `eslint`, `expo-doctor`, and the full test suite — all must pass.
- [ ] Build a preview APK (`eas build --profile preview`) and install it on a device/emulator.
- [ ] Manually walk every core flow end-to-end: register → unlock (PIN + calculator disguise) → import → assign access/encryption key → search/favorite → export/share → backup → restore → trash → permanent delete → settings (theme, disguise icon, screenshot protection, auth-key change).
- [ ] Re-run this audit's §19 scoring methodology against the updated code and record the new scorecard, especially confirming the Security category has moved substantially off its current 30/100.
- [ ] Decide on a `production` EAS build profile (currently only `preview` exists in `eas.json`) once ready to consider store distribution.

**Files:** whole repo (validation), `eas.json` (new production profile, when ready).
**Exit criteria:** clean build, all core flows manually verified working, updated scorecard published.
**Dependencies:** all prior phases complete.
**Addresses:** §16's "Not ready" production-readiness verdict — this phase is the gate for moving it to "Ready for release consideration."

---

*All secrets, credentials, and sensitive values referenced during this audit were confirmed absent from the repository; none required masking. This report reflects static, read-only analysis only, as agreed with the user — no files were modified, and no build/test/runtime commands were executed.*
