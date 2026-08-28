import { router } from 'expo-router';
import { Delete, Lock } from 'lucide-react-native';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Button } from '../../components/primitives/Button';
import { Type } from '../../constants/typography';
import { useTheme } from '../../contexts/ThemeContext';
import { useScreenEnterAnimation } from '../../hooks/useScreenEnterAnimation';
import { PIN_LOCKOUT_KEY, useAuthStore } from '../../store/authStore';
import { useLockoutStore } from '../../store/lockoutStore';
import { useSettingsStore } from '../../store/settingsStore';
import { PIN_MIN_LENGTH, validatePin } from '../../utils/accessKeyValidation';
import { evaluateArithmeticExpression } from '../../utils/calculatorExpression';

const CALC_BG = '#000000';
const CALC_NUM_BG = '#2D2D2D';
const CALC_FUNC_BG = '#3A3A3C';
const CALC_OP_BG = '#FFFFFF';
const CALC_SCI_BG = '#2D2D2D';
const CALC_TEXT = '#FFFFFF';
const CALC_OP_TEXT = '#000000';
const CALC_SPLASH_BG = CALC_BG;

const CALC_THEME_COLORS: Record<string, { equalBg: string }> = {
  default: { equalBg: '#FFFFFF' },
  white: { equalBg: '#FFFFFF' },
  orange: { equalBg: '#FF9F0A' },
  red: { equalBg: '#FF453A' },
};

