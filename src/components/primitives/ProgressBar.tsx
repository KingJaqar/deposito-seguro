// src/components/primitives/ProgressBar.tsx
// Consolidates 3 separate progress-bar implementations (dashboard storage
// card, backup-progress modal, settings/storage.tsx's local one). Fixes a
// real bug: the old storage.tsx track was hardcoded rgba(255,255,255,0.08),
// invisible in light theme — this sources its track color from
// colors.borderLight instead (§3/§4). Numeric label always shown alongside
// the bar, never bar-only (§6).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';

export interface ProgressBarProps {
  progress: number; // 0-1
  color?: string;
  label?: string;
  showPercentage?: boolean;
  height?: number;
}

export function ProgressBar({ progress, color, label, showPercentage = true, height }: ProgressBarProps) {
  const { colors, space, font, radius, iconSize } = useTheme();
  const barHeight = iconSize(height ?? 8);
  const pct = Math.max(0, Math.min(1, progress));
  const fillColor = color ?? colors.primary;

  return (
    <View>
      {(label || showPercentage) && (
        <View style={[styles.labelRow, { marginBottom: space(2) }]}>
          {label ? (
            <Text style={[styles.label, { fontSize: font(Type.caption.size), color: colors.textSecondary }]} numberOfLines={1}>
              {label}
            </Text>
          ) : <View />}
          {showPercentage && (
            <Text style={[styles.pct, { fontSize: font(Type.caption.size), color: colors.textMuted }]}>
              {Math.round(pct * 100)}%
            </Text>
          )}
        </View>
      )}
      <View
        style={[styles.track, { height: barHeight, borderRadius: radius(1), backgroundColor: colors.borderLight }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      >
        <View style={[styles.fill, { width: `${pct * 100}%`, height: barHeight, borderRadius: radius(1), backgroundColor: fillColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontWeight: '600',
    flexShrink: 1,
  },
  pct: {
    fontWeight: '600',
  },
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {},
});
