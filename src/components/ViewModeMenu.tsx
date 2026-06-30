import { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { List, LayoutGrid, PanelTop, Monitor } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { AnimatedActionSheet } from './AnimatedActionSheet';

type ViewOption = {
  key: 'list' | 'small-icons' | 'medium-icons' | 'large-icons';
  label: string;
  description: string;
  Icon: any;
};

const OPTIONS: ViewOption[] = [
  { key: 'list', label: 'List View', description: 'Single column list', Icon: List },
  { key: 'small-icons', label: 'Small Icons', description: 'Up to 5 columns', Icon: LayoutGrid },
  { key: 'medium-icons', label: 'Medium Icons', description: 'Up to 3 columns', Icon: PanelTop },
  { key: 'large-icons', label: 'Large Icons', description: 'Up to 2 columns', Icon: Monitor },
];

export const ViewModeMenu = () => {
  const { isDark, space, font, radius, isTablet, responsiveSize } = useTheme();
  const viewMode = useSettingsStore((s) => s.viewMode);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const [visible, setVisible] = useState(false);

  const handleSelect = async (mode: 'list' | 'small-icons' | 'medium-icons' | 'large-icons') => {
    await updateSetting('viewMode', mode);
    setVisible(false);
  };

  const triggerSize = responsiveSize(40, 48, 52);

  const currentOption = OPTIONS.find((o) => o.key === viewMode) ?? OPTIONS[0];
  const CurrentIcon = currentOption.Icon;

  const softBlue = '#4A90D9';
  const rowBorder = isDark ? '#333333' : '#E5E5E5';
  const textPrimary = isDark ? '#FFFFFF' : '#111111';
  const textSecondary = isDark ? '#999999' : '#666666';
  const chipActive = softBlue;
  const chipInactive = isDark ? '#2A2A2A' : '#F5F5F5';
  const iconActive = '#FFFFFF';
  const iconInactive = isDark ? '#FFFFFF' : '#111111';

  return (
    <View>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        style={[
          styles.trigger,
          { backgroundColor: chipInactive, width: triggerSize, height: triggerSize, borderRadius: triggerSize / 2 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Change view mode"
      >
        <CurrentIcon size={18} color={iconInactive} strokeWidth={2} />
      </TouchableOpacity>

      <AnimatedActionSheet
        visible={visible}
        onClose={() => setVisible(false)}
        title="View Options"
        closeOnSwipeDown
      >
        {OPTIONS.map((opt) => {
          const isSelected = viewMode === opt.key;
          const IconComp = opt.Icon;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => handleSelect(opt.key)}
              style={[
                styles.optionRow,
                {
                  backgroundColor: isSelected ? `${softBlue}15` : 'transparent',
                  borderBottomColor: rowBorder,
                  paddingVertical: space(4),
                  paddingHorizontal: space(6),
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={opt.label}
            >
              <View
                style={[
                  styles.optionIcon,
                  {
                    backgroundColor: isSelected ? chipActive : chipInactive,
                    width: space(10),
                    height: space(10),
                    borderRadius: radius(5),
                  },
                ]}
              >
                <IconComp
                  size={18}
                  color={isSelected ? iconActive : iconInactive}
                  strokeWidth={2}
                />
              </View>
              <View style={styles.optionTextBlock}>
                 <Text
                   style={[
                     styles.optionLabel,
                     { color: isSelected ? softBlue : textPrimary, fontSize: font(16) },
                   ]}
                   numberOfLines={1}
                 >
                   {opt.label}
                 </Text>
                 <Text
                   style={[
                     styles.optionDesc,
                     { color: textSecondary, fontSize: font(13) },
                   ]}
                   numberOfLines={1}
                 >
                   {opt.description}
                 </Text>
              </View>
              {isSelected && (
                <View style={[styles.checkDot, { backgroundColor: softBlue }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </AnimatedActionSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  trigger: {
    alignItems: 'center',
    justifyContent: 'center',
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
  optionLabel: { fontWeight: '600' },
  optionDesc: { fontWeight: '500', marginTop: 2 },
  checkDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
});
