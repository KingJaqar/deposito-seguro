// src/components/primitives/ListRow.tsx
// The file/folder row shape repeated across folder/[id].tsx, trash.tsx,
// favorites.tsx, search.tsx: leading icon/thumbnail, title (wrapAtLength-
// wrapped), metadata line, trailing badges, trailing overflow/checkbox slot.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { CheckSquare, Square, MoreVertical } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';
import { Durations } from '../../constants/animations';
import { wrapAtLength } from '../../utils/wrapAtLength';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode; // icon or thumbnail
  thumbnailUri?: string;
  trailingBadges?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onOverflowPress?: () => void;
  allowMultilineTitle?: boolean;
  disabled?: boolean;
}

export function ListRow({
  title,
  subtitle,
  leading,
  thumbnailUri,
  trailingBadges,
  onPress,
  onLongPress,
  selectable = false,
  selected = false,
  onToggleSelect,
  onOverflowPress,
  allowMultilineTitle = false,
  disabled = false,
}: ListRowProps) {
  const { colors, space, font, radius, iconSize, touchTarget } = useTheme();
  const leadingSize = iconSize(44);
  const titleLines = allowMultilineTitle ? wrapAtLength(title, 60) : [title];
  const [rowFocused, setRowFocused] = useState(false);
  const [checkboxFocused, setCheckboxFocused] = useState(false);
  const [overflowFocused, setOverflowFocused] = useState(false);

  // The row used to be one big Pressable with the checkbox/overflow buttons
  // nested inside it. On react-native-web a Pressable with
  // accessibilityRole="button" renders as an HTML <button>, so that nesting
  // produced <button><button>…</button></button> — invalid HTML. Browsers
  // repair that by closing the outer button early, which silently detaches
  // the inner button from its intended place in the tree and breaks its
  // click handling (the overflow "…" menu looked static: nothing happened
  // on tap). Native (iOS/Android) never hit this — Pressable-in-Pressable
  // is fine there — which is why the bug only showed up in the web preview.
  // Fix: the checkbox and overflow controls are now siblings of the main
  // row Pressable (all children of a plain View), not descendants of it, so
  // no control is ever a <button> inside another <button>.
  const [rowPressed, setRowPressed] = useState(false);

  // Graceful fallback for a broken/missing thumbnail file — see GridTile.tsx's
  // identical addition for the full rationale. ListRow only has the one
  // thumbnailUri read below (the leading Image/leading-node ternary), so
  // there's nothing else in this component to switch over to showThumbnail.
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  useEffect(() => setThumbnailFailed(false), [thumbnailUri]);
  const showThumbnail = !!thumbnailUri && !thumbnailFailed;

  // Crossfade on thumbnail set/change/clear — see GridTile.tsx's identical
  // addition for the full rationale (per-tile Reanimated tween instead of
  // LayoutAnimation, which this codebase already found stutters on grids/
  // lists heavier than a couple of rows; skipped on first mount so
  // scrolling a virtualized list doesn't replay it per row).
  const thumbOpacity = useSharedValue(1);
  const hasMountedThumb = useRef(false);
  const reduceMotionThumb = useRef(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (mounted) reduceMotionThumb.current = enabled; })
      .catch(() => { });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!hasMountedThumb.current) {
      hasMountedThumb.current = true;
      return;
    }
    if (reduceMotionThumb.current) {
      thumbOpacity.value = 1;
      return;
    }
    thumbOpacity.value = 0;
    thumbOpacity.value = withTiming(1, { duration: Durations.fast, easing: Easing.out(Easing.quad) });
  }, [thumbnailUri, thumbOpacity]);
  const animatedThumbStyle = useAnimatedStyle(() => ({ opacity: thumbOpacity.value }));

  return (
    <View
      style={[
        styles.row,
        {
          minHeight: touchTarget() + space(2),
          paddingVertical: space(3),
          paddingHorizontal: space(4),
          borderRadius: radius(4),
          backgroundColor: selected ? `${colors.primary}14` : 'transparent',
          borderWidth: rowFocused ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: colors.secondary,
          opacity: disabled ? 0.5 : rowPressed ? 0.85 : 1,
        },
      ]}
    >
      {selectable && (
        <Pressable
          onPress={onToggleSelect}
          onFocus={() => setCheckboxFocused(true)}
          onBlur={() => setCheckboxFocused(false)}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          style={{
            marginRight: space(3),
            borderRadius: radius(2),
            borderWidth: checkboxFocused ? StyleSheet.hairlineWidth * 2 : 0,
            borderColor: colors.secondary,
          }}
        >
          {selected ? (
            <CheckSquare size={iconSize(22)} color={colors.primary} strokeWidth={2} />
          ) : (
            <Square size={iconSize(22)} color={colors.textMuted} strokeWidth={2} />
          )}
        </Pressable>
      )}

      <Pressable
        onPress={selectable ? onToggleSelect : onPress}
        onLongPress={onLongPress}
        onPressIn={() => setRowPressed(true)}
        onPressOut={() => setRowPressed(false)}
        onFocus={() => setRowFocused(true)}
        onBlur={() => setRowFocused(false)}
        disabled={disabled}
        android_ripple={{ color: `${colors.text}0F` }}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ selected: selectable ? selected : undefined, disabled }}
        style={styles.rowBody}
      >
        <Animated.View style={[styles.leading, animatedThumbStyle, { width: leadingSize, height: leadingSize, marginRight: space(3), borderRadius: radius(3), backgroundColor: colors.vaultIconBg }]}>
          {showThumbnail ? (
            <Image
              source={{ uri: thumbnailUri }}
              style={[styles.thumbnail, { width: leadingSize, height: leadingSize, borderRadius: radius(3) }]}
              resizeMode="cover"
              onError={() => setThumbnailFailed(true)}
            />
          ) : (
            leading
          )}
        </Animated.View>

        <View style={styles.textCol}>
          {titleLines.map((line, i) => (
            <Text
              key={i}
              numberOfLines={allowMultilineTitle ? undefined : 1}
              style={[styles.title, { fontSize: font(Type.body.size), color: colors.text }]}
            >
              {line}
            </Text>
          ))}
          {subtitle ? (
            <Text numberOfLines={1} style={[styles.subtitle, { fontSize: font(Type.caption.size), color: colors.textMuted, marginTop: 2 }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {trailingBadges ? <View style={[styles.badges, { marginLeft: space(2), gap: space(1) }]}>{trailingBadges}</View> : null}
      </Pressable>

      {onOverflowPress && !selectable && (
        <Pressable
          onPress={onOverflowPress}
          onFocus={() => setOverflowFocused(true)}
          onBlur={() => setOverflowFocused(false)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="More actions"
          style={{
            marginLeft: space(2),
            padding: 6,
            borderRadius: radius(2),
            borderWidth: overflowFocused ? StyleSheet.hairlineWidth * 2 : 0,
            borderColor: colors.secondary,
          }}
        >
          <MoreVertical size={iconSize(18)} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leading: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbnail: {},
  textCol: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
  },
  subtitle: {
    fontWeight: '500',
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
