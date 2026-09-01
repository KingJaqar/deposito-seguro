// src/utils/__tests__/pickFolderThumbnail.test.ts
// Coverage for pickAndSetFolderThumbnail per plans/custom folders and album
// thumbnail implementation plan.md, Phase 5 — this is the only automated
// coverage for the picker helper itself (the 5 screens that call it are
// exercised manually per the plan's Verification section, not here).
import * as ImagePicker from 'expo-image-picker';
import { pickAndSetFolderThumbnail } from '../pickFolderThumbnail';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const mockRequestPermission = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const mockLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;

describe('pickAndSetFolderThumbnail', () => {
  const folderId = 'folder-1';
  let setFolderThumbnail: jest.Mock;

  beforeEach(() => {
    setFolderThumbnail = jest.fn().mockResolvedValue(undefined);
  });

  it('returns permission-denied and never opens the picker when permission is refused', async () => {
    mockRequestPermission.mockResolvedValue({ granted: false });

    const result = await pickAndSetFolderThumbnail(folderId, setFolderThumbnail);

    expect(result).toBe('permission-denied');
    expect(mockLaunchLibrary).not.toHaveBeenCalled();
    expect(setFolderThumbnail).not.toHaveBeenCalled();
  });

  it('returns canceled and never calls setFolderThumbnail when the user backs out of the picker', async () => {
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockLaunchLibrary.mockResolvedValue({ canceled: true, assets: null });

    const result = await pickAndSetFolderThumbnail(folderId, setFolderThumbnail);

    expect(result).toBe('canceled');
    expect(setFolderThumbnail).not.toHaveBeenCalled();
  });

  it('returns canceled when the result is not canceled but carries no assets (defensive)', async () => {
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [] });

    const result = await pickAndSetFolderThumbnail(folderId, setFolderThumbnail);

    expect(result).toBe('canceled');
    expect(setFolderThumbnail).not.toHaveBeenCalled();
  });

  it('requests a single, square-cropped image (not the multi-select shape used by album media import)', async () => {
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockLaunchLibrary.mockResolvedValue({ canceled: true, assets: null });

    await pickAndSetFolderThumbnail(folderId, setFolderThumbnail);

    expect(mockLaunchLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        allowsEditing: true,
        aspect: [1, 1],
      })
    );
  });

  it('calls setFolderThumbnail with the picked asset uri and returns set on success', async () => {
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///picked.jpg' }] });

    const result = await pickAndSetFolderThumbnail(folderId, setFolderThumbnail);

    expect(result).toBe('set');
    expect(setFolderThumbnail).toHaveBeenCalledWith(folderId, 'file:///picked.jpg');
  });

  it('returns error (not a thrown exception) when setFolderThumbnail rejects', async () => {
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///picked.jpg' }] });
    setFolderThumbnail.mockRejectedValue(new Error('extraction blew up'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await pickAndSetFolderThumbnail(folderId, setFolderThumbnail);

    expect(result).toBe('error');
    consoleErrorSpy.mockRestore();
  });
});
