// src/app/(auth)/register.tsx
// Steps 2–5 of the onboarding wizard ("Master key" → "Confirm key" →
// "Recovery hint" → "Vault sealed") — rebuilt to match "design images as
// reference output/onboarding screen references/onboarding {2,3,4,5}*.png"
// exactly. Business logic preserved from the previous single-page form:
// initializeVault(pin, hint) is still the only write path and still routes
// to /(main)/dashboard on success. What changed to match the reference is
// the flow itself — a PIN keypad that auto-advances once 6 digits are
// entered (no manual "confirm" tap), and a recovery hint that is genuinely
// optional (the old hard "Hint Required" block contradicted the design's
// own "Optional" copy and "Skip" affordance, and initializeVault already
// accepts an empty hint string).
import { router } from 'expo-router';
import { ArrowRight, Check, TriangleAlert } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { BrandHeader } from '../../components/onboarding/BrandHeader';
import { OnboardingProgress } from '../../components/onboarding/OnboardingProgress';
import { PinDots } from '../../components/onboarding/PinDots';
import { PinKeypad } from '../../components/onboarding/PinKeypad';
import { Button } from '../../components/primitives/Button';
import { useTheme } from '../../contexts/ThemeContext';
import { Type } from '../../constants/typography';
import { useScreenEnterAnimation } from '../../hooks/useScreenEnterAnimation';
import { SecureCrypto } from '../../security/crypto';
import { useAuthStore } from '../../store/authStore';
import { PIN_MIN_LENGTH } from '../../utils/accessKeyValidation';

const HINT_MAX_LENGTH = 64;
type WizardStep = 'pin' | 'confirm' | 'hint' | 'sealed';

