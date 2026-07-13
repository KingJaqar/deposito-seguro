// File: src/app/(main)/_layout.tsx
import { Slot, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, StyleSheet, View, Platform } from 'react-native';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useVaultStore } from '../../store/vaultStore';
import { setDisguiseIcon } from '../../utils/disguiseIcon';

export default function MainAppContainerLayout() {
  const router = useRouter();
  const colors = useThemeColors();
  const appState = useRef(AppState.currentState);
  const { lastActiveTimestamp, updateActivity, terminateSession } = useAuthStore();
  const { autoLockDuration } = useSettingsStore();
  const { hydrateVault } = useVaultStore();
  const { disguiseMode, disguiseIconTheme, lockTransientMemory } = useSettingsStore();

  useEffect(() => {
    hydrateVault();
  }, [hydrateVault]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        const elapsed = Date.now() - lastActiveTimestamp;
        if (elapsed > autoLockDuration) {
          terminateSession();
          router.replace('/(auth)/lock');
        } else {
          updateActivity();
        }
        if (disguiseMode === 'calculator' && Platform.OS === 'android') {
          await setDisguiseIcon(disguiseIconTheme);
        }
      } else if (nextAppState === 'background') {
        updateActivity();
        if (disguiseMode === 'calculator') {
          lockTransientMemory?.();
          if (Platform.OS === 'android') {
            await setDisguiseIcon(disguiseIconTheme);
          }
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [lastActiveTimestamp, autoLockDuration, terminateSession, router, updateActivity, disguiseMode, disguiseIconTheme, lockTransientMemory]);

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]} onTouchStart={updateActivity}>
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 }
});