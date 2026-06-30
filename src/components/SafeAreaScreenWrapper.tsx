// src/components/SafeAreaScreenWrapper.tsx
// Reusable screen wrapper providing:
// - Safe area insets (top / bottom)
// - Theme-aware background color
// - Standard horizontal padding (responsive via useTheme)
// - Optional tab bar spacer
// - Optional header slot
// - ScrollView or static content support
// - Optional KeyboardAvoidingView for form screens

import { ReactNode, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

type ScreenVariant = 'scroll' | 'static';

interface SafeAreaScreenWrapperProps {
  children: ReactNode;
  variant?: ScreenVariant;
  backgroundColor?: string;
  contentContainerStyle?: ViewStyle;
  style?: ViewStyle;
  showsVerticalScrollIndicator?: boolean;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  header?: ReactNode;
  disableBottomSpacer?: boolean;
  extraBottomPadding?: number;
  testID?: string;
  keyboardAvoiding?: boolean;
  keyboardVerticalOffset?: number;
}

export const SafeAreaScreenWrapper = ({
  children,
  variant = 'scroll',
  backgroundColor,
  contentContainerStyle,
  style,
  showsVerticalScrollIndicator = false,
  keyboardShouldPersistTaps = 'handled',
  header,
  disableBottomSpacer = false,
  extraBottomPadding = 0,
  testID,
  keyboardAvoiding = false,
  keyboardVerticalOffset = 0,
}: SafeAreaScreenWrapperProps) => {
  const { colors, screenPadding, headerPaddingTop, bottomTabSpacing } = useTheme();
  const { width, height } = useWindowDimensions();

  const bg = backgroundColor ?? colors.background;

  const contentStyle = useMemo<ViewStyle>(() => {
    const base: ViewStyle = {
      paddingHorizontal: screenPadding,
      paddingTop: 8,
      paddingBottom: disableBottomSpacer ? extraBottomPadding : bottomTabSpacing + extraBottomPadding,
    };
    return base;
  }, [screenPadding, headerPaddingTop, bottomTabSpacing, disableBottomSpacer, extraBottomPadding]);

  const rootStyle = useMemo<ViewStyle>(() => {
    const base: ViewStyle = { flex: 1, backgroundColor: bg };
    return style ? { ...base, ...(style as ViewStyle) } : base;
  }, [bg, style]);

  const innerContent = (
    <View style={rootStyle} testID={testID}>
      {header}
      {variant === 'scroll' ? (
        <ScrollView
          contentContainerStyle={[contentStyle, contentContainerStyle]}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[contentStyle, contentContainerStyle]}>{children}</View>
      )}
    </View>
  );

  const safeAreaContent = (
    <SafeAreaView style={styles.safeArea}>
      {innerContent}
    </SafeAreaView>
  );

  if (keyboardAvoiding) {
    const behavior = Platform.OS === 'ios' ? 'padding' : 'height';
    return (
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={behavior}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {safeAreaContent}
      </KeyboardAvoidingView>
    );
  }

  return safeAreaContent;
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  root: {
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
  },
});
