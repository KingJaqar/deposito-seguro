# UI/UX Design Critique — Authentication Key Screens

> Files reviewed: `auth-key.tsx`, `access-keys.tsx`, `AccessKeyUnlockModal.tsx`, `AccessKeyScreenAuthModal.tsx`  
> Design references: Airbnb & Notion mobile apps (clean card-based layouts, generous whitespace, consistent 8–12px spacing rhythm, restrained typography, muted iconography)

---

## 1. Spacing and Visual Hierarchy

### auth-key.tsx — Verification Screen
- **Issue**: The verification card uses a 72×72 icon ring with a 64×64 inner circle. These are massive relative to the viewport and dominate the visual hierarchy, pushing the primary task (entering the PIN) below the fold. Airbnb and Notion typically use icon accents at 1/6–1/8 of the card width, not 1/3.
- **Issue**: Horizontal padding inside the verification card is not controlled via the spacing scale; elements feel arbitrarily placed (e.g., the Lock icon label row uses `gap: 8`, the input wrapper uses `paddingRight: space(10)` on a 14px-height eye button, but the main input padding is `space(4)`/`space(3)`).
- **Issue**: The subtitle `Enter your current authentication key to access\nthe management screen.` uses a hardcoded newline rather than letting the text wrap naturally.
- **Issue**: In the management screen, the description text has `marginTop: 2, marginBottom: 16` while the card has `marginBottom: 16`. The rhythm becomes irregular — the bottom tab spacing and card margins overlap without a clear pattern.
- **Issue**: The `minHeight: 70` on each field group is arbitrary. The combination of an 18px label row + 52px input row + 14px padding = 84px needed; the 70px constraint can cause visual clipping or inconsistent vertical rhythm.

### access-keys.tsx
- **Issue**: The `createCard` has `padding: 24` (hardcoded) while other cards use dynamic theme tokens inconsistently. On a small phone, 24px padding can consume 40%+ of horizontal space.
- **Issue**: `fieldGroup` has `marginBottom: 20`, but the `sectionDivider` uses `marginVertical: 24`. These values are close but not harmonized in a 4px/8px grid.
- **Issue**: The empty state uses an emoji `🔒` with `marginBottom: space(2)`. Emoji rendering varies wildly across platforms, making the empty state feel inconsistent compared to other screens that use icons.
- **Issue**: The `description` text in the header has `marginBottom: 4, marginTop: 2` while the card starts immediately after. The gap between description and card is only 4+4=8px, which is too tight on small screens.
- **Issue**: The password card actions (`editBtn`, `deleteBtn`, `infoBtn`) have inconsistent internal padding. `editBtn` and `deleteBtn` use `paddingVertical: 8`, but `infoBtn` is a 40×40 circle. The vertical middle alignment is off because the button text metrics differ.

### AccessKeyUnlockModal.tsx
- **Issue**: The modal uses a single `View` as the card without any visible close affordance (no X button in the header). Users must tap the backdrop to dismiss, which is non-discoverable.
- **Issue**: The `iconRing` and `iconCircle` are 72px/64px — identical to the too-large sizes in `auth-key.tsx`. This makes the unlock modal feel oversized and pushes the password input down.
- **Issue**: The `idBox` (`fontSize: 28`, `fontWeight: '800'`) is disproportionately large compared to the title (`fontSize: 24`). This hierarchy inversion makes it harder to scan the form.
- **Issue**: `buttonRow` uses `gap: space(3)` from the theme but buttons have `paddingVertical: 14` hardcoded, not aligned with the spacing scale.
- **Issue**: The overlay background is hardcoded as `rgba(0,0,0,0.75)` instead of using a theme token.

### AccessKeyScreenAuthModal.tsx
- **Issue**: Same hardcoded `rgba(0,0,0,0.75)` overlay.
- **Issue**: The verify button uses a hardcoded `#4A90D9` instead of the theme `colors.primary`.
- **Issue**: The `idBox` shows "Access Keys" as a destination indicator but lacks the same visual weight as the equivalent state in `auth-key.tsx` (which shows a hint box with icon).
- **Issue**: `inputWrap` has `marginBottom: 24` hardcoded, while the label row uses `marginBottom: 8`. The gap to the button row is `space(5)` + 24px = inconsistent.

---

## 2. Component Scaling and Proportions

