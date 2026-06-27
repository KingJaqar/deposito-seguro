import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { validatePin, PIN_MIN_LENGTH } from '../../utils/accessKeyValidation';

export default function LoginScreen() {
  const colors = useThemeColors();
  const { authenticate, securityHint } = useAuthStore();
  const { disguiseMode } = useSettingsStore();
  const [inputBuffer, setInputBuffer] = useState('');

  const handleStandardAuth = async () => {
    const pinValidation = validatePin(inputBuffer);
    if (!pinValidation.valid) {
      Alert.alert('Invalid PIN', pinValidation.message);
      return;
    }

    const success = await authenticate(inputBuffer);
    if (success) {
      router.replace('/(main)/dashboard');
    } else {
      Alert.alert('Access Denied', 'Invalid signature key payload.');
      setInputBuffer('');
    }
  };

  const evaluateExpression = (expr: string): string | null => {
    if (!/^[\d+\-*/.()%\s]+$/.test(expr)) {
      return null;
    }
    try {
      const sanitized = expr.replace(/[^0-9+\-*/.()%\s]/g, '');
      const result = Function(`'use strict'; return (${sanitized})`)();
      return String(result);
    } catch {
      return null;
    }
  };

  const handleCalculatorPress = (token: string) => {
    if (token === 'C') {
      setInputBuffer('');
    } else if (token === '=') {
      if (inputBuffer) {
        const result = evaluateExpression(inputBuffer);
        if (result === null) {
          handleStandardAuth();
        } else {
          setInputBuffer(result);
        }
      }
    } else if (token === '+/-') {
      if (inputBuffer && inputBuffer[0] !== '-') {
        setInputBuffer('-' + inputBuffer);
      } else if (inputBuffer && inputBuffer[0] === '-') {
        setInputBuffer(inputBuffer.substring(1));
      }
    } else if (token === '%') {
      const num = parseFloat(inputBuffer);
      if (!isNaN(num)) {
        setInputBuffer((num / 100).toString());
      }
    } else if (token === '+' || token === '-' || token === '*' || token === '/') {
      if (inputBuffer && !inputBuffer.endsWith(' ') && !/[+\-*/]$/.test(inputBuffer.trim())) {
        setInputBuffer(prev => prev + ' ' + token + ' ');
      }
    } else {
      setInputBuffer(prev => prev + token);
    }
  };

  const isCalc = disguiseMode === 'calculator';

  if (isCalc) {
    const gridTokens = [
      ['C', '()', '%', '/'],
      ['7', '8', '9', '*'],
      ['4', '5', '6', '-'],
      ['1', '2', '3', '+'],
      ['+/-', '0', '.', '=']
    ];

    return (
      <View style={[styles.calcContainer, { backgroundColor: '#17171C' }]}>
        <View style={styles.calcScreen}>
          <Text style={styles.calcInputText} numberOfLines={1}>
            {inputBuffer || '0'}
          </Text>
        </View>
        <View style={styles.calcGrid}>
          {gridTokens.map((row, rIdx) => (
            <View key={rIdx} style={styles.calcRow}>
              {row.map((token) => {
                let btnBg = '#3A3A3C';
                let txtColor = '#FFF';

                if (token === '=') {
                  btnBg = '#FF9F0A';
                } else if (token === 'C' || token === '(' || token === ')' || token === '%') {
                  btnBg = '#A5A5A5';
                  txtColor = '#000';
                }

                return (
                  <TouchableOpacity
                    key={token}
                    style={[styles.calcButton, { backgroundColor: btnBg }]}
                    onPress={() => handleCalculatorPress(token)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.calcButtonText, { color: txtColor }]}>
                      {token}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.stdContainer, { backgroundColor: colors.background }]}>
      <Text style={[styles.stdTitle, { color: colors.text }]}>Vault Authentication Required</Text>
      <TextInput
        style={[styles.stdInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        placeholder={`Enter ${PIN_MIN_LENGTH}+ digit PIN`}
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        value={inputBuffer}
        onChangeText={setInputBuffer}
        keyboardType="number-pad"
        maxLength={10}
      />
      <TouchableOpacity
        style={[styles.stdSubmit, { backgroundColor: colors.primary }]}
        onPress={handleStandardAuth}
        activeOpacity={0.8}
      >
        <Text style={styles.stdSubmitText}>Unlock Pipeline</Text>
      </TouchableOpacity>

      {securityHint ? (
        <Text style={[styles.hintText, { color: colors.textMuted }]}>Hint: {securityHint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  calcContainer: { flex: 1, justifyContent: 'flex-end', paddingBottom: 20 },
  calcScreen: { paddingHorizontal: 24, paddingVertical: 32, alignItems: 'flex-end' },
  calcInputText: { color: '#FFF', fontSize: 64, fontWeight: '300' },
  calcGrid: { paddingHorizontal: 12 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  calcButton: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  calcButtonText: { fontSize: 30, fontWeight: '500' },
  stdContainer: { flex: 1, justifyContent: 'center', padding: 24 },
  stdTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 24 },
  stdInput: { height: 52, borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, fontSize: 16, marginBottom: 16 },
  stdSubmit: { height: 52, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  stdSubmitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  hintText: { textAlign: 'center', marginTop: 20, fontStyle: 'italic' }
});
