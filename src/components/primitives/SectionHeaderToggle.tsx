// src/components/primitives/SectionHeaderToggle.tsx
// Chevron + title control shared by the collapsible section headers on
// dashboard.tsx, search.tsx, favorites.tsx, and folder/[id].tsx. Tapping
// anywhere on it (not just the chevron glyph) toggles the section. Pair it
// with <CollapsibleSection expanded={...}> wrapping the section's content —
// that component drives the collapse/expand tween on the UI thread via
// Reanimated instead of the old JS-thread LayoutAnimation approach, which
// stuttered on anything heavier than a couple of rows (grids, ScrollViews).
import React, { useEffect, useState } from 'react';
import { Animated as RNAnimated, Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';
import { Durations } from '../../constants/animations';

/**
 * Wraps a section's collapsible content. Mount/unmount is still driven by
 * the caller's `expanded` boolean (`{expanded && <CollapsibleSection>...`}
 * or pass children unconditionally and let `expanded` gate the mount here —
 * either works), but the height/opacity change animates smoothly on the UI
 * thread via Reanimated's layout transitions, and `layout={LinearTransition}`
 * makes surrounding siblings (other cards, sections) glide into their new
 * position instead of snapping.
 */
export function CollapsibleSection({ expanded, children }: { expanded: boolean; children: React.ReactNode }) {
  if (!expanded) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(Durations.layout)}
      exiting={FadeOut.duration(Durations.layout)}
      layout={LinearTransition.duration(Durations.layout)}
    >
      {children}
    </Animated.View>
  );
}

export interface SectionHeaderToggleProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  /**
   * 'title' (default): the bold headline-size label used on dashboard.tsx,
   * search.tsx, and favorites.tsx section headers.
   * 'eyebrow': the small uppercase muted label used for folder/[id].tsx's
   * SUBFOLDERS/FILES sub-sections.
   */
  variant?: 'title' | 'eyebrow';
}

export function SectionHeaderToggle({ title, expanded, onToggle, variant = 'title' }: SectionHeaderToggleProps) {
  const { colors, space, font, iconSize } = useTheme();
  // Lazy useState replaces useRef(...).current — see Sheet.tsx/SegmentedControl.tsx
  // for the same pattern — keeping identical create-once semantics.
  const [rotation] = useState(() => new RNAnimated.Value(expanded ? 1 : 0));

  useEffect(() => {
    RNAnimated.timing(rotation, {
      toValue: expanded ? 1 : 0,
      duration: Durations.toggle,
      useNativeDriver: true,
    }).start();
  }, [expanded, rotation]);

  const rotateDeg = rotation.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] });
  const isEyebrow = variant === 'eyebrow';

  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${title} section, ${expanded ? 'expanded' : 'collapsed'}`}
      accessibilityState={{ expanded }}
      style={styles.row}
    >
      <RNAnimated.View style={{ transform: [{ rotate: rotateDeg }] }}>
        <ChevronDown size={iconSize(isEyebrow ? 14 : 18)} color={colors.textMuted} strokeWidth={2.5} />
      </RNAnimated.View>
      <Text
        style={[
          isEyebrow ? styles.eyebrowTitle : styles.title,
          {
            color: isEyebrow ? colors.textMuted : colors.text,
            fontSize: font(isEyebrow ? Type.eyebrow.size : Type.headline.size),
            marginLeft: space(1),
          },
        ]}
        numberOfLines={1}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  title: { fontWeight: '800', letterSpacing: -0.3 },
  eyebrowTitle: { fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
});
