import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedCard } from '../../../components/AnimatedCard';
import { VaultHeader } from '../../../components/VaultHeader';
import { useThemeColors } from '../../../contexts/ThemeContext';
import { useSettingsStore } from '../../../store/settingsStore';

export default function CustomizationSettingsScreen() {
  const colors = useThemeColors();
  const { themeMode, viewMode, updateSetting } = useSettingsStore();

  const themeOptions: { id: typeof themeMode; label: string }[] = [
    { id: 'light', label: 'Classic Light' },
    { id: 'dark', label: 'Deep Dark' },
    { id: 'amoled', label: 'AMOLED High Contrast' }
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Appearance Layouts" showBack />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Core Visual Mode Engine</Text>
        {themeOptions.map(opt => {
          const active = themeMode === opt.id;
          return (
            <AnimatedCard key={opt.id} onPress={() => updateSetting('themeMode', opt.id)}>
              <View style={styles.selectionRow}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: active ? '700' : '400' }}>
                  {opt.label}
                </Text>
                {active && <Text style={{ color: colors.primary, fontWeight: 'bold' }}>✓ Active</Text>}
              </View>
            </AnimatedCard>
          );
        })}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Dashboard View Configuration</Text>
        <AnimatedCard onPress={() => updateSetting('viewMode', viewMode === 'grid' ? 'list' : 'grid')}>
          <View style={styles.selectionRow}>
            <Text style={{ color: colors.text, fontSize: 16 }}>
              Current Directory Layout: <Text style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{viewMode}</Text>
            </Text>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Toggle State</Text>
          </View>
        </AnimatedCard>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', marginTop: 24, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  selectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }
});