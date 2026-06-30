// File path: src/components/VaultHeader.tsx

import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  rightButton?: React.ReactNode;
  scrollY?: any;
  style?: ViewStyle;
}

export const VaultHeader = ({ title, showBack = false, rightButton, style }: HeaderProps) => {
  const { colors, space, font, headerPaddingTop, isTablet } = useTheme();

  const handleBackPress = () => {
    if (showBack) {
      router.back();
    }
  };

  const containerStyle: ViewStyle = {
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.glass,
    paddingTop: headerPaddingTop,
    paddingHorizontal: space(4),
    minHeight: isTablet ? 72 : 64,
  };

  return (
    <View
      style={[styles.container, containerStyle, style]}
    >
      <View style={styles.content}>
        {showBack && (
          <TouchableOpacity
            onPress={handleBackPress}
            style={styles.backBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <View
              style={[
                styles.backIconWrap,
                { backgroundColor: `${colors.primary}15` },
              ]}
            >
              <Text style={styles.backIcon}>←</Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
        </View>

        {rightButton && (
          <View style={styles.rightBtn}>
            {rightButton}
          </View>
        )}
      </View>

      <View style={[styles.gradientLine, { backgroundColor: colors.primary, opacity: 0.3 }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'space-between',
    zIndex: 100,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    marginRight: 8,
  },
  backIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: -1,
  },
  titleContainer: {
    flex: 1,
    flexShrink: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
    flexShrink: 1,
  },
  rightBtn: {
    marginLeft: 'auto',
    flexShrink: 0,
  },
  gradientLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
  },
});
