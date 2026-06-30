import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useSettingsStore } from '../store/settingsStore';
import { AccessKeyMetadata } from '../types';

interface AccessKeyPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectPassword: (passwordId: string) => void;
}

export function AccessKeyPicker({ visible, onClose, onSelectPassword }: AccessKeyPickerProps) {
  const { colors, space, font, radius, isTablet } = useTheme();
  const accessKeys = useSettingsStore((state: { accessKeys: AccessKeyMetadata[] }) => state.accessKeys);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        onPress={onClose}
        activeOpacity={0.8}
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface },
            isTablet && styles.sheetTablet,
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={[styles.handle, { backgroundColor: 'rgba(255,255,255,0.18)' }]} />
          <Text style={[styles.title, { color: colors.text, marginBottom: space(3) }]}>Assign Access Key</Text>

          {accessKeys.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ color: colors.text, fontSize: 34, marginBottom: 8 }}>🔒</Text>
              <Text style={[styles.emptyText, { color: colors.text }]}>No access keys yet</Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                Create an access key from Settings, then assign it here.
              </Text>
            </View>
          ) : (
            <ScrollView style={[styles.scroll, { maxHeight: isTablet ? 480 : 360 }]} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space(4) }}>
              {accessKeys.map((ak: AccessKeyMetadata) => (
                <AccessKeyItem
                  key={ak.id}
                  accessKeyItem={ak}
                  colors={colors}
                  font={font}
                  onPress={() => onSelectPassword(ak.id)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function AccessKeyItem({
  accessKeyItem,
  colors,
  font,
  onPress,
}: {
  accessKeyItem: AccessKeyMetadata;
  colors: any;
  font: (size: number) => number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.password,
        { borderBottomColor: colors.border },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Select access key: ${accessKeyItem.label}`}
    >
      <View style={styles.passwordInner}>
        <View style={{ flex: 1, flexShrink: 1 }}>
          <Text style={[styles.passwordName, { color: colors.text }]} numberOfLines={1}>
            {accessKeyItem.label}
          </Text>
          <Text style={[styles.passwordMeta, { color: colors.textMuted }]} numberOfLines={1}>
            Fingerprint {accessKeyItem.fingerprint}
          </Text>
          {accessKeyItem.description && (
            <Text style={[styles.passwordMeta, { color: colors.textMuted }]} numberOfLines={1}>
              {accessKeyItem.description}
            </Text>
          )}
        </View>
        <Text style={{ color: colors.primary, fontSize: 22, flexShrink: 0 }}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
  },
  sheetTablet: {
    maxHeight: '65%',
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  scroll: {
    maxHeight: 360,
  },
  password: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passwordInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginHorizontal: -18,
  },
  passwordName: {
    fontSize: 15,
    fontWeight: '700',
  },
  passwordMeta: {
    fontSize: 12,
    marginTop: 3,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
