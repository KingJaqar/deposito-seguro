import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { AnimatedCard } from '../../../components/AnimatedCard';
import AnimatedTabBar from '../../../components/AnimatedTabBar';
import { VaultHeader } from '../../../components/VaultHeader';
import { useThemeColors } from '../../../contexts/ThemeContext';
import { useSettingsStore } from '../../../store/settingsStore';
import { EncryptionKeyMetadata } from '../../../types';

export default function EncryptionKeysScreen() {
  const colors = useThemeColors();
  const { encryptionKeys, createEncryptionKey, encryptionKeyExists, deleteEncryptionKey } = useSettingsStore();
  const [keyName, setKeyName] = useState('');
  const [keyDescription, setKeyDescription] = useState('');
  const [customKey, setCustomKey] = useState('');

  const handleCreateKey = async () => {
    if (encryptionKeys.length >= 20) {
      Alert.alert('Encryption Key Limit', 'You can only create up to 20 encryption keys.');
      return;
    }

    if (!keyName.trim()) {
      Alert.alert('Key Name Required', 'Give this encryption key a recognizable name.');
      return;
    }

    if (encryptionKeyExists(keyName)) {
      Alert.alert('Key Name Already Used', 'Encryption key names must be unique.');
      return;
    }

    const key = await createEncryptionKey(keyName, customKey, keyDescription);
    if (!key) {
      Alert.alert('Encryption Key Limit', 'You can only create up to 20 encryption keys.');
      return;
    }

    setKeyName('');
    setKeyDescription('');
    setCustomKey('');
    Alert.alert('Encryption Key Created', `${key.name} is ready to assign.`);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SafeAreaView>
        <VaultHeader title="Encryption Keys" showBack />
      </SafeAreaView>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.description, { color: colors.textMuted }]}>
          Create up to 20 keys. Generated keys are high-entropy; custom key phrases are hashed before storage.
        </Text>

        <AnimatedCard style={styles.createCard}>
          <Text style={[styles.label, { color: colors.text }]}>Key Name</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}30` }]}
            value={keyName}
            onChangeText={setKeyName}
            placeholder="e.g. Personal Vault Key"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[styles.label, { color: colors.text, marginTop: 14 }]}>Description Optional</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}30` }]}
            value={keyDescription}
            onChangeText={setKeyDescription}
            placeholder="What is this key used for?"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <Text style={[styles.label, { color: colors.text, marginTop: 14 }]}>Custom Key Phrase Optional</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: `${colors.border}30` }]}
            value={customKey}
            onChangeText={setCustomKey}
            placeholder="Leave blank to generate a secure key"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: encryptionKeys.length >= 20 ? colors.textMuted : colors.primary }]}
            onPress={handleCreateKey}
            disabled={encryptionKeys.length >= 20}
          >
            <Text style={styles.createBtnText}>{encryptionKeys.length >= 20 ? 'Limit Reached' : 'Create Encryption Key'}</Text>
          </TouchableOpacity>
        </AnimatedCard>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Registered Keys ({encryptionKeys.length}/20)
        </Text>

        {encryptionKeys.length === 0 ? (
          <View style={[styles.empty, { borderColor: colors.border }]}>
            <Text style={{ fontSize: 42, marginBottom: 10 }}>🔑</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No keys yet</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Create a key to assign it to folders or files.</Text>
          </View>
        ) : (
          encryptionKeys.map((key: EncryptionKeyMetadata) => (
            <View key={key.id}>
              <TouchableOpacity
                style={[styles.keyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => Alert.alert(key.name, `Fingerprint: ${key.fingerprint}`)}
              >
                <View style={styles.keyHeader}>
                  <View>
                    <Text style={[styles.keyName, { color: colors.text }]} numberOfLines={1}>{key.name}</Text>
                    <Text style={[styles.keyMeta, { color: colors.textMuted }]}>Fingerprint {key.fingerprint}</Text>
                    {key.description ? <Text style={[styles.keyMeta, { color: colors.textMuted }]} numberOfLines={1}>{key.description}</Text> : null}
                  </View>
                  <Text style={{ color: colors.primary, fontSize: 22 }}>ⓘ</Text>
                </View>
                <TouchableOpacity
                  style={[styles.deleteBtn, { borderColor: colors.error }]}
                  onPress={() => Alert.alert(
                    'Delete Encryption Key',
                    'Delete this key from the key screen? Keys assigned to files or folders cannot be deleted.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: async () => {
                        const result = await deleteEncryptionKey(key.id);
                        if (result === 'in-use') {
                          Alert.alert('Key In Use', 'This key is assigned to at least one file or folder. Reassign or remove encryption before deleting it.');
                        } else if (result === 'not-found') {
                          Alert.alert('Key Not Found', 'This encryption key no longer exists.');
                        }
                      } },
                    ]
                  )}
                >
                  <Text style={{ color: colors.error, fontSize: 12, fontWeight: '700' }}>Delete Key</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
      <AnimatedTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 110 },
  description: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  createCard: { padding: 16 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginTop: 6, fontSize: 14 },
  createBtn: { marginTop: 16, paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  createBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginTop: 24, marginBottom: 12 },
  empty: { borderWidth: 1, borderRadius: 18, paddingVertical: 34, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 6, paddingHorizontal: 24 },
  keyCard: { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 10 },
  keyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  keyName: { fontSize: 15, fontWeight: '800' },
  keyMeta: { fontSize: 12, marginTop: 4 },
  deleteBtn: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 14 },
});
