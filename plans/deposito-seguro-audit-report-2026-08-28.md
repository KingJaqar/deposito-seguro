# Deposito Seguro — Full Repository Re-Audit Report

**Repository:** `C:\Users\User\deposito-seguro` · **Branch:** `main` · **Working tree:** clean at time of writing
**Baseline compared against:** `plans/deposito-seguro-audit-report.md` (prior audit, dated 2026-08-26, against commit `9e0802a`, scored 51/100)
**Current HEAD:** `a6a9b94` "major UI update 2" (2026-08-28 22:32:40 +0800)
**Audit dates:** 2026-08-28 → 2026-08-29 · **Audited by:** Claude Code (static analysis + executed validation commands, read-only)

**Commits since the prior baseline** (`git log 9e0802a..HEAD`): `90ef6fb` "issues solve", `0f05a73` "new feature addition: storage threshold in settings", `c2e2d9f` "major UI update", `a6a9b94` "major UI update 2". At the start of this audit the working tree still had ~30 modified files and several untracked directories (the tail end of the `a6a9b94` work); by the time this report was compiled, all of it had been committed and the tree is clean. No application source files were modified by this audit — only this report file was written.

---

## 1. Executive Summary

Deposito Seguro is a **local-only Expo/React Native vault app** (Expo SDK `^57.0.9`, React Native `0.86.2`, React `19.2.3`) that hides photos, videos, and documents behind a PIN, inside a UI disguised as a calculator. It offers per-item "access key" (password) locks, per-item/per-folder real encryption, local ZIP backup/restore, and — new since the prior audit — fully offline in-app previewers for PDF/DOCX/XLSX/ODT files and automatic icon extraction for imported `.apk` files. There is still **no backend, no cloud service, and no network I/O anywhere** — `android.permission.INTERNET` is explicitly blocked in `app.json`, confirmed by repo-wide grep and by every document-viewer component being built to work with zero network access.

**This is a re-audit, not a first look.** The prior audit (2026-08-26) scored the app 51/100 and found the security posture materially undermined its "secure vault" premise: no PIN lockout, plaintext-secret duplication, a fake XOR "encryption" mislabeled as AES-256, a homemade weak password hash, an app-breaking infinite-loop bug on first launch, and zero automated tests or CI. **The overwhelming majority of that work has since been done, verified against current source with fresh file:line evidence, and is now committed** (not just sitting in a working tree):

- Real cryptography: PBKDF2-HMAC-SHA256 (10,000 rounds) + AES-256-CBC/HMAC-SHA256 Encrypt-then-MAC, CSPRNG-sourced salts/IVs/keys, constant-time comparisons (with one residual gap — see Finding S-7 below).
- PIN brute-force lockout wired into the master-PIN path; per-item lockout now persists across app restarts.
- Secrets are no longer duplicated into plaintext AsyncStorage; `android:allowBackup="false"` is confirmed in the generated manifest.
- The custom native Android module (calculator-icon disguise, `FLAG_SECURE`) is now a real Expo config plugin (`plugins/withDisguiseIcon.js`), CNG-safe, confirmed to match the currently-generated `android/` tree.
- The onboarding infinite-render-loop bug that could permanently strand a fresh install on the loading screen (Finding L-1) is fixed and the fix is confirmed correct.
- A real automated test suite (7 files, 52 tests, **all passing** — executed in this audit) and a GitHub Actions CI workflow now exist; both were completely absent before.
- **All four validation commands were executed in this audit** (the prior audit explicitly skipped them): `tsc --noEmit` is clean; `jest --ci` is 52/52 green; `expo lint` finds 5 real errors and 16 warnings; `expo-doctor` finds only minor SDK patch-version drift (14 packages a few patch versions behind their SDK-57 targets — no major-version or breaking issues).

**What is still genuinely open:** one leftover non-constant-time secret comparison on a destructive delete path (S-7); a residual "encryption" fallback in `storage.ts` that silently byte-reverses a file instead of encrypting it when no key is supplied (new finding, not in the original 21); a real privacy leak where an imported `.apk`'s true icon is cached and rendered **unencrypted**, revealing what app is hidden even when the `.apk` itself is marked encrypted (new finding); a storage-limit feature whose own code comments claim it's enforced on copy/paste/duplicate but is only actually enforced on import (new finding); `initializeDisguiseIcon()` is still a dead no-op stub (unfixed from the original report); and settings/clipboard persistence writes are still fire-and-forget (the original I-11 finding is only partially closed — the vault-file/folder core was fixed, but `settingsStore.ts` and vault clipboard state were not). Five real ESLint errors (all React-hooks anti-patterns: setState-in-effect ×3, ref-mutation-during-render, an unescaped-entity JSX issue) also currently exist and were never caught because lint was never run before this audit.

The project has moved from **"feature-rich but not secure"** to **"largely secure, still has real but bounded gaps, and now has execution evidence to prove it."** It remains a personal/hobbyist-scale project (single-developer git history, one Android build profile, no production EAS profile) but is now meaningfully closer to safely protecting data the user cannot afford to lose or expose.

---

## 2. Audit Scope, Access, and Verification Limits

**Scope:** Full working tree at `C:\Users\User\deposito-seguro`, excluding `node_modules/`, `.kilo/`, `.qodo/`, and generated build output (`dist/`, `.expo/`). The generated (but real, on-disk, gitignored) `android/` folder was inspected directly for several findings; no `ios/` folder exists on disk (never prebuilt for this platform).

**Method:** Read-only static analysis (near-full reads of every store, service, security module, config plugin, screen, and component touched by a prior finding or a new feature) **plus, new in this pass, executed validation commands** — `npx tsc --noEmit`, `npx expo lint`, `npx jest --ci`, `npx expo-doctor` were all run to completion and their output captured verbatim (summarized in §13). This upgrades several claims from "static only" to "executed evidence," which the prior audit explicitly could not do.

**Explicitly NOT performed:**
- No app build, no install on a device/emulator, no runtime execution of any user flow (login, import, viewer, backup). Whether the app actually launches, authenticates, imports a file, or completes a backup/restore round-trip on a real device is **Not verifiable** by this audit — "Statically complete" and "tests pass" are not equivalent to a confirmed working runtime experience.
- No access to Play Store listings, EAS build logs, or any external service.
- `expo-doctor`'s SDK-compatibility check required network access to Expo's registry and succeeded; this is the one command in this pass with an external dependency.
- No PII, secrets, or credentials were found anywhere in the repository; none are disclosed in this report.

---

## 3. Project Purpose and Actual Behavior

**Target user:** unchanged from the prior audit — an individual hiding personal photos/videos/documents on their own Android device from casual access, via a "vault"/"gallery lock" app disguised as a calculator.

**Core problem solved (as implemented):** local, on-device concealment with **now-real cryptographic protection** (previously light-weight/cosmetic), still not hardened against a sophisticated attacker with forensic tooling and physical device access (e.g., a rooted device could still read the SecureStore-backed keystore if the OS keystore itself is compromised — an inherent platform limit, not a code defect).

