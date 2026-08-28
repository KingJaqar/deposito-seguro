// File: src/utils/videoRemux.ts
import { NativeModules, Platform } from 'react-native';

/**
 * Best-effort, lossless remux of a local video file via the native
 * VideoRemuxModule (see plugins/withVideoRemux.js) — Android's
 * MediaExtractor/MediaMuxer stream-copy every sample into a fresh, fully
 * finalized MP4 container. No re-encoding, no quality/bitrate loss.
 *
 * WHY THIS EXISTS: some otherwise-valid video files report `C.TIME_UNSET`
 * duration to ExoPlayer, which makes expo-video treat them as non-seekable —
 * the rewind/fast-forward buttons and the scrubber become no-ops (see
 * src/app/(main)/viewer/video.tsx's `canSeek` guard, which stays in place as
 * a safety net for whatever this can't fix). MediaMuxer always finalizes a
 * complete, valid duration/seek index on `stop()`, independent of whatever
 * was wrong with the source container — so remuxing on import fixes seeking
 * regardless of *why* the original file was missing that metadata.
 *
 * Android-only (this project has no ios/ native project — see
 * plugins/withDisguiseIcon.js's own Android-only precedent). Requires a
 * custom dev client/EAS build; the native module isn't present in Expo Go,
 * in which case this resolves to `false` and the caller keeps the original
 * file, matching this app's existing pattern in disguiseIcon.ts for optional
 * native functionality.
 */
const { VideoRemuxModule } = NativeModules;

export async function remuxVideoLossless(inputPath: string, outputPath: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    if (VideoRemuxModule && typeof VideoRemuxModule.remux === 'function') {
      await VideoRemuxModule.remux(inputPath, outputPath);
      return true;
    }
    console.log('VideoRemuxModule not available (Expo Go, or not yet prebuilt) — importing video without remux.');
    return false;
  } catch (e) {
    console.error('Video remux failed, importing original file unchanged:', e);
    return false;
  }
}
