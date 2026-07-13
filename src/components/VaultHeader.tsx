// File path: src/components/VaultHeader.tsx

import { Ionicons } from '@expo/vector-icons';
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
  backgroundColor: colors.glass,
  paddingTop: headerPaddingTop,
  paddingHorizontal: space(4),
  paddingBottom: space(3),
  minHeight: isTablet ? 84 : 72,
};

  return (
    <View style={[styles.container, containerStyle, style, { shadowColor: colors.text }]}>
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
                { backgroundColor: `${colors.primary}14`, shadowColor: colors.primary },
              ]}
            >
              <Ionicons name="chevron-back" size={19} color={colors.primary} />
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
        </View>

        {rightButton ? (
          <View style={styles.rightBtn}>{rightButton}</View>
        ) : showBack ? (
          <View style={styles.rightSpacer} />
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    marginRight: 14,
  },
  backIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 1,
  },
  titleContainer: {
    flex: 1,
    flexShrink: 1,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'left',
    flexShrink: 1,
  },
  rightBtn: {
    marginLeft: 12,
    flexShrink: 0,
  },
  rightSpacer: {
    width: 38,
  },
});