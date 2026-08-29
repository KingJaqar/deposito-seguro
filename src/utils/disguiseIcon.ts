import { Platform, NativeModules } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';

const ICON_MAP: Record<string, string> = {
  default: 'default',
  white: 'calculator-icon-black-white',
  orange: 'calculator-icon-black-orange',
  red: 'calculator-icon-black-red',
};

// Read off NativeModules at call time rather than destructured once at
// module load (same reasoning as Platform.OS being read fresh in each
// function below, not destructured either): makes DisguiseIconModule
// injectable in tests via a direct NativeModules.DisguiseIconModule = {...}
// assignment, the same style storage.test.ts already uses for Platform.OS.
function getDisguiseIconModule() {
  return (NativeModules as unknown as { DisguiseIconModule?: { setIcon?: unknown; setFlagSecure?: unknown } }).DisguiseIconModule;
}

export async function setDisguiseIcon(theme: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const DisguiseIconModule = getDisguiseIconModule();
    if (DisguiseIconModule && typeof DisguiseIconModule.setIcon === 'function') {
      await (DisguiseIconModule.setIcon as (theme: string) => Promise<void>)(theme);
      return true;
    }
    console.log('DisguiseIconModule not available. Icon theme saved but not applied.');
    return false;
  } catch (e) {
    console.error('Failed to set application icon:', e);
    return false;
  }
}

export async function setFlagSecure(enabled: boolean): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const DisguiseIconModule = getDisguiseIconModule();
    if (DisguiseIconModule && typeof DisguiseIconModule.setFlagSecure === 'function') {
      await (DisguiseIconModule.setFlagSecure as (enabled: boolean) => Promise<void>)(enabled);
      return true;
    }
    console.log('DisguiseIconModule.setFlagSecure not available.');
    return false;
  } catch (e) {
    console.error('Failed to set FLAG_SECURE:', e);
    return false;
  }
}

/**
 * I-14 remediation (plans/deposito-seguro-audit-report-2026-08-28.md §10,
 * plans/what-are-the-next-jaunty-deer.md item 7): this used to be an empty
 * stub, so a disguise-icon preference set in a previous session was never
 * re-applied to the OS launcher icon on cold boot — _layout.tsx already
 * awaits this correctly right after hydrateSettings() resolves (before
 * login), the stub body was the only missing piece.
 *
 * Reads `disguiseIconTheme` — not `disguiseMode` (an unrelated enum driving
 * the in-app calculator/notes/utility disguise *screen*, values 'default' |
 * 'calculator' | 'notes' | 'utility'). `disguiseIconTheme` ('default' |
 * 'white' | 'orange' | 'red') is what every other real call site of
 * setDisguiseIcon in the app actually passes — (main)/_layout.tsx's own
 * session-resume effect and settings/index.tsx's theme picker both use it,
 * and its values are what ICON_MAP above is keyed on.
 */
export async function initializeDisguiseIcon(): Promise<void> {
  const { disguiseIconTheme } = useSettingsStore.getState();
  await setDisguiseIcon(disguiseIconTheme);
}
