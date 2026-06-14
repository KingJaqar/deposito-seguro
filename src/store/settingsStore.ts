import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { DisguiseMode, GridListView, ThemeMode } from '../types';

interface SettingsState {
  themeMode: ThemeMode;
  disguiseMode: DisguiseMode;
  viewMode: GridListView;
  autoLockDuration: number; // in milliseconds
  biometricsEnabled: boolean;
  encryptionDefault: boolean;
  accentColor: string;
  fontSizeMultiplier: number;
  hydrateSettings: () => Promise<void>;
  updateSetting: <K extends keyof Omit<SettingsState, 'hydrateSettings' | 'updateSetting'>>(key: K, val: SettingsState[K]) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  themeMode: 'dark',
  disguiseMode: 'default',
  viewMode: 'grid',
  autoLockDuration: 60000, 
  biometricsEnabled: false,
  encryptionDefault: false,
  accentColor: '#0A84FF',
  fontSizeMultiplier: 1.0,
  hydrateSettings: async () => {
    try {
      const stored = await AsyncStorage.getItem('@vault_settings');
      if (stored) {
        set(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Settings store failed hydration sequence.', e);
    }
  },
  updateSetting: async (key, val) => {
    set((state) => {
      const updated = { ...state, [key]: val };
      AsyncStorage.setItem('@vault_settings', JSON.stringify({
        themeMode: updated.themeMode,
        disguiseMode: updated.disguiseMode,
        viewMode: updated.viewMode,
        autoLockDuration: updated.autoLockDuration,
        biometricsEnabled: updated.biometricsEnabled,
        encryptionDefault: updated.encryptionDefault,
        accentColor: updated.accentColor,
        fontSizeMultiplier: updated.fontSizeMultiplier,
      })).catch(err => console.error(err));
      return updated;
    });
  }
}));