export default function RegisterScreen() {
  const { colors, space, font } = useTheme();
  const { initializeVault } = useAuthStore();

  const [step, setStep] = useState<WizardStep>('pin');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [hint, setHint] = useState('');
  const [sealedHint, setSealedHint] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);

  // Auto-advance once the 6th digit lands — the reference screens have no
  // "Next" button on the keypad steps.
  useEffect(() => {
    if (step !== 'pin' || pin.length !== PIN_MIN_LENGTH) return;
    const t = setTimeout(() => setStep('confirm'), 220);
    return () => clearTimeout(t);
  }, [step, pin]);

  useEffect(() => {
    if (step !== 'confirm' || confirmPin.length !== PIN_MIN_LENGTH) return;
    const t = setTimeout(() => {
      if (confirmPin === pin) {
        setStep('hint');
      } else {
        Alert.alert('Mismatch', 'PINs do not match. Try again.');
        setConfirmPin('');
      }
    }, 220);
    return () => clearTimeout(t);
  }, [step, confirmPin, pin]);

  const handleBack = () => {
    if (step === 'pin') {
      router.back();
    } else if (step === 'confirm') {
      setConfirmPin('');
      setStep('pin');
    }
  };

  const handleSeal = async (hintOverride?: string) => {
    if (isInitializing) return;
    const finalHint = (hintOverride ?? hint).trim();
    setIsInitializing(true);
    try {
      const completed = await initializeVault(pin, finalHint);
      if (completed) {
        setSealedHint(finalHint);
        setStep('sealed');
      } else {
        Alert.alert('Error', 'Failed to securely instantiate storage hashes.');
      }
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSkip = () => {
    setHint('');
    handleSeal('');
  };

  const handleOpenVault = () => {
    router.replace('/(main)/dashboard');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: space(6), paddingTop: space(5), paddingBottom: space(8) }]}
          keyboardShouldPersistTaps="handled"
        >
          <StepBody key={step}>
            {step === 'pin' && (
              <>
                <BrandHeader onBack={handleBack} />
                <View style={{ marginTop: space(6), marginBottom: space(5) }}>
                  <OnboardingProgress activeStep={2} label="Step 2 · Master key" />
                </View>
                <Text style={[styles.headline, { color: colors.text, fontSize: font(Type.title.size), marginBottom: space(3) }]}>
                  Set your master key
                </Text>
                <Text style={[styles.paragraph, { color: colors.textMuted, fontSize: font(Type.body.size), marginBottom: space(6) }]}>
                  Choose {PIN_MIN_LENGTH} digits you will remember. It is the only way into this vault and it cannot be reset.
                </Text>
                <View style={{ marginBottom: space(8) }}>
                  <PinDots length={pin.length} total={PIN_MIN_LENGTH} />
                </View>
                <PinKeypad value={pin} onChange={setPin} maxLength={PIN_MIN_LENGTH} />
              </>
            )}

            {step === 'confirm' && (
              <>
                <BrandHeader onBack={handleBack} />
                <View style={{ marginTop: space(6), marginBottom: space(5) }}>
                  <OnboardingProgress activeStep={3} label="Step 3 · Confirm key" />
                </View>
                <Text style={[styles.headline, { color: colors.text, fontSize: font(Type.title.size), marginBottom: space(3) }]}>
                  Confirm your master key
                </Text>
                <Text style={[styles.paragraph, { color: colors.textMuted, fontSize: font(Type.body.size), marginBottom: space(6) }]}>
                  Enter the same digits once more so we know it was deliberate.
                </Text>
                <View style={{ marginBottom: space(8) }}>
                  <PinDots length={confirmPin.length} total={PIN_MIN_LENGTH} />
                </View>
                <PinKeypad value={confirmPin} onChange={setConfirmPin} maxLength={PIN_MIN_LENGTH} disabled={isInitializing} />
              </>
            )}

            {step === 'hint' && (
              <>
                <BrandHeader />
                <View style={{ marginTop: space(6), marginBottom: space(5) }}>
                  <OnboardingProgress activeStep={4} label="Step 4 · Recovery hint" />
                </View>
                <Text style={[styles.headline, { color: colors.text, fontSize: font(Type.title.size), marginBottom: space(3) }]}>
                  Leave yourself a hint
                </Text>
                <Text style={[styles.paragraph, { color: colors.textMuted, fontSize: font(Type.body.size), marginBottom: space(6) }]}>
                  Optional. Stored locally in plain text, so keep it oblique — a reference only you would follow.
                </Text>

                <Text style={[styles.fieldLabel, { color: colors.text, fontSize: font(Type.label.size), marginBottom: space(2) }]}>
                  Recovery hint
                </Text>
                <TextInput
                  value={hint}
                  onChangeText={setHint}
                  placeholder="e.g. the year of the second move"
                  placeholderTextColor={colors.textMuted}
                  maxLength={HINT_MAX_LENGTH}
                  autoComplete="off"
                  editable={!isInitializing}
                  accessibilityLabel="Recovery hint"
                  style={[
                    styles.hintInput,
                    {
                      color: colors.text,
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                      fontSize: font(Type.body.size),
                      paddingHorizontal: space(4),
                    },
                  ]}
                />
                <Text style={[styles.counter, { color: colors.textMuted, fontSize: font(Type.caption.size), marginTop: space(2), marginBottom: space(5) }]}>
                  {hint.length}/{HINT_MAX_LENGTH}
                </Text>

                <View
                  style={[
                    styles.warningBox,
                    { backgroundColor: colors.surfaceElevated, padding: space(4), marginBottom: space(6), gap: space(3) },
                  ]}
                >
                  <TriangleAlert size={18} color={colors.error} strokeWidth={2.25} />
                  <Text style={[styles.warningText, { color: colors.textMuted, fontSize: font(Type.body.size) }]}>
                    There is no recovery flow. If the master key is lost, the vault contents are lost with it.
                  </Text>
                </View>

                <Button
                  title={isInitializing ? 'Sealing…' : 'Seal the vault'}
                  onPress={() => handleSeal()}
                  loading={isInitializing}
                  size="lg"
                  style={{ width: '100%', marginBottom: space(4) }}
                />
                <Text
                  onPress={isInitializing ? undefined : handleSkip}
                  style={[styles.skip, { color: colors.textMuted, fontSize: font(Type.body.size), opacity: isInitializing ? 0.5 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Skip recovery hint and seal the vault"
                >
                  Skip
                </Text>
              </>
            )}

            {step === 'sealed' && (
              <>
                <View
                  style={[
                    styles.sealedBadge,
                    { backgroundColor: `${colors.primary}26`, marginBottom: space(5) },
                  ]}
                >
                  <Check size={26} color={colors.primary} strokeWidth={3} />
                </View>

                <View style={{ marginBottom: space(5) }}>
                  <OnboardingProgress activeStep={0} label="Step 4 · Recovery hint" />
                </View>

                <Text style={[styles.headline, { color: colors.text, fontSize: font(Type.title.size), marginBottom: space(3) }]}>
                  Vault sealed
                </Text>
                <Text style={[styles.paragraph, { color: colors.textMuted, fontSize: font(Type.body.size), marginBottom: space(6) }]}>
                  Your master key is hashed and stored inside this device only. Nothing was uploaded.
                </Text>

                <StatRow label="Storage" value="Device only" first />
                <StatRow label="Key hashing" value={`${SecureCrypto.PBKDF2_ITERATIONS.toLocaleString()} iterations`} />
                <StatRow label="Recovery hint" value={sealedHint ? 'Set' : 'None set'} />

                <Button
                  title="Open vault"
                  onPress={handleOpenVault}
                  icon={ArrowRight}
                  size="lg"
                  style={{ width: '100%', marginTop: space(6) }}
                />
              </>
            )}
          </StepBody>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Re-mounted per step (key={step} on the caller) so the shared enter fade
// replays on every transition instead of only once for the whole route.
function StepBody({ children }: { children: ReactNode }) {
  const enterStyle = useScreenEnterAnimation();
  return <Animated.View style={enterStyle}>{children}</Animated.View>;
}

function StatRow({ label, value, first = false }: { label: string; value: string; first?: boolean }) {
  const { colors, space, font } = useTheme();
  return (
    <View>
      {first && <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />}
      <View style={[styles.statRow, { paddingVertical: space(4) }]}>
        <Text style={[styles.statLabel, { color: colors.textMuted, fontSize: font(Type.body.size) }]}>{label}</Text>
        <Text style={[styles.statValue, { color: colors.text, fontSize: font(Type.body.size) }]}>{value}</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  headline: { fontWeight: '800', letterSpacing: -0.4 },
  paragraph: { fontWeight: '500', lineHeight: 21 },
  fieldLabel: { fontWeight: '700' },
  hintInput: { width: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingVertical: 14 },
  counter: { fontFamily: 'monospace', textAlign: 'right', fontWeight: '500' },
  warningBox: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12 },
  warningText: { flex: 1, lineHeight: 19, fontWeight: '500' },
  skip: { textAlign: 'center', fontWeight: '600' },
  sealedBadge: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
  statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statLabel: { fontFamily: 'monospace', fontWeight: '500' },
  statValue: { fontFamily: 'monospace', fontWeight: '700' },
});
