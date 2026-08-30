// src/services/mediaThumbnailExtractor.ts
// Best-effort thumbnail generation for freshly-imported photos/videos, so
// grid tiles can render a small, fast-to-decode preview via FileMetadata's
// existing iconPath/iconEncrypted mechanism — the same field
// src/services/apkIconExtractor.ts already populates for .apk launcher
// icons, extended here to media (see plans/album implementation plan.md
// §1a). Fixes two pre-existing gaps: video tiles had no frame extraction at
// all (an <Image> can't decode video bytes), and every full-resolution
// photo was decoded at full size just to render a ~100px tile.
//
// Same contract as extractApkIcon: write the result to the caller-given
// `outputPath` and return it, or return `null` on any failure — never
// throw, so a corrupt/unusual file never blocks the import itself.
import * as FileSystem from 'expo-file-system/legacy';
import { Image as RNImage, Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';

const THUMBNAIL_MAX_EDGE = 300;

const getImageSize = (uri: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    RNImage.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Both ImageRef.saveAsync and VideoThumbnails.getThumbnailAsync write into
 * the OS-managed cache directory with no way to control the destination —
 * not safe for anything this app expects to persist (it could be evicted
 * at any time). Move the result into our own vault sandbox at `outputPath`
 * instead, matching how everything else this app keeps long-term lives
 * under StorageService's VAULT_DIR, not a cache dir.
 *
 * On Android (most reproducibly under Expo Go), the native module that
 * writes `tempUri` can resolve its promise a beat before the file is
 * actually flushed/closed on disk, so an immediate copyAsync sometimes
 * throws "isn't readable" even though the file shows up fine moments
 * later. Retry a couple of times with a short backoff before giving up,
 * and fall back to a base64 read/write (which goes through a different
 * native path than copyAsync) if copyAsync keeps failing.
 */
const relocateToSandbox = async (tempUri: string, outputPath: string): Promise<void> => {
  const attempts = 3;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(150 * attempt);
    try {
      await FileSystem.copyAsync({ from: tempUri, to: outputPath });
      await FileSystem.deleteAsync(tempUri, { idempotent: true });
      return;
    } catch (e) {
      lastError = e;
    }
  }
  try {
    const base64 = await FileSystem.readAsStringAsync(tempUri, { encoding: FileSystem.EncodingType.Base64 });
    await FileSystem.writeAsStringAsync(outputPath, base64, { encoding: FileSystem.EncodingType.Base64 });
    await FileSystem.deleteAsync(tempUri, { idempotent: true });
    return;
  } catch {
    // Base64 fallback failed too — surface the original copyAsync error.
    throw lastError;
  }
};

/**
 * Downscales an image to a small JPEG (longest edge capped at 300px) for
 * use as a grid thumbnail.
 */
export async function extractImageThumbnail(imagePath: string, outputPath: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { width, height } = await getImageSize(imagePath);
    const landscape = width >= height;
    const context = ImageManipulator.manipulate(imagePath);
    context.resize(landscape ? { width: THUMBNAIL_MAX_EDGE, height: null } : { width: null, height: THUMBNAIL_MAX_EDGE });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.6 });
    await relocateToSandbox(saved.uri, outputPath);
    return outputPath;
  } catch (e) {
    console.error('extractImageThumbnail failed (falling back to full-resolution image):', e);
    return null;
  }
}

/**
 * Grabs the frame at t=0 from a video for use as its grid thumbnail. On
 * failure the caller leaves iconPath unset, which is no worse than this
 * app's pre-existing behavior (a video's localPath rendered straight into
 * an <Image>, which was always broken — see useFileThumbnailUri.ts).
 */
export async function extractVideoThumbnail(videoPath: string, outputPath: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoPath, { time: 0, quality: 0.6 });
    await relocateToSandbox(uri, outputPath);
    return outputPath;
  } catch (e) {
    console.error('extractVideoThumbnail failed (video tile will fall back to the generic icon):', e);
    return null;
  }
}
