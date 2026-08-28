// src/components/primitives/GridTile.tsx
// Google Photos-style dense grid tile: a flush square thumbnail with the
// name in a compact single line beneath it — no card chrome (no border,
// no shadow, no internal padding) so tiles pack edge-to-edge with only a
// hairline-scale gutter between them, matching Google Photos' Albums grid.
// Shared by dashboard.tsx's vault grid and folder/[id].tsx's subfolder/file
// grid so every "small/medium/large icons" view mode renders the same way.
import React from 'react';
import { Image as RNImage, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Circle } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';

/** A lucide icon or any icon component matching its (size/color/strokeWidth) call signature — e.g. RootFolderIcon. */
type IconComponent = React.ComponentType<{ size?: number | string; color?: string; strokeWidth?: number | string }>;

export interface GridTileProps {
  size: number;
  name: string;
  Icon: IconComponent;
  iconColor: string;
  thumbnailUri?: string;
  /** Optional second line under the name (e.g. a file-type label), single line. */
  subtitle?: string;
  subtitleColor?: string;
  selectable?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  badges?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  onMenuPress?: () => void;
  accessibilityLabel?: string;
}

export function GridTile({
  size,
  name,
  Icon,
  iconColor,
  thumbnailUri,
  subtitle,
  subtitleColor,
  selectable = false,
  selected = false,
  dimmed = false,
  badges,
  onPress,
  onLongPress,
  onMenuPress,
  accessibilityLabel,
}: GridTileProps) {
  const { colors, font, radius, iconSize } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? name}
      accessibilityState={{ selected: selectable ? selected : undefined }}
      style={({ pressed }) => [styles.tile, { width: size, opacity: dimmed ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      <View
        style={[
          styles.thumb,
          {
            width: size,
            height: size,
            backgroundColor: thumbnailUri ? colors.surfaceHover : `${iconColor}1F`,
            borderRadius: radius(2),
          },
        ]}
      >
        {thumbnailUri ? (
          <RNImage source={{ uri: thumbnailUri }} style={styles.thumbImage} resizeMode="cover" />
        ) : (
          <Icon size={Math.round(size * 0.4)} color={iconColor} strokeWidth={1.75} />
        )}

        {selected && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: `${colors.primary}40`, borderRadius: radius(2) }]} />
        )}

        {!!badges && <View style={styles.badgeCorner}>{badges}</View>}

        {selectable ? (
          <View style={[styles.checkBadge, { width: iconSize(22), height: iconSize(22), borderRadius: iconSize(11), backgroundColor: selected ? colors.primary : 'rgba(0,0,0,0.4)' }]}>
            {selected ? (
              <CheckCircle2 size={iconSize(16)} color={colors.onPrimary} strokeWidth={2.5} />
            ) : (
              <Circle size={iconSize(16)} color="#fff" strokeWidth={2.5} />
            )}
          </View>
        ) : (
          onMenuPress && (
            <Pressable
              onPress={onMenuPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`More actions for ${name}`}
              style={[styles.menuBtn, { width: iconSize(22), height: iconSize(22), borderRadius: iconSize(11), backgroundColor: 'rgba(0,0,0,0.45)' }]}
            >
              <Text style={styles.menuDots}>•••</Text>
            </Pressable>
          )
        )}
      </View>

      <Text numberOfLines={1} style={[styles.label, { color: colors.text, fontSize: font(Type.caption.size), width: size }]}>
        {name}
      </Text>
      {!!subtitle && (
        <Text numberOfLines={1} style={[styles.subtitle, { color: subtitleColor ?? colors.textMuted, fontSize: font(Type.caption.size), width: size }]}>
          {subtitle}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'flex-start' },
  thumb: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  badgeCorner: { position: 'absolute', bottom: 4, right: 4, flexDirection: 'row', gap: 4 },
  menuBtn: { position: 'absolute', top: 4, right: 4, alignItems: 'center', justifyContent: 'center' },
  menuDots: { color: '#fff', fontSize: 10, fontWeight: '700', lineHeight: 10 },
  checkBadge: { position: 'absolute', top: 4, right: 4, alignItems: 'center', justifyContent: 'center' },
  label: { marginTop: 4, fontWeight: '600' },
  subtitle: { fontWeight: '500', marginTop: 1 },
});
