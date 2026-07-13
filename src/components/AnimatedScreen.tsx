// file: src/components/AnimatedScreen.tsx

import React from 'react';
import Animated from 'react-native-reanimated';

interface AnimatedScreenProps {
  style?: any;
  children: React.ReactNode;
}

/**
 * Wraps a screen's root content so entry/exit fade+translate animations
 * never break flex layout. The wrapper always fills its parent —
 * `flex: 1` is baked in here so it can't be forgotten on a future screen.
 *
 * Usage:
 *   <AnimatedScreen style={screenAnimatedStyle}>
 *     <View style={[styles.root, { backgroundColor: colors.background }]}>
 *       ...
 *     </View>
 *   </AnimatedScreen>
 */
export function AnimatedScreen({ style, children }: AnimatedScreenProps) {
  return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;
}
