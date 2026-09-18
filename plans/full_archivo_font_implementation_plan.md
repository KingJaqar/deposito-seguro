# Full Archivo Font Implementation Plan

## Goal

Make Archivo the default typeface throughout the native Deposito Seguro UI, without Android font-weight crashes, synthetic bolding, launch flashes, or regressions in security-sensitive flows. The feature must remain safe in a production EAS APK.

## Decisions made before implementation

1. **One loading mechanism:** load the bundled Google-font assets at JavaScript boot with `expo-font`. This works on Android, iOS, and web and fits the existing hydration splash. We will not add a competing config-plugin font registration path.
2. **Exact faces, not synthetic weights:** each semantic weight maps to one registered Archivo family name. On Android, a custom `fontFamily` is never paired with a conflicting `fontWeight`.
3. **The primitive owns defaults:** native UI uses the shared `Text` primitive or an explicit `FontFamily` token. `TextInput` receives the token directly because it cannot use the text primitive.
4. **Preserve deliberate exceptions:** `fontFamily: 'monospace'` stays monospaced for PIN/calculator, counters, and technical document values. User document bodies rendered in a WebView/PDF preserve their source fonts; only their native viewer chrome is changed.
5. **Safe boot:** font assets load while the existing native/JS splash covers the app. A font-load failure is logged and leaves the app usable with system text rather than blocking vault access.

## Type scale

| Token | Face | Role |
| --- | --- | --- |
| `display` | Archivo Black | branded hero and exceptional large stats |
| `title`, `headline` | Archivo ExtraBold | screen and section headings |
| `subtitle` | Archivo Bold | subheads and strong actions |
| `body` | Archivo Medium | normal app copy and file names |
| `label`, `caption` | Archivo SemiBold | controls and metadata |
| `eyebrow` | Archivo Bold | uppercase category labels |

## Execution phases

### Phase 1 — Assets and launch gate

- Confirm the two Archivo packages and `expo-font` are installed.
- Register regular, medium, semibold, bold, extra-bold, black, and Archivo Black assets in `src/app/_layout.tsx`.
- Include loading in the existing hydration work before removing the JS boot splash.
- Add a deterministic Jest mock for `expo-font`.

**Acceptance:** no visible FOUT during normal launch; a failed font request reports an error but cannot make the vault inaccessible.

### Phase 2 — Typography contract

- Export `FontFamily`, `isArchivoFontFamily`, and `archivoFontFamilyForWeight` from `src/constants/typography.ts`.
- Attach the exact `fontFamily` to every `Type` token while retaining its semantic weight for compatibility with existing layout styles.

**Acceptance:** app code has one source of truth for registered names; no code imports a nonexistent `FontFamily` export.

### Phase 3 — Android-safe text primitive and inputs

- Complete `src/components/primitives/Text.tsx`.
- Flatten incoming styles, map a supplied standard `fontWeight` to an Archivo face, and remove that weight when the final face is Archivo.
- Respect any explicit non-Archivo family (especially `monospace`) and its weight.
- Apply a token font to `TextField` inputs.

**Acceptance:** custom Archivo text does not request a synthetic Android weight; styles such as alignment, truncation, and color survive merging.

### Phase 4 — Reusable UI and overlays

- Move primitives, headers, dialogs, pickers, toasts, and vault overlays onto the shared text contract.
- Replace direct native `Text` imports where appropriate. Keep native text only where an intentional non-Archivo family is declared locally.

**Acceptance:** common controls and every vault entry path use Archivo consistently.

### Phase 5 — Screens and viewer chrome

- Migrate auth, dashboard, favorites, trash, search, settings, folder/vault content, and viewer controls.
- Do not restyle user-controlled HTML/PDF/document content merely because it appears inside a viewer.

**Acceptance:** the native UI is fully covered while document fidelity and monospace interfaces are retained.

### Phase 6 — Release verification

- Run `npx tsc --noEmit --ignoreDeprecations 6.0`, `npm test -- --runInBand`, and the Android production bundle/export check.
- Build a fresh incremented EAS preview APK. Test a clean install and an update-over-previous-build install.
- Capture `adb logcat` during vault open; release only if there is no `FATAL EXCEPTION`, `ReactNativeJS` invariant, or font-family resolution error.

## Rollback and diagnosis

If the vault ever stops during the rollout, first collect `adb logcat -d -v time *:E ReactNative:V ReactNativeJS:V AndroidRuntime:E`, plus the EAS build logs and commit/build IDs. Disable only the font-load promise or revert the font commit; do not mask the crash with a broad error boundary. The previously fixed invalid `FontFamily` import in `TextField` must remain absent.