**Core user workflows confirmed in code (updated):**
1. First-run PIN setup — now a 5-step branded wizard (`onboarding.tsx` → `register.tsx`: pin → confirm → hint → sealed) → `dashboard.tsx`.
2. Return visits: calculator-disguise or PIN-pad unlock (`login.tsx`, brute-force-protected) → `dashboard.tsx`.
3. Import files (`DocumentPicker` → `vaultStore.importFile`, storage-limit-checked, real per-file encryption on request); `.apk` files additionally get their real launcher icon auto-extracted for display.
4. Browse/search/filter/**preview** — new: PDF/DOCX/XLSX/ODT files can now be viewed in-app via an offline WebView pipeline instead of only "open externally."
5. Soft-delete to Trash, restore (with an honestly-surfaced protection-inheritance caveat) or permanently shred.
6. Local backup export/import — now a **real ZIP archive** (JSZip) with an optional passphrase-protected export of the actual access/encryption key material, plus a real OS folder picker (Android SAF) alongside the sandbox-only path.
7. Settings: theme, disguise mode, per-item access/encryption keys, auth-key management, and a **new storage-usage-limit** feature with a live device-storage display.

**Gap between documentation claims and actual code:** largely closed. The stale root markdown files that previously self-reported "PASSED" audits with no test backing (`FILE_PASSWORD_VERIFICATION_TEST.md`, `BACKUP_AUDIT_REPORT.md`) have been **deleted**, replaced by a real, passing automated test suite. One stale doc remains: `AGENTS.md` still directs readers to Expo's **v56** docs ("Expo HAS CHANGED... Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/") even though the project has been on SDK **57** since before this audit began — a small but real instruction-file/reality mismatch that could send a future contributor (human or AI) to the wrong API reference.

**Architecture (as actually implemented):**

```text
User
  ↓
Screens (src/app/(auth)/*, src/app/(main)/*) — expo-router file-based routing, Stack-based nav in (main)
  ↓
Contexts (Theme, Rename, MoveVault, Hydration) + Zustand stores
  (authStore, lockoutStore, settingsStore, vaultStore)
  ↓
Services (StorageService — file I/O + real AES-256 encryption; EnhancedBackupService — real ZIP + key
  export; apkIconExtractor; documentViewers — offline WebView-based PDF/DOCX/XLSX/ODT rendering)
  ↓
Device-local persistence only:
  - expo-secure-store (PIN hash+salt, access-key/encryption-key secret material — sole copy)
  - AsyncStorage (vault index: folders/files/clipboard; settings — secrets now redacted before write)
  - expo-file-system app sandbox (file bytes, real AES-256-CBC+HMAC when encrypted; APK icon
    thumbnails, unencrypted)
  ↓
No network / no backend / no external database — confirmed absent (INTERNET permission blocked)
```

---

## 4. Repository Structure and Active Components

| Path | Role | Status |
|---|---|---|
| `src/app/(auth)/*` | Onboarding (5-step wizard), register, lock, login (incl. calculator disguise) | Active |
| `src/app/(main)/*` | Dashboard, favorites, search, trash, folder/[id], viewer/{image,video,document}, settings/{index,access-keys,auth-key,customization,storage} | Active |
| `src/components/*` (top-level, ~16 files) | UI building blocks (modals, headers, tab bar) | Active — the previously-identified dead components (`ResponsiveText`, `AnimatedPressable`, `AnimatedScreen`, `SafeAreaScreenWrapper`, `GridListToggle`, `AnimatedModal`) have been **deleted**, not just left unreferenced |
| `src/components/primitives/*` | Design-system primitives (Badge, Button, Sheet, GridTile, FileTypeIcon, TopToast, etc.) | Active |
| `src/components/documentViewer/*` (new) | `PdfViewer`, `FlowDocViewer` (DOCX/ODT), `SheetViewer` (XLSX), `TextPageViewer`, `ViewerProgressPill` | Active |
| `src/components/onboarding/*` (new) | `BrandHeader`, `OnboardingProgress`, `PinDots`, `PinKeypad` — pure presentational, no effects/loop risk | Active |
| `src/contexts/*` (4 files) | Theme, Rename, MoveVault, Hydration | Active — `UnlockContext.tsx` has been **deleted** (previously dead code) |
| `src/hooks/*` (2 files) | `useFileSystemQuery`, `useScreenEnterAnimation` | Active — the previously-dead `useResponsive`, `useBreakpoint`, `useOrientation`, `useScreenFadeTransition` have been **deleted** |
| `src/store/*` (4 files) | `authStore`, `lockoutStore`, `settingsStore`, `vaultStore` (Zustand) | Active; the dead parallel `authKey` subsystem in `settingsStore.ts` has been **deleted** |
| `src/services/*` | `storage.ts` (file I/O + real crypto, one residual fallback issue — see §10), `backupService.ts`/`backup.ts` (real ZIP + key export), `apkIconExtractor.ts` (new), `documentViewers/*` (new, 6 modules + 3 vendored library-source files) | Active |
| `src/security/crypto.ts` | PBKDF2 + AES-256-CBC/HMAC, CSPRNG, constant-time compare | Active — fully rewritten since baseline |
| `src/constants/storageLimits.ts` (new) | Storage-limit preset options, formatting/disabling helpers | Active |
| `plugins/withDisguiseIcon.js`, `plugins/withVideoRemux.js` (new) | Expo config plugins generating the native disguise-icon/`FLAG_SECURE`/video-remux Kotlin modules at prebuild | Active, committed, confirmed to match the on-disk generated `android/` tree |
| `scripts/generate-viewer-vendor.js` (new) | Build-time script regenerating vendored pdf.js/mammoth sources for the offline document viewers | Active but manual — not wired into any `package.json` script; must be re-run by hand after bumping `pdfjs-dist`/`mammoth` |
| `src/**/__tests__/*.test.ts` (new, 7 files, 681 lines) | Jest test suite for crypto, lockout, auth, backup, storage, vaultStore, calculator-expression parsing | Active, **executed in this audit — 52/52 passing** |
| `.github/workflows/ci.yml` (new) | CI: `npm ci` → `tsc --noEmit` → `expo lint` → `jest --ci` → `expo-doctor`, on push/PR to `main` | Active |
| `android/` | Real, on-disk, gitignored, CNG-generated native Android project — confirmed to be plugin-generated (not hand-maintained) and consistent with `plugins/withDisguiseIcon.js`/`withVideoRemux.js` | Active, generated |
| `ios/` | Absent — never prebuilt | N/A |
| `app.json.bak`, `tsc_out.txt` (0 bytes) | Stale artifacts flagged in the prior audit | **Deleted** — no longer present |
| `FILE_PASSWORD_VERIFICATION_TEST.md`, `BACKUP_AUDIT_REPORT.md` | Root docs with unverifiable "PASSED" claims | **Deleted** — replaced by the real test suite |
| `LICENSE` | Previously unedited Expo-template boilerplate | **Updated** — now `Copyright (c) 2026 KingJaqar` |
| `AGENTS.md` | AI-agent instruction file | Active but **stale** — still points at Expo v56 docs; project is on SDK 57 |
| `plans/deposito-seguro-audit-report.md` | Prior full audit (2026-08-26 baseline) | Reference document, preserved for history |
| `plans/you-are-a-senior-majestic-swing.md` | A separate, unrelated, in-progress plan for a full UI/design-system teardown | Not part of this audit's scope; noted as context only |
| `design images as reference output/` | UI mockup PNGs (calculator, lock, onboarding flow) | Design reference assets, not code |
| `.kilo/`, `.qodo/` | Third-party AI-tool session state | Tooling metadata; now correctly excluded by root `.gitignore` (was a latent risk in the prior audit, now fixed) |

---

## 5. Technology Stack and Dependencies

| Layer | Technology | Classification |
|---|---|---|
| Framework | Expo `^57.0.9` (managed/CNG), React Native `0.86.2`, React `19.2.3` | Actively used |
| Routing | expo-router `~57.0.16` (file-based; `(main)` now uses `<Stack>` with per-screen transition config, was `<Slot>`) | Actively used |
| State | zustand `^4.5.2` (no persistence middleware; hand-rolled AsyncStorage/SecureStore glue, largely hardened since baseline) | Actively used |
| Animation | react-native-reanimated `4.5.1` + `react-native-worklets` `0.10.1`, `react-native-gesture-handler` `~2.32.0` | Actively used |
| Crypto | `crypto-js ^4.2.0` (PBKDF2, AES-CBC, HMAC-SHA256), `expo-crypto ~57.0.2` (CSPRNG) | Actively used, now correctly applied (was misapplied at baseline) |
| Storage | `@react-native-async-storage/async-storage 2.2.0`, `expo-secure-store ~57.0.1` | Actively used, secrets no longer duplicated |
| File system | `expo-file-system ~57.0.5` (`/legacy` API) | Actively used |
| Document viewers (new) | `xlsx ^0.18.5` (SheetJS, runtime dep), `react-native-webview 13.16.1`; `pdfjs-dist ^3.11.174` and `mammoth ^1.9.1` (devDependencies only — vendored into the bundle at build time, never fetched at runtime) | Actively used |
| Archives | `jszip ^3.10.1` — real backup ZIPs, ODT unzipping, APK icon extraction | Actively used |
| Media/pickers | `expo-document-picker`, `expo-image-picker`, `expo-media-library`, `expo-video`, `expo-sharing`, `react-native-blob-util` | Actively used |
| Icons | `lucide-react-native ^1.21.0`, `@expo/vector-icons` | Actively used |
| Biometrics | *(none)* — `expo-local-authentication` still not a dependency | **Not present**; `USE_BIOMETRIC`/`USE_FINGERPRINT` are now explicitly **blocked** via `app.json`'s `blockedPermissions` (previously just declared-but-unused) — consistent, no longer a stale-permission risk |
| Backend/Cloud | *(none)* | **Not present** — confirmed via repo-wide grep, unchanged from baseline |
| Testing | Jest `~29.7.0` + `jest-expo ~57.0.4` | **New since baseline** — 7 suites, 52 tests, all passing (executed in this audit) |
| CI/CD | GitHub Actions (`.github/workflows/ci.yml`) | **New since baseline** — was entirely absent |
| Build/tooling | TypeScript `^6.0.3` (`strict: true`), ESLint 9 (`eslint-config-expo/flat`), Babel, Metro | Actively used; `tsc --noEmit` now confirmed clean (executed) |
| Distribution | EAS (`eas.json`) | Only a `preview`/internal-APK profile exists — unchanged, still no production profile |

**Dependency-freshness (executed evidence, `npx expo-doctor`):** 20/21 checks pass. The one failure lists 14 packages a **minor patch version** behind their SDK-57-recommended target (e.g. `expo 57.0.16` vs recommended `~57.0.18`, `react-native 0.86.2` vs `0.86.3`) — routine drift, not a compatibility break; fixable with `npx expo install --check`.

---

## 6. Current Architecture and Data Flow

```text
App.tsx (ExpoRoot)
  → src/app/_layout.tsx: mounts Hydration/Theme/Rename/Move providers, kicks off
     settingsStore.hydrateSettings() + vaultStore.hydrateVault() in parallel,
     calls setFlagSecure(true) on boot if screenshotProtection is on (now default-on),
     awaits initializeDisguiseIcon() — still an empty no-op stub (unfixed, see §11 I-14)
  → src/app/index.tsx: redirect → (auth)/onboarding
  → (auth)/onboarding.tsx: single-run checkSetup() effect (loop bug fixed) decides:
       not configured → register.tsx (5-step PIN wizard)
       configured, not authenticated → lock.tsx → login.tsx (PIN, lockout-protected, or calculator disguise)
       configured, authenticated → (main)/dashboard.tsx
  → (main)/_layout.tsx: render-time `if (!isAuthenticated) return <Redirect .../>` guard (now present),
       Stack-based nav (was Slot), AppState listener re-locks on background timeout
  → (main)/* screens ↔ vaultStore / settingsStore (CRUD, search, favorites, trash, storage-limit checks)
       ↔ StorageService (real AES-256-CBC+HMAC encrypt/decrypt, one fallback caveat — §10)
       ↔ EnhancedBackupService (real ZIP, optional passphrase-protected key export, SAF folder picker)
       ↔ apkIconExtractor (plaintext icon cache — new privacy finding, §11)
       ↔ documentViewers (offline WebView PDF/DOCX/XLSX/ODT rendering, temp-file cleanup on unmount)
  → Persistence: AsyncStorage (vault index + settings, secrets now redacted before write — some writes
       still fire-and-forget, §11 I-11), expo-secure-store (PIN hash+salt, sole copy of all key secrets),
       expo-file-system sandbox (file bytes + plaintext APK icon thumbnails)
```

No network layer, no server, no external database exists anywhere in this flow.

---

## 7. Complete Feature Inventory

| Feature | UI Location | Frontend Logic | Service/Backend | Data Storage | Validation | Loading/Error Handling | Auth/Authorization | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| First-run PIN setup (5-step wizard) | `onboarding.tsx` → `register.tsx` | Wizard state machine `pin→confirm→hint→sealed` | `authStore.initializeVault` (PBKDF2) | SecureStore | `validatePin` | Per-step, plus sealed-state stats | N/A (setup) | Statically complete | `src/app/(auth)/register.tsx`, `src/store/authStore.ts:80-100` |
| PIN unlock (standard + calculator disguise) | `login.tsx` | `authenticate()` | `authStore.ts:101-137` | SecureStore | `validatePin` | Lockout-aware alert | **Lockout enforced** | Statically complete | `src/store/authStore.ts:101-137`, `src/app/(auth)/login.tsx:104-117` |
| Auto-lock on background + render guard | `(main)/_layout.tsx` | `AppState` listener + render-time `Redirect` | `authStore.terminateSession` | In-memory | N/A | Silent | Time-based **and** render-time guard | Statically complete | `src/app/(main)/_layout.tsx:57-64` |
| Import file (+ storage-limit check) | `folder/[id].tsx` | `DocumentPicker` → `importFile()` | `vaultStore.ts:346` (`assertWithinStorageLimit`, before I/O) | AsyncStorage index + FS sandbox | File-type inferred, size-limit checked | Alerts incl. tailored `StorageLimitExceededError` | Vault-level | Statically complete | `src/store/vaultStore.ts:162-172,346` |
| APK icon auto-extraction | Grid/list tiles for `.apk` files | Automatic on import | `apkIconExtractor.ts` | FS sandbox, **unencrypted** PNG | Best-effort, never throws | Silent fallback to generic icon | None | Statically complete, but see privacy finding §11 | `src/services/apkIconExtractor.ts:68-96`, `src/store/vaultStore.ts:371` |
| Folder/file CRUD | Dashboard/Favorites/Search/Folder | Store actions | `vaultStore.ts` | AsyncStorage (now awaited for folders/files) | Basic | Alerts, empty states | Vault-level | Statically complete | `src/store/vaultStore.ts:208-260` |
| Document preview (PDF/DOCX/XLSX/ODT) — **new** | `viewer/document.tsx` | Decrypt-to-temp → route by kind → WebView/native render | `documentViewers/*`, offline-bundled pdf.js/mammoth/SheetJS | Temp plaintext file, **cleaned up on unmount** | Per-format error handling | Loading pill + error card per viewer | Decrypt-gated | Statically complete | `src/app/(main)/viewer/document.tsx:109-151`, `src/components/documentViewer/*` |
| Search/filter/sort | Search, Trash | Debounced local filter | `useFileSystemQuery` | In-memory | N/A | Empty/no-results states | Vault-level | Statically complete | `src/hooks/useFileSystemQuery.ts` |
| Trash / restore / permanent delete | `trash.tsx` | Store actions | `vaultStore.ts:421-473` | AsyncStorage | N/A | Empty state, honestly-surfaced fallback-folder warning | Vault-level | Statically complete (protection-inheritance gap now disclosed, not silent) | `src/store/vaultStore.ts:421-473` |
| File export/share (Favorites/Search) | `favorites.tsx`, `search.tsx` | Real `exportFileToDevice`/`exportFolderFiles` | `StorageService` | Temp decrypted file | N/A | Toast/alert | Vault-level | **Now Statically complete** (was a placeholder alert) | `src/app/(main)/favorites.tsx:333-336,414-419` |
| Per-item access key (password) | Dashboard/Favorites/Search/Folder + `settings/access-keys.tsx` | `AccessKeyPicker`, modals | `settingsStore.createAccessKey` etc. | **SecureStore only** (AsyncStorage redacted) | Password policy | Persisted lockout | Per-item, constant-time compare (one exception — §10) | Statically complete | `src/store/settingsStore.ts:133-145,225-230` |
| Per-item / per-folder encryption | Same screens | `assignFileEncryptionKey`/`assignFolderEncryptionKey` | Real AES-256-CBC+HMAC, folder-level now cascades to file bytes | SecureStore (key) + FS sandbox (ciphertext) | Key length | N/A | Per-item | Statically complete (was metadata-only for folders — now fixed) | `src/store/vaultStore.ts:651-681,748-760` |
| File "encryption" at rest | `StorageService.encryptSandboxFile`/`decryptSandboxFile` | Real AES-256-CBC+HMAC | `crypto.ts:139-183` | Sandbox FS | none | Errors bubble to caller | N/A | Statically complete, **with a residual fallback caveat** (byte-reversal when no key supplied) | `src/services/storage.ts:84-111` |
| Backup export (real ZIP + optional key export) | `settings/index.tsx` → `FolderPicker`/SAF | `handleExport`/`handleBackupConfirm` | `EnhancedBackupService.createBackupInFolder`, real `JSZip` | Real `.zip` on device, optional passphrase-encrypted key material inside manifest | Manifest schema validated | Progress + passphrase-retry dialog | Vault-level | **Now Statically complete** (was fake-zip, no keys) | `src/services/backupService.ts:132-300,378-467` |
| Backup import/restore | `settings/index.tsx` → `handleImport` | `EnhancedBackupService.restoreBackup` | Decrypts + restores key material when passphrase supplied | Overwrites vault index | Manifest checked | Progress + result alert | Vault-level | Statically complete | `src/services/backupService.ts:378-467` |
| Theme / customization | `settings/customization.tsx` | `settingsStore.updateSetting` | n/a | AsyncStorage | n/a | n/a | n/a | Statically complete | `src/store/settingsStore.ts` |
| App-icon disguise + `FLAG_SECURE` | `settings/index.tsx` | Native module calls | `plugins/withDisguiseIcon.js`-generated Kotlin, real config plugin now | Activity-alias enable/disable | n/a | n/a | n/a | Statically complete, **CNG-safe now** (N-1 fixed) | `plugins/withDisguiseIcon.js`, generated `android/` tree |
| Storage usage / limit — **new** | `settings/storage.tsx`, dashboard widget | `storageLimits.ts` presets, `getStorageQuotaInfo()` | Real device free/used/total via `expo-file-system` | AsyncStorage (setting) | Device-capacity-aware option disabling | Loading/error states present | n/a | **Partially implemented** — enforced on import, **not** on copy/paste/duplicate despite code comments claiming otherwise (new finding) | `src/store/vaultStore.ts:162-172,346,1056-1101` |
| Authentication-key management | `settings/auth-key.tsx` | Reuses `authStore` (the real, now-sole PIN system) | `authStore.ts` | SecureStore | n/a | Alerts | Vault-level | Statically complete; parallel dead subsystem **removed** | `src/app/(main)/settings/auth-key.tsx` |
| Biometric unlock | *(none)* | n/a | n/a | n/a | n/a | n/a | n/a | Not present (permission now consistently blocked, not just unused) | `app.json:40-41` |
| Automated tests | `src/**/__tests__/*.test.ts` | n/a | n/a | n/a | n/a | n/a | n/a | **Executed-working** — 52/52 passing, run in this audit | §13 |
| CI/CD | `.github/workflows/ci.yml` | n/a | n/a | n/a | n/a | n/a | n/a | Statically complete | `.github/workflows/ci.yml` |

---

## 8. Feature Trace Analysis

### 8.1 Vault unlock (PIN) — now lockout-protected
```
login.tsx → handleStandardAuth() → checks useLockoutStore.isLockedOut(PIN_LOCKOUT_KEY) first
  → authStore.authenticate(pin) → SecureCrypto.hashPassword (PBKDF2-HMAC-SHA256, 10k rounds)
  → SecureCrypto.secureCompare(verifyHash, storedHash) [constant-time]
  → success: resetAttempts(); set isAuthenticated; re-hydrate settings keys; router.replace(dashboard)
  → failure: recordFailedAttempt(); UI shows "Too Many Attempts / try again in Ns" once locked out
```
No broken links found. This closes the single highest-risk finding from the prior audit (S-1).

### 8.2 Document preview (new)
```
viewer/document.tsx → resolveDocKind() by mime/extension
  → decryptSandboxFile(localPath, key) → plaintext temp sibling file
  → route to PdfViewer/FlowDocViewer/SheetViewer/TextPageViewer, given the plaintext path
  → WebView renders fully offline (vendored pdf.js/mammoth sources inlined as <script>, no CDN)
  → on unmount: removeSandboxFile(decryptedUri) deletes the plaintext temp file
```
**Residual gap (Risk, not Confirmed exploit):** cleanup is a React-effect-cleanup call, which does not fire on an abnormal process termination (crash/force-kill) between decrypt and viewer close — a plaintext temp file could persist on disk in that narrow window with no independent sweep-on-next-launch to catch it. Low severity (same-device, same-sandbox exposure only) but real.

### 8.3 File import + real encryption + storage-limit check
```
folder/[id].tsx → DocumentPicker → vaultStore.importFile(uri, folderId, { encrypt, encryptionKeyId })
  → assertWithinStorageLimit(files, size, encrypt) [BEFORE any I/O; 1.4x padding for encrypted estimates]
  → StorageService.copyToSandbox(uri) → apkIconExtractor.extractApkIcon() if .apk (plaintext icon)
  → IF encrypt && encryptionKeyId resolves: StorageService.encryptSandboxFile() [real AES-256+HMAC]
     didEncrypt flag only set true on actual success (I-2 fixed — no more false "encrypted" badges)
  → metadata.isEncrypted = didEncrypt (honest); AsyncStorage write now awaited via commitVaultState()
```
**Confirmed gap:** `copyFileToFolder`/`duplicateFile` (paste/copy operations, the *other* way vault usage grows per the feature's own doc comment at `vaultStore.ts:13-17,156-160`) **never call** `assertWithinStorageLimit` — only `importFile` does. This directly contradicts the inline documentation and is untested by the otherwise-thorough `vaultStore.test.ts:189-266` storage-limit test block, which only exercises `importFile`.

### 8.4 Backup export (real archive now)
```
settings/index.tsx → handleExport() → BackupService.pickBackupFolder() [real Android SAF picker]
  → BackupConfirmDialog (optional passphrase) → createBackupInFolder()
     → per-file bytes copied (inherits existing encryption state)
     → createBackupManifest(): if passphrase given, PBKDF2-derives a key, AES-encrypts
        {accessKeys, encryptionKeys} secret material into manifest.keyMaterial
     → buildAndWriteZip(): real new JSZip(), manifest.json + entries, generateAsync({type:'base64', ...})
        → a genuine, externally-openable .zip file (I-3 fixed)
  → restoreBackup(): decrypts keyMaterial with the supplied passphrase, calls
     settingsStore.restoreKeysFromBackup() — encrypted content is now recoverable on a new device
     (D-2/D-3 fixed), gated by passphrase-retry UI on wrong passphrase
```
No broken links found.

### 8.5 Route protection
```
(main)/_layout.tsx now renders: if (!isAuthenticated) return <Redirect href="/(auth)/lock" />; before <Stack/>
```
The prior audit's Finding I-1 (funnel-only protection, no render-time guard) is fixed with a real guard, confirmed to still function correctly after the file's separate `<Slot>`→`<Stack>` navigation-transition change.

---

## 9. Frontend, Backend, Data, and Native Platform Assessment

**Backend:** Not present in the repository — confirmed again this pass, no new backend surface was introduced by any of the new features (document viewers, APK icon extraction, and backups are all pure on-device processing).

**Data/storage resource inventory:**

| Resource | Purpose | Fields/Types Observed | Readers | Writers | Validation | Authorization Evidence | Risks/Mismatches |
|---|---|---|---|---|---|---|---|
| SecureStore `MASTER_PASSWORD_HASH`/`SALT`/`SECURITY_HINT`/`PIN_LENGTH` | Master PIN auth | PBKDF2 hash, salt, hint, length | `authStore.checkSetup/authenticate` | `authStore.initializeVault` | `validatePin`, PBKDF2 (10k rounds) | Vault-level gate, **now lockout-protected** | Resolved (was S-1) |
| AsyncStorage `@vault_folders`/`@vault_files` | Vault index | `FolderMetadata`/`FileMetadata` incl. new `iconPath`, `isMissing` | All screens via `vaultStore` | `vaultStore.*`, now **awaited** via `commitVaultState` | Loose (`any` still used at some UI call sites) | UI-convention only | Writes now durable; `isEncrypted` now honest (was D-1) |
| AsyncStorage `@vault_settings` | App settings, access/encryption-key **metadata only** | `AccessKeyMetadata`/`EncryptionKeyMetadata` — `password`/`key` fields **redacted to `''`** before write | `settingsStore` | `settingsStore.persistSnapshot` — **still fire-and-forget** (`.setItem(...).catch(...)`, not awaited) | Password/key policy on create only | None at storage layer | Secrets no longer plaintext-duplicated (was S-2, fixed); write-durability gap remains open (part of I-11, unfixed for this store) |
| SecureStore per-key access/encryption entries | Sole copy of secret material | raw password/key strings | `loadAccessKeyValues`/`loadEncryptionKeyValues` | `settingsStore.create/updateAccessKey` etc. | Same as above | OS keystore | No longer redundant with a plaintext copy — resolved |
| `expo-file-system` sandbox `vault_sandbox/` | File bytes | AES-256-CBC+HMAC ciphertext when encrypted; plaintext otherwise | `StorageService` | `StorageService` | None | Vault-level (UI gate only) | Real encryption now (was S-3, fixed); **fallback byte-reversal when no key supplied** is a new, smaller-scope version of the same smell (new finding) |
| `expo-file-system` sandbox, `*.icon.png` | Plaintext APK launcher-icon cache | PNG bytes | `FileTypeIcon.getFileThumbnailUri` | `apkIconExtractor` | None | **None — never encrypted, even for encrypted `.apk` files** | **New privacy finding** — reveals hidden-app identity independent of the vault's encryption |
| AsyncStorage `@vault_lockouts` | Per-item + PIN lockout state | attempt counts, lockout timestamps | `lockoutStore` | `lockoutStore` | n/a | n/a | **Now persisted** (was S-5, fixed) |
| AsyncStorage `@vault_clipboard` | Copy/cut clipboard state | `ClipboardItem[]` | `vaultStore` | `vaultStore.persistClipboard` — **still fire-and-forget, un-awaited** | n/a | n/a | Smaller-scope residual instance of I-11, unfixed |

**Native platform (Android):** the custom native module (calculator-icon disguise, `FLAG_SECURE`) is now generated by a real Expo config plugin (`plugins/withDisguiseIcon.js`), confirmed CNG-safe and matching the currently-generated `android/` tree — this closes Finding N-1. The dead `shouldApplyFlagSecure` companion-var mechanism previously found in `MainActivity.kt` has been **deleted outright**, not just left unused. The generated manifest confirms `android:allowBackup="false"` and that all six previously-overprivileged permissions (`CAMERA`, `INTERNET`, `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `USE_BIOMETRIC`, `USE_FINGERPRINT`) are present with `tools:node="remove"`, correctly stripping them at manifest-merge time (closes S-8). No `ios/` directory exists to review.

---

## 10. Authentication, Authorization, and Security

This section re-verifies every Critical/Major finding from the prior audit's §10 against current code, then lists new findings surfaced by this pass.

### Carried-over findings — remediation status

| # | Original finding | Status | Evidence |
|---|---|---|---|
| S-1 | No brute-force lockout on master PIN | **Remediated** | `src/store/authStore.ts:101-137` checks/records via `useLockoutStore`; `src/app/(auth)/login.tsx:104-117` shows lockout-aware messaging |
| S-2 | Secrets duplicated into plaintext AsyncStorage | **Remediated** | `src/store/settingsStore.ts:133-145` (`buildPersistSnapshot`) redacts `password`/`key` before every write; secrets live only in SecureStore |
| S-3 | XOR "encryption" mislabeled AES-256 | **Remediated, with a caveat** | `src/security/crypto.ts:139-183` real AES-256-CBC+HMAC; **but** `src/services/storage.ts:89-91,103-105` falls back to `fileData.split('').reverse().join('')` when no key is supplied — see new Finding S-11 below |
| S-4 | Homemade 1000-round SHA-256 hash | **Remediated** | `src/security/crypto.ts:90-97`, PBKDF2-HMAC-SHA256, 10,000 rounds; confirmed sole hash-call path across `src/` |
| S-5 | In-memory-only per-item lockout | **Remediated** | `src/store/lockoutStore.ts` persists via AsyncStorage, hydrates and evicts expired lockouts on load |
| S-6 | `Math.random()` in security code | **Remediated** | `crypto.ts` uses `Crypto.getRandomBytes`/`getRandomBytesAsync` throughout; the only remaining `Math.random` hit in `src/` is a comment, not code |
| S-7 | Non-constant-time secret comparisons | **Partially Remediated** | `authStore.ts:118`, `AccessKeyUnlockModal.tsx:87`, and `crypto.ts`'s own HMAC check now use `secureCompare`/`constantTimeEqual`; **`src/app/(main)/settings/access-keys.tsx:101`** still does a plain `===` comparison of the entered verification password against the stored access-key secret on a destructive delete path |
| S-8 | Overprivileged/unused Android permissions, `allowBackup=true` | **Remediated** | Confirmed against the generated `android/app/src/main/AndroidManifest.xml`: all 6 permissions `tools:node="remove"`; `allowBackup="false"` |
| S-9 | Screenshot protection off by default; dead native `FLAG_SECURE` path | **Remediated** | `settingsStore.ts:164` defaults `screenshotProtection: true`; dead `shouldApplyFlagSecure` code deleted from `MainActivity.kt` entirely |
| S-10 | Storage-permission request fails open | **Remediated** | `src/services/backupService.ts:110-120` — catch block now sets `backupPermissionGranted = false`, explicitly citing S-10 |
| N-1 | Native module not CNG-safe | **Remediated** | `plugins/withDisguiseIcon.js`/`withVideoRemux.js` are real config plugins, wired into `app.json`, confirmed to match the on-disk generated `android/` tree |

**9 of 11 Critical/Major security findings fully remediated; 2 partially** (S-3's new fallback caveat, S-7's one leftover comparison).

### New findings (not in the original 21)

**Finding S-11 — Fallback "encryption" is a trivially-reversible byte-reversal, not real crypto**
- Classification: Confirmed · Severity: Major
- Evidence: `src/services/storage.ts:89-91` (`encryptSandboxFile`), `:103-105` (`decryptSandboxFile`) — `const transformed = encryptionKey ? await SecureCrypto.encrypt(...) : fileData.split('').reverse().join('')`.
- Verification basis: Static analysis (two independent agent passes both flagged this without prompting, cross-corroborated)
- Impact: any call to these functions without a key produces a `.enc`-suffixed file that is visually indistinguishable from a genuinely encrypted one but is reversible with zero effort — the exact "cosmetic protection mistaken for real encryption" failure mode the original S-3 finding described, now reproduced as an edge case inside the otherwise-correct new crypto path.
- Recommended fix: throw instead of silently falling back when no key is supplied; callers should never invoke these functions expecting encryption without one.
- Confidence: Medium (not exhaustively traced whether any current caller can reach this branch in practice — recommend a follow-up call-site audit).

**Finding S-12 — Plaintext APK-icon thumbnail leaks the identity of an "encrypted" hidden app**
- Classification: Confirmed · Severity: Major
- Evidence: `src/services/apkIconExtractor.ts:68-96` writes the extracted icon via `FileSystem.writeAsStringAsync(outputPngPath, ...)` with no encryption step; `src/store/vaultStore.ts:371` runs this **before** the encryption branch and never re-visits `iconPath`; `src/components/primitives/FileTypeIcon.tsx:59-64` renders `file.iconPath` directly with no decrypt step. `copyFileToFolder` (`vaultStore.ts:1073-1086`) propagates a second unencrypted copy on duplicate.
- Verification basis: Static analysis
- Impact: a user who marks a hidden `.apk` as "encrypted" still has its real launcher icon sitting in plaintext in the same sandbox directory — anyone with filesystem access (not just someone who has unlocked the vault) can identify which app is hidden, undermining the encryption's purpose for this file type specifically.
- Recommended fix: either encrypt the icon PNG under the same key as the `.apk` (decrypt it alongside the file for display), or don't cache/render the extracted icon at all for files the user has marked encrypted.
- Confidence: High.

**Finding S-13 — Zip-slip is not exploitable in the APK-icon extractor (confirmed safe, documented for completeness)**
- Classification: Confirmed (safe) · Severity: N/A (this is a clean-bill finding, not a defect)
- Evidence: `src/services/apkIconExtractor.ts:68-96` — the only filesystem write target (`outputPngPath`) is caller-supplied, never derived from any zip-entry name; zip-entry paths are only used as in-memory strings for scoring which icon to pick.
- Verification basis: Static analysis
- Confidence: High.

**No hardcoded credentials, API keys, or backend secrets were found anywhere in the repository** (repo-wide grep, consistent with the prior audit).

---

## 11. Inconsistencies, Bugs, and Risks

### Carried-over findings — remediation status

| # | Original finding | Status | Evidence |
|---|---|---|---|
| L-1 | Infinite re-render loop stuck onboarding on the loading screen at first launch | **Remediated** | `src/app/(auth)/onboarding.tsx:31-53` — the setup effect now has `[checkSetup]`-only deps; the 8s timeout reads live state via `useAuthStore.getState().isLoading` instead of a closed-over prop; the redirect effect is fully decoupled |
| I-1 | No render-time auth guard on `(main)/_layout.tsx` | **Remediated** | `src/app/(main)/_layout.tsx:57-64`, real `Redirect` guard, confirmed compatible with the new Stack-based nav |
| I-2/D-1 | `isEncrypted` set unconditionally regardless of actual encryption success | **Remediated** | `src/store/vaultStore.ts:377-398` — `didEncrypt` flag only true on confirmed success |
| I-3/D-2/D-3 | Fake `.zip` backup, no key export, unused native folder picker | **Remediated** | `src/services/backupService.ts:132-300,378-467` — real JSZip archive, passphrase-protected key export/restore, SAF picker wired into `settings/index.tsx` |
| I-4 | Two unreconciled `authKey` systems | **Remediated** | Dead subsystem fully removed from `settingsStore.ts`; `auth-key.tsx` is the sole system |
| I-5 | `UnlockContext` dead code | **Remediated (deleted)** | File no longer exists under `src/contexts/` |
| I-6 | 6 dead components, 4 dead hooks | **Remediated (deleted)** | Confirmed absent via directory listing |
| I-7 | Duplicated responsive-layout formula in ThemeContext | **Remediated** | `src/contexts/ThemeContext.tsx:75-169`, single `computeResponsiveTheme()`, computed once and shared via context |
| I-8 | Favorites/Search "Export" was a placeholder alert | **Remediated** | Now calls real `exportFileToDevice`/`exportFolderFiles` |
| I-9 | Folder-level "encrypt" was metadata-only | **Remediated** | `assignFolderEncryptionKey` now cascades real encryption to every member file |
| I-10 | `toggleFolderEncryption` couldn't toggle off | **Remediated** | Now genuinely flips `isEncrypted` when a key is present |
| I-11 | Pervasive un-awaited fire-and-forget AsyncStorage writes | **Partially Remediated** | `vaultStore.ts`'s folder/file writes now go through an awaited `commitVaultState()`; **`vaultStore.ts`'s `persistClipboard`** (lines 810-876) and **all of `settingsStore.ts`'s `persistSnapshot`** (lines 147-151, confirmed directly in this audit) remain fire-and-forget, un-awaited `.setItem(...).catch(...)` |
| I-12 | Trash-restore doesn't preserve folder-level protection | **Partially Remediated** | Underlying behavior unchanged (a file whose original folder is gone still lands in an unprotected "Restored Files" folder), but this is now honestly surfaced to the UI as a `landedInFallbackFolder` warning rather than silently misrepresented |
| I-13 | Hardcoded fake storage-usage numbers | **Remediated** | `getStorageQuotaInfo()` now returns real device/vault usage; dashboard/settings both consume real data and factor in the new storage-limit setting |
| I-14 | `initializeDisguiseIcon()` empty stub called on every boot | **Not Remediated** | `src/utils/disguiseIcon.ts:44-46` is still just a comment; `src/app/_layout.tsx:65` still awaits it unconditionally — unchanged from the original report |
| I-15/I-16 | Stale/unverifiable "PASSED" markdown docs | **Remediated** | Both docs deleted, replaced by a real, executed, passing test suite |
| I-17 | Stale `app.json.bak` | **Remediated (deleted)** | File no longer present |
| I-18 | Unedited MIT LICENSE boilerplate | **Remediated** | Now attributed to the actual author |
| I-19 | Byte-identical `index.tsx` files | **Remediated** | `(main)/index.tsx` now redirects to `dashboard` specifically, with a comment explaining why given I-1's guard |
| I-20 | `Function()` eval on user-typed calculator input | **Remediated** | Replaced by a real recursive-descent parser (`src/utils/calculatorExpression.ts`), with an explicit anti-regression test asserting an injection payload throws instead of executing |
| I-21 | `.kilo/` not excluded by root `.gitignore` | **Remediated** | `.kilo/`/`.qodo/` now explicitly listed |

**18 of 21 inconsistency findings fully remediated; 2 partially; 1 (I-14) not remediated at all.**

### New findings (not in the original 21)

**Finding I-22 — Storage-limit enforcement doesn't match its own documentation: copy/paste/duplicate bypass the limit entirely**
- Classification: Confirmed · Severity: Major
- Evidence: `src/store/vaultStore.ts:13-17,156-160` (doc comments) explicitly claim the limit is "shared by `importFile` ... and `copyFileToFolder` (paste-copy / duplicate — the other way vault usage grows)"; but `assertWithinStorageLimit` has exactly one call site in the whole file, `vaultStore.ts:346`, inside `importFile`. `copyFileToFolder` (`vaultStore.ts:1056-1101`) never calls it.
- Verification basis: Static analysis, confirmed by grep for the function's call sites
- Impact: a user can exceed their configured storage limit indefinitely via paste/duplicate operations, silently contradicting the feature's own stated design and the dashboard's "near/over limit" warnings, which would then under-represent actual growth vectors. Untested by the existing `vaultStore.test.ts:189-266` storage-limit suite, which only exercises `importFile`.
- Recommended fix: call `assertWithinStorageLimit` from `copyFileToFolder`/`duplicateFile` as well, before the copy; add a test for this path specifically.
- Confidence: High.

**Finding I-23 — Five real ESLint errors, never caught because lint was never run pre-merge**
- Classification: Confirmed · Severity: Medium
- Evidence (executed, `npx expo lint`, exit code 1):
  - `src/app/(main)/search.tsx:130` — `setState` called synchronously inside a `useEffect` body (`react-hooks/set-state-in-effect`)
  - `src/app/(main)/settings/storage.tsx:138` — unescaped `'` in JSX text (`react/no-unescaped-entities`)
  - `src/app/(main)/viewer/video.tsx:206` — same setState-in-effect pattern
  - `src/components/primitives/Sheet.tsx:113` — a ref's `.current` is mutated during render (`react-hooks/refs`)
  - `src/components/primitives/Sheet.tsx:124` — same setState-in-effect pattern
- Verification basis: Executed (`npx expo lint`, this audit)
- Impact: the setState-in-effect and ref-during-render patterns are the exact class of bug that caused the original L-1 infinite-loop finding (a `useEffect` triggering a state update that can cascade). None of the current instances is confirmed to loop, but they are the same anti-pattern family and are flagged by the framework's own lint rule — worth checking each individually rather than assuming they're all benign.
- Recommended fix: address each; wire `expo lint` into a pre-commit hook or rely on the now-existing CI workflow, which already runs it on every push/PR to `main` (so these would be caught going forward — this is a gap in when they were introduced, not an ongoing blind spot).
- Confidence: High (execution evidence, not inference).

---

## 12. Code Quality and Technical Debt

- **TypeScript strict mode is on and `tsc --noEmit` is confirmed clean** (executed, exit 0) — a real improvement over the prior audit, which could not verify this.
- **16 ESLint warnings** (executed evidence): mostly unused variables/imports (`ThemeContext.tsx`, `crypto.ts`, `vaultStore.ts`, `accessKeyValidation.ts`, `disguiseIcon.ts`, `responsive.ts`) and two `react-hooks/exhaustive-deps` warnings in `viewer/image.tsx`/`viewer/video.tsx`. Low severity, but real cleanup opportunities the CI workflow will now surface on every future push.
- **Dead-code volume has dropped sharply**: the prior audit's entire dead-code inventory (6 components, 4 hooks, 1 context, 1 parallel auth subsystem) has been deleted, not just left unreferenced — a genuine cleanup, not documentation drift.
- **`scripts/generate-viewer-vendor.js` is a manual step**, not wired into any `package.json` script or CI job — a future `pdfjs-dist`/`mammoth` version bump could silently leave the vendored bundle stale unless someone remembers to re-run it by hand.
- **`AGENTS.md` is stale**: still tells readers (including AI agents) to consult Expo's v56 docs; the project has been on SDK 57 since before this audit. Low severity but directly actionable — a one-line fix.
- **Two tsconfig files** (`tsconfig.json`, `tsconfig.all_src.json`) still coexist with no documented reason for the split — unchanged from the prior audit, not re-investigated in depth this pass.
- **Residual fire-and-forget persistence** (I-11's uncovered half) is the most significant remaining code-quality/reliability gap: `settingsStore.ts`'s `persistSnapshot` and `vaultStore.ts`'s `persistClipboard` can silently lose a write if the app is killed immediately after a settings/key change or a clipboard action, with only a `console.error` and no user-visible signal or retry.

---

## 13. Testing, Build, and QA Assessment

**Test inventory (executed, `npx jest --ci`, this audit):**

```
PASS src/utils/__tests__/calculatorExpression.test.ts (5.2s)
PASS src/store/__tests__/lockoutStore.test.ts (5.6s)
PASS src/services/__tests__/storage.test.ts (6.9s)
PASS src/security/__tests__/crypto.test.ts (10.0s)
PASS src/store/__tests__/authStore.test.ts (14.5s)
PASS src/store/__tests__/vaultStore.test.ts (19.9s)
PASS src/services/__tests__/backupService.test.ts (26.2s)

Test Suites: 7 passed, 7 total
Tests:       52 passed, 52 total
Time:        32.3s
```

Coverage assessed by direct reading: the suite is **meaningful, not smoke-only**, for what it covers — real encrypt/decrypt round-trips with wrong-key and tampered-ciphertext rejection assertions, real lockout persistence-across-restart tests, an explicit anti-regression test for the old code-injection calculator bug, and a thorough 6-test block on the new storage-limit feature (though notably **not** covering the `copyFileToFolder` gap in Finding I-22). **Coverage gap, unchanged from the prior audit:** zero UI/component/screen tests exist anywhere — no `@testing-library/react-native` usage found, so the entire document-viewer UI, the onboarding wizard, and the storage settings screen have no automated coverage of their rendered behavior, only of their underlying store/service logic.

**Build/validation commands — all four executed in this audit (the prior audit explicitly skipped all of these):**

| Command | Purpose | Result |
|---|---|---|
| `npx tsc --noEmit` | Type-check | **Clean, exit 0** — Executed evidence |
| `npx expo lint` | Lint | **5 errors, 16 warnings, exit 1** — Executed evidence (see Finding I-23) |
| `npx jest --ci` | Tests | **52/52 passed, exit 0** — Executed evidence |
| `npx expo-doctor` | Dependency/SDK compatibility | **20/21 checks passed** — 14 packages a minor patch version behind SDK-57 targets, exit 1 — Executed evidence |

**CI (`.github/workflows/ci.yml`, confirmed present and consistent):** runs `npm ci --legacy-peer-deps` → `tsc --noEmit` → `expo lint` → `jest --ci` → `expo-doctor` on every push/PR targeting `main`. This means the 5 lint errors and the patch-version drift found in this audit would already be visible in CI going forward — they predate the workflow's introduction or slipped in before it was consistently enforced, not an ongoing blind spot.

**Conclusion for this section:** build, type-check, lint, and test-suite correctness are now **executed and confirmed**, a material upgrade from the prior audit's "entirely unverified" status. Runtime correctness on a real device/emulator (does the app actually launch, authenticate, import, and render a preview end-to-end) remains **Not verifiable** by this audit — passing tests and clean static checks are strong but not equivalent evidence.

---

## 14. Missing or Incomplete Functionality

- `initializeDisguiseIcon()` remains a dead no-op stub, still called on every boot (I-14, unfixed).
- Storage-limit enforcement doesn't cover copy/paste/duplicate, contradicting its own documentation (I-22, new).
- The plaintext APK-icon cache undermines encryption for that file type specifically (S-12, new).
- `settingsStore.ts` and vault-clipboard persistence remain fire-and-forget, unlike the now-durable folder/file writes (I-11, partially open).
- One non-constant-time secret comparison remains on a destructive delete path (S-7, partially open).
- `storage.ts`'s no-key fallback is a cosmetic, reversible transform, not real encryption (S-11, new).
- No production EAS build profile exists — `eas.json` still only has `preview`.
- No biometric unlock (unchanged; the relevant permissions are now consistently blocked rather than declared-but-unused, so this is at least no longer a stale-permission inconsistency).
- No UI/component/screen-level automated test coverage exists for any feature, old or new.
- `scripts/generate-viewer-vendor.js` is a manual, unautomated step with no CI/script safeguard against staleness.
- `AGENTS.md` still references the wrong Expo SDK major version.

---

## 15. Functional Status Matrix

| Area | Status |
|---|---|
| App bootstrap / hydration | Statically complete |
| Onboarding / PIN setup | Statically complete — infinite-loop bug fixed |
| PIN unlock (standard + calculator disguise) | Statically complete — now lockout-protected |
| Auto-lock on background + render-time guard | Statically complete |
| Folder/file CRUD | Statically complete |
| Document preview (PDF/DOCX/XLSX/ODT) | Statically complete — offline, temp-file cleanup confirmed on normal exit |
| APK icon extraction | Statically complete, but see Finding S-12 (privacy leak) |
| Search / filter / sort | Statically complete |
| Trash / restore / shred | Statically complete — protection-inheritance gap now disclosed, not silent |
| Favorites/Search Export | Statically complete — was Broken/placeholder |
| Per-item access key | Statically complete — SecureStore-only now, one comparison still non-constant-time |
| Per-item / per-folder encryption | Statically complete — folder-level now cascades real encryption |
| File encryption at rest | Statically complete — real AES-256, with a residual fallback caveat |
| Storage-usage limit | **Partially implemented** — enforced on import only, not copy/paste/duplicate |
| Backup export/import | Statically complete — real ZIP, real key export/restore, real SAF picker |
| Theme / customization | Statically complete |
| App-icon disguise / screenshot protection | Statically complete — CNG-safe, default-on |
| Authentication-key settings | Statically complete — dead parallel system removed |
| Biometric unlock | Not present |
| Automated tests | **Executed-working** — 52/52 passing |
| CI/CD | Statically complete, consistent with its stated checks |
| Type-check / lint | **Executed** — tsc clean; lint has 5 real errors |
| Backend / cloud sync | Not present |

---

## 16. Development, Testing, and Production Readiness

| Track | Status | Rationale |
|---|---|---|
| **Development readiness** | **Ready for continued development** | Architecture remains coherent and is now cleaner (dead code removed); the security/crypto foundation is genuinely solid; the main remaining work is closing a handful of well-scoped gaps (I-14, I-22, S-7, S-11, S-12, I-11's remainder), not a structural rework. |
| **Testing readiness** | **Ready for systematic testing** | Upgraded from "Conditionally ready" — the app-breaking L-1 bug is fixed and confirmed, a real automated regression suite exists and passes, and `tsc`/`lint`/`jest`/`expo-doctor` all now run cleanly enough to trust as a baseline. The 5 lint errors (Finding I-23) are worth triaging before a deep manual QA pass, since 3 of them are the same setState-in-effect anti-pattern family as the original L-1 bug. |
| **Production readiness** | **Conditionally ready** | Upgraded from "Not ready." The core "secure vault" promise is now substantively real (PBKDF2 + AES-256-CBC/HMAC, persisted lockouts, redacted secret storage, CNG-safe native module). What remains before a genuine release: fix the plaintext APK-icon privacy leak (S-12) and the storage-limit bypass (I-22) since both directly contradict what the app tells the user it does; close the one leftover non-constant-time comparison (S-7); decide the fate of the `storage.ts` no-key fallback (S-11); and establish a production EAS build profile (still only `preview` exists). |

---

## 17. Prioritized Improvement Roadmap

| Priority | Improvement | Reason | Affected Files/Modules | Expected Benefit | Verification Method |
|---|---|---|---|---|---|
| **Critical** | Fix the plaintext APK-icon privacy leak | Undermines encryption's purpose for `.apk` files specifically (S-12) | `src/services/apkIconExtractor.ts`, `src/store/vaultStore.ts`, `src/components/primitives/FileTypeIcon.tsx` | Encrypted `.apk` files no longer reveal their identity via an unencrypted icon | Mark an `.apk` encrypted, inspect the sandbox directory for a plaintext `.icon.png` |
| **Critical** | Enforce the storage limit on copy/paste/duplicate | Directly contradicts the feature's own documentation (I-22); silent limit bypass | `src/store/vaultStore.ts` (`copyFileToFolder`, `duplicateFile`) | Storage-limit setting actually holds under every usage-growth path | Add the missing test case to `vaultStore.test.ts`'s storage-limit block; manual paste-past-limit test |
| Major | Remove or gate the `storage.ts` no-key encryption fallback | Cosmetic, reversible "protection" reproduces the original S-3 failure mode (S-11) | `src/services/storage.ts` | No code path can produce a `.enc` file that isn't actually encrypted | Call-site audit + unit test asserting the function throws without a key |
| Major | Fix the remaining non-constant-time secret comparison | Leftover instance of S-7 on a destructive delete path | `src/app/(main)/settings/access-keys.tsx:101` | Consistent constant-time comparison discipline everywhere secrets are checked | Code review + grep confirms zero remaining plain `===` on secret fields |
| Major | Finish I-11: await `settingsStore.ts`'s and vault-clipboard's persistence writes | Only half of the original fire-and-forget-writes finding was closed | `src/store/settingsStore.ts` (`persistSnapshot`), `src/store/vaultStore.ts` (`persistClipboard` + its 3 callers) | Settings/key changes and clipboard state survive an app kill immediately after mutation | Kill-and-relaunch test after a setting change |
| Major | Implement the still-dead `initializeDisguiseIcon()` or remove the call | Unfixed no-op from the original report, still awaited on every boot | `src/utils/disguiseIcon.ts`, `src/app/_layout.tsx` | Either delivers the intended behavior or removes dead weight from the boot path | Grep confirms real logic or removal |
| Medium | Triage the 5 ESLint errors, prioritizing the 3 setState-in-effect instances | Same anti-pattern family as the original L-1 app-breaking bug (I-23) | `search.tsx`, `viewer/video.tsx`, `Sheet.tsx` (×2), `settings/storage.tsx` | Removes a plausible source of future render-loop bugs before they manifest | `npx expo lint` returns 0 errors |
| Medium | Wire `scripts/generate-viewer-vendor.js` into a script/CI check | Currently a manual, unautomated step; vendored viewer libs can silently go stale | `package.json`, `.github/workflows/ci.yml`, `scripts/generate-viewer-vendor.js` | Vendored document-viewer libraries can't drift unnoticed from `package.json`'s devDependencies | CI fails if regenerated output differs from committed vendor files |
| Medium | Update `AGENTS.md` to reference SDK 57 (or de-version it) | Actively points AI agents/contributors at the wrong API docs | `AGENTS.md` | Future agent-assisted work references correct SDK docs | Manual review |
| Medium | Bring the 14 patch-version-behind packages current | `expo-doctor`'s one failing check; routine drift, not urgent | `package.json` | Clean `expo-doctor` baseline | `npx expo install --check` then re-run `expo-doctor` |
| Minor | Add UI/component test coverage for at least the 3 new major features (viewers, onboarding, storage settings) | Zero rendered-behavior test coverage exists anywhere in the app | New test files under `src/app/**/__tests__`, `src/components/**/__tests__` | A regression safety net beyond store/service logic | New tests run green in CI |
| Minor | Reconcile the two near-duplicate `tsconfig.json`/`tsconfig.all_src.json` files | Undocumented split, unchanged since the prior audit | root tsconfig files | One clear source of truth | Manual review |
| Minor | Establish a production EAS build profile | `eas.json` still only has `preview` | `eas.json` | A defined path to a store-ready release build | `eas build --profile production` succeeds |

---

## 18. Top 10 Next Actions

1. **Fix the plaintext APK-icon privacy leak (Finding S-12)** — encrypt the extracted icon under the same key as the `.apk`, or stop caching/rendering it for encrypted files.
2. **Close the storage-limit bypass on copy/paste/duplicate (Finding I-22)** — call `assertWithinStorageLimit` from `copyFileToFolder`/`duplicateFile`, matching the feature's own documentation.
3. **Remove or gate the no-key "encryption" fallback in `storage.ts` (Finding S-11)** — throw instead of silently byte-reversing.
4. **Fix the last non-constant-time secret comparison** at `src/app/(main)/settings/access-keys.tsx:101`.
5. **Await `settingsStore.ts`'s `persistSnapshot` and `vaultStore.ts`'s `persistClipboard`** to finish closing Finding I-11.
6. **Triage the 5 real ESLint errors** found by executing `npx expo lint` in this audit, starting with the 3 setState-in-effect instances (same bug family as the original L-1).
7. **Implement or remove `initializeDisguiseIcon()`** — it remains a dead no-op stub called on every boot.
8. **Update `AGENTS.md`** to stop directing contributors/agents to Expo's v56 docs; the project has been on SDK 57 throughout this audit.
9. **Wire `scripts/generate-viewer-vendor.js` into CI or a package script** so the vendored PDF/DOCX viewer libraries can't silently drift from `package.json`.
10. **Bring the 14 patch-version-behind dependencies current** via `npx expo install --check`, then re-run `expo-doctor` to confirm a clean 21/21.

---

## 19. Final Scorecard

| Category | Weight | Score | Evidence | Verification Limitations | Main factor holding score back |
|---|---|---|---|---|---|
| Functionality | 30% | 80/100 | Core workflows statically complete and now include working document preview, real backup portability, and honest error/status flags; storage-limit and APK-icon findings are real but narrowly scoped | Static + executed tests, no real-device runtime evidence | Storage-limit bypass on copy/paste; plaintext APK-icon leak |
| Architecture | 15% | 78/100 | Clean file-based routing, dead code removed, config-plugin-based native customization is now CNG-safe | Static only | Two near-duplicate tsconfigs; manual (unautomated) vendor-generation step |
| Backend/data integrity | 15% | 78/100 | Vault-core AsyncStorage writes are now durable/awaited; secrets no longer duplicated in plaintext | Static + one executed test suite covering this area | settingsStore/clipboard writes still fire-and-forget; trash-restore protection-inheritance gap persists (now disclosed, not fixed) |
| Security | 15% | 80/100 | 9 of 11 prior Critical/Major findings fully remediated with real cryptography, persisted lockouts, CNG-safe native module, redacted secret storage | Static analysis; no penetration test | Plaintext APK-icon leak (S-12), no-key encryption fallback (S-11), one leftover non-constant-time comparison (S-7) |
| Code quality | 10% | 75/100 | `tsc` clean (executed); dead code fully removed; CI now enforces quality gates going forward | Static + executed tsc/lint | 5 real lint errors, 16 warnings, all newly surfaced by actually running lint in this audit |
| Reliability/error handling | 5% | 68/100 | Vault-core writes durable; document-viewer and backup flows have real loading/error states | Static only | settingsStore/clipboard fire-and-forget writes; narrow decrypted-temp-file cleanup gap on abnormal termination |
| Testing | 5% | 75/100 | 52/52 tests passing (executed), meaningful assertions on security-critical paths, real CI enforcing this on every push | Executed for the covered areas; no runtime/device evidence | Zero UI/component/screen test coverage anywhere in the app |
| Maintainability/scalability | 5% | 72/100 | Dead code removed, module boundaries reasonable, CI now guards regressions | Static only | Stale `AGENTS.md` (wrong SDK version referenced), unautomated vendor-generation script |

**Overall Score: 78/100** *(up from 51/100 at the 2026-08-26 baseline)*

- **Development readiness:** Ready for continued development
- **Testing readiness:** Ready for systematic testing
- **Production readiness:** Conditionally ready

**Three highest-risk findings:**
1. **Finding S-12 — Plaintext APK-icon thumbnail leaks the identity of an "encrypted" hidden app** (`src/services/apkIconExtractor.ts:68-96`, `src/store/vaultStore.ts:371`, `src/components/primitives/FileTypeIcon.tsx:59-64`) — directly undermines the app's core promise for this specific file type.
2. **Finding I-22 — Storage-limit enforcement silently doesn't cover copy/paste/duplicate**, contradicting its own code comments (`src/store/vaultStore.ts:13-17,156-160,1056-1101`).
3. **Finding S-11 — The no-key "encryption" fallback in `storage.ts` is a trivially-reversible byte-reversal**, reproducing the spirit of the original (now otherwise-fixed) S-3 finding in a narrower, still-live code path.

**Top 10 next actions:** see §18 above.
