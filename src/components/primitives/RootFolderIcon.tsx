// src/components/primitives/RootFolderIcon.tsx
// Custom stacked-folders glyph swapped in for lucide's Folder icon on
// root-level vaults (dashboard, favorites, search). Matches the LucideIcon
// call signature (size/color/strokeWidth) so it drops straight into
// GridTile's `Icon` prop and ListRow's `leading` slot alongside `Folder`.
import React from 'react';
import { Image, StyleSheet } from 'react-native';

const rootFolderIconSource = require('../../../assets/icons/folder icons/root_folder_icon.png');

export function RootFolderIcon({
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
      source={rootFolderIconSource}
      style={[styles.icon, { width: numericSize, height: numericSize, tintColor: color }]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  icon: {},
});