### auth-key.tsx
- **Issue**: The "Security Verification Required" title is `font(20)` but the management screen's secondary title is also `font(13)`. The subunit text is too small relative to the primary action. A better hierarchy: title (20–24px), subtitle (14–15px), label (11px).
- **Issue**: Input fields in the verification screen have `minHeight: INPUT_H` where `INPUT_H = clampSize(48, 56)`. That means on a small phone they are 48px, on a tablet 56px. This is fine, but the text inside uses `font(15)` which is reasonable. However, the `eye` button text ("Show"/"Hide") uses `font(12)` and the icon uses `size={13}` — mismatched sizes. The text button should match the icon height.
- **Issue**: The verify button uses `minHeight: INPUT_H` but adds an icon (`size={18}`) plus text. The content box is correct, but the `gap: 10` between icon and text makes the button feel too loose on small screens and slightly cramped on tablets.
- **Issue**: The management screen uses `minHeight: 52` for inputs. This is 4px taller than the verification screen, breaking consistency across the authentication flow.

### access-keys.tsx
- **Issue**: The `createBtn` has `paddingVertical: 16` which is good, but its text is `font(15)` while the password card action buttons use `font(12)`. A three-level hierarchy (primary 15px, destructive 12px, tertiary 12px) is acceptable, but the destructive action should be visually stronger.
- **Issue**: The password card icon box is 44×44 with `borderRadius: 12`. This is fine, but the icon inside is `size={20}` with `strokeWidth={2}`. The icon fills about 45% of the box, which is appropriate. However, compared to the `AccessKeyUnlockModal` icon (28px in a 64px circle, 44% fill), the sizes feel disconnected.
- **Issue**: The `empty` card uses `paddingVertical: 36` with no horizontal padding specified, so it inherits nothing. The emoji is `font(42)`. On tablet, this will look enormous relative to the card.
- **Issue**: The `keyIconBox` in the list header (44×44, borderRadius 12) is defined in styles but used only in the inline header at the top of the screen. It is **not** used in the password cards, where an anonymous `View` with inline styles is used instead.

### AccessKeyUnlockModal.tsx
- **Issue**: The title is `fontSize: 24` which is disproportionately large for a small modal on a phone. Notion/ Airbnb keep modal titles at 17–20px.
- **Issue**: The `idText` is `fontSize: 28, fontWeight: '800'` with `marginBottom: 4`. This makes the target ID dominate the title, creating a confusing visual hierarchy.
- **Issue**: Buttons use `paddingVertical: 14` while the primary CTA should be aligned with the card's content padding rhythm.
- **Issue**: The `eyeBtn` uses `position: 'absolute'` with `marginTop: -16`, which assumes a specific input height. If the input height changes (e.g., via `clampSize` or a larger minimum), the eye button will be misaligned.

### AccessKeyScreenAuthModal.tsx
- **Issue**: The title is `fontSize: 20` which is slightly smaller than the overlay's subtitle density. The `idBox` is much simpler than the equivalent in `auth-key.tsx`, leading to inconsistent visual identity across the app's auth flows.
- **Issue**: The input has `paddingRight: space(12)` but the eye button is positioned at `right: 12`, creating a collision when the input is narrow.

---

## 3. Alignment and Composition

### auth-key.tsx
- **Issue**: The verification screen is entirely centered (`alignItems: 'center'` in `verifyCard`), but the input row and eye button are left-aligned (`alignSelf: 'flex-start'` via `labelRow`). This mixed alignment creates a "floating" input feel inside the centered card.
- **Issue**: The management screen uses three stacked field groups separated by `hairline` dividers. These dividers are `height: StyleSheet.hairlineWidth` (≈0.5px), which is very subtle and may be invisible on AMOLED screens. The section divider in the create card uses a decorative Lock-icon divider that is not present in the management screen, breaking cross-screen consistency.
- **Issue**: The edit hint box (`editingHint`) appears conditionally. When shown, it has `marginTop: space(3)` (12px) but the hint box above it has no bottom margin. This is fine, but the cancel/save buttons inside the edit hint box use `justifyContent: 'flex-end'`, which pushes them to the right while the label above is left-aligned.

### access-keys.tsx
- **Issue**: The password card uses `passwordLeft` (flex: 1) and `passwordActions` (flex row). The actions are right-aligned via `justifyContent: 'space-between'` on the parent card. On small screens, the actions can overflow horizontally if the label text is long.
- **Issue**: The section header row uses `sectionHeaderLeft` with `gap: 4` but the icon is `size={16}` and the title is `font(13)` with `fontWeight: '800'`. On a 360px-wide phone, the text "Existing Access Keys" plus the counter badge on the same row can feel tight.
- **Issue**: The `createCard` fields are left-aligned but the `sectionDivider` uses centered text with flanking icons. This asymmetric alignment is intentional for the divider, but it means the field groups feel "ragged" relative to the centered separator.

