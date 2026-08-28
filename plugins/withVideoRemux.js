/**
 * Local Expo config plugin (mirrors plugins/withDisguiseIcon.js) that makes
 * the video-remux native Android module survive `expo prebuild`.
 *
 * WHY THIS EXISTS: some imported video files report `C.TIME_UNSET` duration
 * to ExoPlayer (Android's "unknown" sentinel), which makes expo-video treat
 * them as non-seekable — rewind/fast-forward and scrubber-drag become no-ops
 * (see src/app/(main)/viewer/video.tsx's `canSeek` guard, which is the safety
 * net for exactly this). `ffmpeg-kit-react-native`, the usual fix for this
 * class of problem, was retired (deprecated on npm as of Jan 2025, binaries
 * pulled from Maven Central/CocoaPods/npm in April 2025) and its would-be
 * successors are either unpublished or, in the case of small community
 * forks, explicitly marked "not stable for production use" — unacceptable
 * for a security-sensitive vault app's dependency tree. Since the actual
 * requirement is just "guarantee the container has a valid, finalized
 * duration/seek index," this reaches for what the Android SDK itself
 * already ships for exactly that: `MediaExtractor` + `MediaMuxer` performs a
 * lossless stream-copy remux (no re-encoding, no quality loss, no
 * third-party binary) — `MediaMuxer.stop()` always finalizes a complete
 * `moov`/duration atom, regardless of what was wrong with the source's own
 * container.
 *
 * Android-only: this project has no ios/ native project (see
 * plugins/withDisguiseIcon.js's own Android-only precedent) and no Mac/Xcode
 * available to build or test an iOS equivalent (AVAssetExportSession with
 * the `.passthrough` preset would be the analogous fix there).
 *
 * This plugin, run on every prebuild, re-creates:
 *   - VideoRemuxModule.kt / VideoRemuxPackage.kt (native module)
 *   - registration of VideoRemuxPackage in MainApplication.kt
 *
 * Requires a custom dev client / EAS build (`expo prebuild` +
 * `expo run:android`, or an EAS build) — native modules do not run inside
 * Expo Go.
 */
const { withDangerousMod, withMainApplication } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_PATH = 'com/anonymous/depositoseguro';