const BUTTON_LAYOUT = [
  ['AC', '±', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0', '.', '⌫', '='],
];

export default function LoginScreen() {
  const { colors, font, space, isTablet , iconSize } = useTheme();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // Standard PIN screen shrinks proportionally on short screens so the logo,
  // title, dots, hint, keypad, and unlock button all fit without scrolling
  // or clipping — 780 is the design-reference height (iPhone-class device).
  const stdScale = Math.max(0.6, Math.min(1, height / 780));

  const { buttonHeight, sciButtonHeight } = useMemo(() => {
    const landscape = width > height;
    const ROW_MARGIN = landscape ? space(2) : space(1);
    const BOTTOM_PADDING = landscape ? space(4) : space(3);
    const SCI_RATIO = 0.7;
    const SCI_HEIGHT_BASE = isTablet ? 40 : 28;
    const totalRows = 6;
    const fixedVerticalSpace = totalRows * ROW_MARGIN + BOTTOM_PADDING;
    const maxButtonAreaHeight = height * (landscape ? 0.7 : 0.55);
    const heightBasedMain = (maxButtonAreaHeight - fixedVerticalSpace - SCI_HEIGHT_BASE) / 5;
    const mainHeight = Math.max(44, Math.min(heightBasedMain, landscape ? 80 : 64));
    const sciHeight = Math.max(44, mainHeight * SCI_RATIO);
    return { buttonHeight: mainHeight, sciButtonHeight: sciHeight };
  }, [width, height, isTablet, space]);

  const enterStyle = useScreenEnterAnimation();
  const { authenticate, securityHint } = useAuthStore();
  const { disguiseMode, disguiseIconTheme } = useSettingsStore();
  const [inputBuffer, setInputBuffer] = useState('');
  const [pin, setPin] = useState('');
  const [calcHistory, setCalcHistory] = useState('');
  const [calcExpression, setCalcExpression] = useState('');
  const [calcMainDisplay, setCalcMainDisplay] = useState('0');
  const [isSecondMode, setIsSecondMode] = useState(false);
  const [showTransitionSplash, setShowTransitionSplash] = useState(false);
  const isCalc = disguiseMode === 'calculator';

  const calcTheme = useMemo(
    () => CALC_THEME_COLORS[disguiseIconTheme] || CALC_THEME_COLORS.default,
    [disguiseIconTheme]
  );

  const buttonLayout = useMemo(() => BUTTON_LAYOUT, []);

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

    // S-1: surface a specific lockout message instead of a generic "Access
    // Denied" — authenticate() still enforces the lockout itself either way.
    if (useLockoutStore.getState().isLockedOut(PIN_LOCKOUT_KEY)) {
      const remaining = useLockoutStore.getState().getRemainingLockoutTime(PIN_LOCKOUT_KEY);
      if (!silent) Alert.alert('Too Many Attempts', `Try again in ${remaining}s.`);
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
    if (!/^[\d+\-*/.()%\s ^×÷]+$/.test(trimmed)) return null;

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

      const result = evaluateArithmeticExpression(sanitized);
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
      <View style={{ flex: 1, backgroundColor: CALC_SPLASH_BG }}>
        <View style={styles.transitionSplash}>
          <View style={styles.transitionSplashLogoContainer}>
            <Image source={require('../../../assets/logo/DepoS_logo.png')} style={styles.transitionSplashImage} resizeMode="contain" />
          </View>
          <Text style={styles.transitionSplashTitle}>Deposito Seguro</Text>
        </View>
      </View>
    );
  }

  if (isCalc) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: CALC_BG }}>
        <View style={[styles.calcOuter, { flexDirection: isLandscape && !isTablet ? 'row' : 'column' }]}>
          <View style={[
            styles.displayArea,
            {
              paddingHorizontal: space(2),
              paddingTop: space(1),
              paddingBottom: 8,
              flex: 1,
              maxWidth: isLandscape ? '50%' : undefined,
            },
          ]}>
            <Text style={[styles.historyText, { fontSize: font(16) }]} numberOfLines={1}>
              {calcHistory}
            </Text>
            <Text style={[styles.expressionText, { fontSize: font(22) }]} numberOfLines={1}>
              {calcExpression ? formatExpression(calcExpression) : '\u00A0'}
            </Text>
            <Text
              style={[
                styles.mainText,
                { fontSize: font(64) },
                displayMain.length > 9 && { fontSize: font(46) },
                displayMain.length > 14 && { fontSize: font(36) },
              ]}
              numberOfLines={1}
            >
              {displayMain}
            </Text>
          </View>

          <View style={[styles.calcButtonPanel, isLandscape && !isTablet && styles.calcButtonPanelLandscape]}>
            <View style={[styles.sciRow, { paddingHorizontal: 8, marginBottom: 8, gap: 8 }]}>
              <CalcButton label="2nd" style="sci" active={isSecondMode} onPress={() => handleButtonPress('2nd')} height={sciButtonHeight} fontSize={font(13)} />
              <CalcButton label={isSecondMode ? '√' : 'x²'} style="sci" onPress={() => handleButtonPress(isSecondMode ? '√' : 'x²')} height={sciButtonHeight} fontSize={font(13)} />
              <CalcButton label={isSecondMode ? '∛' : 'x³'} style="sci" onPress={() => handleButtonPress(isSecondMode ? '∛' : 'x³')} height={sciButtonHeight} fontSize={font(13)} />
              <CalcButton label={isSecondMode ? 'ʸ√' : 'xʸ'} style="sci" onPress={() => handleButtonPress(isSecondMode ? 'ʸ√' : 'xʸ')} height={sciButtonHeight} fontSize={font(13)} />
              <CalcButton label={isSecondMode ? 'ln' : 'eˣ'} style="sci" onPress={() => handleButtonPress(isSecondMode ? 'ln' : 'eˣ')} height={sciButtonHeight} fontSize={font(13)} />
              <CalcButton label={isSecondMode ? 'log' : '10ˣ'} style="sci" onPress={() => handleButtonPress(isSecondMode ? 'log' : '10ˣ')} height={sciButtonHeight} fontSize={font(13)} />
            </View>

            <View style={[styles.buttonGrid, { paddingHorizontal: 8, paddingBottom: 20, gap: 8 }]}>
              {buttonLayout.map((row, ri) => (
                <View key={`row-${ri}`} style={[styles.row, { gap: space(1), marginBottom: space(1) }]}>
                  {row.map((label, ci) => {
                    const btnKey = `btn-${ri}-${ci}`;
                    const styleType: 'num' | 'func' | 'op' | 'equal' | 'sci' =
                      label === 'AC' || label === '±' || label === '%' || label === '⌫' ? 'func' :
                      ['÷', '×', '-', '+', '='].includes(label) ? (label === '=' ? 'equal' : 'op') : 'num';
                    const isOp = ['÷', '×', '-', '+'].includes(label);
                    const pressed = () => handleButtonPress(label);
                    if (styleType === 'equal') {
                      return (
                        <CalcButton key={btnKey} label="=" style="equal" onPress={pressed} height={buttonHeight} fontSize={font(34)} equalBg={calcTheme.equalBg} />
                      );
                    }
                    if (isOp) {
                      return (
                        <CalcButton key={btnKey} label={label} style="op" onPress={pressed} height={buttonHeight} fontSize={font(30)} />
                      );
                    }
                    return (
                      <CalcButton key={btnKey} label={label} style={styleType} onPress={pressed} height={buttonHeight} fontSize={font(26)} />
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Standard (non-disguised) PIN entry. Per §3: a real PIN-dot display
  // replaces the old disabled dummy TextInput, and the keypad/unlock button
  // are rebuilt on the new design system. Dots never expose the entered
  // value to a screen reader (§6) — only a count.
  const pinDotSlots = Math.max(pin.length, PIN_MIN_LENGTH);
  const keySize = Math.min(76, (Math.min(width, 400) - space(6) * 2 - space(3) * 2) / 3) * stdScale;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View
            style={[
              styles.decorCircle,
              { top: -90, right: -70, width: 260, height: 260, backgroundColor: `${colors.primary}12` },
            ]}
          />
          <View
            style={[
              styles.decorCircle,
              { bottom: -60, left: -80, width: 220, height: 220, backgroundColor: `${colors.secondary}0F` },
            ]}
          />
        </View>

        <Animated.View
          style={[
            enterStyle,
            {
              flex: 1,
              paddingHorizontal: space(6),
              paddingVertical: space(3) * stdScale,
              alignItems: 'center',
              justifyContent: 'space-between',
            },
          ]}
        >
          <View style={{ width: '100%', alignItems: 'center' }}>
            <View
              style={[
                styles.iconBadge,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: `${colors.primary}2A`,
                  shadowColor: colors.shadow,
                  width: 88 * stdScale,
                  height: 88 * stdScale,
                  borderRadius: 44 * stdScale,
                },
              ]}
            >
              <Image source={require('../../../assets/logo/DepoS_logo.png')} style={{ width: 52 * stdScale, height: 52 * stdScale }} resizeMode="contain" />
            </View>

            <Text
              style={[
                styles.brandLabel,
                { color: colors.textMuted, marginTop: space(3) * stdScale, fontSize: font(Type.label.size) },
              ]}
            >
              Deposito Seguro
            </Text>

            <Text style={[styles.titleText, { color: colors.text, marginTop: space(1), fontSize: font(Type.title.size) }]}>Enter PIN</Text>
            <Text style={[styles.subtitleText, { color: colors.textMuted, fontSize: font(Type.body.size), marginBottom: space(4) * stdScale }]}>
              Enter your PIN to unlock the vault
            </Text>

            <View
              style={[
                styles.pinCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.borderLight,
                  shadowColor: colors.shadow,
                  paddingVertical: space(3) * stdScale,
                  paddingHorizontal: space(4) * stdScale,
                  marginBottom: space(3) * stdScale,
                },
              ]}
              accessibilityLabel={`PIN entered: ${pin.length} digit${pin.length === 1 ? '' : 's'}`}
              accessibilityRole="text"
            >
              <View style={[styles.pinDotsRow, { gap: space(3) }]}>
                {Array.from({ length: pinDotSlots }).map((_, i) => (
                  <PinDot key={i} filled={i < pin.length} color={colors.primary} borderColor={colors.border} />
                ))}
              </View>
            </View>

            {securityHint ? (
              <View style={[styles.hintChip, { backgroundColor: colors.surfaceHover, marginBottom: space(2) * stdScale }]}>
                <Text style={[styles.hintChipText, { color: colors.textMuted, fontSize: font(Type.caption.size) }]}>
                  Hint: {securityHint}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ width: '100%', alignItems: 'center' }}>
            <View style={[styles.keypadGrid, { width: '100%', maxWidth: 400, gap: space(3) * stdScale, marginBottom: space(4) * stdScale }]}>
              {[
                ['1', '2', '3'],
                ['4', '5', '6'],
                ['7', '8', '9'],
                ['clearAll', '0', 'backspace'],
              ].map((row, ri) => (
                <View key={`row-${ri}`} style={[styles.keypadRow, { gap: space(3) * stdScale }]}>
                  {row.map((key, ci) => {
                    const btnKey = `btn-${ri}-${ci}`;
                    if (key === 'clearAll') {
                      return (
                        <KeyButton
                          key={btnKey}
                          size={keySize}
                          borderColor={colors.borderLight}
                          onPress={handleClearAll}
                          accessibilityLabel="Clear PIN"
                        >
                          <Text style={[styles.keyGhostText, { color: colors.textMuted, fontSize: font(18) }]}>C</Text>
                        </KeyButton>
                      );
                    }
                    if (key === 'backspace') {
                      return (
                        <KeyButton
                          key={btnKey}
                          size={keySize}
                          borderColor={colors.borderLight}
                          onPress={handleBackspace}
                          accessibilityLabel="Backspace"
                        >
                          <Delete size={iconSize(22)} color={colors.textMuted} strokeWidth={2.25} />
                        </KeyButton>
                      );
                    }
                    return (
                      <KeyButton
                        key={btnKey}
                        size={keySize}
                        filled
                        bg={colors.surface}
                        borderColor={colors.borderLight}
                        shadowColor={colors.shadow}
                        onPress={() => handlePinPress(key)}
                        accessibilityLabel={`Digit ${key}`}
                      >
                        <Text style={[styles.keyNum, { color: colors.text, fontSize: font(24) }]}>{key}</Text>
                      </KeyButton>
                    );
                  })}
                </View>
              ))}
            </View>

            <Button
              title="Unlock Vault"
              onPress={handleUnlockPress}
              icon={Lock}
              size="lg"
              style={{
                width: '100%',
                maxWidth: 400,
                height: 56 * stdScale,
                borderRadius: 28 * stdScale,
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.28,
                shadowRadius: 16,
                elevation: 6,
              }}
            />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// A single PIN indicator. Springs into its filled state (scale + color) as
// digits are entered so the dots read as live feedback rather than a static
// counter. Purely visual — accessibility exposure is on the row (§6).
function PinDot({ filled, color, borderColor }: { filled: boolean; color: string; borderColor: string }) {
  const scale = useSharedValue(filled ? 1 : 0.86);

  useEffect(() => {
    scale.value = withSpring(filled ? 1 : 0.86, { damping: 14, stiffness: 260 });
  }, [filled, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.pinDot,
        animatedStyle,
        {
          borderColor: filled ? color : borderColor,
          backgroundColor: filled ? color : 'transparent',
        },
      ]}
    />
  );
}

// Shared circular keypad key. `filled` gives digit keys a raised, elevated
// surface; utility keys (clear/backspace) stay borderless/ghost so the grid
// reads digits-first, matching modern passcode-pad conventions.
function KeyButton({
  size,
  filled,
  bg,
  borderColor,
  shadowColor,
  onPress,
  accessibilityLabel,
  children,
}: {
  size: number;
  filled?: boolean;
  bg?: string;
  borderColor: string;
  shadowColor?: string;
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.keyCircle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: filled ? bg : 'transparent',
          borderColor,
          borderWidth: filled ? StyleSheet.hairlineWidth : 0,
        },
        filled && shadowColor
          ? { shadowColor, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2 }
          : null,
      ]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </TouchableOpacity>
  );
}

function CalcButton({ label, style, onPress, active, height, fontSize, equalBg }: { label: string; style: 'num' | 'func' | 'op' | 'equal' | 'sci'; onPress: () => void; active?: boolean; height?: number; fontSize?: number; equalBg?: string }) {
  const bg = style === 'equal' ? (equalBg || CALC_OP_BG) :
             style === 'op' ? CALC_OP_BG :
             style === 'sci' ? (active ? CALC_FUNC_BG : CALC_SCI_BG) :
             style === 'func' ? CALC_FUNC_BG : CALC_NUM_BG;
  const textColor = style === 'op' || style === 'equal' ? CALC_OP_TEXT : CALC_TEXT;
  const defaultFontSize = label === '=' ? 34 :
                          label === '÷' || label === '×' || label === '-' || label === '+' ? 30 :
                          style === 'sci' ? 13 : 26;
  const resolvedFontSize = fontSize ?? defaultFontSize;
  const btnHeight = height || 56;
  const borderRadius = btnHeight * 0.2;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.65}
      accessible
      accessibilityLabel={label === '⌫' ? 'Backspace' : label === 'AC' ? 'All Clear' : label === '±' ? 'Plus Minus' : label}
      accessibilityRole="button"
      style={[
        styles.calcButton,
        { backgroundColor: bg, height: btnHeight, borderRadius, minHeight: 44 },
      ]}
    >
      <Text style={[styles.calcButtonText, { color: textColor, fontSize: resolvedFontSize }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CALC_BG },
  calcOuter: { flex: 1 },
  calcButtonPanel: {},
  calcButtonPanelLandscape: { flexBasis: '50%', maxWidth: '55%', flexGrow: 1 },
  displayArea: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    minHeight: 120,
  },
  historyText: {
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '400',
    minHeight: 20,
    textAlign: 'right',
    width: '100%',
    marginBottom: 4,
  },
  expressionText: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '400',
    minHeight: 28,
    textAlign: 'right',
    width: '100%',
    marginBottom: 4,
  },
  mainText: {
    color: CALC_TEXT,
    fontWeight: '300',
    minHeight: 72,
    textAlign: 'right',
    width: '100%',
    letterSpacing: -1,
  },
  mainTextMedium: {},
  mainTextSmall: {},
  sciRow: {
    flexDirection: 'row',
  },
  buttonGrid: {},
  row: { flexDirection: 'row' },
  calcButton: { justifyContent: 'center', alignItems: 'center', flex: 1, minWidth: 44 },
  calcButtonText: { fontWeight: '400', includeFontPadding: false },
  calcScrollContent: { flexGrow: 1, backgroundColor: CALC_BG },
  decorCircle: { position: 'absolute', borderRadius: 999 },
  iconBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 6,
  },
  brandLabel: { fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', textAlign: 'center' },
  titleText: { fontWeight: '800', letterSpacing: -0.4, textAlign: 'center' },
  subtitleText: { textAlign: 'center', marginTop: 6, lineHeight: 20 },
  pinCard: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12, elevation: 2 },
  hintChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  hintChipText: { textAlign: 'center' },
  pinDotsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pinDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  keypadGrid: { alignSelf: 'center' },
  keypadRow: { flexDirection: 'row', justifyContent: 'center' },
  keyCircle: { justifyContent: 'center', alignItems: 'center' },
  keyNum: { fontWeight: '700', includeFontPadding: false },
  keyGhostText: { fontWeight: '600', includeFontPadding: false },
  transitionSplash: {
    flex: 1,
    backgroundColor: '#2D2D2D',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  transitionSplashLogoContainer: {
    width: 160,
    height: 160,
    borderRadius: 40,
    backgroundColor: '#3A3A3C',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  transitionSplashImage: {
    width: 300,
    height: 300,
    resizeMode: 'contain',
  },
  transitionSplashTitle: {
    fontWeight: '800',
    letterSpacing: -0.3,
    fontSize: 28,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
