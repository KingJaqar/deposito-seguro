import { type ReactNode } from 'react';
import { AccessibilityRole, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import Animated, {
   Extrapolation,
   interpolate,
   useAnimatedStyle,
   useSharedValue,
   withTiming,
 } from 'react-native-reanimated';
import { Durations } from '../constants/animations';

interface AnimatedPressableProps {
   children: ReactNode;
   onPress?: () => void;
   onLongPress?: () => void;
   onPressIn?: () => void;
   onPressOut?: () => void;
   style?: ViewStyle;
   disabled?: boolean;
   scaleOnPress?: number;
   animateOpacity?: boolean;
   accessibilityRole?: AccessibilityRole;
   accessibilityLabel?: string;
   accessibilityState?: object;
 }

export const AnimatedPressable = ({
   children,
   onPress,
   onLongPress,
   onPressIn,
   onPressOut,
   style,
   disabled = false,
   scaleOnPress = 0.96,
   animateOpacity = true,
   accessibilityRole,
   accessibilityLabel,
   accessibilityState,
 }: AnimatedPressableProps) => {
   const pressed = useSharedValue(0);

   const handlePressIn = () => {
     pressed.value = withTiming(1, {
       duration: Durations.fast,
     });
     onPressIn?.();
   };

   const handlePressOut = () => {
     pressed.value = withTiming(0, {
       duration: Durations.normal,
     });
     onPressOut?.();
   };

   const animatedStyle = useAnimatedStyle(() => {
     const scale = interpolate(
       pressed.value,
       [0, 1],
       [1, scaleOnPress],
       Extrapolation.CLAMP
     );

     const opacity = animateOpacity
       ? interpolate(pressed.value, [0, 1], [1, 0.7], Extrapolation.CLAMP)
       : 1;

     return {
       transform: [{ scale }],
       opacity,
     };
   });

   return (
     <Animated.View style={[styles.wrapper, style, animatedStyle]}>
       <TouchableOpacity
         onPress={onPress}
         onLongPress={onLongPress}
         onPressIn={handlePressIn}
         onPressOut={handlePressOut}
         disabled={disabled}
         activeOpacity={1}
         style={styles.touchable}
         accessibilityRole={accessibilityRole}
         accessibilityLabel={accessibilityLabel}
         accessibilityState={accessibilityState}
       >
         {children}
       </TouchableOpacity>
     </Animated.View>
   );
 };

 const styles = StyleSheet.create({
    wrapper: {
      overflow: 'hidden',
    },
    touchable: {
      width: '100%',
      height: '100%',
    },
 });