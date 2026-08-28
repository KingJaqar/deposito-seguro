// src/components/primitives/SwitchRow.tsx
// label+description+icon+switch row, generalized from settings/index.tsx's
// current local SettingCard (§4).
import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';

export interface SwitchRowProps {
  label: string;
  description?: string;
  icon?: LucideIcon;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function SwitchRow({ label, description, icon: Icon, value, onValueChange, disabled = false }: SwitchRowProps) {
  const { colors, space, font, iconSize, touchTarget } = useTheme();
  const wrapSize = iconSize(36);

  return (
    <View style={[styles.row, { paddingVertical: space(3), minHeight: touchTarget() }]}>
      {Icon && (
        <View style={[styles.iconWrap, { width: wrapSize, height: wrapSize, borderRadius: iconSize(10), backgroundColor: colors.surfaceHover, marginRight: space(3) }]}>
          <Icon size={iconSize(18)} color={colors.primary} strokeWidth={2} />
        </View>
      )}
      <View style={styles.textCol}>
        <Text style={[styles.label, { fontSize: font(Type.body.size), color: colors.text }]}>{label}</Text>
        {description ? (
          <Text style={[styles.description, { fontSize: font(Type.caption.size), color: colors.textMuted, marginTop: 2 }]}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.onPrimary}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityHint={description}
        accessibilityState={{ checked: value, disabled }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
  },
  label: {
    fontWeight: '600',
  },
  description: {
    fontWeight: '500',
  },
});
