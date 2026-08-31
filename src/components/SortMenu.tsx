// src/components/SortMenu.tsx
// Icon button + bottom Sheet radio-list sort control, shared across every
// vault-listing screen (Dashboard, Folder, Favorites, Search, Trash) — see
// plans/sorting function implementation plan.md. Mirrors ViewModeMenu.tsx's
// structure exactly (Milestone 2), plus:
//   - Enhancement A: uppercase group captions (Name/Date/Size/Type) above
//     each option pair, matching trash.tsx's existing sectionHeader style.
//   - Enhancement B: trigger accessibilityLabel announces the *current*
//     sort, not just that a sort control exists.
//   - Enhancement C: a small active-indicator dot on the trigger icon when
//     the current sort isn't the screen's own default.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';
import { Sheet } from './primitives/Sheet';
import { SORT_OPTIONS, SortKey } from '../utils/vaultSort';

interface SortMenuProps {
  value: SortKey;
  onChange: (key: SortKey) => void;
  /** The screen's own default sort — used only to show the Enhancement C indicator dot. */
  defaultKey: SortKey;
}

export const SortMenu = ({ value, onChange, defaultKey }: SortMenuProps) => {
  const { colors, space, font, radius, responsiveSize, iconSize } = useTheme();
  const [visible, setVisible] = useState(false);

  const handleSelect = (key: SortKey) => {
    onChange(key);
    setVisible(false);
  };

  const triggerSize = iconSize(responsiveSize(40, 48, 52));
  const currentOption = SORT_OPTIONS.find((o) => o.key === value) ?? SORT_OPTIONS[0];
  const isNonDefault = value !== defaultKey;
  const TriggerIcon = currentOption.Icon;

  return (
    <View>
      <Pressable
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.trigger,
          {
            width: triggerSize,
            height: triggerSize,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Sort options, currently ${currentOption.label}`}
      >
        <TriggerIcon size={iconSize(18)} color={colors.text} strokeWidth={2} />
        {isNonDefault && (
          <View
            style={[
              styles.activeDot,
              { backgroundColor: colors.primary, borderColor: colors.background },
            ]}
          />
        )}
      </Pressable>

      <Sheet visible={visible} onClose={() => setVisible(false)} title="Sort By" closeOnSwipeDown>
        {SORT_OPTIONS.map((opt, index) => {
          const isSelected = value === opt.key;
          const IconComp = opt.Icon;
          const isGroupStart = index % 2 === 0;
          return (
            <View key={opt.key}>
              {isGroupStart && (
                <Text
                  style={[
                    styles.groupHeader,
                    {
                      color: colors.textMuted,
                      fontSize: font(Type.eyebrow.size),
                      paddingHorizontal: space(5),
                      marginTop: index === 0 ? 0 : space(3),
                      marginBottom: space(1),
                    },
                  ]}
                >
                  {opt.group.toUpperCase()}
                </Text>
              )}
              <Pressable
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
                <Text
                  style={[styles.optionLabel, { color: isSelected ? colors.primary : colors.text, fontSize: font(Type.body.size) }]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
                {isSelected && <Check size={iconSize(18)} color={colors.primary} strokeWidth={3} />}
              </Pressable>
            </View>
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
  },
  activeDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  groupHeader: { fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
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
  optionLabel: { flex: 1, flexShrink: 1, fontWeight: '700' },
});
