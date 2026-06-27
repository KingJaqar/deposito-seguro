import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../contexts/ThemeContext';
import { useSettingsStore } from '../store/settingsStore';
import { FilePasswordMetadata } from '../types';

interface FilePasswordPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectPassword: (passwordId: string) => void;
}

export function FilePasswordPicker({ visible, onClose, onSelectPassword }: FilePasswordPickerProps) {
  const colors = useThemeColors();
  const filePasswords = useSettingsStore((state: { filePasswords: FilePasswordMetadata[] }) => state.filePasswords);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        onPress={onClose}
        activeOpacity={0.8}
      >
        <View
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <Text style={[styles.title, { color: colors.text }]}>Assign File Password</Text>

          {filePasswords.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ color: colors.text, fontSize: 34, marginBottom: 8 }}>🔒</Text>
              <Text style={[styles.emptyText, { color: colors.text }]}>No file passwords yet</Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>Create a password from Settings, then assign it here.</Text>
            </View>
          ) : (
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              {filePasswords.map((fp: FilePasswordMetadata) => (
                <PasswordItem
                  key={fp.id}
                  passwordItem={fp}
                  colors={colors}
                  onPress={() => onSelectPassword(fp.id)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function PasswordItem({
  passwordItem,
  colors,
  onPress,
}: {
  passwordItem: FilePasswordMetadata;
  colors: any;
  onPress: () => void;
}) {
  return (
    <View>
      <TouchableOpacity
        style={[styles.passwordRow, { borderColor: colors.border }]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.passwordContent}>
          <View>
            <Text style={[styles.passwordName, { color: colors.text }]} numberOfLines={1}>
              {passwordItem.label}
            </Text>
            <Text style={[styles.passwordMeta, { color: colors.textMuted }]}>
              Fingerprint {passwordItem.fingerprint}
            </Text>
            {passwordItem.description && (
              <Text style={[styles.passwordMeta, { color: colors.textMuted }]} numberOfLines={1}>
                {passwordItem.description}
              </Text>
            )}
          </View>
          <Text style={{ color: colors.primary, fontSize: 22 }}>›</Text>
        </View>
      </TouchableOpacity>
    </View>
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
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 14,
  },
  scroll: {
    maxHeight: 360,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    marginHorizontal: -18,
    paddingHorizontal: 18,
  },
  passwordContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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