// File: src/components/EncryptionKeyPicker.tsx
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useThemeColors } from '../contexts/ThemeContext';
import { useSettingsStore } from '../store/settingsStore';
import { EncryptionKeyMetadata } from '../types';

interface EncryptionKeyPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectKey: (keyId: string) => void;
}

export function EncryptionKeyPicker({ visible, onClose, onSelectKey }: EncryptionKeyPickerProps) {
  const colors = useThemeColors();
  const encryptionKeys = useSettingsStore((state: { encryptionKeys: EncryptionKeyMetadata[] }) => state.encryptionKeys);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />
          <Text style={[styles.title, { color: colors.text }]}>Assign Encryption Key</Text>

          {encryptionKeys.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ color: colors.text, fontSize: 34, marginBottom: 8 }}>🔑</Text>
              <Text style={[styles.emptyText, { color: colors.text }]}>No encryption keys yet</Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>Create a key from Settings, then assign it here.</Text>
            </View>
          ) : (
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              {encryptionKeys.map((key: EncryptionKeyMetadata) => (
                <Animated.View key={key.id} entering={FadeInDown.duration(180)}>
                  <TouchableOpacity
                    style={[styles.keyRow, { borderColor: colors.border }]}
                    onPress={() => onSelectKey(key.id)}
                  >
                    <View>
                      <Text style={[styles.keyName, { color: colors.text }]} numberOfLines={1}>{key.name}</Text>
                      <Text style={[styles.keyMeta, { color: colors.textMuted }]}>Fingerprint {key.fingerprint}</Text>
                    </View>
                    <Text style={{ color: colors.primary, fontSize: 22 }}>›</Text>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </ScrollView>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: { maxHeight: '78%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  scroll: { maxHeight: 360 },
  keyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1 },
  keyName: { fontSize: 15, fontWeight: '700' },
  keyMeta: { fontSize: 12, marginTop: 3 },
  empty: { alignItems: 'center', paddingVertical: 28 },
  emptyText: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  emptySubtext: { fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
});
