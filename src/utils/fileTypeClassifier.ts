// src/utils/fileTypeClassifier.ts
// Pure file-type classification, split out of getFileType.tsx per plans/
// you-are-a-senior-majestic-swing.md §5/§7 Phase 2 — this half of the split
// has zero JSX/icon coupling. The icon/color mapping is owned centrally by
// the design system at src/components/primitives/FileTypeIcon.tsx.

export type FileTypeTag = 'image' | 'video' | 'audio' | 'doc' | 'app' | 'other';

export function classifyFileType(mimeType: string, name: string): FileTypeTag {
  const isApp =
    mimeType === 'application/vnd.android.package-archive' ||
    mimeType === 'application/x-msdownload' ||
    name.endsWith('.apk') || name.endsWith('.exe') || name.endsWith('.dmg');
  if (isApp) return 'app';

  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';

  const isDoc =
    mimeType.includes('pdf') || mimeType.includes('document') ||
    mimeType.includes('text') || mimeType.includes('sheet');
  if (isDoc) return 'doc';

  return 'other';
}
