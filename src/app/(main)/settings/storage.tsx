// File: src/app/(main)/settings/storage.tsx
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { VaultHeader } from '../../../components/VaultHeader';
import { useThemeColors } from '../../../contexts/ThemeContext';
import { StorageService } from '../../../services/storage';

function ProgressBar({
  ratio,
  color,
  delay = 0,
}: {
  ratio: number;
  color: string;
  delay?: number;
}) {
  return (
    <View style={barStyles.track}>
      <View style={[barStyles.fill, { backgroundColor: color, width: `${ratio * 100}%` }]} />
    </View>
  );
}

const barStyles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
});

function StatCard({
  icon,
  label,
  value,
  sublabel,
  barRatio,
  barColor,
  delay,
  colors,
}: {
  icon: string;
  label: string;
  value: string;
  sublabel?: string;
  barRatio?: number;
  barColor?: string;
  delay?: number;
  colors: any;
}) {
  return (
    <View
      style={[
        statStyles.card,
        {
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderColor: 'rgba(255,255,255,0.08)',
        },
      ]}
    >
      <View style={statStyles.header}>
        <View style={[statStyles.iconBox, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
          <Text style={statStyles.icon}>{icon}</Text>
        </View>
        <View style={statStyles.texts}>
          <Text style={[statStyles.label, { color: 'rgba(255,255,255,0.45)' }]}>{label}</Text>
          <Text style={[statStyles.value, { color: colors.text }]}>{value}</Text>
          {sublabel ? (
            <Text style={[statStyles.sublabel, { color: 'rgba(255,255,255,0.3)' }]}>{sublabel}</Text>
          ) : null}
        </View>
      </View>
      {barRatio !== undefined && barColor ? (
        <View style={{ marginTop: 14 }}>
          <ProgressBar ratio={barRatio} color={barColor} delay={delay ?? 0} />
          <Text style={[statStyles.barLabel, { color: 'rgba(255,255,255,0.3)' }]}>
            {Math.round(barRatio * 100)}% used
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  icon: { fontSize: 20 },
  texts: { flex: 1 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  value: { fontSize: 22, fontWeight: '700' },
  sublabel: { fontSize: 11, marginTop: 3 },
  barLabel: { fontSize: 10, marginTop: 6, textAlign: 'right' },
});

export default function StorageTelemetryScreen() {
  const colors = useThemeColors();
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<{ used: number; free: number } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    StorageService.getStorageQuotaInfo()
      .then(setQuota)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const usedMB = quota ? quota.used / (1024 * 1024) : 0;
  const freeGB = quota ? quota.free / (1024 * 1024 * 1024) : 0;
  const totalBytes = quota ? quota.used + quota.free : 1;
  const usedRatio = quota ? quota.used / totalBytes : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Storage" showBack />
      <View style={styles.content}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: 'rgba(255,255,255,0.35)' }]}>
              Reading partition…
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={[styles.errorText, { color: colors.text }]}>
              Could not read storage data
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: 'rgba(255,255,255,0.38)' }]}>
              PARTITION OVERVIEW
            </Text>

            <StatCard
              icon="📦"
              label="APP SANDBOX USAGE"
              value={`${usedMB.toFixed(2)} MB`}
              sublabel="Vault data on this device"
              barRatio={usedRatio}
              barColor={colors.primary}
              delay={0}
              colors={colors}
            />

            <StatCard
              icon="💿"
              label="FREE DEVICE STORAGE"
              value={`${freeGB.toFixed(2)} GB`}
              sublabel="Available on hardware"
              barRatio={1 - usedRatio}
              barColor="#34d399"
              delay={120}
              colors={colors}
            />

            <StatCard
              icon="🗂️"
              label="TOTAL DEVICE STORAGE"
              value={`${((totalBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`}
              sublabel="Combined capacity"
              delay={240}
              colors={colors}
            />
          </>
        )}
      </View>

      <AnimatedTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, flex: 1, paddingBottom: 110 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  loadingWrap: { alignItems: 'center', marginTop: 80, gap: 16 },
  loadingText: { fontSize: 13 },
  errorWrap: { alignItems: 'center', marginTop: 80 },
  errorEmoji: { fontSize: 40, marginBottom: 12 },
  errorText: { fontSize: 15, fontWeight: '600' },
});
