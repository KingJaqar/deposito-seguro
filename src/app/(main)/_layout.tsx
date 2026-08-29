// File: src/app/(main)/_layout.tsx
import { Redirect, Stack, useRouter } from 'expo-router';
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
      {/* Native-stack transitions (GPU-driven, off the JS thread) so pushes like
          dashboard -> folder/[id] get a smooth, fast slide instead of Slot's
          hard cut. 100ms = 0.5x the original 200ms duration. */}
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          animationDuration: 100,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {/* The 5 bottom-tab destinations swap via AnimatedTabBar's router.replace,
            not a real drill-down — no slide for those, matching typical tab-bar
            feel. replace (not push) keeps this layer's stack depth at 1 instead
            of appending a new mounted instance per tab tap — the previous
            router.push here was the root cause of tab switches getting
            progressively slower over a session (every old instance stays
            mounted and subscribed to the vault/settings stores). Everything
            else (folder/[id], viewer/*, settings/* subpages) keeps the default
            push/pop slide from screenOptions above. */}
        <Stack.Screen name="dashboard" options={{ animation: 'none' }} />
        <Stack.Screen name="favorites" options={{ animation: 'none' }} />
        <Stack.Screen name="search" options={{ animation: 'none' }} />
        <Stack.Screen name="trash" options={{ animation: 'none' }} />
        <Stack.Screen name="settings/index" options={{ animation: 'none' }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 }
});