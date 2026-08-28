// src/components/primitives/SubfolderIcon.tsx
// Custom nested-folder glyph swapped in for lucide's Folder/FolderPlus icon
// on non-root folders (dashboard, favorites, search, folder/[id]). Matches
// the LucideIcon call signature (size/color/strokeWidth) so it drops into
// GridTile's `Icon` prop and ListRow's `leading` slot alongside `Folder`.
// Sibling of RootFolderIcon, which covers root-level vaults.
import React from 'react';
import { Image, StyleSheet } from 'react-native';

const subfolderIconSource = require('../../../assets/icons/folder icons/subfolder_icon.png');

export function SubfolderIcon({
  size = 24,
  color,
}: {
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
}) {
  const numericSize = typeof size === 'string' ? Number(size) || 24 : size;
  return (
    <Image
      source={subfolderIconSource}
      style={[styles.icon, { width: numericSize, height: numericSize, tintColor: color }]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  icon: {},
});
