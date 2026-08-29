/**
 * Item 15 (plans/what-are-the-next-jaunty-deer.md): rendered-behavior
 * coverage for the storage settings screen — one of the "3 newest major
 * features" the audit report calls out as having zero component coverage.
 * Exercises the real vaultStore/settingsStore (not mocked) specifically so
 * this doubles as UI-facing coverage for the "Post-Phase-C audit" storage-
 * accounting fix (vaultStore.ts's committedFileBytes): the VAULT LIMIT USAGE
 * card reads getVaultUsageBytes() directly, so a regression back to raw
 * f.size accounting would show up here as a wrong displayed value, not just
 * in vaultStore.test.ts's own unit tests.
 *
 * VaultHeader/AnimatedTabBar are mocked out — they pull in expo-router and
 * react-native-reanimated, neither of which this screen's own business logic
 * (limit warning banner, chip selection, quota display) depends on.
 */
import React from 'react';
import { useVaultStore } from '../../../../store/vaultStore';
import { useSettingsStore } from '../../../../store/settingsStore';
import { StorageService } from '../../../../services/storage';
import { fireEvent, renderWithProviders, screen, waitFor } from '../../../../test-utils/renderWithProviders';
import StorageTelemetryScreen from '../storage';

jest.mock('../../../../components/VaultHeader', () => ({
  VaultHeader: () => null,
}));
jest.mock('../../../../components/AnimatedTabBar', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../../../services/storage', () => ({
  StorageService: {
    getStorageQuotaInfo: jest.fn(),
  },
}));

const mockFile = (id: string, size: number, isEncrypted = false) =>
  ({ id, folderId: 'f1', name: id, size, mimeType: 'image/jpeg', localPath: `/vault/${id}.jpg`, isEncrypted, isFavorite: false, isTrash: false, importedAt: 0 }) as import('../../../../types').FileMetadata;

describe('StorageTelemetryScreen', () => {
  beforeEach(() => {
    useVaultStore.setState({ folders: [], files: [] });
    useSettingsStore.setState({ storageLimitBytes: null });
    (StorageService.getStorageQuotaInfo as jest.Mock).mockResolvedValue({
      used: 500 * 1024 * 1024, // 500 MB
      free: 10 * 1024 * 1024 * 1024, // 10 GB
      total: 64 * 1024 * 1024 * 1024, // 64 GB
    });
  });

  it('shows a loading indicator before the quota load resolves', async () => {
    renderWithProviders(<StorageTelemetryScreen />);
    expect(screen.getByText('Reading partition…')).toBeTruthy();
    // Let the mocked getStorageQuotaInfo() promise settle inside act() before
    // the test ends, rather than leaving it to resolve during teardown (which
    // triggers React's "state update not wrapped in act()" warning).
    await waitFor(() => expect(screen.queryByText('Reading partition…')).toBeNull());
  });

  it('shows "No cap" once loaded when no limit is configured', async () => {
    renderWithProviders(<StorageTelemetryScreen />);
    await waitFor(() => expect(screen.queryByText('Reading partition…')).toBeNull());
    expect(screen.getByText('No cap — imports are never blocked')).toBeTruthy();
  });

  it('reports vault usage inclusive of encryption overhead, not the raw sum of file sizes', async () => {
    // Ties directly to the "Post-Phase-C audit" fix: 100 raw (unencrypted)
    // + ceil(200 * 1.4) = 280 for the encrypted file = 380, not the naive
    // 100 + 200 = 300 a raw-size sum would show here.
    useVaultStore.setState({
      folders: [],
      files: [mockFile('a', 100, false), mockFile('b', 200, true)],
    });
    useSettingsStore.setState({ storageLimitBytes: 1000 });

    renderWithProviders(<StorageTelemetryScreen />);
    await waitFor(() => expect(screen.queryByText('Reading partition…')).toBeNull());

    expect(screen.getByText('380 B / 1000 B')).toBeTruthy();
  });

  it('shows the over-limit warning once usage exceeds the configured cap', async () => {
    useVaultStore.setState({
      folders: [],
      files: [mockFile('a', 1500, false)],
    });
    useSettingsStore.setState({ storageLimitBytes: 1000 });

    renderWithProviders(<StorageTelemetryScreen />);
    await waitFor(() => expect(screen.queryByText('Reading partition…')).toBeNull());

    expect(screen.getByText('Over limit — new imports will be blocked until this is raised or freed up')).toBeTruthy();
  });

  it('pressing a limit option updates storageLimitBytes', async () => {
    renderWithProviders(<StorageTelemetryScreen />);
    await waitFor(() => expect(screen.queryByText('Reading partition…')).toBeNull());

    fireEvent.press(screen.getByText('8 GB'));
    expect(useSettingsStore.getState().storageLimitBytes).toBe(8 * 1024 * 1024 * 1024);
  });

  it('falls back to an error state if the quota read itself rejects', async () => {
    (StorageService.getStorageQuotaInfo as jest.Mock).mockRejectedValue(new Error('fs error'));
    renderWithProviders(<StorageTelemetryScreen />);
    await waitFor(() => expect(screen.getByText('Could not read storage data')).toBeTruthy());
  });
});
