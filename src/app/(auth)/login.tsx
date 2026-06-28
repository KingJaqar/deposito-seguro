import { router } from 'expo-router';
import { Delete, Lock } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { PIN_MIN_LENGTH, validatePin } from '../../utils/accessKeyValidation';

const CALC_BG = '#000000';
const CALC_NUM_BG = '#2D2D2D';
const CALC_FUNC_BG = '#3A3A3C';
const CALC_OP_BG = '#FFFFFF';
const CALC_SCI_BG = '#2D2D2D';
const CALC_TEXT = '#FFFFFF';
const CALC_OP_TEXT = '#000000';

const CALC_THEME_COLORS: Record<string, { equalBg: string }> = {
  default: { equalBg: '#FFFFFF' },
  white: { equalBg: '#FFFFFF' },
  orange: { equalBg: '#FF9F0A' },
  red: { equalBg: '#FF453A' },
};

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const { height } = useWindowDimensions();
  const { buttonHeight, sciButtonHeight } = useMemo(() => {
    const ROW_MARGIN = 8;
    const BOTTOM_PADDING = 20;
    const SCI_RATIO = 0.65;
    const MAX_BUTTON_AREA_RATIO = 0.55;
    const totalRows = 6;
    const fixedVerticalSpace = totalRows * ROW_MARGIN + BOTTOM_PADDING;
    const maxButtonAreaHeight = height * MAX_BUTTON_AREA_RATIO;
    const heightBasedMain = (maxButtonAreaHeight - fixedVerticalSpace - (56 * SCI_RATIO)) / 5;
    const mainHeight = Math.max(36, Math.min(heightBasedMain, 64));
    const sciHeight = mainHeight * SCI_RATIO;
    return { buttonHeight: mainHeight, sciButtonHeight: sciHeight };
  }, [height]);

  const { authenticate, securityHint } = useAuthStore();
  const { disguiseMode, disguiseIconTheme } = useSettingsStore();
  const [inputBuffer, setInputBuffer] = useState('');
  const [pin, setPin] = useState('');
  const [calcHistory, setCalcHistory] = useState('');
  const [calcExpression, setCalcExpression] = useState('');
  const [calcMainDisplay, setCalcMainDisplay] = useState('0');
  const [isSecondMode, setIsSecondMode] = useState(false);
  const [showTransitionSplash, setShowTransitionSplash] = useState(false);
  const pinInputRef = useRef<TextInput>(null);
  const isCalc = disguiseMode === 'calculator';
  const calcTheme = CALC_THEME_COLORS[disguiseIconTheme] || CALC_THEME_COLORS.default;

  const stdTheme = {
    bg: isDark ? '#000000' : colors.background,
    text: isDark ? '#FFFFFF' : colors.text,
    muted: isDark ? '#8E8E93' : colors.textMuted,
    surface: isDark ? '#1C1C1E' : colors.surface,
    keypad: isDark ? '#2D2D2D' : colors.surfaceElevated,
    keyText: isDark ? '#FFFFFF' : colors.text,
    keySub: isDark ? 'rgba(255,255,255,0.4)' : colors.textMuted,
    unlockBg: isDark ? '#F5F0E8' : colors.primary,
    unlockText: isDark ? '#000000' : '#FFFFFF',
    inputPlaceholder: isDark ? 'rgba(255,255,255,0.3)' : colors.textMuted,
  };

  const handleStandardAuth = async (rawInput?: string, silent = false) => {
    const pinValue = (rawInput ?? (isCalc ? inputBuffer : pin)).replace(/[^0-9]/g, '');
    const pinValidation = validatePin(pinValue);
    if (!pinValidation.valid) {
      if (!silent) Alert.alert('Invalid PIN', pinValidation.message);
      if (isCalc) {
        setInputBuffer('');
        setCalcExpression('');
        setCalcMainDisplay('0');
        setCalcHistory('');
        setIsSecondMode(false);
      } else {
        setPin('');
      }
      return;
    }

    const success = await authenticate(pinValue);
    if (success) {
      if (isCalc) {
        setShowTransitionSplash(true);
        setTimeout(async () => {
          setShowTransitionSplash(false);
          router.replace('/(main)/dashboard');
        }, 800);
      } else {
        router.replace('/(main)/dashboard');
      }
    } else {
      if (!silent) Alert.alert('Access Denied', 'Invalid signature key payload.');
      if (isCalc) {
        setInputBuffer('');
        setCalcExpression('');
        setCalcMainDisplay('0');
        setCalcHistory('');
        setIsSecondMode(false);
      } else {
        setPin('');
      }
    }
  };

  const handlePinPress = (digit: string) => {
    setPin(prev => {
      if (prev.length >= 20) return prev;
      return prev + digit;
    });
  };

  const handleUnlockPress = () => {
    handleStandardAuth(pin, false);
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const handleClearAll = () => {
    setPin('');
  };

  const evaluateExpression = (expr: string): string | null => {
    const trimmed = expr.trim();
    if (!trimmed) return null;
    if (!/^[\d+\-*/.()%\s^×÷]+$/.test(trimmed)) return null;

    try {
      let sanitized = trimmed
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/\^/g, '**')
        .replace(/%/g, '/100')
        .replace(/[^0-9+\-*/.()\s]/g, '');

      if (!sanitized.trim()) return null;

      const openParens = (sanitized.match(/\(/g) || []).length;
      const closeParens = (sanitized.match(/\)/g) || []).length;
      if (openParens > closeParens) {
        sanitized += ')'.repeat(openParens - closeParens);
      }

      let depth = 0;
      for (const ch of sanitized) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (depth < 0) return null;
      }

      const result = Function(`'use strict'; return (${sanitized})`)();
      if (typeof result !== 'number' || !isFinite(result)) return null;
      return String(result);
    } catch {
      return null;
    }
  };

  const formatDisplayNumber = (val: string): string => {
    if (!val || val === '.') return val;
    const cleaned = val.replace(/[^0-9.\-]/g, '');
    if (!cleaned || cleaned === '-') return cleaned;
    if (cleaned.includes('.')) {
      const [intPart, decPart] = cleaned.split('.');
      const formattedInt = parseInt(intPart || '0', 10).toLocaleString('en-US');
      return `${intPart?.startsWith('-') ? '-' : ''}${formattedInt.replace(/^-/, '')}.${decPart ?? ''}`;
    }
    const num = parseInt(cleaned, 10);
    if (isNaN(num)) return cleaned;
    return num.toLocaleString('en-US');
  };

  const formatExpression = (expr: string): string => {
    let formatted = expr
      .replace(/\*/g, ' × ')
      .replace(/\//g, ' ÷ ')
      .replace(/\+/g, ' + ')
      .replace(/-/g, ' - ')
      .replace(/%/g, '%')
      .replace(/\^/g, ' ^ ')
      .replace(/\(/g, '(')
      .replace(/\)/g, ')')
      .replace(/\s+/g, ' ')
      .trim();

    if (formatted.startsWith(' - ')) {
      formatted = formatted.slice(3);
    }

    return formatted;
  };

  const applyImmediateFunction = (fn: string) => {
    const target = calcExpression.trim() || calcMainDisplay.replace(/,/g, '');
    const value = evaluateExpression(target);
    const numValue = value !== null ? parseFloat(value) : parseFloat(target);

    if (isNaN(numValue)) return;

    let result: number;
    let label: string;

    switch (fn) {
      case 'x²':
        result = numValue * numValue;
        label = 'x²';
        break;
      case 'x³':
        result = numValue * numValue * numValue;
        label = 'x³';
        break;
      case '√':
        result = Math.sqrt(numValue);
        label = '√';
        break;
      case '∛':
        result = Math.cbrt(numValue);
        label = '∛';
        break;
      case 'eˣ':
        result = Math.exp(numValue);
        label = 'e^';
        break;
      case '10ˣ':
        result = Math.pow(10, numValue);
        label = '10^';
        break;
      case 'ln':
        result = Math.log(numValue);
        label = 'ln';
        break;
      case 'log':
        result = Math.log10(numValue);
        label = 'log';
        break;
      default:
        return;
    }

    const formattedResult = formatDisplayNumber(String(result));
    if (!isFinite(result)) return;
    setCalcHistory(`${label}(${target}) = ${formattedResult}`);
    setCalcMainDisplay(formattedResult);
    setCalcExpression('');
  };

  const handleButtonPress = (token: string) => {
    if (token === 'AC') {
      setCalcHistory('');
      setCalcExpression('');
      setCalcMainDisplay('0');
      setIsSecondMode(false);
    } else if (token === '2nd') {
      setIsSecondMode((prev) => !prev);
    } else if (token === '±') {
      if (!calcExpression.trim()) {
        setCalcExpression('-');
        return;
      }
      const trimmed = calcExpression.trim();
      const segments = trimmed.split(/\s*[÷×%+-]\s*/);
      const lastSegment = segments[segments.length - 1];
      if (lastSegment && !isNaN(parseFloat(lastSegment)) && lastSegment !== '') {
        const prefix = trimmed.slice(0, trimmed.length - lastSegment.length);
        const newLast = lastSegment.startsWith('-') ? lastSegment.slice(1) : '-' + lastSegment;
        setCalcExpression(prefix + newLast);
      } else {
        setCalcExpression('-' + trimmed);
      }
    } else if (token === '⌫') {
      setCalcExpression((prev) => {
        const trimmed = prev.trimEnd();
        if (!trimmed) return '';
        const lastChar = trimmed[trimmed.length - 1];
        if (lastChar === ' ') {
          const operatorEnd = trimmed.length - 1;
          const operatorStart = operatorEnd - 1;
          return trimmed.slice(0, operatorStart).trimEnd();
        }
        return trimmed.slice(0, -1);
      });
    } else if (['÷', '×', '%', '+', '-'].includes(token)) {
      setCalcExpression((prev) => {
        const trimmed = prev.trimEnd();
        if (!trimmed) {
          return calcMainDisplay.replace(/,/g, '') + ' ' + token + ' ';
        }
        const lastChar = trimmed[trimmed.length - 1];
        if (['÷', '×', '%', '+', '-'].includes(lastChar)) {
          return prev.slice(0, -1) + token;
        }
        if (trimmed === '(' && ['÷', '×', '%'].includes(token)) return prev;
        return trimmed + ' ' + token + ' ';
      });
    } else if (token === '.') {
      setCalcExpression((prev) => {
        const segments = prev.split(/\s*[÷×%+-]\s*/);
        const currentSegment = segments[segments.length - 1];
        if (currentSegment.includes('.')) return prev;
        if (!currentSegment || /[÷×%+-]$/.test(prev.trimEnd())) {
          return prev + '0.';
        }
        return prev + '.';
      });
    } else if (token === '(' || token === ')') {
      setCalcExpression((prev) => {
        const trimmed = prev.trimEnd();
        if (!trimmed) return token;
        const lastChar = trimmed[trimmed.length - 1];
        if (/[0-9.)]$/.test(lastChar) && token === '(') {
          return trimmed + ' × ' + token;
        }
        return trimmed + token;
      });
    } else if (token === '=') {
      if (!calcExpression.trim()) return;
      const expr = calcExpression.trim();
      const effectiveExpr = expr.replace(/^-[-\s]*/, '').replace(/[()]/g, '');
      const hasOperator = /[÷×%+\^-]/.test(effectiveExpr);

      if (!hasOperator) {
        const digitsOnly = expr.replace(/[^0-9]/g, '');
        if (digitsOnly.length >= PIN_MIN_LENGTH) {
          handleStandardAuth(digitsOnly, true);
          return;
        }
      }

      const result = evaluateExpression(expr);
      if (result !== null) {
        setCalcHistory(`${formatExpression(expr)} = ${formatDisplayNumber(result)}`);
        setCalcMainDisplay(formatDisplayNumber(result));
        setCalcExpression('');
      } else {
        handleStandardAuth(undefined, true);
      }
    } else if (['x²', 'x³', '√', '∛', 'eˣ', '10ˣ', 'ln', 'log'].includes(token)) {
      applyImmediateFunction(token);
    } else if (token === 'xʸ') {
      setCalcExpression((prev) => {
        if (!prev.trim()) {
          return calcMainDisplay.replace(/,/g, '') + ' ^ ';
        }
        const trimmed = prev.trimEnd();
        if (['÷', '×', '%', '+', '-', '^'].includes(trimmed[trimmed.length - 1])) {
          return prev;
        }
        return trimmed + ' ^ ';
      });
    } else if (token === 'ʸ√') {
      setCalcExpression((prev) => {
        if (!prev.trim()) {
          return calcMainDisplay.replace(/,/g, '') + ' ^(1/';
        }
        const trimmed = prev.trimEnd();
        if (['÷', '×', '%', '+', '-', '^'].includes(trimmed[trimmed.length - 1])) {
          return prev;
        }
        return trimmed + ' ^(1/';
      });
    } else {
      setCalcExpression((prev) => {
        if (!prev) return token === '.' ? '0.' : token;
        if (prev === '0' && token !== '.') return token;
        if (token === '.' && /\.[^0-9]*$/.test(prev)) return prev;
        return prev + token;
      });
    }
  };

  const getCurrentOperand = (): string => {
    if (!calcExpression.trim()) return '0';
    const segments = calcExpression.split(/\s*[÷×%+-]\s*/);
    const last = segments[segments.length - 1] || '0';
    const cleanLast = last.replace(/\)+$/, '');
    if (/^-?[\d.]+$/.test(cleanLast)) return cleanLast;
    return '0';
  };

  const liveResult = calcExpression.trim() ? evaluateExpression(calcExpression) : null;
  const displayMain = liveResult !== null ? formatDisplayNumber(liveResult) : getCurrentOperand();

  if (showTransitionSplash) {
    return (
      <View style={styles.transitionSplash}>
        <Image source={require('../../../assets/images/icon.png')} style={styles.transitionSplashImage} resizeMode="contain" />
        <Text style={styles.transitionSplashTitle}>Deposito Seguro</Text>
      </View>
    );
  }

  if (isCalc) {
    return (
      <View style={[styles.container, { backgroundColor: CALC_BG }]}>
        <View style={styles.displayArea}>
          <Text style={styles.historyText} numberOfLines={1}>
            {calcHistory}
          </Text>
          <Text style={styles.expressionText} numberOfLines={1}>
            {calcExpression ? formatExpression(calcExpression) : '\u00A0'}
          </Text>
          <Text
            style={[
              styles.mainText,
              displayMain.length > 9 && styles.mainTextMedium,
              displayMain.length > 14 && styles.mainTextSmall,
            ]}
            numberOfLines={1}
          >
            {displayMain}
          </Text>
        </View>

        <View style={styles.sciRow}>
          <CalcButton label="2nd" style="sci" active={isSecondMode} onPress={() => handleButtonPress('2nd')} height={sciButtonHeight} />
          <CalcButton label={isSecondMode ? '√' : 'x²'} style="sci" onPress={() => handleButtonPress(isSecondMode ? '√' : 'x²')} height={sciButtonHeight} />
          <CalcButton label={isSecondMode ? '∛' : 'x³'} style="sci" onPress={() => handleButtonPress(isSecondMode ? '∛' : 'x³')} height={sciButtonHeight} />
          <CalcButton label={isSecondMode ? 'ʸ√' : 'xʸ'} style="sci" onPress={() => handleButtonPress(isSecondMode ? 'ʸ√' : 'xʸ')} height={sciButtonHeight} />
          <CalcButton label={isSecondMode ? 'ln' : 'eˣ'} style="sci" onPress={() => handleButtonPress(isSecondMode ? 'ln' : 'eˣ')} height={sciButtonHeight} />
          <CalcButton label={isSecondMode ? 'log' : '10ˣ'} style="sci" onPress={() => handleButtonPress(isSecondMode ? 'log' : '10ˣ')} height={sciButtonHeight} />
        </View>

        <View style={styles.buttonGrid}>
          <View style={styles.row}>
            <CalcButton label="AC" style="func" onPress={() => handleButtonPress('AC')} height={buttonHeight} />
            <CalcButton label="±" style="func" onPress={() => handleButtonPress('±')} height={buttonHeight} />
            <CalcButton label="%" style="func" onPress={() => handleButtonPress('%')} height={buttonHeight} />
            <CalcButton label="÷" style="op" onPress={() => handleButtonPress('÷')} height={buttonHeight} />
          </View>
          <View style={styles.row}>
            <CalcButton label="7" style="num" onPress={() => handleButtonPress('7')} height={buttonHeight} />
            <CalcButton label="8" style="num" onPress={() => handleButtonPress('8')} height={buttonHeight} />
            <CalcButton label="9" style="num" onPress={() => handleButtonPress('9')} height={buttonHeight} />
            <CalcButton label="×" style="op" onPress={() => handleButtonPress('×')} height={buttonHeight} />
          </View>
          <View style={styles.row}>
            <CalcButton label="4" style="num" onPress={() => handleButtonPress('4')} height={buttonHeight} />
            <CalcButton label="5" style="num" onPress={() => handleButtonPress('5')} height={buttonHeight} />
            <CalcButton label="6" style="num" onPress={() => handleButtonPress('6')} height={buttonHeight} />
            <CalcButton label="-" style="op" onPress={() => handleButtonPress('-')} height={buttonHeight} />
          </View>
          <View style={styles.row}>
            <CalcButton label="1" style="num" onPress={() => handleButtonPress('1')} height={buttonHeight} />
            <CalcButton label="2" style="num" onPress={() => handleButtonPress('2')} height={buttonHeight} />
            <CalcButton label="3" style="num" onPress={() => handleButtonPress('3')} height={buttonHeight} />
            <CalcButton label="+" style="op" onPress={() => handleButtonPress('+')} height={buttonHeight} />
          </View>
          <View style={styles.row}>
            <CalcButton label="0" style="num" onPress={() => handleButtonPress('0')} height={buttonHeight} />
            <CalcButton label="." style="num" onPress={() => handleButtonPress('.')} height={buttonHeight} />
            <CalcButton label="⌫" style="func" onPress={() => handleButtonPress('⌫')} height={buttonHeight} />
            <CalcButton label="=" style="equal" onPress={() => handleButtonPress('=')} height={buttonHeight} equalBg={calcTheme.equalBg} />
          </View>
        </View>
      </View>
    );
  }

  const T9: Record<string, string> = {
    '2': 'ABC',
    '3': 'DEF',
    '4': 'GHI',
    '5': 'JKL',
    '6': 'MNO',
    '7': 'PQRS',
    '8': 'TUV',
    '9': 'WXYZ',
  };

  return (
    <View style={[styles.stdContainer, { backgroundColor: stdTheme.bg }]}>
      <View style={[styles.logoWrap, { backgroundColor: isDark ? '#1C1C1E' : colors.surfaceElevated }]}>
        <Image source={require('../../../assets/logo/DepoS_logo.png')} style={styles.logo} resizeMode="contain" />
      </View>
      <Text style={[styles.appName, { color: stdTheme.text }]}>Deposito Seguro</Text>

      <Text style={[styles.stdTitle, { color: stdTheme.text }]}>Enter PIN</Text>
      <Text style={[styles.subtitle, { color: stdTheme.muted }]}>
        Enter your PIN to unlock the vault
      </Text>

      <TextInput
        ref={pinInputRef}
        style={[styles.pinInput, { backgroundColor: stdTheme.surface, color: stdTheme.text }]}
        placeholder="Enter PIN"
        placeholderTextColor={stdTheme.inputPlaceholder}
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        maxLength={20}
        secureTextEntry
        editable={false}
        showSoftInputOnFocus={false}
        autoFocus={false}
        returnKeyType="done"
      />

      {securityHint ? (
        <Text style={[styles.hintText, { color: stdTheme.muted }]}>Hint: {securityHint}</Text>
      ) : null}

      <View style={{ flex: 1 }} />

      <View style={styles.keypadGrid}>
        {[
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
          ['clearAll', '0', 'backspace'],
        ].map((row, ri) => (
          <View key={`row-${ri}`} style={styles.keypadRow}>
            {row.map((key, ci) => {
              const btnKey = `btn-${ri}-${ci}`;
              if (key === 'clearAll') {
                return (
                  <TouchableOpacity key={btnKey} style={[styles.keypadBtn, { backgroundColor: stdTheme.keypad }]} onPress={handleClearAll} activeOpacity={0.7}>
                    <Text style={[styles.keyNum, { color: stdTheme.keyText }]}>C</Text>
                  </TouchableOpacity>
                );
              }
              if (key === 'backspace') {
                return (
                  <TouchableOpacity key={btnKey} style={[styles.keypadBtn, { backgroundColor: stdTheme.keypad }]} onPress={handleBackspace} activeOpacity={0.7}>
                    <Delete size={26} color={stdTheme.keyText} strokeWidth={2.5} />
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity key={btnKey} style={[styles.keypadBtn, { backgroundColor: stdTheme.keypad }]} onPress={() => handlePinPress(key)} activeOpacity={0.7}>
                  <Text style={[styles.keyNum, { color: stdTheme.keyText }]}>{key}</Text>
                  {T9[key] ? <Text style={[styles.keySub, { color: stdTheme.keySub }]}>{T9[key]}</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      <View style={{ height: 16 }} />

      <TouchableOpacity
        style={[styles.unlockBtn, { backgroundColor: stdTheme.unlockBg }]}
        onPress={handleUnlockPress}
        activeOpacity={0.8}
      >
        <Lock size={18} color={stdTheme.unlockText} strokeWidth={2.5} />
        <Text style={[styles.unlockBtnText, { color: stdTheme.unlockText }]}>Unlock Vault</Text>
      </TouchableOpacity>
    </View>
  );
}

function CalcButton({ label, style, onPress, active, height, equalBg }: { label: string; style: 'num' | 'func' | 'op' | 'equal' | 'sci'; onPress: () => void; active?: boolean; height?: number; equalBg?: string }) {
  const bg = style === 'equal' ? (equalBg || CALC_OP_BG) :
             style === 'op' ? CALC_OP_BG :
             style === 'sci' ? (active ? CALC_FUNC_BG : CALC_SCI_BG) :
             style === 'func' ? CALC_FUNC_BG : CALC_NUM_BG;
  const textColor = style === 'op' || style === 'equal' ? CALC_OP_TEXT : CALC_TEXT;
  const fontSize = label === '=' ? 34 :
                    label === '÷' || label === '×' || label === '-' || label === '+' ? 30 :
                    style === 'sci' ? 13 : 26;
  const btnHeight = height || 56;
  const borderRadius = btnHeight * 0.22;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.65}
      style={[
        styles.calcButton,
        { backgroundColor: bg, height: btnHeight, borderRadius },
      ]}
    >
      <Text style={[styles.calcButtonText, { color: textColor, fontSize }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CALC_BG },
  displayArea: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
    minHeight: 120,
  },
  historyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 16,
    fontWeight: '400',
    minHeight: 20,
    textAlign: 'right',
    width: '100%',
    marginBottom: 4,
  },
  expressionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 22,
    fontWeight: '400',
    minHeight: 28,
    textAlign: 'right',
    width: '100%',
    marginBottom: 4,
  },
  mainText: {
    color: CALC_TEXT,
    fontSize: 64,
    fontWeight: '300',
    minHeight: 72,
    textAlign: 'right',
    width: '100%',
    letterSpacing: -1,
  },
  mainTextMedium: { fontSize: 46 },
  mainTextSmall: { fontSize: 36 },
  sciRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 8,
  },
  buttonGrid: { paddingHorizontal: 12, paddingBottom: 20 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  calcButton: { justifyContent: 'center', alignItems: 'center', flex: 1 },
  calcButtonText: { fontWeight: '400', includeFontPadding: false },
  stdContainer: { flex: 1, backgroundColor: '#000000', alignItems: 'center', paddingHorizontal: 24 },
  logoWrap: { width: 72, height: 72, borderRadius: 20, backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center', marginTop: 60, marginBottom: 12 },
  
  logo: { marginTop: 40, width: 160, height: 140 },
  
  appName: {  marginTop: 40, color: '#FFFFFF', fontSize: 36, fontWeight: '800', letterSpacing: -0.2, marginBottom: 24 },
  
  stdTitle: { marginTop: 40, fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3, marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#8E8E93', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  hintText: { fontSize: 13, color: '#8E8E93', textAlign: 'center', fontStyle: 'italic', marginBottom: 28 },
 
  pinInput: { width: 400,  height: 52, backgroundColor: '#1C1C1E', borderRadius: 22, paddingHorizontal: 20, color: '#FFFFFF', fontSize: 18, fontWeight: '500', textAlign: 'center', letterSpacing: 4, marginBottom: 16 },
  keypadGrid: { gap: 12, width: '100%', maxWidth: 320, marginBottom: 8 },
  keypadRow: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
 
  keypadBtn: { width: 120, height: 108, borderRadius: 22, backgroundColor: '#2D2D2D', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' },
  keyNum: { color: '#FFFFFF', fontSize: 28, fontWeight: '400', includeFontPadding: false, lineHeight: 32 },
  keySub: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '500', letterSpacing: 0.5, marginTop: -2, lineHeight: 12 },
  
  unlockBtn: {  marginBottom: 70 , height: 80, width: 400,  paddingVertical: 16, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  unlockBtnText: { color: '#000000', fontWeight: '800', fontSize: 26, letterSpacing: -0.2 },
  transitionSplash: {
    flex: 1,
    backgroundColor: '#2D2D2D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  transitionSplashImage: {
    width: 200,
    height: 200,
  },
  transitionSplashTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 24,
  },
});
