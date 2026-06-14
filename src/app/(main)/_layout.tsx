import { Slot, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';

export default function MainAppContainerLayout() {
  const router = useRouter();
  const colors = useThemeColors();
  const appState = useRef(AppState.currentState);
  const { lastActiveTimestamp, updateActivity, terminateSession } = useAuthStore();
  const { autoLockDuration } = useSettingsStore();
  const { hydrateVault } = useVaultStore();

  useEffect(() => {
    hydrateVault();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        const elapsed = Date.now() - lastActiveTimestamp;
        if (elapsed > autoLockDuration) {
          terminateSession();
          router.replace('/(auth)/lock');
        } else {
          updateActivity();
        }
      } else if (nextAppState === 'background') {
        updateActivity();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [lastActiveTimestamp, autoLockDuration, terminateSession, router, updateActivity]);

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]} onTouchStart={updateActivity}>
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 }
});