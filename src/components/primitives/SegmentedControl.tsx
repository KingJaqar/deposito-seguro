// src/components/primitives/SegmentedControl.tsx
// Replaces customization.tsx's local radio-row pattern. Real radio-group
// semantics (§6): accessibilityRole="radiogroup" on the container,
// "radio" + checked state per option — not bare touchables.
import React, { useRef } from 'react';
import { AccessibilityInfo, Animated, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';
import { Durations } from '../../constants/animations';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedControlProps<T>) {
  const { colors, radius } = useTheme();
  const [containerWidth, setContainerWidth] = React.useState(0);
  // See Sheet.tsx's comment: lazy useState replaces useRef(...).current to
  // satisfy react-hooks/refs while keeping identical create-once semantics.
  const [thumbX] = React.useState(() => new Animated.Value(0));
  const reduceMotionRef = useRef(false);

  React.useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotionRef.current = v; });
  }, []);

  const segmentWidth = containerWidth / options.length;
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));

  React.useEffect(() => {
    if (containerWidth === 0) return;
    Animated.timing(thumbX, {
      toValue: activeIndex * segmentWidth,
      duration: reduceMotionRef.current ? Durations.instant : Durations.toggle,
      useNativeDriver: true,
    }).start();
    // thumbX is useState-stable (never reassigned via its setter) —
    // including it satisfies exhaustive-deps without changing when this
    // effect fires.
  }, [activeIndex, segmentWidth, containerWidth, thumbX]);

  const onLayout = (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width);

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={onLayout}
      style={[
        styles.track,
        { backgroundColor: colors.surfaceHover, borderRadius: radius(4), borderColor: colors.borderLight, padding: 3 },
      ]}
    >
      {containerWidth > 0 && (
        <Animated.View
          style={[
            styles.thumb,
            {
              width: segmentWidth - 6,
              backgroundColor: colors.surface,
              borderRadius: radius(3),
              transform: [{ translateX: thumbX }],
            },
          ]}
        />
      )}
      {options.map((option) => (
        <SegmentedOption
          key={option.value}
          option={option}
          selected={option.value === value}
          onChange={onChange}
        />
      ))}
    </View>
  );
}

// Split out so each segment owns its own focus state (§6: every custom
// Pressable-based control — this one isn't a native component like Switch —
// shows a visible themed outline when reached via external keyboard/D-pad/
// switch-access, not just on touch-press).
function SegmentedOption<T extends string>({
  option,
  selected,
  onChange,
}: {
  option: SegmentedControlOption<T>;
  selected: boolean;
  onChange: (value: T) => void;
}) {
  const { colors, font, touchTarget } = useTheme();
  const [focused, setFocused] = React.useState(false);

  return (
    <Pressable
      onPress={() => onChange(option.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      android_ripple={{ color: `${colors.text}14` }}
      accessibilityRole="radio"
      accessibilityLabel={option.label}
      accessibilityState={{ checked: selected }}
      style={[
        styles.segment,
        {
          minHeight: touchTarget() - 8,
          borderRadius: 6,
          borderWidth: focused ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: colors.secondary,
        },
      ]}
    >
      <Text
        style={[
          styles.segmentText,
          { fontSize: font(Type.label.size), color: selected ? colors.text : colors.textMuted },
        ]}
        numberOfLines={1}
      >
        {option.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    position: 'relative',
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  segmentText: {
    fontWeight: '700',
  },
});
