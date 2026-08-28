// src/services/apkIconExtractor.ts
// Best-effort extraction of an installable app's launcher icon out of an
// .apk (which is just a zip — JSZip is already a project dependency via
// backupService.ts / odtToHtml.ts) so the vault can show the real app icon
// as the file's thumbnail instead of the generic Smartphone glyph.
//
// This deliberately does NOT do a fully correct Android resource resolution
// (parsing the compiled binary AndroidManifest.xml + resources.arsc to walk
// from the <application android:icon> attribute to its resolved entry, then
// compositing adaptive-icon foreground/background layers) — that's a lot of
// machinery for a thumbnail. Instead it relies on a fact that holds for the
// overwhelming majority of real-world APKs: `aapt`/`aapt2` always emits
// legacy raster fallbacks named `ic_launcher.png` (and often
// `ic_launcher_round.png`) under the numbered density folders
// (`res/mipmap-xxxhdpi-v4/`, `-xxhdpi-v4/`, ...), even for apps whose
// primary icon is an adaptive icon (`res/mipmap-anydpi-v4/ic_launcher.xml`)
// — those numbered folders are the pre-API-26 fallback and ship in every
// APK that still supports older devices, which is effectively all of them.
// So: unzip, find the best-density raster launcher icon by filename
// pattern, extract its bytes to a plain PNG file. If nothing matches,
// return null and the caller falls back to the generic icon — this must
// never throw or block an import.
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';

const DENSITY_RANK: Record<string, number> = {
  xxxhdpi: 7,
  xxhdpi: 6,
  xhdpi: 5,
  hdpi: 4,
  mdpi: 3,
  tvdpi: 2,
  ldpi: 1,
};

// res/mipmap-xxxhdpi-v4/ic_launcher.png, res/drawable-hdpi/ic_launcher.png, etc.
const ICON_PATH_RE = /^res\/(mipmap|drawable)-?([a-z]+)?[^/]*\/([^/]+)\.(png|webp)$/i;

function scoreIconEntry(path: string): number {
  const m = ICON_PATH_RE.exec(path);
  if (!m) return -1;
  const [, folderKind, density, baseName] = m;
  const lowerName = baseName.toLowerCase();

  // Adaptive-icon layer PNGs are usable in a pinch but often look wrong
  // in isolation (full-bleed foreground with no background, or vice
  // versa), so they rank well below a real ic_launcher raster.
  const isForegroundOrBackground = /foreground|background|monochrome/.test(lowerName);
  if (!/ic_launcher|ic_app|app_icon|icon/.test(lowerName) && !isForegroundOrBackground) return -1;

  let score = 0;
  score += (DENSITY_RANK[density?.toLowerCase() ?? ''] ?? 0) * 100;
  score += folderKind.toLowerCase() === 'mipmap' ? 20 : 0;
  if (lowerName === 'ic_launcher') score += 10;
  else if (lowerName === 'ic_launcher_round') score += 8;
  else if (/^ic_launcher/.test(lowerName)) score += 5;
  if (isForegroundOrBackground) score -= 1000; // last resort only
  return score;
}

/**
 * Extracts the best launcher-icon PNG found inside `apkPath` and writes it
 * to `outputPngPath`. Returns `outputPngPath` on success, or `null` if no
 * suitable icon could be found or extraction failed for any reason — never
 * throws, mirroring StorageService.remuxVideoIfPossible's best-effort shape
 * so a broken/unusual APK never blocks the import itself.
 */
export async function extractApkIcon(apkPath: string, outputPngPath: string): Promise<string | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(apkPath, { encoding: FileSystem.EncodingType.Base64 });
    const zip = await JSZip.loadAsync(base64, { base64: true });

    let bestPath: string | null = null;
    let bestScore = -1;
    zip.forEach((relativePath, entry) => {
      if (entry.dir) return;
      const score = scoreIconEntry(relativePath);
      if (score > bestScore) {
        bestScore = score;
        bestPath = relativePath;
      }
    });

    if (!bestPath || bestScore < 0) return null;

    const iconEntry = zip.file(bestPath);
    if (!iconEntry) return null;

    const iconBase64 = await iconEntry.async('base64');
    await FileSystem.writeAsStringAsync(outputPngPath, iconBase64, { encoding: FileSystem.EncodingType.Base64 });
    return outputPngPath;
  } catch (e) {
    console.error('extractApkIcon failed (falling back to generic app icon):', e);
    return null;
  }
}
