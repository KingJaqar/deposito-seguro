// src/app/(main)/settings/storage.tsx
// Rebuilt per plans/you-are-a-senior-majestic-swing.md §3/§7 Phase 4.
// Store reads/writes (getVaultUsageBytes, storageLimitBytes, updateSetting)
// and the StorageService.getStorageQuotaInfo() load are unchanged; only
// JSX/StyleSheet is new. Notable per-plan change — the real bug this rewrite
// fixes: the local `StatCard`/`ProgressBar` here hardcoded track/text colors
// as `rgba(255,255,255,...)`, invisible in light theme; the new
// `ProgressBar`/`Card` primitives source every color from tokens instead
// (`colors.borderLight` for the track, per §3/§5), so the bars and labels are
// legible in every palette, not just dark ones.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, Database, HardDrive, Package, SlidersHorizontal } from 'lucide-react-native';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { VaultHeader } from '../../../components/VaultHeader';
import { Card } from '../../../components/primitives/Card';
import { Chip } from '../../../components/primitives/Chip';
import { ProgressBar } from '../../../components/primitives/ProgressBar';
import { Type } from '../../../constants/typography';
import { useTheme } from '../../../contexts/ThemeContext';
import { formatBytes, isStorageLimitOptionDisabled, STORAGE_LIMIT_OPTIONS } from '../../../constants/storageLimits';
import { StorageService } from '../../../services/storage';
import { useSettingsStore } from '../../../store/settingsStore';
import { useVaultStore } from '../../../store/vaultStore';

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  barRatio,
  barColor,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  sublabel?: string;
  barRatio?: number;
  barColor?: string;
}) {
  const { colors, space, font , iconSize } = useTheme();
  return (
    <Card style={{ marginBottom: space(3) }}>
      <View style={styles.statHeader}>
        <View style={[styles.iconBox, { backgroundColor: colors.surfaceHover, marginRight: space(3) }]}>
          <Icon size={iconSize(20)} color={colors.textSecondary} strokeWidth={2} />
        </View>
        <View style={styles.statTexts}>
          <Text style={[styles.statLabel, { color: colors.textMuted, fontSize: font(Type.eyebrow.size) }]}>{label}</Text>
          <Text style={[styles.statValue, { color: colors.text, fontSize: font(Type.headline.size) }]}>{value}</Text>
          {sublabel ? <Text style={[styles.statSublabel, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>{sublabel}</Text> : null}
        </View>
      </View>
      {barRatio !== undefined && barColor ? (
        <View style={{ marginTop: space(3) }}>
          <ProgressBar progress={barRatio} color={barColor} showPercentage />
        </View>
      ) : null}
    </Card>
  );
}

export default function StorageTelemetryScreen() {
  const { colors, space, screenPadding, bottomTabSpacing, font , iconSize } = useTheme();
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<{ used: number; free: number; total: number } | null>(null);
  const [error, setError] = useState(false);

  const storageLimitBytes = useSettingsStore((s) => s.storageLimitBytes);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const vaultUsageBytes = useVaultStore((s) => s.getVaultUsageBytes());

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

  const limitRatio = storageLimitBytes ? Math.min(1, vaultUsageBytes / storageLimitBytes) : 0;
  const limitBarColor = limitRatio >= 1 ? colors.error : limitRatio >= 0.9 ? colors.warning : colors.primary;
  const isOverLimit = storageLimitBytes !== null && vaultUsageBytes > storageLimitBytes;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      <VaultHeader title="Storage" showBack />
      <View style={[styles.content, { paddingHorizontal: screenPadding, paddingTop: space(4), paddingBottom: bottomTabSpacing }]}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>Reading partition…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorWrap}>
            <AlertTriangle size={iconSize(32)} color={colors.error} strokeWidth={1.75} style={{ marginBottom: space(3) }} />
            <Text style={[styles.errorText, { color: colors.text, fontSize: font(Type.subtitle.size) }]}>Could not read storage data</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textMuted, fontSize: font(Type.eyebrow.size), marginBottom: space(3) }]}>STORAGE LIMIT</Text>

            <StatCard
              icon={isOverLimit ? AlertTriangle : SlidersHorizontal}
              label="VAULT LIMIT USAGE"
              value={`${formatBytes(vaultUsageBytes)}${storageLimitBytes !== null ? ` / ${formatBytes(storageLimitBytes)}` : ''}`}
              sublabel={
                storageLimitBytes === null
                  ? 'No cap — imports are never blocked'
                  : isOverLimit
                    ? 'Over limit — new imports will be blocked until this is raised or freed up'
                    : `${Math.round(limitRatio * 100)}% of the configured limit`
              }
              barRatio={storageLimitBytes !== null ? limitRatio : undefined}
              barColor={storageLimitBytes !== null ? limitBarColor : undefined}
            />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(2) }}>
              {STORAGE_LIMIT_OPTIONS.map((opt) => {
                const optionDisabled = quota ? isStorageLimitOptionDisabled(opt.bytes, quota.total, quota.free) : false;
                return (
                  <Chip
                    key={opt.label}
                    label={opt.label}
                    selected={storageLimitBytes === opt.bytes}
                    disabled={optionDisabled}
                    onPress={() => updateSetting('storageLimitBytes', opt.bytes)}
                  />
                );
              })}
            </View>
            <Text style={[styles.capHint, { color: colors.textMuted, fontSize: font(Type.caption.size), marginTop: space(2), marginBottom: space(6) }]}>
              Greyed-out options exceed this device&apos;s capacity or its currently free space.
            </Text>

            <Text style={[styles.sectionTitle, { color: colors.textMuted, fontSize: font(Type.eyebrow.size), marginBottom: space(3) }]}>PARTITION OVERVIEW</Text>

            <StatCard icon={Package} label="APP SANDBOX USAGE" value={`${usedMB.toFixed(2)} MB`} sublabel="Vault data on this device" barRatio={usedRatio} barColor={colors.primary} />
            <StatCard icon={HardDrive} label="FREE DEVICE STORAGE" value={`${freeGB.toFixed(2)} GB`} sublabel="Available on hardware" barRatio={1 - usedRatio} barColor={colors.secondary} />
            <StatCard icon={Database} label="TOTAL DEVICE STORAGE" value={`${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`} sublabel="Combined capacity" />
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
  sectionTitle: { fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
  loadingWrap: { alignItems: 'center', marginTop: 80, gap: 16 },
  loadingText: {},
  errorWrap: { alignItems: 'center', marginTop: 80 },
  errorText: { fontWeight: '600' },
  capHint: { fontWeight: '500' },

  statHeader: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statTexts: { flex: 1 },
  statLabel: { fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontWeight: '800' },
  statSublabel: { fontWeight: '500', marginTop: 2 },
});
