import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { VaultHeader } from '../../../components/VaultHeader';
import { useThemeColors } from '../../../contexts/ThemeContext';
import { useSettingsStore } from '../../../store/settingsStore';

function OptionRow({
  label,
  sublabel,
  active,
  onPress,
  colors,
}: {
  label: string;
  sublabel?: string;
  active: boolean;
  onPress: () => void;
  colors: any;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View
        style={[
          optStyles.row,
          {
            backgroundColor: active
              ? `${colors.primary}22`
              : 'transparent',
            borderColor: active
              ? colors.primary
              : 'rgba(255,255,255,0.07)',
          },
        ]}
      >
        <View style={optStyles.texts}>
          <Text style={[optStyles.label, { color: colors.text }]}>{label}</Text>
          {sublabel ? (
            <Text style={[optStyles.sublabel, { color: 'rgba(255,255,255,0.35)' }]}>{sublabel}</Text>
          ) : null}
        </View>
        <View
          style={[
            optStyles.radio,
            {
              borderColor: active ? colors.primary : 'rgba(255,255,255,0.2)',
              backgroundColor: active ? colors.primary : 'transparent',
            },
          ]}
        >
          {active && <View style={optStyles.radioDot} />}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const optStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  texts: { flex: 1 },
  label: { fontSize: 15, fontWeight: '600' },
  sublabel: { fontSize: 12, marginTop: 3 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
});

function SectionTitle({ title }: { title: string }) {
  return (
    <Text style={sTitle.t}>{title}</Text>
  );
}
const sTitle = StyleSheet.create({
  t: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    color: 'rgba(255,255,255,0.38)',
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 24,
    paddingHorizontal: 4,
  },
});

export default function CustomizationSettingsScreen() {
  const colors = useThemeColors();
  const { themeMode, viewMode, updateSetting } = useSettingsStore();

  const themeOptions: { id: typeof themeMode; label: string; sub: string }[] = [
    { id: 'light', label: '☀️ Classic Light', sub: 'Bright backgrounds, dark text' },
    { id: 'dark', label: '🌙 Deep Dark', sub: 'Low-light comfortable theme' },
    { id: 'amoled', label: '⚫ AMOLED Contrast', sub: 'True black for OLED displays' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Appearance" showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <SectionTitle title="Color Theme" />
        {themeOptions.map(opt => (
          <OptionRow
            key={opt.id}
            label={opt.label}
            sublabel={opt.sub}
            active={themeMode === opt.id}
            onPress={() => updateSetting('themeMode', opt.id)}
            colors={colors}
          />
        ))}

        <SectionTitle title="Directory Layout" />
        <OptionRow
          label="⊞ Grid View"
          sublabel="Files displayed in a grid"
          active={viewMode === 'grid'}
          onPress={() => updateSetting('viewMode', 'grid')}
          colors={colors}
        />
        <OptionRow
          label="☰ List View"
          sublabel="Files displayed as rows"
          active={viewMode === 'list'}
          onPress={() => updateSetting('viewMode', 'list')}
          colors={colors}
        />

      </ScrollView>
      <AnimatedTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 110, paddingTop: 8 },
});
