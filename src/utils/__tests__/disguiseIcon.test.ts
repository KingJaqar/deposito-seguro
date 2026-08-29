/**
 * I-14 (plans/what-are-the-next-jaunty-deer.md item 7):
 * initializeDisguiseIcon() used to be an empty stub — assert it actually
 * re-applies the persisted disguiseIconTheme to the native module on boot,
 * using the same field every other real call site in the app uses
 * ((main)/_layout.tsx, settings/index.tsx) — not the unrelated `disguiseMode`
 * enum the plan's own first draft mis-cited.
 *
 * No jest.mock('react-native') here — same lesson as storage.test.ts:
 * jest-expo's own preset already provides a working react-native mock;
 * re-mocking the whole module (even via requireActual) pulls in real
 * TurboModule registrations that aren't set up under Jest. Platform.OS and
 * NativeModules are just mutated directly on the mocked module, like
 * storage.test.ts already does for Platform.OS.
 */
import { Platform, NativeModules } from 'react-native';
import { initializeDisguiseIcon } from '../disguiseIcon';
import { useSettingsStore } from '../../store/settingsStore';

const mockSetIcon = jest.fn().mockResolvedValue(undefined);

describe('I-14: initializeDisguiseIcon applies the persisted icon theme on boot', () => {
  beforeEach(() => {
    (Platform as unknown as { OS: string }).OS = 'android';
    (NativeModules as unknown as Record<string, unknown>).DisguiseIconModule = { setIcon: mockSetIcon };
    mockSetIcon.mockClear();
  });

  it('calls the native module with the persisted disguiseIconTheme, not disguiseMode', async () => {
    useSettingsStore.setState({ disguiseIconTheme: 'orange', disguiseMode: 'calculator' });

    await initializeDisguiseIcon();

    expect(mockSetIcon).toHaveBeenCalledWith('orange');
  });

  it('applies the default theme when none was ever changed', async () => {
    useSettingsStore.setState({ disguiseIconTheme: 'default' });

    await initializeDisguiseIcon();

    expect(mockSetIcon).toHaveBeenCalledWith('default');
  });

  it('does nothing off-Android', async () => {
    (Platform as unknown as { OS: string }).OS = 'ios';
    useSettingsStore.setState({ disguiseIconTheme: 'red' });

    await initializeDisguiseIcon();

    expect(mockSetIcon).not.toHaveBeenCalled();
  });
});
