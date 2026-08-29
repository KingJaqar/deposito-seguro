// src/components/primitives/GridTile.tsx
// Google Photos-style dense grid tile: a flush square thumbnail with the
// name in a compact single line beneath it — no card chrome (no border,
// no shadow, no internal padding) so tiles pack edge-to-edge with only a
// hairline-scale gutter between them, matching Google Photos' Albums grid.
// Shared by dashboard.tsx's vault grid and folder/[id].tsx's subfolder/file
// grid so every "small/medium/large icons" view mode renders the same way.
import React, { useState } from 'react';
import { Image as RNImage, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Circle, RotateCcw, Trash2 } from 'lucide-react-native';
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
  /** Trash-specific actions: when provided (and not in selection mode), renders a
   * always-visible restore/delete row beneath the label at every grid density,
   * instead of relying on a hover/overlay affordance that small tiles can't fit. */
  onRestorePress?: () => void;
  onDeletePress?: () => void;
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
  onRestorePress,
  onDeletePress,
  accessibilityLabel,
}: GridTileProps) {
  const { colors, font, radius, iconSize } = useTheme();

  // The menu/restore/delete buttons used to be nested inside the tile's own
  // Pressable. On react-native-web a Pressable with accessibilityRole="button"
  // renders as an HTML <button>, so nesting one Pressable inside another
  // produced <button><button>…</button></button> — invalid HTML that
  // browsers repair by closing the outer button early, detaching the inner
  // button from the tree and breaking its click handling (the "…" menu
  // looked static — tapping it did nothing). Native never hit this — only
  // the web preview did — since Pressable-in-Pressable is fine there. Fix:
  // the menu/restore/delete Pressables are now siblings of the main content
  // Pressable (all children of a plain View), overlaid with absolute
  // positioning where needed, so no button is ever nested inside another.
  const [tilePressed, setTilePressed] = useState(false);

  return (
    <View style={[styles.tile, { width: size, opacity: dimmed ? 0.5 : tilePressed ? 0.85 : 1 }]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => setTilePressed(true)}
        onPressOut={() => setTilePressed(false)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? name}
        accessibilityState={{ selected: selectable ? selected : undefined }}
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

          {selectable && (
            <View style={[styles.checkBadge, { width: iconSize(22), height: iconSize(22), borderRadius: iconSize(11), backgroundColor: selected ? colors.primary : 'rgba(0,0,0,0.4)' }]}>
              {selected ? (
                <CheckCircle2 size={iconSize(16)} color={colors.onPrimary} strokeWidth={2.5} />
              ) : (
                <Circle size={iconSize(16)} color="#fff" strokeWidth={2.5} />
              )}
            </View>
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

      {!selectable && onMenuPress && (
        <Pressable
          onPress={onMenuPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`More actions for ${name}`}
          style={[styles.menuBtn, { width: iconSize(22), height: iconSize(22), borderRadius: iconSize(11), backgroundColor: 'rgba(0,0,0,0.45)' }]}
        >
          <Text style={styles.menuDots}>•••</Text>
        </Pressable>
      )}

      {!selectable && (onRestorePress || onDeletePress) && (
        <View style={[styles.actionRow, { width: size }]}>
          {onRestorePress && (
            <Pressable
              onPress={onRestorePress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Restore ${name}`}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.surfaceHover, borderRadius: radius(3), opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <RotateCcw size={iconSize(13)} color={colors.text} strokeWidth={2.25} />
            </Pressable>
          )}
          {onDeletePress && (
            <Pressable
              onPress={onDeletePress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${name}`}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: `${colors.error}1F`, borderRadius: radius(3), opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Trash2 size={iconSize(13)} color={colors.error} strokeWidth={2.25} />
            </Pressable>
          )}
        </View>
      )}
    </View>
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
  actionRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  actionBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
