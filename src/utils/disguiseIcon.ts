import { Platform, NativeModules } from 'react-native';

const ICON_MAP: Record<string, string> = {
  default: 'default',
  white: 'calculator-icon-black-white',
  orange: 'calculator-icon-black-orange',
  red: 'calculator-icon-black-red',
};

const { DisguiseIconModule } = NativeModules;

export async function setDisguiseIcon(theme: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    if (DisguiseIconModule && typeof DisguiseIconModule.setIcon === 'function') {
      await DisguiseIconModule.setIcon(theme);
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
    if (DisguiseIconModule && typeof DisguiseIconModule.setFlagSecure === 'function') {
      await DisguiseIconModule.setFlagSecure(enabled);
      return true;
    }
    console.log('DisguiseIconModule.setFlagSecure not available.');
    return false;
  } catch (e) {
    console.error('Failed to set FLAG_SECURE:', e);
    return false;
  }
}

export async function initializeDisguiseIcon(): Promise<void> {
  // Icon preference is persisted in settings and applied when the module is available
}
