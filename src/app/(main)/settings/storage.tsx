import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AnimatedCard } from '../../../components/AnimatedCard';
import { VaultHeader } from '../../../components/VaultHeader';
import { useThemeColors } from '../../../contexts/ThemeContext';
import { StorageService } from '../../../services/storage';

export default function StorageTelemetryScreen() {
  const colors = useThemeColors();
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<{ used: number; free: number } | null>(null);

  useEffect(() => {
    async function loadTelemetry() {
      try {
        const data = await StorageService.getStorageQuotaInfo();
        setQuota(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadTelemetry();
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Hardware Partition Telemetry" showBack />
      <View style={{ padding: 16 }}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : quota ? (
          <AnimatedCard style={styles.telemetryCard}>
            <Text style={[styles.label, { color: colors.textMuted }]}>ISOLATED STORAGE LAYER STATUS</Text>
            <View style={styles.statLine}>
              <Text style={{ color: colors.text }}>Allocated App Sandbox Footprint:</Text>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>{(quota.used / (1024 * 1024)).toFixed(2)} MB</Text>
            </View>
            <View style={styles.statLine}>
              <Text style={{ color: colors.text }}>Available Hardware Space Left:</Text>
              <Text style={{ color: colors.success, fontWeight: '700' }}>{(quota.free / (1024 * 1024 * 1024)).toFixed(2)} GB</Text>
            </View>
          </AnimatedCard>
        ) : (
          <Text style={{ color: colors.error }}>Failed compiling subsystem sector telemetry map.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  telemetryCard: { padding: 16 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 12 },
  statLine: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 8 }
});