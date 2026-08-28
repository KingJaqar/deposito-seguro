// src/components/ViewModeMenu.tsx
// Rebuilt per §5/§7 Phase 3: internal sheet migrated onto the Sheet primitive
// from Phase 2 instead of a direct AnimatedActionSheet call. Business logic
// (useSettingsStore().viewMode read/write) is unchanged.
import { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { List, LayoutGrid, PanelTop, Monitor, Check } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';
import { Sheet } from './primitives/Sheet';

type ViewModeKey = 'list' | 'small-icons' | 'medium-icons' | 'large-icons';

type ViewOption = {
  key: ViewModeKey;
  label: string;
  description: string;
  Icon: LucideIcon;
};

const OPTIONS: ViewOption[] = [
  { key: 'list', label: 'List View', description: 'Single column list', Icon: List },
  { key: 'small-icons', label: 'Small Icons', description: 'Up to 5 columns', Icon: LayoutGrid },
  { key: 'medium-icons', label: 'Medium Icons', description: 'Up to 3 columns', Icon: PanelTop },
  { key: 'large-icons', label: 'Large Icons', description: 'Up to 2 columns', Icon: Monitor },
];

export const ViewModeMenu = () => {
  const { colors, space, font, radius, responsiveSize, iconSize } = useTheme();
  const viewMode = useSettingsStore((s) => s.viewMode);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const [visible, setVisible] = useState(false);

  const handleSelect = async (mode: ViewModeKey) => {
    await updateSetting('viewMode', mode);
    setVisible(false);
  };

  const triggerSize = iconSize(responsiveSize(40, 48, 52));
  const currentOption = OPTIONS.find((o) => o.key === viewMode) ?? OPTIONS[0];
  const CurrentIcon = currentOption.Icon;

  return (
    <View>
      <Pressable
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: colors.surfaceHover,
            borderColor: colors.borderLight,
            width: triggerSize,
            height: triggerSize,
            borderRadius: triggerSize / 2,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Change view mode"
      >
        <CurrentIcon size={iconSize(18)} color={colors.text} strokeWidth={2} />
      </Pressable>

      <Sheet visible={visible} onClose={() => setVisible(false)} title="View Options" closeOnSwipeDown>
        {OPTIONS.map((opt) => {
          const isSelected = viewMode === opt.key;
          const IconComp = opt.Icon;
          return (
            <Pressable
              key={opt.key}
              onPress={() => handleSelect(opt.key)}
              style={({ pressed }) => [
                styles.optionRow,
                {
                  backgroundColor: isSelected ? `${colors.primary}14` : pressed ? colors.surfaceHover : 'transparent',
                  borderBottomColor: colors.borderLight,
                  paddingVertical: space(4),
                  paddingHorizontal: space(5),
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, checked: isSelected }}
              accessibilityLabel={opt.label}
            >
              <View
                style={[
                  styles.optionIcon,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.surfaceHover,
                    width: space(10),
                    height: space(10),
                    borderRadius: radius(5),
                  },
                ]}
              >
                <IconComp size={iconSize(18)} color={isSelected ? colors.onPrimary : colors.text} strokeWidth={2} />
              </View>
              <View style={styles.optionTextBlock}>
                <Text
                  style={[styles.optionLabel, { color: isSelected ? colors.primary : colors.text, fontSize: font(Type.body.size) }]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
                <Text style={[styles.optionDesc, { color: colors.textMuted, fontSize: font(Type.caption.size) }]} numberOfLines={1}>
                  {opt.description}
                </Text>
              </View>
              {isSelected && <Check size={iconSize(18)} color={colors.primary} strokeWidth={3} />}
            </Pressable>
          );
        })}
      </Sheet>
    </View>
  );
};

const styles = StyleSheet.create({
  trigger: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  optionTextBlock: {
    flex: 1,
    flexShrink: 1,
  },
  optionLabel: { fontWeight: '700' },
  optionDesc: { fontWeight: '500', marginTop: 2 },
});
