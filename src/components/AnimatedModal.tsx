import { useEffect, useRef } from 'react';
import { Modal as RNModal, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Durations } from '../constants/animations';

interface AnimatedModalProps {
   visible: boolean;
   onClose: () => void;
   animationType?: 'fade' | 'slideUp' | 'none';
   backdropOpacity?: number;
   closeOnBackdropPress?: boolean;
   children: React.ReactNode;
   style?: ViewStyle;
  }

export const AnimatedModal = ({
   visible,
   onClose,
   animationType = 'slideUp',
   backdropOpacity = 0.6,
   closeOnBackdropPress = true,
   children,
   style,
 }: AnimatedModalProps) => {
   const backdropOpacityVal = useSharedValue(0);
   const sheetTranslateY = useSharedValue(400);
   const cardScale = useSharedValue(0.9);
   const cardOpacity = useSharedValue(0);

   const animateIn = () => {
     'worklet';
     if (animationType === 'fade') {
       cardOpacity.value = withTiming(1, {
         duration: Durations.modalEnter,
       });
       backdropOpacityVal.value = withTiming(backdropOpacity, {
         duration: Durations.modalEnter,
       });
     } else if (animationType === 'slideUp') {
       sheetTranslateY.value = withTiming(0, {
         duration: Durations.sheetEnter,
       });
       backdropOpacityVal.value = withTiming(backdropOpacity, {
         duration: Durations.sheetEnter,
       });
       cardScale.value = withTiming(1, {
         duration: Durations.sheetEnter - 50,
       });
     }
   };

   const animateOut = () => {
     'worklet';
     if (animationType === 'fade') {
       cardOpacity.value = withTiming(0, {
         duration: Durations.modalExit,
       });
       backdropOpacityVal.value = withTiming(0, {
         duration: Durations.modalExit,
       });
     } else if (animationType === 'slideUp') {
       sheetTranslateY.value = withTiming(400, {
         duration: Durations.sheetExit,
       });
       backdropOpacityVal.value = withTiming(0, {
         duration: Durations.sheetExit,
       });
       cardScale.value = withTiming(0.9, {
         duration: Durations.sheetExit - 50,
       });
     }
   };

   const handleClose = () => {
     animateOut();
     setTimeout(() => {
       runOnJS(onClose)();
     }, animationType === 'fade' ? Durations.modalExit : Durations.sheetExit);
   };

   const backdropAnimatedStyle = useAnimatedStyle(() => ({
     opacity: backdropOpacityVal.value,
   }));

   const contentAnimatedStyle = useAnimatedStyle(() => ({
     transform: [
       { translateY: sheetTranslateY.value },
       { scale: cardScale.value },
     ],
     opacity: cardOpacity.value,
   }));

    const animateInRef = useRef(animateIn);

    useEffect(() => {
      animateInRef.current = animateIn;
    });

    useEffect(() => {
      if (visible) {
        const timer = setTimeout(() => {
          animateInRef.current();
        }, 10);
        return () => clearTimeout(timer);
      }
    }, [visible]);

   return (
     <RNModal
       visible={visible}
       transparent
       animationType="none"
       onRequestClose={handleClose}
       statusBarTranslucent
     >
       <View style={styles.overlay}>
         <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, backdropAnimatedStyle]}>
           {closeOnBackdropPress && (
             <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
           )}
         </Animated.View>
         <View style={[styles.centeringContainer, style]}>
           <Animated.View style={contentAnimatedStyle}>
             {children}
           </Animated.View>
         </View>
       </View>
     </RNModal>
   );
 };

const styles = StyleSheet.create({
   overlay: {
     flex: 1,
     justifyContent: 'flex-end',
     alignItems: 'center',
     backgroundColor: 'transparent',
   },
   centeringContainer: {
     flex: 1,
     width: '100%',
     justifyContent: 'flex-end',
     alignItems: 'center',
   },
 });
