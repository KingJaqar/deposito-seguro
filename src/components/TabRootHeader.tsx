// src/components/TabRootHeader.tsx
// Net-new component (plans/you-are-a-senior-majestic-swing.md §2/§7 Phase 3 —
// authored fresh per the plan's default resolution of its own flagged open
// decision, rather than restored from the stashed pre-redesign draft). Header
// for the 5 tab-root screens: title + optional tagline + right-slot, no back
// button. Owns its own top safe-area inset the same way VaultHeader does, so
// the two headers agree on safe-area handling.
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';

interface TabRootHeaderProps {
  title: string;
  tagline?: string;
  rightSlot?: React.ReactNode;
  style?: ViewStyle;
}

export const TabRootHeader = ({ title, tagline, rightSlot, style }: TabRootHeaderProps) => {
  const { colors, space, font } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.navBar,
          borderBottomColor: colors.borderLight,
          paddingTop: insets.top + space(2),
          paddingHorizontal: space(4),
          paddingBottom: space(3),
        },
        style,
      ]}
    >
      <View style={styles.textCol}>
        <Text style={[styles.title, { fontSize: font(Type.title.size), color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {tagline ? (
          <Text style={[styles.tagline, { fontSize: font(Type.caption.size), color: colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
            {tagline}
          </Text>
        ) : null}
      </View>
      {rightSlot ? <View style={{ marginLeft: space(3) }}>{rightSlot}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 100,
  },
  textCol: {
    flex: 1,
    flexShrink: 1,
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  tagline: {
    fontWeight: '500',
  },
});
