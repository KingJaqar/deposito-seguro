import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { validatePin, PIN_MIN_LENGTH } from '../../utils/accessKeyValidation';

export default function RegisterScreen() {
  const colors = useThemeColors();
  const { initializeVault } = useAuthStore();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [hint, setHint] = useState('');

  const handleInitialization = async () => {
    if (!pin || !confirmPin) {
      Alert.alert('Missing Parameters', 'Please complete all required fields.');
      return;
    }

    const pinValidation = validatePin(pin);
    if (!pinValidation.valid) {
      Alert.alert('Invalid PIN', pinValidation.message);
      return;
    }

    if (pin !== confirmPin) {
      Alert.alert('Mismatch', 'PINs do not match.');
      return;
    }

    if (!hint.trim()) {
      Alert.alert('Hint Required', 'Please provide a validation hint for emergency decryption recovery.');
      return;
    }

    const completed = await initializeVault(pin, hint.trim());
    if (completed) {
      router.replace('/(main)/dashboard');
    } else {
      Alert.alert('Error', 'Failed to securely instantiate storage hashes.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={[styles.container]}>
        <Text style={[styles.header, { color: colors.text }]}>Initialize Master Key</Text>
        <Text style={[styles.desc, { color: colors.textMuted }]}>
          Establish your localized cryptographic master key configuration below. This cannot be reset if lost.
        </Text>

        <View style={styles.form}>
          <Text style={[styles.label, { color: colors.text }]}>Enter PIN ({PIN_MIN_LENGTH}+ digits)</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="Enter numeric PIN"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            maxLength={10}
          />

          <Text style={[styles.label, { color: colors.text }]}>Confirm PIN</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="Repeat PIN"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={confirmPin}
            onChangeText={setConfirmPin}
            keyboardType="number-pad"
            maxLength={10}
          />

          <Text style={[styles.label, { color: colors.text }]}>Password Security Hint</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="Cryptographic hint reference"
            placeholderTextColor={colors.textMuted}
            value={hint}
            onChangeText={setHint}
          />

          <View style={{ marginTop: 20 }}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={handleInitialization}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Lock & Build Vault Container</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  header: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  desc: { fontSize: 14, marginBottom: 32, lineHeight: 20 },
  form: { width: '100%' },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 },
  input: { height: 50, borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, marginBottom: 20, fontSize: 16 },
  button: { height: 52, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