### AccessKeyUnlockModal.tsx
- **Issue**: The card is centered in the overlay, but the `idBox` text is centered while the label row and input are left-aligned. The eye button is right-aligned inside the input. This creates a mixed rhythm: the form is left-aligned but the surrounding intro text is centered.
- **Issue**: There is no top-level close affordance inside the card. The only way out is tapping the backdrop. Airbnb and Notion modals always have a visible close handle (X button) in the header area.

### AccessKeyScreenAuthModal.tsx
- **Issue**: Same mixed left/center alignment as `AccessKeyUnlockModal.tsx`. The `idBox` uses `flexDirection: 'row'` with `justifyContent: 'center'`, but the icon + text inside it is left-aligned relative to each other.
- **Issue**: The overlay padding is `padding: 24` on all sides. On small phones (320–360px width), this gives only 272–312px of modal width. The `maxWidth: 360` then becomes the actual width, and the 24px overlay padding is wasted on the left and right.

---

## 4. Responsive Adaptability

### auth-key.tsx
- **Issue**: The card border-radius uses `borderRadius: 20` (hardcoded) while the theme provides `radius()` tokens that scale on tablets. On tablets, cards should have `radius(16)` → 20px, but the hardcoded value will not scale.
- **Issue**: The `createCard` on the management screen has `padding: 24`. On tablets with `space` scaled by 1.25×, `space(6)` = 15px. The card padding should be `space(6)` on phones and `space(8)` on tablets.
- **Issue**: The empty state card uses `borderRadius: 24` (hardcoded) while the header empty state in the unconfigured view uses `borderRadius: 24`. The management screen card uses `borderRadius: 20`. This inconsistency means the "Vault Not Initialized" state feels like it belongs to a different design system.

### access-keys.tsx
- **Issue**: The delete verification modal uses `padding: space(12)` on the overlay wrapper. On tablets, `space(12)` = 30px. Combined with `maxWidth: 360` (phone) or `maxWidth: 480` (tablet), the modal will be 360px or 480px wide, centered. This is fine, but the card padding inside (`paddingVertical: 24, paddingHorizontal: 24`) is hardcoded.
- **Issue**: The password cards use `marginBottom: 12` (hardcoded). On tablets, this should scale to `space(4)` = 10px or remain 12px depending on desired density. Currently there is no tablet adaptation for list item spacing.
- **Issue**: The edit modal uses `maxWidth: 400` on phones and `maxWidth: 480` on tablets. This creates a visual jump. A smoother approach is `percentageWidth(90)` capped at 480px, or using `clampSize(320, 480)` for the max width.

### AccessKeyUnlockModal.tsx
- **Issue**: The card uses `maxWidth: isTablet ? 480 : 360`. This works, but the overlay uses `padding: 24` hardcoded. On a small phone (320px), the overlay padding is 35%+ of usable width. It should use `screenPadding` from the theme.
- **Issue**: The icon sizes (`size={28}`, `size={18}`, `size={14}`) do not scale on tablets. `clampSize(24, 32)` for the lock icon and `clampSize(16, 20)` for the eye icon would create a more proportional feel.

### AccessKeyScreenAuthModal.tsx
- **Issue**: Same hardcoded overlay issue (`padding: 24`).
- **Issue**: The `idBox` uses `flexDirection: 'row'` but the icon and text are small relative to the box. On tablets, the box should be taller (`paddingVertical: space(5)` = 20px instead of 16px).
- **Issue**: The "Cancel" and "Verify" buttons use `flex: 1` and `flex: 1.2` respectively. On narrow screens, a 1.2× flex ratio still works, but on very wide screens (tablet in landscape), the buttons would stretch to fill the extended modal width, making touch targets too wide. The buttons should have a `maxWidth` or use percentage width with a max.

---

## Summary of Key Issues

