import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StyledButton } from '../../components/StyledButton';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';

export default function OnboardingScreen() {
  const colors = useThemeColors();
  const { checkSetup, isConfigured, isAuthenticated } = useAuthStore();

  useEffect(() => {
    checkSetup();
  }, []);

  useEffect(() => {
    if (isConfigured && isAuthenticated) {
      router.replace('/(main)/dashboard');
    } else if (isConfigured && !isAuthenticated) {
      router.replace('/(auth)/lock');
    }
  }, [isConfigured, isAuthenticated]);

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        <View style={styles.brandingBox}>
          <Text style={[styles.logo, { color: colors.primary }]}>🔒</Text>
          <Text style={[styles.title, { color: colors.text }]}>DEPOSITO SEGURO</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Zero-Knowledge Local Digital Vault
          </Text>
        </View>

        <View style={styles.infoWrapper}>
          <Text style={[styles.bodyText, { color: colors.text }]}>
            • 100% Offline Architecture: Your data never touches a remote server or cloud database.
          </Text>
          <Text style={[styles.bodyText, { color: colors.text }]}>
            • Military-Grade Security: Passwords undergo intensive iterative hashing directly inside the device hardware sandbox.
          </Text>
          <Text style={[styles.bodyText, { color: colors.text }]}>
            • Camouflage Skins: Instantly transform your workspace into an alternate utility interface at any moment.
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <StyledButton 
            title="Setup Secure Vault Space" 
            onPress={() => router.push('/(auth)/register')}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  brandingBox: { alignItems: 'center', marginTop: 40 },
  logo: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: 1.5 },
  subtitle: { fontSize: 16, marginTop: 8, fontWeight: '500' },
  infoWrapper: { marginVertical: 24, padding: 16, borderRadius: 12 },
  bodyText: { fontSize: 14, marginBottom: 14, lineHeight: 22, fontWeight: '400' },
  buttonContainer: { marginBottom: 20 }
});