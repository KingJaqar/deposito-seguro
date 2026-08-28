// src/app/(auth)/lock.tsx
// Rebuilt per §3/§7 Phase 4. Restyled onto Vault Blue tokens.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LoginScreen from './login';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';

export default function LockScreen() {
  const { colors } = useTheme();
  const { checkSetup } = useAuthStore();

  useEffect(() => {
    checkSetup();
  }, [checkSetup]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.flex}>
        <LoginScreen />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
});
