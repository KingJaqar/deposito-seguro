// File: src/components/ViewModeMenu.tsx
import { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LayoutGrid, List, PanelTop, Monitor } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MENU_WIDTH = Math.min(SCREEN_WIDTH * 0.55, 220);

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
  const { colors } = useTheme();
  const viewMode = useSettingsStore((s) => s.viewMode);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const [visible, setVisible] = useState(false);

  const handleSelect = async (mode: 'list' | 'small-icons' | 'medium-icons' | 'large-icons') => {
    await updateSetting('viewMode', mode);
    setVisible(false);
  };

  const currentOption = OPTIONS.find((o) => o.key === viewMode) ?? OPTIONS[0];

  return (
    <View>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        style={[styles.trigger, { backgroundColor: colors.dashboardSurfaceHover ?? colors.surfaceElevated }]}
        accessibilityRole="button"
        accessibilityLabel="Change view mode"
      >
        <currentOption.Icon size={18} color={colors.text} strokeWidth={2} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.overlay} onPress={() => setVisible(false)} activeOpacity={1}>
          <View style={[styles.menuCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.menuTitle, { color: colors.text }]}>View Options</Text>

            {OPTIONS.map((opt) => {
              const isSelected = viewMode === opt.key;
              const IconComp = opt.Icon;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => handleSelect(opt.key)}
                  style={[
                    styles.optionRow,
                    { backgroundColor: isSelected ? `${colors.primary}15` : 'transparent' },
                  ]}
                >
                  <View style={[styles.optionIcon, { backgroundColor: isSelected ? `${colors.primary}25` : `${colors.text}12` }]}>
                    <IconComp size={18} color={isSelected ? colors.primary : colors.text} strokeWidth={2} />
                  </View>
                  <View style={styles.optionTextBlock}>
                    <Text style={[styles.optionLabel, { color: isSelected ? colors.primary : colors.text }]}>
                      {opt.label}
                    </Text>
                    <Text style={[styles.optionDesc, { color: colors.textMuted }]}>{opt.description}</Text>
                  </View>
                  {isSelected && (
                    <View style={[styles.checkDot, { backgroundColor: colors.primary }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  trigger: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingBottom: 120,
    paddingHorizontal: 40,
  },
  menuCard: {
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'stretch',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextBlock: { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: '600' },
  optionDesc: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  checkDot: { width: 8, height: 8, borderRadius: 4 },
});
