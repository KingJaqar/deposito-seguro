// src/app/(auth)/register.tsx
// Rebuilt per §3/§7 Phase 4. Business logic unchanged: handleInitialization's
// validation order (missing fields → PIN validity → match → hint required)
// and its initializeVault() call are byte-identical; async/store failures
// keep Alert.alert per §3 ("that's a functional boundary, not styling").
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/primitives/Button';
import { TextField } from '../../components/primitives/TextField';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';
import { useAuthStore } from '../../store/authStore';
import { validatePin, PIN_MIN_LENGTH } from '../../utils/accessKeyValidation';

export default function RegisterScreen() {
  const { colors, space, font, isTablet } = useTheme();
  const { initializeVault } = useAuthStore();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [hint, setHint] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);

  const handleInitialization = async () => {
    if (isInitializing) return;

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

    setIsInitializing(true);
    try {
      const completed = await initializeVault(pin, hint.trim());
      if (completed) {
        router.replace('/(main)/dashboard');
      } else {
        Alert.alert('Error', 'Failed to securely instantiate storage hashes.');
      }
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingHorizontal: space(6), paddingVertical: space(6), paddingBottom: space(10) }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.header, { color: colors.text, fontSize: font(Type.title.size), marginBottom: space(2) }]}>
            Initialize Master Key
          </Text>
          <Text style={[styles.desc, { color: colors.textMuted, fontSize: font(Type.body.size), marginBottom: space(7), lineHeight: 20 }]}>
            Establish your localized cryptographic master key configuration below. This cannot be reset if lost.
          </Text>

          <View style={{ width: '100%', maxWidth: isTablet ? 480 : '100%' }}>
            <TextField
              label={`Enter PIN (${PIN_MIN_LENGTH}+ digits)`}
              placeholder="Enter numeric PIN"
              secureToggle
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              maxLength={20}
              autoComplete="off"
              editable={!isInitializing}
              accessibilityLabel="PIN"
            />
            <TextField
              label="Confirm PIN"
              placeholder="Repeat PIN"
              secureToggle
              value={confirmPin}
              onChangeText={setConfirmPin}
              keyboardType="number-pad"
              maxLength={20}
              autoComplete="off"
              editable={!isInitializing}
              accessibilityLabel="Confirm PIN"
            />
            <TextField
              label="Password Security Hint"
              placeholder="Cryptographic hint reference"
              value={hint}
              onChangeText={setHint}
              autoComplete="off"
              editable={!isInitializing}
              accessibilityLabel="Security hint"
            />

            <Button
              title={isInitializing ? 'Initializing…' : 'Setup Secure Vault Space'}
              onPress={handleInitialization}
              loading={isInitializing}
              size="lg"
              style={{ width: '100%', marginTop: space(3) }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center' },
  header: { fontWeight: '800', textAlign: 'center' },
  desc: { fontWeight: '400', textAlign: 'center' },
});