const VIDEO_REMUX_MODULE_KT = `package com.anonymous.depositoseguro

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.nio.ByteBuffer

/**
 * Lossless container remux via MediaExtractor + MediaMuxer: stream-copies
 * every compressed video/audio sample into a fresh MP4 container without
 * decoding/re-encoding, so quality and bitrate are unchanged. Fixes files
 * whose original container doesn't declare a usable duration/seek index
 * (ExoPlayer's \`C.TIME_UNSET\`) by producing one that always has both, since
 * MediaMuxer always finalizes a complete index on stop().
 *
 * Not a general-purpose "works on literally any container" tool — it only
 * carries over tracks MediaExtractor can read and MediaMuxer's MPEG_4
 * output format can hold (standard H.264/HEVC video + AAC audio — the
 * overwhelming majority of real-world video files, including anything an
 * MP4/MOV/WebM/Matroska source produces). DRM-protected sources aren't
 * supported (not a concern for a personal vault app importing the user's
 * own local media).
 */
class VideoRemuxModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "VideoRemuxModule"

  /** Accepts either a bare filesystem path or a \`file://\` URI (both are used across this codebase's storage layer). MediaMuxer's constructor specifically requires a plain path, not a URI string. */
  private fun toFilePath(path: String): String {
    return if (path.startsWith("file://")) Uri.parse(path).path ?: path else path
  }

  @ReactMethod
  fun remux(inputPath: String, outputPath: String, promise: Promise) {
    Thread {
      var extractor: MediaExtractor? = null
      var muxer: MediaMuxer? = null
      var retriever: MediaMetadataRetriever? = null
      try {
        val inPath = toFilePath(inputPath)
        val outPath = toFilePath(outputPath)

        extractor = MediaExtractor()
        extractor.setDataSource(inPath)

        muxer = MediaMuxer(outPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

        // Preserve portrait/landscape orientation — MediaExtractor's
        // per-track MediaFormat doesn't reliably carry the container's
        // rotation matrix, so read it separately and re-apply as a muxer
        // orientation hint before starting.
        retriever = MediaMetadataRetriever()
        retriever.setDataSource(inPath)
        val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
        if (rotation != 0) {
          muxer.setOrientationHint(rotation)
        }

        val trackCount = extractor.trackCount
        val indexMap = HashMap<Int, Int>()
        var maxInputSize = 0

        for (i in 0 until trackCount) {
          val format = extractor.getTrackFormat(i)
          val mime = format.getString(MediaFormat.KEY_MIME) ?: ""
          // Only carry tracks MediaMuxer's MPEG_4 output can actually hold —
          // skip anything else (e.g. timed-text/metadata tracks) rather than
          // failing the whole remux over a track we don't need.
          if (mime.startsWith("video/") || mime.startsWith("audio/")) {
            val dstIndex = muxer.addTrack(format)
            indexMap[i] = dstIndex
            if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
              maxInputSize = maxOf(maxInputSize, format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE))
            }
          }
        }

        if (indexMap.isEmpty()) {
          throw Exception("No video/audio tracks found to remux")
        }

        for (srcIndex in indexMap.keys) {
          extractor.selectTrack(srcIndex)
        }

        muxer.start()

        // Not every track's format declares KEY_MAX_INPUT_SIZE (it's an
        // optional hint) — start from a generous default and grow on demand
        // (readSampleData throws IllegalArgumentException if the buffer is
        // too small for a given sample) rather than guessing wrong once and
        // failing on an unusually large keyframe.
        var bufferCapacity = if (maxInputSize > 0) maxInputSize else 2 * 1024 * 1024
        var buffer = ByteBuffer.allocate(bufferCapacity)
        val bufferInfo = MediaCodec.BufferInfo()

        while (true) {
          val srcIndex = extractor.sampleTrackIndex
          if (srcIndex < 0) break
          val dstIndex = indexMap[srcIndex]
          if (dstIndex == null) {
            extractor.advance()
            continue
          }

          buffer.clear()
          var sampleSize: Int
          try {
            sampleSize = extractor.readSampleData(buffer, 0)
          } catch (e: IllegalArgumentException) {
            bufferCapacity *= 2
            buffer = ByteBuffer.allocate(bufferCapacity)
            sampleSize = extractor.readSampleData(buffer, 0)
          }
          if (sampleSize < 0) break

          bufferInfo.offset = 0
          bufferInfo.size = sampleSize
          bufferInfo.presentationTimeUs = extractor.sampleTime
          bufferInfo.flags = extractor.sampleFlags

          muxer.writeSampleData(dstIndex, buffer, bufferInfo)
          extractor.advance()
        }

        muxer.stop()
        promise.resolve(outputPath)
      } catch (e: Exception) {
        promise.reject("REMUX_FAILED", e.message ?: "Unknown remux error", e)
      } finally {
        try { muxer?.release() } catch (e: Exception) {}
        try { extractor?.release() } catch (e: Exception) {}
        try { retriever?.release() } catch (e: Exception) {}
      }
    }.start()
  }
}
`;

const VIDEO_REMUX_PACKAGE_KT = `package com.anonymous.depositoseguro

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class VideoRemuxPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(VideoRemuxModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;

function withVideoRemuxNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const javaDir = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/java',
        PACKAGE_PATH
      );
      fs.mkdirSync(javaDir, { recursive: true });
      fs.writeFileSync(path.join(javaDir, 'VideoRemuxModule.kt'), VIDEO_REMUX_MODULE_KT);
      fs.writeFileSync(path.join(javaDir, 'VideoRemuxPackage.kt'), VIDEO_REMUX_PACKAGE_KT);
      return config;
    },
  ]);
}

function withVideoRemuxPackageRegistration(config) {
  return withMainApplication(config, (config) => {
    const marker = 'add(VideoRemuxPackage())';
    if (!config.modResults.contents.includes(marker)) {
      const before = config.modResults.contents;
      config.modResults.contents = config.modResults.contents.replace(
        /(PackageList\(this\)\.packages\.apply \{\n)([ \t]*)/,
        (_match, open, indent) => `${open}${indent}  ${marker}\n${indent}`
      );
      if (config.modResults.contents === before) {
        console.warn(
          '[withVideoRemux] could not find PackageList(this).packages.apply { ... } block in MainApplication.kt — VideoRemuxPackage was NOT registered. Manual patch required.'
        );
      }
    }
    return config;
  });
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
module.exports = function withVideoRemux(config) {
  config = withVideoRemuxNativeFiles(config);
  config = withVideoRemuxPackageRegistration(config);
  return config;
};
