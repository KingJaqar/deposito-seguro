import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { VaultHeader } from '../../../components/VaultHeader';
import { useTheme } from '../../../contexts/ThemeContext';
import { useSettingsStore } from '../../../store/settingsStore';

function OptionRow({
  label,
  sublabel,
  active,
  onPress,
  colors,
  isDark,
  space,
  font,
}: {
  label: string;
  sublabel?: string;
  active: boolean;
  onPress: () => void;
  colors: any;
  isDark: boolean;
  space: (key: any) => number;
  font: (size: number) => number;
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
              : isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
            padding: space(4),
            marginBottom: space(2),
          },
        ]}
      >
        <View style={optStyles.texts}>
          <Text style={[optStyles.label, { color: colors.text, fontSize: font(15) }]}>{label}</Text>
          {sublabel ? (
            <Text style={[optStyles.sublabel, { color: colors.textMuted, fontSize: font(12) }]}>{sublabel}</Text>
          ) : null}
        </View>
        <View
          style={[
            optStyles.radio,
            {
              borderColor: active ? colors.primary : isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)',
              backgroundColor: active ? colors.primary : 'transparent',
            },
          ]}
        >
          {active && <View style={[optStyles.radioDot, { backgroundColor: colors.text }]} />}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const optStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
  },
  texts: { flex: 1, flexShrink: 1 },
  label: { fontWeight: '600', flexShrink: 1 },
  sublabel: { marginTop: 3 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
});

function SectionTitle({ title, color, space, font }: { title: string; color: string; space: (key: any) => number; font: (size: number) => number }) {
  return (
    <Text style={[sTitle.t, { color, fontSize: font(11), marginBottom: space(3), marginTop: space(6), paddingHorizontal: space(1) }]}>{title}</Text>
  );
}
const sTitle = StyleSheet.create({
  t: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 24,
    paddingHorizontal: 4,
  },
});

export default function CustomizationSettingsScreen() {
  const { colors, isDark, space, screenPadding, bottomTabSpacing, headerPaddingTop, font, isTablet, clampSize } = useTheme();
  const { themeMode, viewMode, updateSetting } = useSettingsStore();

  const themeOptions: { id: typeof themeMode; label: string; sub: string }[] = [
    { id: 'light', label: '☀️ Classic Light', sub: 'Bright backgrounds, dark text' },
    { id: 'dark', label: '🌙 Deep Dark', sub: 'Low-light comfortable theme' },
    { id: 'amoled', label: '⚫ AMOLED Contrast', sub: 'True black for OLED displays' },
  ];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Appearance" showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <SectionTitle title="Color Theme" color={colors.textMuted} space={space} font={font} />
        {themeOptions.map(opt => (
          <OptionRow
            key={opt.id}
            label={opt.label}
            sublabel={opt.sub}
            active={themeMode === opt.id}
            onPress={() => updateSetting('themeMode', opt.id)}
            colors={colors}
            isDark={isDark}
            space={space}
            font={font}
          />
        ))}

        <SectionTitle title="Directory Layout" color={colors.textMuted} space={space} font={font} />
        <OptionRow
          label="☰ List View"
          sublabel="Files displayed as rows"
          active={viewMode === 'list'}
          onPress={() => updateSetting('viewMode', 'list')}
          colors={colors}
          isDark={isDark}
          space={space}
          font={font}
        />
        <OptionRow
          label="⊞ Large Icons"
          sublabel="Up to 2 columns"
          active={viewMode === 'large-icons'}
          onPress={() => updateSetting('viewMode', 'large-icons')}
          colors={colors}
          isDark={isDark}
          space={space}
          font={font}
        />
        <OptionRow
          label="⊟ Medium Icons"
          sublabel="Up to 3 columns"
          active={viewMode === 'medium-icons'}
          onPress={() => updateSetting('viewMode', 'medium-icons')}
          colors={colors}
          isDark={isDark}
          space={space}
          font={font}
        />
        <OptionRow
          label="▦ Small Icons"
          sublabel="Up to 5 columns"
          active={viewMode === 'small-icons'}
          onPress={() => updateSetting('viewMode', 'small-icons')}
          colors={colors}
          isDark={isDark}
          space={space}
          font={font}
        />

      </ScrollView>
      <AnimatedTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 110, paddingTop: 16 },
});
