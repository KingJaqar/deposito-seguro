// src/app/(main)/settings/customization.tsx
// Redesigned to match the mockup: a minimal icon-only nav bar (back + Reset),
// a large in-body heading/subtitle, a "Live" preview card that mirrors the
// current settings using the same font()/space()/radius() tokens as the rest
// of the app (so it really is live, not a static illustration), value
// summaries on every section header, and swatch/pill pickers in place of the
// old uppercase-eyebrow section labels + plain segmented control everywhere.
import { useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Check,
  FileText,
  Folder,
  Image as ImageIcon,
  Music,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react-native';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { VaultHeader } from '../../../components/VaultHeader';
import { Button } from '../../../components/primitives/Button';
import { Card } from '../../../components/primitives/Card';
import { SegmentedControl } from '../../../components/primitives/SegmentedControl';
import { CategoryTint, Palette } from '../../../constants/Colors';
import { Type } from '../../../constants/typography';
import { useTheme } from '../../../contexts/ThemeContext';
import { useSettingsStore } from '../../../store/settingsStore';

const THEME_OPTIONS = [
  { value: 'light' as const, label: 'Light', sub: 'Bright backgrounds, dark text' },
  { value: 'dark' as const, label: 'Dark', sub: 'Low-light comfortable theme' },
  { value: 'amoled' as const, label: 'AMOLED', sub: 'True black for OLED displays' },
];

const VIEW_MODE_OPTIONS = [
  { value: 'list' as const, label: 'List', sub: 'Files displayed as rows' },
  { value: 'large-icons' as const, label: 'Large', sub: 'Up to 2 columns' },
  { value: 'medium-icons' as const, label: 'Medium', sub: 'Up to 3 columns' },
  { value: 'small-icons' as const, label: 'Small', sub: 'Up to 5 columns' },
];

// Text size is a direct percentage-of-normal scale (25%–250%, in 10 even
// 25-point steps) rather than 5 named presets — the multiplier persisted in
// settingsStore (fontSizeMultiplier) is just percent / 100, so 100% (the
// 4th stop) is the app's normal, un-scaled reading size and DEFAULTS below
// stays anchored there; steps below it shrink text to fit more on screen,
// steps above it enlarge it for readability.
const FONT_SIZE_OPTIONS = Array.from({ length: 10 }, (_, i) => {
  const percent = (i + 1) * 25;
  return {
    value: String(percent),
    label: `${percent}%`,
    sub:
      percent === 100
        ? 'Standard reading size'
        : percent > 100
          ? percent >= 200
            ? 'Maximum readability — largest text'
            : 'Larger — easier to read'
          : percent >= 50
            ? 'Slightly reduced — more fits on screen'
            : 'Very compact — may be hard to read',
    multiplier: percent / 100,
  };
});

const DEFAULTS = {
  themeMode: 'dark' as const,
  viewMode: 'list' as const,
  fontSizeMultiplier: 1.0,
};

const PREVIEW_ITEMS: { name: string; sub: string; Icon: LucideIcon; tint?: string; isFolder?: boolean }[] = [
  { name: 'Documents', sub: '12 items', Icon: Folder, isFolder: true },
  { name: 'Screenshot', sub: '48 items', Icon: ImageIcon, tint: CategoryTint.images },
  { name: 'Invoice', sub: '1.2 MB', Icon: FileText, tint: CategoryTint.docs },
  { name: 'Night Drive', sub: '5.8 MB', Icon: Music, tint: CategoryTint.audio },
  { name: 'Archive', sub: '7 items', Icon: Folder, isFolder: true },
];

const closestOption = <T extends { multiplier: number }>(options: T[], multiplier: number): T =>
  options.reduce((closest, opt) =>
    Math.abs(opt.multiplier - multiplier) < Math.abs(closest.multiplier - multiplier) ? opt : closest
  , options[0]);

/** Label + current-value row shared by every section below the preview card. */
function SectionHeader({ label, value }: { label: string; value: string }) {
  const { colors, font, space } = useTheme();
  return (
    <View style={[styles.sectionHeaderRow, { marginBottom: space(3) }]}>
      <Text style={{ fontSize: font(Type.subtitle.size), fontWeight: '700', color: colors.text }}>{label}</Text>
      <Text style={{ fontSize: font(Type.body.size), fontWeight: '700', color: colors.textSecondary }}>{value}</Text>
    </View>
  );
}

const CAPTION_STYLE = { fontWeight: '500' as const };

function SectionCaption({ text }: { text: string }) {
  const { colors, font, space } = useTheme();
  return (
    <Text style={[CAPTION_STYLE, { color: colors.textMuted, fontSize: font(Type.caption.size), marginTop: space(3) }]}>
      {text}
    </Text>
  );
}

/**
 * Three swatch tiles (Light/Dark/AMOLED), each rendering a miniature of that
 * theme's own background/surface colors plus a checkmark badge on the
 * selected one — replaces the plain segmented control for this section only,
 * since a text-label pill can't show what a theme actually looks like.
 */
function ThemeSwatchPicker({
  value,
  onChange,
}: {
  value: 'light' | 'dark' | 'amoled';
  onChange: (v: 'light' | 'dark' | 'amoled') => void;
}) {
  const { colors, space, font, radius, iconSize } = useTheme();

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Color theme" style={[styles.swatchRow, { gap: space(3) }]}>
      {THEME_OPTIONS.map((opt) => {
        const selected = opt.value === value;
        const swatchColors = Palette[opt.value];
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="radio"
            accessibilityLabel={opt.label}
            accessibilityState={{ checked: selected }}
            style={styles.swatchOption}
          >
            <View
              style={[
                styles.swatchPreview,
                {
                  backgroundColor: swatchColors.background,
                  borderRadius: radius(4),
                  borderColor: selected ? colors.primary : colors.borderLight,
                  borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                  padding: space(2),
                },
              ]}
            >
              <View style={[styles.swatchBar, { width: '70%', backgroundColor: swatchColors.surfaceHover, borderRadius: radius(1) }]} />
              <View style={[styles.swatchBar, { width: '45%', marginTop: space(1), backgroundColor: swatchColors.surfaceHover, borderRadius: radius(1) }]} />
              {selected && (
                <View style={[styles.checkBadge, { width: iconSize(18), height: iconSize(18), backgroundColor: colors.primary, borderRadius: radius(6) }]}>
                  <Check size={iconSize(11)} color={colors.onPrimary} strokeWidth={3} />
                </View>
              )}
            </View>
            <Text
              numberOfLines={1}
              style={{
                fontSize: font(Type.label.size),
                fontWeight: selected ? '700' : '500',
                color: selected ? colors.text : colors.textMuted,
                marginTop: space(2),
                textAlign: 'center',
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A discrete 10-stop drag slider — track fills from the left up to the
 * thumb, with a tick per stop, replacing the Text Size chip grid. Tracks its
 * own pixel width via onLayout (percent-of-track math needs real pixels,
 * not the 0..1 layout fraction alone) and its own screen-space origin via
 * `measure()` so drag math stays correct regardless of scroll position —
 * `nativeEvent.locationX` isn't used because on Android it's reported
 * relative to whatever view is currently under the finger, not the view
 * that captured the gesture, so it drifts once the finger leaves the
 * responder's original bounds mid-drag.
 */
function TextSizeSlider({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const { colors, space, font, radius } = useTheme();
  const trackRef = useRef<View>(null);
  const trackOriginX = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);

  const stepCount = options.length;
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const fraction = stepCount > 1 ? activeIndex / (stepCount - 1) : 0;

  const commitFromPageX = (pageX: number) => {
    if (trackWidth <= 0) return;
    const localX = pageX - trackOriginX.current;
    const clamped = Math.max(0, Math.min(trackWidth, localX));
    const idx = Math.round((clamped / trackWidth) * (stepCount - 1));
    const opt = options[idx];
    if (opt && opt.value !== value) onChange(opt.value);
  };

  // `PanResponder.create()` lives in a `useRef` so it's built exactly once —
  // its handler closures would otherwise see stale `trackWidth`/`value`
  // (captured from whichever render happened to run first, typically before
  // onLayout's measure() ever fires, permanently reading trackWidth as 0 and
  // silently no-op'ing every drag). `commitRef` is refreshed every render so
  // the fixed PanResponder instance always calls into the latest closure.
  const commitRef = useRef(commitFromPageX);
  commitRef.current = commitFromPageX;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => commitRef.current(e.nativeEvent.pageX),
      onPanResponderMove: (e) => commitRef.current(e.nativeEvent.pageX),
    })
  ).current;

  const thumbSize = 24;

  // Reference-line markers at fixed percentages (not tied to the option
  // stops themselves, so they'd still land correctly if the step size ever
  // changes) — positioned by their fraction across [min, max], same as the
  // thumb/fill, and skipped if out of the current range.
  const minPercent = Number(options[0]?.value ?? 0);
  const maxPercent = Number(options[stepCount - 1]?.value ?? 0);
  const markerPercents = [50, 100, 150, 200].filter((p) => p >= minPercent && p <= maxPercent);

  return (
    <View accessibilityRole="adjustable" accessibilityLabel="Text size" accessibilityValue={{ min: 1, max: stepCount, now: activeIndex + 1, text: options[activeIndex]?.label }}>
      <View
        ref={trackRef}
        onLayout={() => {
          trackRef.current?.measure((_x, _y, width, _height, pageX) => {
            trackOriginX.current = pageX;
            setTrackWidth(width);
          });
        }}
        hitSlop={{ top: 16, bottom: 16 }}
        {...panResponder.panHandlers}
        style={styles.sliderHitArea}
      >
        <View style={[styles.sliderTrack, { backgroundColor: colors.borderLight, borderRadius: radius(2) }]}>
          <View style={[styles.sliderFill, { width: `${fraction * 100}%`, backgroundColor: colors.primary, borderRadius: radius(2) }]} />
        </View>
        {/* Pinned to all four edges of sliderHitArea (a definite, already-
         * measured size by the time this paints) so every child's `top`/
         * `left` percentage below resolves against real pixels — the ticks
         * row previously left `top` unset, which made its vertical position
         * ambiguous, and the marker lines used `colors.surfaceElevated`,
         * which in the AMOLED palette (#161616) is nearly identical to the
         * track's own unfilled color (#1A1A1A) and invisible against it. */}
        <View pointerEvents="none" style={styles.sliderOverlay}>
          {options.map((opt, i) => (
            <View
              key={opt.value}
              style={[
                styles.sliderTick,
                {
                  left: `${(i / (stepCount - 1)) * 100}%`,
                  backgroundColor: i <= activeIndex ? colors.primary : colors.borderLight,
                  borderRadius: radius(1),
                },
              ]}
            />
          ))}
          {markerPercents.map((p) => (
            <View
              key={p}
              style={[
                styles.sliderMarkerLine,
                { left: `${((p - minPercent) / (maxPercent - minPercent)) * 100}%`, backgroundColor: colors.text },
              ]}
            />
          ))}
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.sliderThumb,
            {
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              left: `${fraction * 100}%`,
              marginLeft: -thumbSize / 2,
              backgroundColor: colors.primary,
              borderColor: colors.surfaceElevated,
            },
          ]}
        />
      </View>
      <View style={[styles.sliderEndLabels, { marginTop: space(2) }]}>
        <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: font(Type.caption.size) }}>{options[0]?.label}</Text>
        <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: font(Type.caption.size) }}>{options[stepCount - 1]?.label}</Text>
      </View>
    </View>
  );
}

