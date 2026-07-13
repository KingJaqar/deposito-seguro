import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { validatePin, PIN_MIN_LENGTH } from '../../utils/accessKeyValidation';
import { StyledButton } from '../../components/StyledButton';

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

  const inputStyle = {
    color: colors.text,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 52,
    borderRadius: 12,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    fontSize: font(16),
    marginBottom: space(5),
    borderWidth: 1,
  };

  const labelStyle = {
    color: colors.text,
    fontSize: font(12),
    marginBottom: space(1),
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.container, { paddingHorizontal: space(6), paddingVertical: space(6), paddingBottom: space(10) }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.header, { color: colors.text, fontSize: font(24), marginBottom: space(2) }]}>
            Initialize Master Key
          </Text>
          <Text style={[styles.desc, { color: colors.textMuted, fontSize: font(14), marginBottom: space(7), lineHeight: 20 }]}>
            Establish your localized cryptographic master key configuration below. This cannot be reset if lost.
          </Text>

          <View style={[styles.form, { width: '100%', maxWidth: isTablet ? 480 : '100%' }]}>
            <Text style={[styles.label, labelStyle]}>Enter PIN ({PIN_MIN_LENGTH}+ digits)</Text>
            <TextInput
              style={inputStyle}
              placeholder="Enter numeric PIN"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              maxLength={20}
              autoComplete="off"
              editable={!isInitializing}
            />

            <Text style={[styles.label, labelStyle]}>Confirm PIN</Text>
            <TextInput
              style={inputStyle}
              placeholder="Repeat PIN"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={confirmPin}
              onChangeText={setConfirmPin}
              keyboardType="number-pad"
              maxLength={20}
              autoComplete="off"
              editable={!isInitializing}
            />

            <Text style={[styles.label, labelStyle]}>Password Security Hint</Text>
            <TextInput
              style={inputStyle}
              placeholder="Cryptographic hint reference"
              placeholderTextColor={colors.textMuted}
              value={hint}
              onChangeText={setHint}
              autoComplete="off"
              editable={!isInitializing}
            />

            <View style={{ marginTop: space(5) }}>
              <StyledButton
                title={isInitializing ? 'Initializing...' : 'Lock & Build Vault Container'}
                onPress={handleInitialization}
                style={{ width: '100%' }}
                disabled={isInitializing}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center' },
  header: { fontWeight: '800', textAlign: 'center' },
  desc: { fontWeight: '400', textAlign: 'center' },
  form: {},
  label: { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 1 },
});
