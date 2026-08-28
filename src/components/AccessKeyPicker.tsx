// src/components/AccessKeyPicker.tsx
// Rebuilt on the Sheet primitive per §5 (scrollable list picker → Sheet, not
// Dialog). The accessKeys store read and the onSelectPassword(ak.id) contract
// are unchanged; prop interface preserved for every caller.
import { KeyRound, ChevronRight } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Type } from '../constants/typography';
import { EmptyState } from './primitives/EmptyState';
import { Sheet } from './primitives/Sheet';
import { useSettingsStore } from '../store/settingsStore';
import { AccessKeyMetadata } from '../types';

interface AccessKeyPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectPassword: (passwordId: string) => void;
}

export function AccessKeyPicker({ visible, onClose, onSelectPassword }: AccessKeyPickerProps) {
  const { colors, space, font, isTablet, iconSize, touchTarget } = useTheme();
  const iconWrapSize = iconSize(36);
  const accessKeys = useSettingsStore((state: { accessKeys: AccessKeyMetadata[] }) => state.accessKeys);

  if (!visible) return null;

  return (
    <Sheet visible={visible} onClose={onClose} title="Assign Access Key">
      {accessKeys.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No access keys yet"
          message="Create an access key from Settings, then assign it here."
        />
      ) : (
        <ScrollView
          style={{ maxHeight: isTablet ? 480 : 360 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space(4) }}
        >
          {accessKeys.map((ak: AccessKeyMetadata) => (
            <Pressable
              key={ak.id}
              onPress={() => onSelectPassword(ak.id)}
              accessibilityRole="button"
              accessibilityLabel={`Select access key: ${ak.label}`}
              android_ripple={{ color: `${colors.text}0F` }}
              style={({ pressed }) => [
                styles.row,
                {
                  borderBottomColor: colors.borderLight,
                  paddingHorizontal: space(5),
                  paddingVertical: space(4),
                  minHeight: touchTarget(),
                  backgroundColor: pressed ? colors.surfaceHover : 'transparent',
                },
              ]}
            >
              <View style={[styles.iconWrap, { width: iconWrapSize, height: iconWrapSize, borderRadius: iconSize(10), backgroundColor: `${colors.primary}1F`, marginRight: space(3) }]}>
                <KeyRound size={iconSize(18)} color={colors.primary} strokeWidth={2} />
              </View>
              <View style={styles.textCol}>
                <Text style={[styles.name, { color: colors.text, fontSize: font(Type.body.size) }]} numberOfLines={1}>
                  {ak.label}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted, fontSize: font(Type.caption.size) }]} numberOfLines={1}>
                  Fingerprint {ak.fingerprint}
                </Text>
                {ak.description ? (
                  <Text style={[styles.meta, { color: colors.textMuted, fontSize: font(Type.caption.size) }]} numberOfLines={1}>
                    {ak.description}
                  </Text>
                ) : null}
              </View>
              <ChevronRight size={iconSize(18)} color={colors.textMuted} strokeWidth={2} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textCol: { flex: 1, flexShrink: 1 },
  name: { fontWeight: '700' },
  meta: { fontWeight: '500', marginTop: 2 },
});
