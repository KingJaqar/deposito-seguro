// src/components/primitives/EmptyState.tsx
// Consolidates ~6 near-identical empty-state blocks across dashboard/folder/
// trash/settings/auth-key (§5).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';
import { Button } from './Button';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  const { colors, space, font, responsiveSize, iconSize } = useTheme();
  const glyphSize = iconSize(responsiveSize(36, 44));

  return (
    <View style={[styles.container, { paddingVertical: space(12), paddingHorizontal: space(6) }]}>
      <View
        style={[
          styles.iconWrap,
          { width: glyphSize * 2, height: glyphSize * 2, borderRadius: glyphSize, backgroundColor: colors.surfaceHover, marginBottom: space(4) },
        ]}
      >
        <Icon size={glyphSize} color={colors.textMuted} strokeWidth={1.75} />
      </View>
      <Text style={[styles.title, { fontSize: font(Type.subtitle.size), color: colors.text, marginBottom: message ? space(2) : 0 }]}>
        {title}
      </Text>
      {message ? (
        <Text style={[styles.message, { fontSize: font(Type.body.size), color: colors.textMuted, marginBottom: onAction ? space(5) : 0 }]}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} variant="tertiary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
});
