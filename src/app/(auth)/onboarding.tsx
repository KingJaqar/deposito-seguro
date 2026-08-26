import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyledButton } from '../../components/StyledButton';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';

export default function OnboardingScreen() {
  const { colors, space, font, isTablet } = useTheme();
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

  const logoSize = isTablet ? 80 : width < 360 ? 48 : 64;

  if (isLoading && !setupTimedOut) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.textMuted, fontSize: font(14) }]}>
            Loading...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (setupTimedOut || (!isConfigured && !isLoading)) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingHorizontal: space(6) }]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.brandingBox, { marginTop: space(10) }]}>
              <Text style={[styles.logo, { color: colors.primary, fontSize: logoSize, marginBottom: space(4) }]}>🔒</Text>
              <Text style={[styles.title, { color: colors.text, fontSize: font(28) }]}>
                DEPOSITO SEGURO
              </Text>
              <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font(16), marginTop: space(2) }]}>
                Zero-Knowledge Local Digital Vault
              </Text>
            </View>

            <View style={[styles.infoWrapper, { padding: space(4), borderRadius: space(2), marginVertical: space(6), backgroundColor: colors.surface }]}>
              <Text style={[styles.bodyText, { color: colors.text, fontSize: font(14), marginBottom: space(3) }]}>
                • 100% Offline Architecture: Your data never touches a remote server or cloud database.
              </Text>
              <Text style={[styles.bodyText, { color: colors.text, fontSize: font(14), marginBottom: space(3) }]}>
                • Military-Grade Security: Passwords undergo intensive iterative hashing directly inside the device hardware sandbox.
              </Text>
              <Text style={[styles.bodyText, { color: colors.text, fontSize: font(14) }]}>
                • Camouflage Skins: Instantly transform your workspace into an alternate utility interface at any moment.
              </Text>
            </View>

            <View style={[styles.buttonContainer, { marginBottom: space(5) }]}>
              <StyledButton
                title="Setup Secure Vault Space"
                onPress={() => router.push('/(auth)/register')}
                style={{ width: '100%' }}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: space(6) }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.brandingBox, { marginTop: space(10) }]}>
            <Text style={[styles.logo, { color: colors.primary, fontSize: logoSize, marginBottom: space(4) }]}>🔒</Text>
            <Text style={[styles.title, { color: colors.text, fontSize: font(28) }]}>
              DEPOSITO SEGURO
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font(16), marginTop: space(2) }]}>
              Zero-Knowledge Local Digital Vault
            </Text>
          </View>

          <View style={[styles.infoWrapper, { padding: space(4), borderRadius: space(2), marginVertical: space(6), backgroundColor: colors.surface }]}>
            <Text style={[styles.bodyText, { color: colors.text, fontSize: font(14), marginBottom: space(3) }]}>
              • 100% Offline Architecture: Your data never touches a remote server or cloud database.
            </Text>
            <Text style={[styles.bodyText, { color: colors.text, fontSize: font(14), marginBottom: space(3) }]}>
              • Military-Grade Security: Passwords undergo intensive iterative hashing directly inside the device hardware sandbox.
            </Text>
            <Text style={[styles.bodyText, { color: colors.text, fontSize: font(14) }]}>
              • Camouflage Skins: Instantly transform your workspace into an alternate utility interface at any moment.
            </Text>
          </View>

          <View style={[styles.buttonContainer, { marginBottom: space(5) }]}>
            <StyledButton
              title="Setup Secure Vault Space"
              onPress={() => router.push('/(auth)/register')}
              style={{ width: '100%' }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  brandingBox: { alignItems: 'center' },
  logo: { marginBottom: 16, textAlign: 'center' },
  title: { fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
  subtitle: { fontWeight: '500', textAlign: 'center' },
  infoWrapper: {},
  bodyText: { lineHeight: 22, fontWeight: '400', flexShrink: 1 },
  buttonContainer: {},
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontWeight: '500',
  },
});
