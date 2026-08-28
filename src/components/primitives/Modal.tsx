// src/components/primitives/Modal.tsx
// Base overlay (backdrop + tap-to-dismiss + KeyboardAvoidingView) that Dialog
// and Sheet are built on. Not used directly by screens.
import React from 'react';
import { KeyboardAvoidingView, Modal as RNModal, Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';

export interface BaseModalProps {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  dismissOnBackdropPress?: boolean;
  align?: 'center' | 'bottom';
  contentStyle?: ViewStyle;
}

export function BaseModal({
  visible,
  onRequestClose,
  children,
  dismissOnBackdropPress = true,
  align = 'center',
  contentStyle,
}: BaseModalProps) {
  if (!visible) return null;

  return (
    <RNModal visible={visible} transparent animationType="none" onRequestClose={onRequestClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.overlay, align === 'bottom' && styles.overlayBottom]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissOnBackdropPress ? onRequestClose : undefined}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View style={contentStyle} pointerEvents="box-none">
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayBottom: {
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
});