| File | Top 3 Issues |
|---|---|
| `auth-key.tsx` verification | Icon ring too large (72px), hardcoded color object instead of theme tokens, centered card with left-aligned form creates mixed alignment |
| `auth-key.tsx` management | Inconsistent input heights across forms (52px vs 48px), arbitrary `minHeight: 70` on field groups, hardcoded divider color |
| `access-keys.tsx` | Nested `View style={styles.fieldGroup}` duplication (lines 537), emoji in empty state, tight header/description gap |
| `AccessKeyUnlockModal.tsx` | Hardcoded overlay color, no visible close button, oversized title/idText hierarchy |
| `AccessKeyScreenAuthModal.tsx` | Hardcoded verify button color (#4A90D9), hardcoded overlay, inconsistent `idBox` design from unlock modal |

---

## Design System Reference (Airbnb / Notion)

| Property | Recommended Value | Usage |
|---|---|---|
| Card border-radius | `radius(16)` phone, `radius(20)` tablet | Cards, modals |
| Card padding | `space(6)` phone, `space(8)` tablet | Card inner padding |
| Section spacing | `space(4)`–`space(6)` vertically | Between card elements |
| Input height | `clampSize(48, 56)` | Text inputs |
| Input padding | `space(4)` horizontal, `space(3)` vertical | Text inputs |
| Label font size | `11px`, `fontWeight: '700'`, `letterSpacing: 0.8` | Uppercase labels |
| Primary text size | `font(15)` | Body copy |
| Secondary text size | `font(13)`–`font(14)` | Subtitles |
| Modal title | `font(17)`–`font(19)` | Modal headers |
| Icon accent size | `clampSize(48, 64)` outer, inner -8px | Modal status icon |
| Button height | Equal to input height (`clampSize(48, 56)`) | Primary CTAs |
| Horizontal screen padding | `space(8)` phone, `space(12)` tablet | Content edges |
| Modal overlay | Use theme opacity token | Backdrop |
| List item vertical gap | `space(3)` phone, `space(4)` tablet | Card stacks |

---

## Implementation Plan

### auth-key.tsx
1. Replace hardcoded color object `c` with `theme` from `useTheme()`.
2. Reduce lock icon ring from 72×72/64×64 to `clampSize(56, 72)`/`clampSize(48, 64)`.
3. Add `marginBottom` to subtitle and increase gap between subtitle and input field to `space(6)`.
4. Increase card padding to `space(6)` on phone, `space(8)` on tablet.
5. Replace text-based "Show"/"Hide" buttons with `Eye`/`EyeOff` icons only (matching `AccessKeyUnlockModal` pattern).
6. Standardize input `minHeight` across both screens to `clampSize(48, 56)`.
7. Remove `minHeight: 70` from field groups; use natural spacing with `marginBottom`.
8. Add a proper X close button to the management screen header, or ensure back navigation is clear.
9. Use `font(13)` for body text, `font(11)` for labels.

### access-keys.tsx
1. Fix nested `View style={styles.fieldGroup}` duplication (line 537).
2. Replace emoji `🔒` empty state with a `Lock` icon inside a colored circle, matching other screens.
3. Increase `description` bottom margin to `space(4)`–`space(6)` before the first card.
4. Use theme `colors.primary` instead of inline white/black for button text.
5. Align password card icon boxes to use the shared `keyIconBox` style.
6. Increase action button gap from `4` to `space(3)` (12px on tablet, 8px phone) and unify vertical alignment.
7. Make delete verification modal's `verifyCard` padding dynamic with `space()`.
8. Remove hardcoded `paddingHorizontal: 20` etc., replace with theme tokens.

### AccessKeyUnlockModal.tsx
1. Extract overlay color to theme token or use theme-aware rgba.
2. Add a header row with X close button inside the card.
3. Reduce title to `font(17)`–`font(19)`, subtitle to `font(14)`.
4. Make `idBox` secondary (smaller font, lighter weight) so the title remains the dominant element.
5. Scale inputs and buttons with `clampSize(48, 56)` for height.
6. Use `screenPadding` for overlay padding.
7. Add consistent `buttonRow` gap using `space(4)`.

### AccessKeyScreenAuthModal.tsx
1. Replace hardcoded overlay `rgba(0,0,0,0.75)` with theme-based overlay.
2. Change verify button color from `#4A90D9` to `colors.primary`.
3. Align `idBox` styling with `AccessKeyUnlockModal.tsx` for cross-modal consistency.
4. Use `screenPadding` for overlay padding.
5. Reduce `idText` to `font(15)` so it doesn't compete with the title.

---

## Responsive Breakpoints Reference

| Breakpoint | Width | Behavior |
|---|---|---|
| Phone (small) | < 360px | Compact spacing, `space(*)` base values, `font(15)` inputs |
| Phone | 360–599px | Standard spacing, `clampSize(48, 52)` inputs |
| Tablet / Large phone | 600–899px | Scaled spacing (`space` ×1.25), `clampSize(52, 56)` inputs, `font(16)` inputs |
| Desktop / Land tablet | ≥ 900px | `maxWidth` capped cards, centered content |
| Large desktop | ≥ 1200px | Narrow content column (max 600px), generous margins |

All spacing, sizing, and alignment decisions above must be fluid between these breakpoints. `clampSize` should be the primary tool for interpolating values; discrete breakpoints should only be used for structural layout changes (e.g., modal max width).
