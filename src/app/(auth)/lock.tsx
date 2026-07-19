import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LoginScreen from './login';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';

export default function LockScreen() {
  const { colors, space, font } = useTheme();
  const { checkSetup, isConfigured, isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    checkSetup();
  }, [checkSetup]);

  const showLockBanner = isConfigured && !isAuthenticated && !isLoading;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {showLockBanner && (
        <View style={[styles.lockBanner, { backgroundColor: `${colors.primary}14`, paddingHorizontal: space(4), paddingVertical: space(3), marginHorizontal: space(4), borderRadius: 16, marginBottom: space(2) }]}>
          <Text style={{ fontSize: 20, marginRight: 8 }}>🔒</Text>
          <Text style={[styles.lockBannerText, { color: colors.text, fontSize: font(13), fontWeight: '700' }]}>
            Vault Locked — Authentication Required
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <LoginScreen />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lockBannerText: {
    flex: 1,
  },
});