/**
 * Item 15 (plans/what-are-the-next-jaunty-deer.md): rendered-behavior
 * coverage for the document viewer screen — one of the "3 newest major
 * features" the audit report calls out as having zero component coverage.
 *
 * Scope: this screen's own routing/decrypt-pipeline logic (which of the 5
 * viewer paths a file resolves to; the S-11 fail-loudly-without-a-key path;
 * decrypt-then-cleanup-on-unmount; the share action) — not the 4 type-
 * specific viewer components' own internals (PdfViewer/FlowDocViewer render
 * into a react-native-webview WebView loaded with a vendored HTML bundle,
 * which has no meaningful jsdom/test-renderer equivalent and is out of scope
 * here; they're stubbed out so this screen's own logic can be exercised in
 * isolation).
 */
import React from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import { fireEvent, renderWithProviders, screen, waitFor } from '../../../../test-utils/renderWithProviders';
import { useVaultStore } from '../../../../store/vaultStore';
import { useSettingsStore } from '../../../../store/settingsStore';
import { StorageService } from '../../../../services/storage';
import DocumentViewerScreen from '../document';
import type { FileMetadata } from '../../../../types';

// babel-plugin-jest-hoist forbids a jest.mock() factory from closing over
// this file's own top-level imports (only requires and `mock`-prefixed
// bindings are allowed) — every stub component factory below needs its own
// require() as a result.
/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useFocusEffect: (cb: () => void | (() => void)) => {
    // Real expo-router's useFocusEffect needs a navigation context this
    // test doesn't provide. The screen only uses it to reset/animate a
    // reanimated opacity value on focus/blur — invoking the callback once
    // (and skipping its cleanup) is enough to let the rest of the screen's
    // own logic run under test.
    cb();
  },
}));

jest.mock('react-native-reanimated', () => {
  // react-native-reanimated's own bundled jest mock (mock.js) transitively
  // requires react-native-worklets' native module bootstrap (reanimated 4 is
  // New-Architecture/worklets-only), which throws outside a real device —
  // there's no jest-side shim for it. document.tsx only reads a handful of
  // reanimated APIs to drive one opacity/translateY fade on focus/blur, so a
  // small hand-rolled mock covering just those is more reliable here than
  // fighting the package's own (native-dependent) mock.
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (initial: number) => ({ value: initial }),
    useAnimatedStyle: (fn: () => Record<string, unknown>) => fn(),
    withTiming: (toValue: number) => toValue,
    Easing: { in: (fn: unknown) => fn, out: (fn: unknown) => fn, quad: () => undefined, bezier: () => () => undefined },
  };
});

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8' },
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}));

jest.mock('../../../../services/storage', () => ({
  StorageService: {
    decryptSandboxFile: jest.fn(),
    removeSandboxFile: jest.fn(async () => {}),
  },
}));

jest.mock('../../../../components/VaultHeader', () => {
  const { Text } = require('react-native');
  return { VaultHeader: (props: { title?: string }) => require('react').createElement(Text, null, props.title ?? '') };
});

jest.mock('../../../../components/documentViewer/PdfViewer', () => {
  const { Text } = require('react-native');
  return { PdfViewer: (props: { localUri: string }) => require('react').createElement(Text, null, `PdfViewer:${props.localUri}`) };
});
jest.mock('../../../../components/documentViewer/FlowDocViewer', () => {
  const { Text } = require('react-native');
  return { FlowDocViewer: (props: { localUri: string; kind: string }) => require('react').createElement(Text, null, `FlowDocViewer:${props.kind}:${props.localUri}`) };
});
jest.mock('../../../../components/documentViewer/SheetViewer', () => {
  const { Text } = require('react-native');
  return { SheetViewer: (props: { localUri: string }) => require('react').createElement(Text, null, `SheetViewer:${props.localUri}`) };
});
jest.mock('../../../../components/documentViewer/TextPageViewer', () => {
  const { Text } = require('react-native');
  return { TextPageViewer: (props: { content: string }) => require('react').createElement(Text, null, `TextPageViewer:${props.content}`) };
});

const baseFile = (overrides: Partial<FileMetadata> = {}): FileMetadata => ({
  id: 'file-1',
  folderId: 'f1',
  name: 'notes.bin',
  mimeType: 'application/octet-stream',
  localPath: '/vault/notes.bin',
  size: 2048,
  isFavorite: false,
  isTrash: false,
  importedAt: 0,
  ...overrides,
} as FileMetadata);

