// src/app/(auth)/onboarding.tsx
// Rebuilt per plans/you-are-a-senior-majestic-swing.md §3/§7 Phase 4.
// Business logic unchanged: checkSetup(), the 8s setupTimedOut guard, the
// isConfigured/isAuthenticated auto-redirect effect, and the register push.
import { router } from 'expo-router';
import { CloudOff, ShieldCheck, Shuffle } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/primitives/Button';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';
import { useAuthStore } from '../../store/authStore';

const FEATURES: { icon: LucideIcon; text: string }[] = [
  { icon: CloudOff, text: '100% Offline Architecture: your data never touches a remote server or cloud database.' },
  { icon: ShieldCheck, text: 'Military-Grade Security: passwords undergo intensive iterative hashing directly inside the device hardware sandbox.' },
  { icon: Shuffle, text: 'Camouflage Skins: instantly transform your workspace into an alternate utility interface at any moment.' },
];

export default function OnboardingScreen() {
  const { colors, space, font, radius, isTablet , iconSize } = useTheme();
  const { width } = useWindowDimensions();
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

  const logoSize = isTablet ? 96 : width < 360 ? 64 : 80;

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
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: space(6) }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.hero, { marginTop: space(10), marginBottom: space(8) }]}>
            <View style={[styles.logoWrap, { width: logoSize, height: logoSize, borderRadius: radius(6), backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight, marginBottom: space(5) }]}>
              <Image
                source={require('../../../assets/logo/DepoS_logo.png')}
                style={{ width: logoSize * 0.62, height: logoSize * 0.62 }}
                resizeMode="contain"
              />
            </View>
            <Text style={[styles.title, { color: colors.text, fontSize: font(Type.display.size) }]}>DEPOSITO SEGURO</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font(Type.subtitle.size), marginTop: space(2) }]}>
              Zero-Knowledge Local Digital Vault
            </Text>
          </View>

          <View style={[styles.featureList, { gap: space(4), marginBottom: space(8) }]}>
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <View key={i} style={[styles.featureRow, { gap: space(3) }]}>
                  <View style={[styles.featureIconWrap, { backgroundColor: `${colors.primary}14`, borderRadius: radius(4) }]}>
                    <Icon size={iconSize(20)} color={colors.primary} strokeWidth={2} />
                  </View>
                  <Text style={[styles.featureText, { color: colors.text, fontSize: font(Type.body.size) }]}>{feature.text}</Text>
                </View>
              );
            })}
          </View>

          <Button
            title="Setup Secure Vault Space"
            onPress={() => router.push('/(auth)/register')}
            size="lg"
            style={{ width: '100%' }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  hero: { alignItems: 'center' },
  logoWrap: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  title: { fontWeight: '800', letterSpacing: 1, textAlign: 'center' },
  subtitle: { fontWeight: '500', textAlign: 'center' },
  featureList: {},
  featureRow: { flexDirection: 'row', alignItems: 'flex-start' },
  featureIconWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  featureText: { flex: 1, lineHeight: 20, fontWeight: '500' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
