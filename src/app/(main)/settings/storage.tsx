// File: src/app/(main)/settings/storage.tsx
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { VaultHeader } from '../../../components/VaultHeader';
import { useTheme } from '../../../contexts/ThemeContext';
import { StorageService } from '../../../services/storage';

function ProgressBar({
  ratio,
  color,
  delay = 0,
  trackHeight = 8,
}: {
  ratio: number;
  color: string;
  delay?: number;
  trackHeight?: number;
}) {
  return (
    <View style={[barStyles.track, { height: trackHeight, backgroundColor: 'rgba(255,255,255,0.08)' }]}>
      <View style={[barStyles.fill, { backgroundColor: color, width: `${ratio * 100}%` }]} />
    </View>
  );
}

const barStyles = StyleSheet.create({
  track: {
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: { borderRadius: 4 },
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
  space,
  font,
}: {
  icon: string;
  label: string;
  value: string;
  sublabel?: string;
  barRatio?: number;
  barColor?: string;
  delay?: number;
  colors: any;
  space: (key: any) => number;
  font: (size: number) => number;
}) {
  return (
    <View
      style={[
        statStyles.card,
        {
          padding: space(4),
          marginBottom: space(3),
        },
      ]}
    >
      <View style={statStyles.header}>
        <View style={[statStyles.iconBox, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
          <Text style={statStyles.icon}>{icon}</Text>
        </View>
        <View style={statStyles.texts}>
          <Text style={[statStyles.label, { color: 'rgba(255,255,255,0.45)', fontSize: font(11) }]}>{label}</Text>
          <Text style={[statStyles.value, { color: colors.text, fontSize: font(22) }]}>{value}</Text>
          {sublabel ? (
            <Text style={[statStyles.sublabel, { color: 'rgba(255,255,255,0.3)', fontSize: font(11) }]}>{sublabel}</Text>
          ) : null}
        </View>
      </View>
      {barRatio !== undefined && barColor ? (
        <View style={{ marginTop: space(3) }}>
          <ProgressBar ratio={barRatio} color={barColor} delay={delay ?? 0} trackHeight={space(2)} />
          <Text style={[statStyles.barLabel, { color: 'rgba(255,255,255,0.3)', fontSize: font(10) }]}>
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
  icon: {},
  texts: { flex: 1 },
  label: { fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  value: { fontWeight: '700' },
  sublabel: { marginTop: 3 },
  barLabel: { marginTop: 6, textAlign: 'right' },
});

export default function StorageTelemetryScreen() {
  const { colors, space, screenPadding, bottomTabSpacing, font } = useTheme();
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
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Storage" showBack />
      <View style={[styles.content, { paddingHorizontal: screenPadding, paddingBottom: bottomTabSpacing }]}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: 'rgba(255,255,255,0.35)', fontSize: font(13) }]}>
              Reading partition…
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={[styles.errorText, { color: colors.text, fontSize: font(15) }]}>
              Could not read storage data
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: 'rgba(255,255,255,0.38)', fontSize: font(11) }]}>
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
              space={space}
              font={font}
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
              space={space}
              font={font}
            />

            <StatCard
              icon="🗂️"
              label="TOTAL DEVICE STORAGE"
              value={`${((totalBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`}
              sublabel="Combined capacity"
              delay={240}
              colors={colors}
              space={space}
              font={font}
            />
          </>
        )}
      </View>

      <AnimatedTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  sectionTitle: {
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
  },
  loadingWrap: { alignItems: 'center', marginTop: 80, gap: 16 },
  loadingText: {},
  errorWrap: { alignItems: 'center', marginTop: 80 },
  errorEmoji: { marginBottom: 12 },
  errorText: { fontWeight: '600' },
});
