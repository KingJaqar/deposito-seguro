// src/app/(main)/settings/customization.tsx
// Redesigned to match the mockup: a minimal icon-only nav bar (back + Reset),
// a large in-body heading/subtitle, a "Live" preview card that mirrors the
// current settings using the same font()/space()/radius() tokens as the rest
// of the app (so it really is live, not a static illustration), value
// summaries on every section header, and swatch/pill pickers in place of the
// old uppercase-eyebrow section labels + plain segmented control everywhere.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { MIN_TOUCH_TARGET } from '../../../utils/responsive';

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

// SegmentedControl/SizePickerRow are generic over string values, so the
// multiplier persisted in settingsStore (fontSizeMultiplier / displayScale)
// is looked up by a string key here rather than driving the control directly.
const FONT_SIZE_OPTIONS = [
  { value: 'very-small' as const, label: 'Very Small', sub: 'Most compact reading size', multiplier: 0.75 },
  { value: 'small' as const, label: 'Small', sub: 'Compact reading size', multiplier: 0.875 },
  { value: 'medium' as const, label: 'Medium', sub: 'Standard reading size', multiplier: 1.0 },
  { value: 'large' as const, label: 'Large', sub: 'Easier to read', multiplier: 1.15 },
  { value: 'very-large' as const, label: 'Very Large', sub: 'Maximum readability', multiplier: 1.3 },
];

const DISPLAY_SIZE_OPTIONS = [
  { value: '25' as const, label: '25%', sub: 'Tightest spacing, most on screen', multiplier: 0.25 },
  { value: '50' as const, label: '50%', sub: 'Very tight spacing', multiplier: 0.5 },
  { value: '100' as const, label: '100%', sub: 'Recommended spacing', multiplier: 1.0 },
  { value: '150' as const, label: '150%', sub: 'Roomier touch targets', multiplier: 1.5 },
  { value: '200' as const, label: '200%', sub: 'Largest spacing and touch targets', multiplier: 2.0 },
];

// The picker itself always shows "Aa" — the descriptive word ("Very Small"…)
// only ever appears in the section's current-value summary and caption —
// with each option's own glyph sized to its multiplier so the row reads as a
// graduated scale, independent of whatever text size is currently applied to
// the rest of the app.
const TEXT_SIZE_PICKER_OPTIONS = FONT_SIZE_OPTIONS.map((o) => ({
  value: o.value,
  label: 'Aa',
  a11yLabel: o.label,
  fontSize: Math.round(o.multiplier * 18),
}));

const DISPLAY_SIZE_PICKER_OPTIONS = DISPLAY_SIZE_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
  a11yLabel: o.label,
}));

const DEFAULTS = {
  themeMode: 'dark' as const,
  viewMode: 'list' as const,
  fontSizeMultiplier: 1.0,
  displayScale: 1.0,
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

interface SizePickerOption<T extends string> {
  value: T;
  label: string;
  a11yLabel: string;
  fontSize?: number;
}

/**
 * A row of variable-width pills where the selected option gets a filled
 * "chip" background — used for Text Size (options are graduated "Aa" glyphs,
 * so a shared-width sliding thumb like SegmentedControl's doesn't fit) and
 * Display Size (uniform width, but styled to match).
 */
function SizePickerRow<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: SizePickerOption<T>[];
  value: T;
  onChange: (v: T) => void;
  accessibilityLabel: string;
}) {
  const { colors, font, radius } = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.pickerTrack, { backgroundColor: colors.surfaceHover, borderRadius: radius(4), borderColor: colors.borderLight, padding: 3 }]}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="radio"
            accessibilityLabel={opt.a11yLabel}
            accessibilityState={{ checked: selected }}
            style={[
              styles.pickerOption,
              {
                minHeight: MIN_TOUCH_TARGET - 8,
                borderRadius: radius(3),
                backgroundColor: selected ? colors.surface : 'transparent',
              },
            ]}
          >
            <Text
              style={{
                fontSize: opt.fontSize ?? font(Type.label.size),
                fontWeight: selected ? '800' : '600',
                color: selected ? colors.text : colors.textMuted,
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
  const { themeMode, viewMode, fontSizeMultiplier, displayScale, updateSetting } = useSettingsStore();

  const activeTheme = THEME_OPTIONS.find(o => o.value === themeMode) ?? THEME_OPTIONS[1];
  const activeViewMode = VIEW_MODE_OPTIONS.find(o => o.value === viewMode) ?? VIEW_MODE_OPTIONS[0];
  const activeFontSize = closestOption(FONT_SIZE_OPTIONS, fontSizeMultiplier);
  const activeDisplaySize = closestOption(DISPLAY_SIZE_OPTIONS, displayScale);

  const handleReset = () => {
    updateSetting('themeMode', DEFAULTS.themeMode);
    updateSetting('viewMode', DEFAULTS.viewMode);
    updateSetting('fontSizeMultiplier', DEFAULTS.fontSizeMultiplier);
    updateSetting('displayScale', DEFAULTS.displayScale);
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
          <SizePickerRow
            options={TEXT_SIZE_PICKER_OPTIONS}
            value={activeFontSize.value}
            onChange={(v) => updateSetting('fontSizeMultiplier', FONT_SIZE_OPTIONS.find(o => o.value === v)!.multiplier)}
            accessibilityLabel="Text size"
          />
          <SectionCaption text={activeFontSize.sub} />
        </Card>

        <SectionHeader label="Display size" value={`${activeDisplaySize.label} spacing`} />
        <Card>
          <SizePickerRow
            options={DISPLAY_SIZE_PICKER_OPTIONS}
            value={activeDisplaySize.value}
            onChange={(v) => updateSetting('displayScale', DISPLAY_SIZE_OPTIONS.find(o => o.value === v)!.multiplier)}
            accessibilityLabel="Display size"
          />
          <SectionCaption text={activeDisplaySize.sub} />
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
  pickerTrack: { flexDirection: 'row', justifyContent: 'space-between', borderWidth: StyleSheet.hairlineWidth },
  pickerOption: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  livePill: { paddingVertical: 3, borderWidth: StyleSheet.hairlineWidth },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between' },
  previewItem: { flex: 1, alignItems: 'center' },
  previewIconWrap: { alignItems: 'center', justifyContent: 'center' },
});
