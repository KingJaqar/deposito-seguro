// File path: src/components/VaultHeader.tsx
// Rebuilt per plans/you-are-a-senior-majestic-swing.md §5/§7 Phase 3: fixes
// the double-top-padding bug by owning its top safe-area inset internally
// (useSafeAreaInsets), instead of relying on a host SafeAreaView plus a
// hardcoded headerPaddingTop stacking together. Host screens now pass
// edges={['bottom','left','right']} to their own SafeAreaView (see §7 Phase 3
// for the 5 host files, 3 of which also needed a SafeAreaView import
// migration off React Native's own iOS-only implementation).
// Also drops the @expo/vector-icons Ionicons back-chevron in favor of
// lucide-react-native, per §4's "100% lucide, no second icon set" rule.
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  rightButton?: React.ReactNode;
  allowMultilineTitle?: boolean;
  style?: ViewStyle;
}

export const VaultHeader = ({ title, showBack = false, rightButton, allowMultilineTitle = false, style }: HeaderProps) => {
  const { colors, space, font, radius, iconSize, touchTarget } = useTheme();
  const insets = useSafeAreaInsets();
  const backBtnSize = Math.max(38, touchTarget() - 6);

  const handleBackPress = () => {
    if (showBack) router.back();
  };

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
      <View style={styles.content}>
        {showBack && (
          <Pressable
            onPress={handleBackPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [
              styles.backBtn,
              {
                width: backBtnSize,
                height: backBtnSize,
                borderRadius: radius(4),
                backgroundColor: `${colors.primary}14`,
                marginRight: space(3),
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <ChevronLeft size={iconSize(20)} color={colors.primary} strokeWidth={2.5} />
          </Pressable>
        )}

        <View style={styles.titleContainer}>
          <Text
            style={[styles.title, { fontSize: font(Type.headline.size), color: colors.text }]}
            numberOfLines={allowMultilineTitle ? undefined : 1}
          >
            {title}
          </Text>
        </View>

        {rightButton ? (
          <View style={[styles.rightBtn, { marginLeft: space(3) }]}>{rightButton}</View>
        ) : showBack ? (
          <View style={{ width: backBtnSize }} />
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 100,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
    flexShrink: 1,
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'left',
    flexShrink: 1,
  },
  rightBtn: {
    flexShrink: 0,
  },
});