describe('DocumentViewerScreen', () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ fileId: 'file-1' });
    useVaultStore.setState({ folders: [], files: [] });
    useSettingsStore.setState({ encryptionKeys: [] });
    (StorageService.decryptSandboxFile as jest.Mock).mockReset().mockResolvedValue('/vault/notes.bin.dec');
    (Sharing.shareAsync as jest.Mock).mockReset();
    (FileSystem.readAsStringAsync as jest.Mock).mockReset();
  });

  it('shows "File not found" when no file matches the fileId param', async () => {
    useVaultStore.setState({ files: [] });
    renderWithProviders(<DocumentViewerScreen />);
    expect(screen.getByText('File not found')).toBeTruthy();
  });

  it('renders the generic hero card (name, size chip) for a plaintext, unrecognized file type', async () => {
    useVaultStore.setState({ files: [baseFile()] });
    renderWithProviders(<DocumentViewerScreen />);
    // "notes.bin" appears twice once loaded (the mocked VaultHeader's title
    // and the hero card's own doc title) — getAllByText confirms both
    // rendered instead of asserting on a single ambiguous match.
    await waitFor(() => expect(screen.getAllByText('notes.bin')).toHaveLength(2));
    expect(screen.getByText('Open Document')).toBeTruthy();
    expect(screen.getByText('2 KB')).toBeTruthy();
    // Unencrypted: never calls the decrypt pipeline.
    expect(StorageService.decryptSandboxFile).not.toHaveBeenCalled();
  });

  it('S-11: shows an error state instead of a garbage render when an encrypted file\'s key cannot be resolved', async () => {
    useVaultStore.setState({
      files: [baseFile({ isEncrypted: true, encryptionKeyId: 'missing-key' })],
    });
    useSettingsStore.setState({ encryptionKeys: [] });

    renderWithProviders(<DocumentViewerScreen />);
    await waitFor(() => expect(screen.getByText("Couldn't open document")).toBeTruthy());
    expect(StorageService.decryptSandboxFile).not.toHaveBeenCalled();
  });

  it('decrypts an encrypted file with the resolved key before rendering, and cleans it up on unmount', async () => {
    useVaultStore.setState({
      files: [baseFile({ isEncrypted: true, encryptionKeyId: 'key-1', localPath: '/vault/notes.bin.enc' })],
    });
    useSettingsStore.setState({
      encryptionKeys: [{ id: 'key-1', name: 'k', key: 'raw-key', fingerprint: 'fp', createdAt: 0 }],
    });

    const { unmount } = renderWithProviders(<DocumentViewerScreen />);
    await waitFor(() => expect(screen.getByText('notes.bin')).toBeTruthy());

    expect(StorageService.decryptSandboxFile).toHaveBeenCalledWith('/vault/notes.bin.enc', 'raw-key');

    unmount();
    await waitFor(() => expect(StorageService.removeSandboxFile).toHaveBeenCalledWith('/vault/notes.bin.dec'));
  });

  it('routes a .pdf file to PdfViewer with the decrypted/local URI', async () => {
    useVaultStore.setState({
      files: [baseFile({ name: 'report.pdf', mimeType: 'application/pdf', localPath: '/vault/report.pdf' })],
    });

    renderWithProviders(<DocumentViewerScreen />);
    await waitFor(() => expect(screen.getByText('PdfViewer:/vault/report.pdf')).toBeTruthy());
  });

  it('reads and passes text content through to TextPageViewer for a text/* file', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('hello world');
    useVaultStore.setState({
      files: [baseFile({ name: 'notes.txt', mimeType: 'text/plain', localPath: '/vault/notes.txt' })],
    });

    renderWithProviders(<DocumentViewerScreen />);
    await waitFor(() => expect(screen.getByText('TextPageViewer:hello world')).toBeTruthy());
  });

  it('pressing the share action calls Sharing.shareAsync with the resolved URI', async () => {
    useVaultStore.setState({ files: [baseFile()] });
    renderWithProviders(<DocumentViewerScreen />);
    await waitFor(() => expect(screen.getByText('Open Document')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Open document'));
    expect(Sharing.shareAsync).toHaveBeenCalledWith('/vault/notes.bin');
  });
});
