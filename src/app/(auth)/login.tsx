import { router } from 'expo-router';
import { useState, useRef } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';

export default function LoginScreen() {
  const colors = useThemeColors();
  const { authenticate, securityHint, isAuthenticated } = useAuthStore();
  const { biometricsEnabled, disguiseMode } = useSettingsStore();
  const [inputBuffer, setInputBuffer] = useState('');
  const lastResultRef = useRef<string | null>(null);

  const handleStandardAuth = async () => {
    const success = await authenticate(inputBuffer);
    if (success) {
      router.replace('/(main)/dashboard');
    } else {
      Alert.alert('Access Denied', 'Invalid signature key payload.');
      setInputBuffer('');
    }
  };

  const evaluateExpression = (expr: string): string => {
    try {
      const sanitized = expr.replace(/[^0-9+\-*/.()%\s]/g, '');
      const result = Function(`'use strict'; return (${sanitized})`)();
      return String(result);
    } catch {
      return '';
    }
  };

  const handleCalculatorPress = (token: string) => {
    if (token === 'C') {
      setInputBuffer('');
      lastResultRef.current = null;
    } else if (token === '=') {
      if (inputBuffer && !/^[\d+\-*/.()%\s]+$/.test(inputBuffer)) {
        handleStandardAuth();
      } else {
        const result = evaluateExpression(inputBuffer);
        if (result) {
          setInputBuffer(result);
          lastResultRef.current = result;
        }
      }
    } else if (token === '+' || token === '-' || token === '*' || token === '/') {
      if (inputBuffer && !inputBuffer.endsWith('+') && !inputBuffer.endsWith('-') && 
          !inputBuffer.endsWith('*') && !inputBuffer.endsWith('/')) {
        setInputBuffer(prev => prev + ` ${token} `);
      }
    } else {
      setInputBuffer(prev => prev + token);
    }
  };

  const handlePercentage = () => {
    if (inputBuffer) {
      const parts = inputBuffer.split(/[\+\-\*\/]/);
      const lastNum = parts[parts.length - 1];
      if (lastNum && !isNaN(Number(lastNum))) {
        setInputBuffer(prev => prev.replace(lastNum, (Number(lastNum) / 100).toString()));
      }
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
          <Text style={styles.calcHistoryText} numberOfLines={1}>
            {lastResultRef.current ? 'Ans' : ''}
          </Text>
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
                } else if (token === 'C') {
                  btnBg = '#A5A5A5';
                  txtColor = '#000';
                } else if (token === '(' || token === ')' || token === '%') {
                  btnBg = '#A5A5A5';
                  txtColor = '#000';
                }
                
                return (
                  <TouchableOpacity
                    key={token}
                    style={[styles.calcButton, { backgroundColor: btnBg }]}
                    onPress={() => {
                      if (token === '%') {
                        handlePercentage();
                      } else {
                        handleCalculatorPress(token);
                      }
                    }}
                  >
                    <Text style={[styles.calcButtonText, { color: txtColor }]}>
                      {token === '=' ? '=' : token}
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
        placeholder="Enter Cryptographic Key"
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        value={inputBuffer}
        onChangeText={setInputBuffer}
      />
      <TouchableOpacity 
        style={[styles.stdSubmit, { backgroundColor: colors.primary }]} 
        onPress={handleStandardAuth}
      >
        <Text style={styles.stdSubmitText}>Unlock Pipeline</Text>
      </TouchableOpacity>

      {securityHint ? (
        <Text style={[styles.hintText, { color: colors.textMuted }]}>Hint: {securityHint}</Text>
      ) : null}

      {biometricsEnabled && false && (
        <TouchableOpacity style={styles.bioTrigger} onPress={() => {}}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry Biometric Challenge</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  calcContainer: { flex: 1, justifyContent: 'flex-end', paddingBottom: 20 },
  calcScreen: { paddingHorizontal: 24, paddingVertical: 32, alignItems: 'flex-end' },
  calcHistoryText: { color: '#8E8E93', fontSize: 20, fontWeight: '300', marginBottom: 8 },
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
  hintText: { textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
  bioTrigger: { textAlign: 'center', marginTop: 32, alignItems: 'center' }
});