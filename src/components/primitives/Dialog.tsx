// src/components/primitives/Dialog.tsx
// Centered card (icon-in-circle, title, message, action row), built from
// DestructiveConfirmModal's existing shape per §5. Base for renames,
// create-folder/subfolder prompts, display-name/restore-passphrase prompts,
// backup progress/result, and (via useConfirmDestructive) destructive
// confirmations.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Durations } from '../../constants/animations';
import { Type } from '../../constants/typography';
import { BaseModal } from './Modal';
import { Button, ButtonVariant } from './Button';

export interface DialogAction {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
}

export interface DialogProps {
  visible: boolean;
  onRequestClose: () => void;
  icon?: LucideIcon;
  iconColor?: string;
  title: string;
  message?: string;
  children?: React.ReactNode;
  actions?: DialogAction[];
  dismissOnBackdropPress?: boolean;
  /** Overrides the default 360 (phone) / 480 (tablet) card width. */
  maxWidth?: number;
  /** Overrides the default space(5) horizontal card padding. */
  contentPaddingHorizontal?: number;
  /** Short dialogs can opt out so the card wraps its content exactly. */
  scrollable?: boolean;
}

export function Dialog({
  visible,
  onRequestClose,
  icon: Icon,
  iconColor,
  title,
  message,
  children,
  actions = [],
  dismissOnBackdropPress = true,
  maxWidth,
  contentPaddingHorizontal,
  scrollable = true,
}: DialogProps) {
  const { colors, space, font, radius, shadow, isTablet, iconSize } = useTheme();
  const iconWrapSize = iconSize(56);
  // See Sheet.tsx's comment: lazy useState replaces useRef(...).current to
  // satisfy react-hooks/refs while keeping identical create-once semantics.
  const [scale] = useState(() => new Animated.Value(0.94));
  const [opacity] = useState(() => new Animated.Value(0));
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotionRef.current = v; });
  }, []);

  useEffect(() => {
    if (!visible) return;
    const duration = reduceMotionRef.current ? Durations.instant : Durations.modalEnter;
    scale.setValue(0.94);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }),
    ]).start();
    // scale/opacity are useState-stable (never reassigned via their
    // setters) — including them satisfies exhaustive-deps without changing
    // when this effect fires.
  }, [visible, scale, opacity]);

  if (!visible) return null;

  const tint = iconColor ?? colors.primary;

  return (
    <BaseModal visible={visible} onRequestClose={onRequestClose} align="center" dismissOnBackdropPress={dismissOnBackdropPress}>
      <Animated.View
        style={[
          styles.card,
          shadow('lg'),
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderLight,
            borderRadius: radius(11),
            paddingVertical: space(7),
            paddingHorizontal: contentPaddingHorizontal ?? space(5),
            maxWidth: maxWidth ?? (isTablet ? 480 : 360),
            transform: [{ scale }],
            opacity,
          },
        ]}
        accessibilityViewIsModal
      >
        {scrollable ? (
          <KeyboardAwareScrollView
            style={styles.scroll}
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {Icon && (
              <View style={[styles.iconWrap, { width: iconWrapSize, height: iconWrapSize, borderRadius: iconWrapSize / 2, backgroundColor: `${tint}1F`, marginBottom: space(4) }]}>
                <Icon size={iconSize(24)} color={tint} strokeWidth={2.5} />
              </View>
            )}
            <Text
              style={[
                styles.title,
                { fontSize: font(Type.headline.size), color: colors.text, marginBottom: message || children ? space(2) : 0 },
              ]}
            >
              {title}
            </Text>
            {message ? (
              <Text style={[styles.message, { fontSize: font(Type.body.size), color: colors.textSecondary, marginBottom: space(6) }]}>
                {message}
              </Text>
            ) : null}
            {children}
            {actions.length > 0 && (
              <View style={[styles.actionRow, { gap: space(3), marginTop: children || message ? 0 : space(6) }]}>
                {actions.map((action, i) => (
                  <Button
                    key={i}
                    title={action.label}
                    onPress={action.onPress}
                    variant={action.variant ?? (i === actions.length - 1 ? 'primary' : 'tertiary')}
                    loading={action.loading}
                    disabled={action.disabled}
                    style={styles.actionBtn}
                  />
                ))}
              </View>
            )}
          </KeyboardAwareScrollView>
        ) : (
          <View style={styles.staticContent}>
            {Icon && (
              <View style={[styles.iconWrap, { width: iconWrapSize, height: iconWrapSize, borderRadius: iconWrapSize / 2, backgroundColor: `${tint}1F`, marginBottom: space(4) }]}>
                <Icon size={iconSize(24)} color={tint} strokeWidth={2.5} />
              </View>
            )}
            <Text
              style={[
                styles.title,
                { fontSize: font(Type.headline.size), color: colors.text, marginBottom: message || children ? space(2) : 0 },
              ]}
            >
              {title}
            </Text>
            {message ? (
              <Text style={[styles.message, { fontSize: font(Type.body.size), color: colors.textSecondary, marginBottom: space(6) }]}>
                {message}
              </Text>
            ) : null}
            {children}
            {actions.length > 0 && (
              <View style={[styles.actionRow, { gap: space(3), marginTop: children || message ? 0 : space(6) }]}>
                {actions.map((action, i) => (
                  <Button
                    key={i}
                    title={action.label}
                    onPress={action.onPress}
                    variant={action.variant ?? (i === actions.length - 1 ? 'primary' : 'tertiary')}
                    loading={action.loading}
                    disabled={action.disabled}
                    style={styles.actionBtn}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </Animated.View>
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxHeight: '92%',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    width: '100%',
    alignItems: 'stretch',
  },
  scroll: {
    width: '100%',
    flex: 0,
    flexGrow: 0,
    flexShrink: 1,
  },
  staticContent: {
    width: '100%',
    alignItems: 'stretch',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    lineHeight: 21,
  },
  actionRow: {
    flexDirection: 'row',
    width: '100%',
  },
  actionBtn: {
    flex: 1,
  },
});
