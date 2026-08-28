// File: src/app/(main)/_layout.tsx
import { Redirect, Slot, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, StyleSheet, View, Platform } from 'react-native';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { setDisguiseIcon } from '../../utils/disguiseIcon';

export default function MainAppContainerLayout() {
  const router = useRouter();
  const colors = useThemeColors();
  const appState = useRef(AppState.currentState);
  const { isAuthenticated, lastActiveTimestamp, updateActivity, terminateSession } = useAuthStore();
  const { autoLockDuration } = useSettingsStore();
  const { disguiseMode, disguiseIconTheme, lockTransientMemory, hydrateSettings } = useSettingsStore();

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        const elapsed = Date.now() - lastActiveTimestamp;
        if (elapsed > autoLockDuration) {
          terminateSession();
          router.replace('/(auth)/lock');
        } else {
          updateActivity();
          // If we backgrounded under calculator disguise, lockTransientMemory()
          // blanked the in-memory encryption/access keys (and flipped
          // isHydrated=false). Coming back BEFORE the auto-lock window would
          // otherwise skip re-auth — the only other place that re-hydrates —
          // leaving every key '' while still authenticated. Any encrypt/decrypt
          // then silently uses the wrong (no-key) transform and corrupts files.
          // hydrateSettings() early-returns when isHydrated is still true, so
          // this is a no-op unless the keys were actually wiped.
          hydrateSettings().catch((e) => console.error('Foreground re-hydration failed', e));
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
  }, [lastActiveTimestamp, autoLockDuration, terminateSession, router, updateActivity, disguiseMode, disguiseIconTheme, lockTransientMemory, hydrateSettings]);

  // I-1: render-time auth guard. Previously route protection relied
  // entirely on the (auth) screens funneling navigation into (main)/* —
  // nothing here actually checked `isAuthenticated`, so any future deep
  // link, restored navigation state, or new code path landing directly on
  // a (main) route would bypass the lock screen entirely.
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/lock" />;
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]} onTouchStart={updateActivity}>
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 }
});