/** "Live" preview card — reuses the screen's own font()/space()/radius() so
 * changing any setting below visibly updates these tiles immediately. */
function PreviewCard() {
  const { colors, space, font, radius, iconSize } = useTheme();
  const previewIconWrapSize = iconSize(44);

  return (
    <Card style={{ marginBottom: space(6) }}>
      <View style={styles.previewHeaderRow}>
        <Text style={{ fontSize: font(Type.subtitle.size), fontWeight: '700', color: colors.text }}>Preview</Text>
        <View style={[styles.livePill, { backgroundColor: colors.surfaceHover, borderColor: colors.borderLight, borderRadius: radius(6), paddingHorizontal: space(2) }]}>
          <Text style={{ fontSize: font(Type.caption.size), fontWeight: '700', color: colors.textSecondary }}>Live</Text>
        </View>
      </View>

      <View style={[styles.previewRow, { marginTop: space(4), gap: space(2) }]}>
        {PREVIEW_ITEMS.map((item, idx) => {
          const tint = item.isFolder ? colors.vaultFolderIcon : (item.tint ?? colors.textMuted);
          return (
            <View key={`${item.name}-${idx}`} style={styles.previewItem}>
              <View
                style={[
                  styles.previewIconWrap,
                  { width: previewIconWrapSize, height: previewIconWrapSize, backgroundColor: `${tint}1F`, borderRadius: radius(3), marginBottom: space(2) },
                ]}
              >
                <item.Icon size={iconSize(20)} color={tint} strokeWidth={2} />
              </View>
              <Text numberOfLines={1} style={{ fontSize: font(Type.caption.size), fontWeight: '700', color: colors.text, textAlign: 'center' }}>
                {item.name}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: font(10), fontWeight: '500', color: colors.textMuted, textAlign: 'center' }}>
                {item.sub}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export default function CustomizationSettingsScreen() {
  const { colors, space, font, screenPadding, bottomTabSpacing } = useTheme();
  const { themeMode, viewMode, fontSizeMultiplier, updateSetting } = useSettingsStore();

  const activeTheme = THEME_OPTIONS.find(o => o.value === themeMode) ?? THEME_OPTIONS[1];
  const activeViewMode = VIEW_MODE_OPTIONS.find(o => o.value === viewMode) ?? VIEW_MODE_OPTIONS[0];
  const activeFontSize = closestOption(FONT_SIZE_OPTIONS, fontSizeMultiplier);

  const handleReset = () => {
    updateSetting('themeMode', DEFAULTS.themeMode);
    updateSetting('viewMode', DEFAULTS.viewMode);
    updateSetting('fontSizeMultiplier', DEFAULTS.fontSizeMultiplier);
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader
        title="Appearance"
        showBack
        rightButton={<Button title="Reset" icon={RotateCcw} variant="tertiary" size="sm" onPress={handleReset} accessibilityLabel="Reset appearance settings to defaults" />}
      />
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.body, { paddingHorizontal: screenPadding, paddingTop: space(3), paddingBottom: bottomTabSpacing }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ fontSize: font(Type.body.size), fontWeight: '500', color: colors.textMuted, marginBottom: space(5) }}>
          Tune how your library looks and how much <Text style={{ color: colors.primary, fontWeight: '700' }}>fits</Text> on screen.
        </Text>

        <PreviewCard />

        <SectionHeader label="Color theme" value={activeTheme.label} />
        <Card style={{ marginBottom: space(6) }}>
          <ThemeSwatchPicker value={themeMode} onChange={(v) => updateSetting('themeMode', v)} />
          <SectionCaption text={activeTheme.sub} />
        </Card>

        <SectionHeader label="Directory layout" value={activeViewMode.label} />
        <Card style={{ marginBottom: space(6) }}>
          <SegmentedControl options={VIEW_MODE_OPTIONS} value={viewMode} onChange={(v) => updateSetting('viewMode', v)} accessibilityLabel="Directory layout" />
          <SectionCaption text={activeViewMode.sub} />
        </Card>

        <SectionHeader label="Text size" value={activeFontSize.label} />
        <Card style={{ marginBottom: space(6) }}>
          <TextSizeSlider
            options={FONT_SIZE_OPTIONS}
            value={activeFontSize.value}
            onChange={(v) => updateSetting('fontSizeMultiplier', FONT_SIZE_OPTIONS.find(o => o.value === v)!.multiplier)}
          />
          <SectionCaption text={activeFontSize.sub} />
        </Card>
      </ScrollView>
      <AnimatedTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flexGrow: 1 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  swatchRow: { flexDirection: 'row' },
  swatchOption: { flex: 1, alignItems: 'center' },
  swatchPreview: { width: '100%', height: 56, position: 'relative' },
  swatchBar: { height: 8 },
  checkBadge: { position: 'absolute', top: 6, right: 6, alignItems: 'center', justifyContent: 'center' },
  sliderHitArea: { justifyContent: 'center', paddingVertical: 10 },
  sliderTrack: { height: 4, overflow: 'hidden' },
  sliderFill: { height: 4 },
  sliderOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sliderTick: { position: 'absolute', top: '50%', width: 4, height: 4, marginTop: -2, marginLeft: -2 },
  sliderMarkerLine: { position: 'absolute', top: '50%', width: 2, height: 14, marginTop: -7, marginLeft: -1 },
  sliderThumb: { position: 'absolute', borderWidth: 3 },
  sliderEndLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  previewHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  livePill: { paddingVertical: 3, borderWidth: StyleSheet.hairlineWidth },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between' },
  previewItem: { flex: 1, alignItems: 'center' },
  previewIconWrap: { alignItems: 'center', justifyContent: 'center' },
});
