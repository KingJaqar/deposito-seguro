import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { StaggerConfig } from '../constants/animations';

const useScrollReveal = (itemCount: number = 10) => {
  const animations = useRef<Animated.Value[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const values = Array.from({ length: itemCount }, () => new Animated.Value(0));
    animations.current = values;
    return () => {
      values.forEach(anim => anim.setValue(0));
    };
  }, [itemCount]);

  const reveal = () => {
    animations.current.forEach((anim, index) => {
      const delay = StaggerConfig.initialDelay + index * StaggerConfig.itemDelay;
      Animated.timing(anim, {
        toValue: 1,
        duration: 400,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
    runOnJS(setReady)(true);
  };

  const hide = () => {
    animations.current.forEach(anim => {
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
    runOnJS(setReady)(false);
  };

  const getAnimatedStyle = (index: number) => {
    if (index >= animations.current.length) {
      return { opacity: 1, transform: [] as { translateY: number; scale: number }[] };
    }
    const anim = animations.current[index];
    const opacity = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });
    const translateY = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [20, 0],
      extrapolate: 'clamp',
    });
    const scale = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.95, 1],
      extrapolate: 'clamp',
    });
    return { opacity, transform: [{ translateY }, { scale }] };
  };

  return { reveal, hide, getAnimatedStyle, ready };
};

const useParallaxScroll = () => {
  const scrollY = useSharedValue(0);

  const headerTranslateY = scrollY.value * 0.5;
  const headerOpacity = Math.max(0, Math.min(1, scrollY.value * 0.4 + 1));
  const contentTranslateY = scrollY.value * -0.3;

  return { scrollY, headerTranslateY, headerOpacity, contentTranslateY };
};

export { useParallaxScroll, useScrollReveal };

