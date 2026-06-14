import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { AnimatedCard } from '../../../components/AnimatedCard';
import { StyledButton } from '../../../components/StyledButton';
import { VaultHeader } from '../../../components/VaultHeader';
import { useThemeColors } from '../../../contexts/ThemeContext';
import { BackupService } from '../../../services/backup';
import { useSettingsStore } from '../../../store/settingsStore';

export default function SettingsCenterScreen() {
  const colors = useThemeColors();
  const { themeMode, disguiseMode, biometricsEnabled, updateSetting } = useSettingsStore();

  const handleExport = async () => {
    const path = await BackupService.exportCompleteBackupArchive();
    if (path) {
      Alert.alert('Backup Complete', 'Encrypted local structural manifest shared successfully.');
    } else {
      Alert.alert('Backup Error', 'Failed compiling data structures.');
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="System Settings" showBack />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Identity Disguise Shield</Text>
        <AnimatedCard>
          <View style={styles.row}>
            <Text style={{ color: colors.text, fontSize: 16 }}>Calculator Spoofing</Text>
            <Switch
              value={disguiseMode === 'calculator'}
              onValueChange={(val) => updateSetting('disguiseMode', val ? 'calculator' : 'default')}
            />
          </View>
        </AnimatedCard>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Visual Configurations</Text>
        <AnimatedCard>
          <View style={styles.row}>
            <Text style={{ color: colors.text, fontSize: 16 }}>High Contrast AMOLED</Text>
            <Switch
              value={themeMode === 'amoled'}
              onValueChange={(val) => updateSetting('themeMode', val ? 'amoled' : 'dark')}
            />
          </View>
        </AnimatedCard>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Hardware Biometrics</Text>
        <AnimatedCard>
          <View style={styles.row}>
            <Text style={{ color: colors.text, fontSize: 16 }}>Require Biometric Challenge</Text>
            <Switch
              value={biometricsEnabled}
              onValueChange={(val) => updateSetting('biometricsEnabled', val)}
            />
          </View>
        </AnimatedCard>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Data Continuity Engine</Text>
        <StyledButton title="Export Standalone Backup Archive" onPress={handleExport} />

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', marginTop: 20, marginBottom: 8, marginHorizontal: 4, letterSpacing: 0.5, textTransform: 'uppercase' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }
});