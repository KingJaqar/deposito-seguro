// src/app/(auth)/onboarding.tsx
// Step 1 of the onboarding wizard ("Overview") — rebuilt to match
// "design images as reference output/onboarding screen references/
// onboarding 1 overview.png" exactly. Business logic unchanged: checkSetup(),
// the 8s setupTimedOut guard, and the isConfigured/isAuthenticated
// auto-redirect effect are byte-identical to the previous implementation.
import { router } from 'expo-router';
import { ArrowRight, CloudOff, ShieldCheck, Shuffle } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandHeader } from '../../components/onboarding/BrandHeader';
import { OnboardingProgress } from '../../components/onboarding/OnboardingProgress';
import { Button } from '../../components/primitives/Button';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';
import { useAuthStore } from '../../store/authStore';

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: CloudOff, title: 'Fully offline', text: 'Nothing leaves the device. No server, no cloud, no sync account.' },
  { icon: ShieldCheck, title: 'Sealed in hardware', text: 'Your key is hashed iteratively inside the device sandbox.' },
  { icon: Shuffle, title: 'Camouflage skin', text: 'Switch the vault to an ordinary utility interface at any moment.' },
];

export default function OnboardingScreen() {
  const { colors, space, font } = useTheme();
  const { checkSetup, isConfigured, isAuthenticated, isLoading } = useAuthStore();
  const [setupTimedOut, setSetupTimedOut] = useState(false);

  useEffect(() => {
    let mounted = true;
    const timer = setTimeout(() => {
      if (mounted && useAuthStore.getState().isLoading) {
        setSetupTimedOut(true);
      }
    }, 8000);

    checkSetup();

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [checkSetup]);

  useEffect(() => {
    if (!isLoading && isConfigured && isAuthenticated) {
      router.replace('/(main)/dashboard');
    } else if (!isLoading && isConfigured && !isAuthenticated) {
      router.replace('/(auth)/lock');
    }
  }, [isLoading, isConfigured, isAuthenticated]);

  if (isLoading && !setupTimedOut) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={{ color: colors.textMuted, fontSize: font(Type.body.size), fontWeight: Type.body.weight }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: space(6), paddingTop: space(5), paddingBottom: space(8) }]}
        keyboardShouldPersistTaps="handled"
      >
        <BrandHeader />

        <View style={{ marginTop: space(6), marginBottom: space(5) }}>
          <OnboardingProgress activeStep={1} label="Step 1 · Overview" />
        </View>

        <Text style={[styles.headline, { color: colors.text, fontSize: font(Type.display.size), marginBottom: space(4) }]}>
          A vault that only opens on this device.
        </Text>

        <Text style={[styles.paragraph, { color: colors.textMuted, fontSize: font(Type.body.size), marginBottom: space(6) }]}>
          Zero-knowledge storage for the things you cannot afford to hand to a cloud. Setup takes under a minute.
        </Text>

        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

        <View>
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <View key={i}>
                <View style={[styles.featureRow, { paddingVertical: space(5), gap: space(3) }]}>
                  <Icon size={22} color={colors.primary} strokeWidth={2} style={styles.featureIcon} />
                  <View style={styles.featureCopy}>
                    <Text style={[styles.featureTitle, { color: colors.text, fontSize: font(Type.subtitle.size), marginBottom: space(1) }]}>
                      {feature.title}
                    </Text>
                    <Text style={[styles.featureText, { color: colors.textMuted, fontSize: font(Type.body.size) }]}>
                      {feature.text}
                    </Text>
                  </View>
                </View>
                <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
              </View>
            );
          })}
        </View>

        <Button
          title="Create master key"
          onPress={() => router.push('/(auth)/register')}
          icon={ArrowRight}
          size="lg"
          style={{ width: '100%', marginTop: space(6), marginBottom: space(4) }}
        />

        <Text style={[styles.caption, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>No account required</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  headline: { fontWeight: '800', letterSpacing: -0.5, lineHeight: 36 },
  paragraph: { fontWeight: '500', lineHeight: 21 },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start' },
  featureIcon: { marginTop: 2 },
  featureCopy: { flex: 1 },
  featureTitle: { fontWeight: '700' },
  featureText: { fontWeight: '500', lineHeight: 19 },
  caption: { fontFamily: 'monospace', fontWeight: '500', textAlign: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
