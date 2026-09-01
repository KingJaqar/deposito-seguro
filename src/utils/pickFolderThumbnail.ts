// src/utils/pickFolderThumbnail.ts
// Shared permission+picker dance for setting a custom folder/subfolder/album
// thumbnail — see plans/custom folders and album thumbnail implementation
// plan.md's "Picker flow" section. Extracted so the 5 screens that wire
// "Set/Change Thumbnail" (dashboard.tsx, VaultContentsScreen.tsx x2,
// favorites.tsx, search.tsx) don't each repeat the permission-request +
// launchImageLibraryAsync + result-shape handling.
//
// Deliberately NOT the same call shape as VaultContentsScreen's own
// executeAlbumImport (multi-select, no crop — it's importing raw media into
// an album). A folder/album *cover* is a single square-ish image, so this
// adds allowsMultipleSelection: false and a forced 1:1 crop via the picker's
// own native editor — matching the "custom cover" convention (Google Photos
// album covers, desktop folder icons), not the "import media" convention.
import * as ImagePicker from 'expo-image-picker';

export type PickThumbnailResult = 'set' | 'canceled' | 'permission-denied' | 'error';

export async function pickAndSetFolderThumbnail(
  folderId: string,
  setFolderThumbnail: (folderId: string, sourceUri: string) => Promise<void>
): Promise<PickThumbnailResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return 'permission-denied';

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled || !result.assets?.[0]) return 'canceled';

  try {
    await setFolderThumbnail(folderId, result.assets[0].uri);
    return 'set';
  } catch (e) {
    console.error('Failed to set folder thumbnail:', e);
    return 'error';
  }
}
