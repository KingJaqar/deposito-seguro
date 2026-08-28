// src/components/primitives/FileTypeIcon.tsx
// The design-system half of the getFileType.tsx split (§5, §7 Phase 2):
// icon/color mapping owned centrally, consumed by ListRow/Badge. Classification
// itself lives in the pure src/utils/fileTypeClassifier.ts.
import React from 'react';
import { FileText, Image as ImageIcon, Music, Play, Smartphone } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { CategoryTint } from '../../constants/Colors';
import { useTheme } from '../../contexts/ThemeContext';
import { classifyFileType, FileTypeTag } from '../../utils/fileTypeClassifier';

const ICON_BY_TAG: Record<FileTypeTag, LucideIcon> = {
  app: Smartphone,
  image: ImageIcon,
  video: Play,
  audio: Music,
  doc: FileText,
  other: FileText,
};

const LABEL_BY_TAG: Record<FileTypeTag, string> = {
  app: 'App',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  doc: 'Document',
  other: 'File',
};

const COLOR_BY_TAG: Record<FileTypeTag, string> = {
  app: CategoryTint.apps,
  image: CategoryTint.images,
  video: CategoryTint.videos,
  audio: CategoryTint.audio,
  doc: CategoryTint.docs,
  other: CategoryTint.other,
};

export interface FileTypeMeta {
  tag: FileTypeTag;
  color: string;
  label: string;
  Icon: LucideIcon;
}

/** Pure lookup — returns the icon component (not yet rendered) plus color/label. */
export function getFileTypeMeta(mimeType: string, name: string): FileTypeMeta {
  const tag = classifyFileType(mimeType, name);
  return { tag, color: COLOR_BY_TAG[tag], label: LABEL_BY_TAG[tag], Icon: ICON_BY_TAG[tag] };
}

export function FileTypeIcon({ mimeType, name, size = 24 }: { mimeType: string; name: string; size?: number }) {
  const { iconSize } = useTheme();
  const { Icon, color } = getFileTypeMeta(mimeType, name);
  return <Icon size={iconSize(size)} color={color} strokeWidth={2} />;
}
